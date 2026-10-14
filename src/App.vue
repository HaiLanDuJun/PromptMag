<script setup>
import { computed, onMounted, ref } from 'vue'
import TitleBar from './components/TitleBar.vue'
import Composer from './components/Composer.vue'
import QueueTab from './components/QueueTab.vue'
import SnippetsTab from './components/SnippetsTab.vue'
import { state, initStore, bindExternalEvents } from './lib/store'

const tab = ref('queue')
const pendingCount = computed(() => state.queue.filter((t) => !t.done).length)

onMounted(async () => {
  await initStore()
  bindExternalEvents()
  // 词库点击「插入」后自动切回队列 Tab
  window.addEventListener('pm:switch-tab', (e) => { tab.value = e.detail || 'queue' })
})
</script>

<template>
  <div class="shell">
    <!-- 顶部栏：拖拽区 + 接力/置顶/透明度/隐藏 -->
    <TitleBar />

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

    <div v-if="state.toast" class="toast">{{ state.toast }}</div>
  </div>
</template>
