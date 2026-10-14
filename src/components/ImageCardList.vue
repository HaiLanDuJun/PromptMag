<script setup>
/**
 * 图片分镜卡片区
 *  - 角标 图N，缩略图，单图批注输入框
 *  - 点击缩略图 -> 主输入框光标处插入 [图N]
 *  - 拖拽缩略图调整顺序 / 删除，均自动重编 [图N] 标记
 */
import { ref } from 'vue'
import { state, removeImage, reorderImage, imgUrl, toast } from '../lib/store'

const emit = defineEmits(['insert'])

const from = ref(-1)
const over = ref(-1)

function dragStart(i, e) {
  from.value = i
  e.dataTransfer.effectAllowed = 'move'
  try { e.dataTransfer.setData('text/plain', String(i)) } catch { /* ignore */ }
}
function onDrop(to) {
  if (from.value > -1 && from.value !== to) {
    reorderImage(from.value, to)
    toast('已调整顺序并同步标记')
  }
  from.value = -1
  over.value = -1
}
function onRemove(i) {
  removeImage(i)
  toast('已删除并重排编号')
}
function reveal(p) {
  window.pm.showItemInFolder(p)
}
</script>

<template>
  <div v-if="state.composer.images.length" class="space-y-1.5">
    <div
      v-for="(img, i) in state.composer.images"
      :key="img.path"
      class="shot-card"
      :class="{ 'drag-over': over === i && from !== i, dragging: from === i }"
      @dragover.prevent="over = i"
      @dragleave="over === i && (over = -1)"
      @drop.prevent="onDrop(i)"
      @dragend="from = -1; over = -1"
    >
      <!-- 缩略图（拖拽手柄 + 点击插入标记） -->
      <div
        class="relative w-14 h-14 shrink-0 rounded-lg overflow-hidden bg-black/40 cursor-pointer"
        draggable="true"
        title="点击：在光标处插入标记｜拖拽：调整顺序"
        @dragstart="dragStart(i, $event)"
        @click="emit('insert', i)"
      >
        <img :src="imgUrl(img.path)" class="w-full h-full object-cover pointer-events-none" alt="">
        <span class="shot-badge">图{{ i + 1 }}</span>
      </div>

      <!-- 单图批注 -->
      <input
        v-model="img.note"
        class="flex-1 min-w-0 self-center px-2 py-1.5 rounded-lg bg-black/25 border border-transparent focus:border-neon-cyan/40 text-slate-300 text-[11px] transition-colors"
        placeholder="可选：一句话说明此图作用…"
        draggable="false"
        @dragstart.prevent.stop
        @click.stop
      >

      <!-- 操作 -->
      <div class="flex flex-col justify-center gap-0.5 shrink-0">
        <button class="icon-btn !w-5 !h-5" title="在文件管理器中显示" @click.stop="reveal(img.path)">
          <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
          </svg>
        </button>
        <button class="icon-btn !w-5 !h-5 danger" title="删除此图（自动重排编号）" @click.stop="onRemove(i)">
          <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <path d="M18 6 6 18" /><path d="m6 6 12 12" />
          </svg>
        </button>
      </div>
    </div>
  </div>
</template>
