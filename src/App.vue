<script setup>
import { computed, onMounted, onBeforeUnmount, ref } from 'vue'
import TitleBar from './components/TitleBar.vue'
import BallOrb from './components/BallOrb.vue'
import QuickPanel from './components/QuickPanel.vue'
import Composer from './components/Composer.vue'
import QueueTab from './components/QueueTab.vue'
import SnippetPicker from './components/SnippetPicker.vue'
import ImagePreviewModal from './components/ImagePreviewModal.vue'
import MagazinePickerModal from './components/MagazinePickerModal.vue'
import RelayStartupModal from './components/RelayStartupModal.vue'
import UpdateModal from './components/UpdateModal.vue'
import { state, initStore, bindExternalEvents, setMode, bindModeSync, checkForUpdates, cycleMagazine, setActiveMagazine, matchAccelerator, toast, t } from './lib/store'

const isSnippetPicker = ref(window.location.hash === '#snippet-picker')
const pendingCount = computed(() => state.queue.filter((t) => !t.done).length)
const mode = computed(() => state.settings.mode)

/* ---------------- 悬停展开 / 离开收起 / 拖动抑制 ---------------- */
let collapseTimer = null
let hoverTimer = null
let hasEntered = false   // 鼠标从未进入过窗口时不做自动收起
let lastExpandAt = 0
let pointerDown = false  // 按住（拖动）时不触发展开/收起，保证拖拽丝滑

function notifyPointerIn() { window.pm.pointerIn() }
function notifyPointerOut() { window.pm.pointerOut() }

/** 胶囊 -> 快捷输入面板（悬停 70ms 展开，极速灵动响应） */
function hoverOpenQuick() {
  clearTimeout(hoverTimer)
  if (pointerDown || state.isDialogOpening) return
  hoverTimer = setTimeout(() => {
    if (pointerDown || state.isDialogOpening) return
    if (mode.value !== 'capsule') return
    lastExpandAt = Date.now()
    setMode('quick')
  }, 70)
}

let isPickerOpen = false

function scheduleCollapse() {
  if (isPickerOpen || state.preview || state.isDialogOpening || state.isMagazinePickerOpen || state.isRelayStartupModalOpen || state.isUpdateModalOpen) return
  if (!hasEntered || pointerDown) return
  clearTimeout(collapseTimer)
  collapseTimer = setTimeout(() => {
    if (isPickerOpen || state.preview || state.isDialogOpening || state.isMagazinePickerOpen || state.isRelayStartupModalOpen || state.isUpdateModalOpen) return
    if (pointerDown) return
    if (Date.now() - lastExpandAt < 800) return   // 展开防抖缓冲（800ms），杜绝快捷键呼出瞬间被误判自缩
    if (document.hasFocus()) return               // 正在输入，不收起
    if (mode.value === 'full') return             // 完整窗口需手动收起
    setMode('capsule')
  }, 220)
}

function onShellEnter(e) {
  hasEntered = true
  notifyPointerIn() // 让主进程取消边缘缩进
  clearTimeout(collapseTimer)
  // 按着鼠标键移动过来（拖拽中）时不要展开
  if (e && typeof e.buttons === 'number' && e.buttons > 0) return
  hoverOpenQuick()
}
function onShellLeave() {
  clearTimeout(hoverTimer)
  notifyPointerOut()
  if (mode.value !== 'capsule') scheduleCollapse()
}
function onWinBlur() {
  if (state.isDialogOpening || state.isMagazinePickerOpen || state.isRelayStartupModalOpen || state.isUpdateModalOpen) return
  if (Date.now() - lastExpandAt < 800) return
  if (mode.value !== 'capsule' && hasEntered) scheduleCollapse()
}
function onWinFocus() {
  clearTimeout(collapseTimer)
  notifyPointerIn()
}

function onPointerDown() { pointerDown = true; clearTimeout(hoverTimer) }
function onPointerUp() {
  if (!pointerDown) return
  pointerDown = false
  // 拖拽结束后若光标仍在胶囊上，补一次展开
  if (mode.value === 'capsule' && hasEntered) hoverOpenQuick()
}

function onHashChange() {
  isSnippetPicker.value = window.location.hash === '#snippet-picker'
}

