<script setup>
import { computed, onMounted, onBeforeUnmount, ref } from 'vue'
import TitleBar from './components/TitleBar.vue'
import CapsuleBar from './components/CapsuleBar.vue'
import Composer from './components/Composer.vue'
import QueueTab from './components/QueueTab.vue'
import SnippetsTab from './components/SnippetsTab.vue'
import { state, initStore, bindExternalEvents, setCollapsed, bindCollapsedSync } from './lib/store'

const tab = ref('queue')
const pendingCount = computed(() => state.queue.filter((t) => !t.done).length)
const collapsed = computed(() => !!state.settings.collapsed)

/* ---------------- 胶囊：悬停展开 / 离开延迟收起 ---------------- */
let collapseTimer = null
let hasEntered = false // 鼠标从未进入过窗口时，不做自动收起（避免启动即收起）
let lastExpandAt = 0

function expand() {
  if (!collapsed.value) return
  lastExpandAt = Date.now()
  setCollapsed(false)
}

function scheduleCollapse() {
  if (!hasEntered) return
  if (Date.now() - lastExpandAt < 900) return // 展开动画期间不收起，避免抖动
  clearTimeout(collapseTimer)
  collapseTimer = setTimeout(() => {
    if (Date.now() - lastExpandAt < 900) return
    // 正在输入（窗口持有焦点）时不收起，等失焦后再触发
    if (document.hasFocus()) return
    setCollapsed(true)
  }, 600)
}

function onShellEnter() {
  hasEntered = true
  clearTimeout(collapseTimer)
}
function onShellLeave() { if (!collapsed.value) scheduleCollapse() }
function onWinBlur() { if (!collapsed.value) scheduleCollapse() }
function onWinFocus() { clearTimeout(collapseTimer) }

onMounted(async () => {
  await initStore()
  bindExternalEvents()
  bindCollapsedSync((flag) => { state.settings.collapsed = flag })
  // 词库点击「插入」后自动切回队列 Tab
  window.addEventListener('pm:switch-tab', (e) => { tab.value = e.detail || 'queue' })
  window.addEventListener('blur', onWinBlur)
  window.addEventListener('focus', onWinFocus)
})

onBeforeUnmount(() => {
  window.removeEventListener('blur', onWinBlur)
  window.removeEventListener('focus', onWinFocus)
  clearTimeout(collapseTimer)
})
</script>

<template>
  <div class="shell" @mouseenter="onShellEnter" @mouseleave="onShellLeave">
    <!-- 胶囊形态：仅显示一条小胶囊，悬停/点击展开 -->
    <CapsuleBar v-if="collapsed" @expand="expand" />

    <template v-else>
      <!-- 顶部栏：拖拽区 + 接力/置顶/透明度/设置/收起/隐藏 -->
      <TitleBar @collapse="setCollapsed(true)" />

      <!-- 主输入区 -->
      <Composer @switch-tab="tab = 'snippets'" />

      <!-- Tab -->
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
