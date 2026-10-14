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
  <div class="h-full flex flex-col bg-ink-900 text-slate-200 font-mono text-xs select-none">
    <!-- 顶部栏：拖拽区 + 置顶/透明度/接力/隐藏 -->
    <TitleBar />

    <!-- 主输入区：光标贴图 + 图片分镜卡片 + 词库胶囊 -->
    <Composer @switch-tab="tab = 'snippets'" />

    <!-- 双 Tab -->
    <div class="flex border-b border-ink-700 bg-ink-850 shrink-0">
      <button class="tab" :class="{ active: tab === 'queue' }" @click="tab = 'queue'">
        ⚡ 待发弹夹队列
        <span v-if="pendingCount" class="ml-1 px-1.5 rounded-full bg-neon-green/15 text-neon-green text-[10px]">{{ pendingCount }}</span>
      </button>
      <button class="tab" :class="{ active: tab === 'snippets' }" @click="tab = 'snippets'">
        📚 常用词库
      </button>
    </div>

    <div class="flex-1 overflow-y-auto min-h-0">
      <QueueTab v-show="tab === 'queue'" />
      <SnippetsTab v-show="tab === 'snippets'" />
    </div>

    <!-- Toast -->
    <div v-if="state.toast" class="toast">{{ state.toast }}</div>
  </div>
</template>