/* ---------- 全局快捷键：快速换弹夹 (支持在快捷面板、录入区以及图片任务列表中随时切换) ---------- */
function onGlobalKeydown(e) {
  if (state.isHotkeyRecording || state.isMagazinePickerOpen || state.isRelayStartupModalOpen) return

  const configured = state.settings.hotkeyCycleMag || 'Ctrl+Tab'

  const isMatch = matchAccelerator(e, configured) ||
    (!state.settings.hotkeyCycleMag && (
      (e.ctrlKey && e.key === 'Tab') ||
      (e.ctrlKey && (e.key === 'm' || e.key === 'M')) ||
      (e.altKey && (e.key === 'm' || e.key === 'M'))
    ))

  const isReverseMatch = (e.shiftKey && matchAccelerator({ ...e, shiftKey: false }, configured)) ||
    (e.ctrlKey && e.shiftKey && e.key === 'Tab')

  if (isMatch || isReverseMatch) {
    e.preventDefault()
    e.stopPropagation()
    const direction = (isReverseMatch || e.shiftKey) ? -1 : 1
    const nextMag = cycleMagazine(direction)
    if (nextMag) {
      const pending = (nextMag.queue || []).filter((t) => !t.done).length
      toast(`🔫 ${nextMag.name} (${pending})`)
    }
    return
  }

  // Ctrl+1 ~ Ctrl+9 数字直达对应弹夹
  if (e.ctrlKey && !e.altKey && !e.shiftKey && e.key >= '1' && e.key <= '9') {
    const idx = parseInt(e.key, 10) - 1
    if (idx >= 0 && idx < state.magazines.length) {
      e.preventDefault()
      e.stopPropagation()
      const targetMag = state.magazines[idx]
      setActiveMagazine(targetMag.id)
      const pending = (targetMag.queue || []).filter((t) => !t.done).length
      toast(`🔫 ${targetMag.name} (${pending})`)
      return
    }
  }
}

onMounted(async () => {
  window.addEventListener('hashchange', onHashChange)
  if (isSnippetPicker.value) {
    return
  }
  await initStore()
  setTimeout(() => {
    checkForUpdates(false)
  }, 1500)
  bindExternalEvents()
  bindModeSync((m) => { state.settings.mode = m })
  window.addEventListener('blur', onWinBlur)
  window.addEventListener('focus', onWinFocus)
  window.addEventListener('mousedown', onPointerDown, true)
  window.addEventListener('mouseup', onPointerUp, true)
  window.addEventListener('keydown', onGlobalKeydown, true)
  if (window.pm && window.pm.onSnippetPickerOpened) {
    window.pm.onSnippetPickerOpened(() => {
      isPickerOpen = true
      clearTimeout(collapseTimer)
    })
  }
  if (window.pm && window.pm.onSnippetPickerClosed) {
    window.pm.onSnippetPickerClosed(() => {
      isPickerOpen = false
    })
  }
  if (window.pm && window.pm.onFocusComposer) {
    window.pm.onFocusComposer(() => {
      lastExpandAt = Date.now()
      clearTimeout(collapseTimer)
      hasEntered = false // 重置鼠标进入状态，热键呼出不由鼠标悬停逻辑控制自缩
    })
  }
})

onBeforeUnmount(() => {
  window.removeEventListener('hashchange', onHashChange)
  window.removeEventListener('blur', onWinBlur)
  window.removeEventListener('focus', onWinFocus)
  window.removeEventListener('mousedown', onPointerDown, true)
  window.removeEventListener('mouseup', onPointerUp, true)
  window.removeEventListener('keydown', onGlobalKeydown, true)
  clearTimeout(collapseTimer)
  clearTimeout(hoverTimer)
})
</script>

<template>
  <!-- 专属提示词收藏夹独立窗口分支 (Alt+C) -->
  <div v-if="isSnippetPicker" class="w-full h-full select-none overflow-hidden">
    <SnippetPicker />
  </div>

  <!-- 主应用悬浮胶囊 / 快捷面板 / 完整窗口 -->
  <div v-else class="shell" :class="'mode-' + mode" @mouseenter="onShellEnter" @mouseleave="onShellLeave">
    <!-- 圆球：悬停/点击 -> 快捷输入面板；整球可拖拽 -->
    <Transition name="orb-fade" mode="out-in">
      <BallOrb v-if="mode === 'capsule'" key="capsule" @open="hoverOpenQuick" />
      <QuickPanel v-else-if="mode === 'quick'" key="quick" />
      <div v-else key="full" class="flex flex-col h-full min-h-0">
        <TitleBar @collapse="setMode('capsule')" @mini="setMode('quick')" />
        <Composer />
        <main class="flex-1 overflow-y-auto min-h-0 px-3.5 pb-3 pt-1">
          <QueueTab />
        </main>
      </div>
    </Transition>

    <div v-if="state.toast && mode !== 'capsule'" class="toast">{{ state.toast }}</div>
    <!-- 双击放大图片全屏查看弹窗 -->
    <ImagePreviewModal v-if="state.preview && mode !== 'capsule'" />
    <!-- 目标弹夹选择弹窗 -->
    <MagazinePickerModal v-if="state.isMagazinePickerOpen && mode !== 'capsule'" />
    <!-- Agent接力启动提示词生成弹窗 -->
    <RelayStartupModal v-if="state.isRelayStartupModalOpen && mode !== 'capsule'" />
    <!-- 版本更新提醒弹窗 -->
    <UpdateModal v-if="state.isUpdateModalOpen && mode !== 'capsule'" />
  </div>
</template>
