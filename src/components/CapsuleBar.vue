<script setup>
import { computed } from 'vue'
import { state } from '../lib/store'

defineEmits(['open'])

const pendingCount = computed(() => state.queue.filter((t) => !t.done).length)
</script>

<template>
  <!-- 胶囊条：整条可拖拽，悬停或点击直接打开快捷输入面板 -->
  <div
    class="capsule drag-region"
    title="悬停或点击直接输入 · 按住可拖拽移动"
    @mouseenter="$emit('open')"
    @click="$emit('open')"
  >
    <span
      class="w-1.5 h-1.5 rounded-full shrink-0"
      :class="state.settings.relay ? 'bg-neon-cyan shadow-[0_0_6px_#22d3ee]' : 'bg-slate-600'"
    />
    <span class="capsule-title">PromptMag</span>
    <span v-if="pendingCount" class="capsule-count">{{ pendingCount }}</span>
    <svg class="capsule-arrow" viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M4 9h12" /><path d="M4 15h16" /><path d="M14 6l6 6-6 6" />
    </svg>
  </div>
</template>
