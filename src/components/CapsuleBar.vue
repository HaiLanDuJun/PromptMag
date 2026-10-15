<script setup>
import { computed } from 'vue'
import { state } from '../lib/store'

defineEmits(['expand'])

const pendingCount = computed(() => state.queue.filter((t) => !t.done).length)
</script>

<template>
  <!-- 胶囊条：整条可拖拽，悬停/点击展开完整窗口 -->
  <div
    class="capsule drag-region"
    title="悬停或点击展开 · 按住拖拽移动"
    @mouseenter="$emit('expand')"
    @click="$emit('expand')"
  >
    <span
      class="w-1.5 h-1.5 rounded-full shrink-0"
      :class="state.settings.relay ? 'bg-neon-cyan shadow-[0_0_6px_#22d3ee]' : 'bg-slate-600'"
    />
    <span class="capsule-title">PromptMag</span>
    <span v-if="pendingCount" class="capsule-count">{{ pendingCount }}</span>
    <!-- 展开提示箭头 -->
    <svg class="capsule-arrow" viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M7 15l5 5 5-5" /><path d="M7 9l5-5 5 5" />
    </svg>
  </div>
</template>
