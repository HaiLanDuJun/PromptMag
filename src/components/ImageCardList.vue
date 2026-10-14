<script setup>
/**
 * 图片分镜卡片区
 *  - 角标 #图N，缩略图，单图批注输入框
 *  - 点击缩略图 -> 主输入框光标处插入 [图N]
 *  - 拖拽缩略图调整顺序 / ✕ 删除，均自动重编 [图N] 标记
 */
import { ref } from 'vue'
import { state, removeImage, reorderImage, imgUrl, toast } from '../lib/store'

defineProps({ })
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
    toast('已调整图片顺序并同步 [图N] 标记')
  }
  from.value = -1
  over.value = -1
}
function onRemove(i) {
  removeImage(i)
  toast('已删除图片并重排编号')
}

function reveal(p) {
  window.pm.showItemInFolder(p)
}
</script>

<template>
  <div v-if="state.composer.images.length" class="space-y-1">
    <div
      v-for="(img, i) in state.composer.images"
      :key="img.path"
      class="img-card flex gap-1.5 items-stretch"
      :class="{ 'drag-over': over === i && from !== i, dragging: from === i }"
      @dragover.prevent="over = i"
      @dragleave="over === i && (over = -1)"
      @drop.prevent="onDrop(i)"
      @dragend="from = -1; over = -1"
    >
      <!-- 缩略图（拖拽手柄 + 点击插入标记） -->
      <div
        class="thumb-wrap w-16 h-16 shrink-0 bg-ink-800"
        draggable="true"
        title="点击：在光标处插入 [图N]｜拖拽：调整顺序"
        @dragstart="dragStart(i, $event)"
        @click="emit('insert', i)"
      >
        <img :src="imgUrl(img.path)" class="w-full h-full object-cover pointer-events-none" alt="">
        <span class="absolute left-0 top-0 px-1 rounded-br bg-neon-amber/90 text-ink-950 text-[10px] font-bold">#图{{ i + 1 }}</span>
      </div>

      <!-- 单图批注 -->
      <input
        v-model="img.note"
        class="flex-1 min-w-0 self-center px-1.5 py-1 rounded bg-ink-900 border border-ink-600 focus:border-neon-cyan/60 text-slate-300 text-[11px]"
        placeholder="可选：一句话说明此图作用..."
        draggable="false"
        @dragstart.prevent.stop
        @click.stop
      >

      <!-- 操作 -->
      <div class="flex flex-col justify-between shrink-0">
        <button class="icon-btn" title="在文件管理器中显示" @click.stop="reveal(img.path)">🗂</button>
        <button class="icon-btn hover:text-red-400" title="删除此图（自动重排编号）" @click.stop="onRemove(i)">✕</button>
      </div>
    </div>
  </div>
</template>
