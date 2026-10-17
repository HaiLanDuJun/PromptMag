<script setup>
import { computed, onMounted, onBeforeUnmount, ref } from 'vue'
import TitleBar from './components/TitleBar.vue'
import BallOrb from './components/BallOrb.vue'
import QuickPanel from './components/QuickPanel.vue'
import Composer from './components/Composer.vue'
import QueueTab from './components/QueueTab.vue'
import SnippetsTab from './components/SnippetsTab.vue'
import SnippetPicker from './components/SnippetPicker.vue'
import ImagePreviewModal from './components/ImagePreviewModal.vue'
import { state, initStore, bindExternalEvents, setMode, bindModeSync, t } from './lib/store'

const isSnippetPicker = ref(window.location.hash === '#snippet-picker')
const tab = ref('queue')
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
  if (isPickerOpen || state.preview || state.isDialogOpening) return
  if (!hasEntered || pointerDown) return
  clearTimeout(collapseTimer)
  collapseTimer = setTimeout(() => {
    if (isPickerOpen || state.preview || state.isDialogOpening) return
    if (pointerDown) return
    if (Date.now() - lastExpandAt < 220) return   // 极短缓冲期防抖，告别漫长等待
    if (document.hasFocus()) return               // 正在输入，不收起
    if (mode.value === 'full') return             // 完整窗口需手动收起
    setMode('capsule')
  }, 180)
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
  if (state.isDialogOpening) return
  if (mode.value !== 'capsule') scheduleCollapse()
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

onMounted(async () => {
  window.addEventListener('hashchange', onHashChange)
  if (isSnippetPicker.value) {
    return
  }
  await initStore()
  bindExternalEvents()
  bindModeSync((m) => { state.settings.mode = m })
  window.addEventListener('pm:switch-tab', (e) => { tab.value = e.detail || 'queue' })
  window.addEventListener('blur', onWinBlur)
  window.addEventListener('focus', onWinFocus)
  window.addEventListener('mousedown', onPointerDown, true)
  window.addEventListener('mouseup', onPointerUp, true)
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
})

onBeforeUnmount(() => {
  window.removeEventListener('hashchange', onHashChange)
  window.removeEventListener('blur', onWinBlur)
  window.removeEventListener('focus', onWinFocus)
  window.removeEventListener('mousedown', onPointerDown, true)
  window.removeEventListener('mouseup', onPointerUp, true)
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
        <Composer @switch-tab="tab = 'snippets'" />
        <nav class="flex items-center gap-1.5 px-3.5 pt-2 pb-1 shrink-0">
          <button
            class="px-2.5 py-0.5 rounded-full text-[11px] font-medium transition-all"
            :class="tab === 'queue' ? 'bg-sky-500/15 border border-sky-400/40 text-sky-300' : 'text-slate-400 hover:text-slate-200'"
            @click="tab = 'queue'"
          >
            {{ t('tabs.history') }}
          </button>
          <button
            class="px-2.5 py-0.5 rounded-full text-[11px] font-medium transition-all"
            :class="tab === 'snippets' ? 'bg-sky-500/15 border border-sky-400/40 text-sky-300' : 'text-slate-400 hover:text-slate-200'"
            @click="tab = 'snippets'"
          >
            {{ t('tabs.snippets') }}
          </button>
        </nav>
        <main class="flex-1 overflow-y-auto min-h-0 px-3.5 pb-3">
          <QueueTab v-show="tab === 'queue'" />
          <SnippetsTab v-show="tab === 'snippets'" />
        </main>
      </div>
    </Transition>

    <div v-if="state.toast" class="toast">{{ state.toast }}</div>
    <!-- 双击放大图片全屏查看弹窗 -->
    <ImagePreviewModal v-if="state.preview" />
  </div>
</template>
