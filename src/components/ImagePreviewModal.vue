<script setup>
/**
 * ImagePreviewModal - 图片放大预览弹窗（Lightbox）
 *  - 响应用户需求：图片框选位置，双击可以放大预览
 *  - 支持方向键 ← → 翻页、ESC 关闭、在文件夹中定位原图、复制原图路径
 */
import { computed, onMounted, onBeforeUnmount } from 'vue'
import { state, closeImagePreview, imgUrl, toast } from '../lib/store'

const preview = computed(() => state.preview || {})
const list = computed(() => preview.value.list || [])
const curIdx = computed(() => preview.value.index || 0)

const hasPrev = computed(() => curIdx.value > 0)
const hasNext = computed(() => curIdx.value < list.value.length - 1)

function prev() {
  if (hasPrev.value) {
    state.preview.index -= 1
    state.preview.img = list.value[state.preview.index]
  }
}

function next() {
  if (hasNext.value) {
    state.preview.index += 1
    state.preview.img = list.value[state.preview.index]
  }
}

function showInFolder() {
  if (preview.value.img?.path) {
    window.pm.showItemInFolder(preview.value.img.path)
  }
}

async function copyPath() {
  if (preview.value.img?.path) {
    await window.pm.copyText(preview.value.img.path)
    toast('已复制图片本地路径')
  }
}

function onKeyDown(e) {
  if (e.key === 'Escape') {
    e.preventDefault()
    closeImagePreview()
  } else if (e.key === 'ArrowLeft') {
    prev()
  } else if (e.key === 'ArrowRight') {
    next()
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKeyDown)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeyDown)
})
</script>

<template>
  <div
    class="fixed inset-0 z-[100] flex flex-col bg-slate-950/88 backdrop-blur-md select-none p-3 animate-in fade-in duration-150"
    @click.self="closeImagePreview"
  >
    <!-- 头部工具栏 -->
    <div class="flex items-center justify-between px-3 py-1.5 shrink-0 bg-slate-900/90 rounded-xl border border-sky-400/25 mb-2 shadow-lg">
      <div class="flex items-center gap-2 min-w-0">
        <span class="px-2 py-0.5 rounded-full bg-sky-500 text-slate-950 text-[10px] font-bold shrink-0 shadow-sm">
          图{{ curIdx + 1 }}
        </span>
        <span class="text-sky-200 text-xs font-semibold truncate" :title="preview.img?.note || '图片预览'">
          {{ preview.img?.note || '图片预览' }}
        </span>
        <span v-if="list.length > 1" class="text-[10px] text-slate-400 shrink-0 font-mono">
          ({{ curIdx + 1 }} / {{ list.length }})
        </span>
      </div>

      <div class="flex items-center gap-1.5 shrink-0">
        <!-- 在文件夹中定位 -->
        <button
          class="icon-btn !w-6 !h-6 hover:!text-sky-300"
          title="在文件夹中定位原图文件"
          @click="showInFolder"
        >
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
          </svg>
        </button>

        <!-- 复制路径 -->
        <button
          class="icon-btn !w-6 !h-6 hover:!text-sky-300"
          title="复制图片绝对路径"
          @click="copyPath"
        >
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
          </svg>
        </button>

        <!-- 关闭 -->
        <button
          class="icon-btn !w-6 !h-6 hover:!text-rose-400 ml-1"
          title="关闭预览 (Esc)"
          @click="closeImagePreview"
        >
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
    </div>

    <!-- 中部主展示大图 -->
    <div
      class="flex-1 min-h-0 relative flex items-center justify-center p-1 overflow-hidden"
      @click.self="closeImagePreview"
    >
      <!-- 上一张 -->
      <button
        v-if="hasPrev"
        class="absolute left-2 top-1/2 -translate-y-1/2 z-10 w-9 h-9 rounded-full bg-slate-900/80 hover:bg-sky-500 hover:text-slate-950 text-slate-200 border border-sky-400/30 flex items-center justify-center transition-all shadow-xl cursor-pointer"
        title="上一张 (←)"
        @click="prev"
      >
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="15 18 9 12 15 6"></polyline>
        </svg>
      </button>

      <!-- 放大图片核心 -->
      <img
        :src="imgUrl(preview.img?.path)"
        class="max-w-full max-h-full object-contain rounded-xl shadow-2xl border border-sky-400/35 cursor-zoom-out select-none transition-transform duration-150"
        alt="preview"
        title="点击图片或背景关闭"
        @click="closeImagePreview"
      />

      <!-- 下一张 -->
      <button
        v-if="hasNext"
        class="absolute right-2 top-1/2 -translate-y-1/2 z-10 w-9 h-9 rounded-full bg-slate-900/80 hover:bg-sky-500 hover:text-slate-950 text-slate-200 border border-sky-400/30 flex items-center justify-center transition-all shadow-xl cursor-pointer"
        title="下一张 (→)"
        @click="next"
      >
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="9 18 15 12 9 6"></polyline>
        </svg>
      </button>
    </div>

    <!-- 底部快捷提示 -->
    <div class="text-center py-1 text-[10px] text-slate-400 flex items-center justify-center gap-2">
      <span>按 <kbd class="px-1 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-300 font-mono">Esc</kbd> 或点击关闭</span>
      <span v-if="list.length > 1">· 支持方向键 <kbd class="px-1 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-300 font-mono">←</kbd> <kbd class="px-1 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-300 font-mono">→</kbd> 翻页</span>
    </div>
  </div>
</template>
