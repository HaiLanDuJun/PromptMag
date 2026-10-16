<script setup>
import { computed, onMounted, onBeforeUnmount, ref } from 'vue'
import TitleBar from './components/TitleBar.vue'
import BallOrb from './components/BallOrb.vue'
import QuickPanel from './components/QuickPanel.vue'
import Composer from './components/Composer.vue'
import QueueTab from './components/QueueTab.vue'
import SnippetsTab from './components/SnippetsTab.vue'
import { state, initStore, bindExternalEvents, setMode, bindModeSync } from './lib/store'

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

/** 胶囊 -> 快捷输入面板（悬停 120ms 后，输入法式手感） */
function hoverOpenQuick() {
  clearTimeout(hoverTimer)
  if (pointerDown) return
  hoverTimer = setTimeout(() => {
    if (pointerDown) return
    if (mode.value !== 'capsule') return
    lastExpandAt = Date.now()
    setMode('quick')
  }, 120)
}

function scheduleCollapse() {
  if (!hasEntered || pointerDown) return
  clearTimeout(collapseTimer)
  collapseTimer = setTimeout(() => {
    if (pointerDown) return
    if (Date.now() - lastExpandAt < 900) return   // 展开动画期不收起，避免抖动
    if (document.hasFocus()) return               // 正在输入，不收起
    if (mode.value === 'full') return             // 完整窗口需手动收起
    setMode('capsule')
  }, 700)
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
function onWinBlur() { if (mode.value !== 'capsule') scheduleCollapse() }
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

onMounted(async () => {
  await initStore()
  bindExternalEvents()
  bindModeSync((m) => { state.settings.mode = m })
  window.addEventListener('pm:switch-tab', (e) => { tab.value = e.detail || 'queue' })
  window.addEventListener('blur', onWinBlur)
  window.addEventListener('focus', onWinFocus)
  window.addEventListener('mousedown', onPointerDown, true)
  window.addEventListener('mouseup', onPointerUp, true)
})

onBeforeUnmount(() => {
  window.removeEventListener('blur', onWinBlur)
  window.removeEventListener('focus', onWinFocus)
  window.removeEventListener('mousedown', onPointerDown, true)
  window.removeEventListener('mouseup', onPointerUp, true)
  clearTimeout(collapseTimer)
  clearTimeout(hoverTimer)
})
</script>

<template>
  <div class="shell" :class="'mode-' + mode" @mouseenter="onShellEnter" @mouseleave="onShellLeave">
    <!-- 圆球：悬停/点击 -> 快捷输入面板；整球可拖拽 -->
    <BallOrb v-if="mode === 'capsule'" @open="hoverOpenQuick" />

    <!-- 快捷输入面板（输入法悬浮窗形态） -->
    <QuickPanel v-else-if="mode === 'quick'" />

    <!-- 完整窗口 -->
    <template v-else>
      <TitleBar @collapse="setMode('capsule')" @mini="setMode('quick')" />
      <Composer @switch-tab="tab = 'snippets'" />
      <nav class="tabs">
        <button class="tab-btn" :class="{ active: tab === 'queue' }" @click="tab = 'queue'">
          队列
          <span v-if="pendingCount" class="tab-count">{{ pendingCount }}</span>
        </button>
        <button class="tab-btn" :class="{ active: tab === 'snippets' }" @click="tab = 'snippets'">
          词库
        </button>
      </nav>
      <main class="flex-1 overflow-y-auto min-h-0 px-3 pb-3">
        <QueueTab v-show="tab === 'queue'" />
        <SnippetsTab v-show="tab === 'snippets'" />
      </main>
    </template>

    <div v-if="state.toast" class="toast">{{ state.toast }}</div>
  </div>
</template>
