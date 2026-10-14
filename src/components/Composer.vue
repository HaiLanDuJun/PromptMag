<script setup>
/**
 * 主输入区（Composer）
 *  - Ctrl+V：剪贴板为图片时落盘并在「光标处」插入 [图N] 内联标记
 *  - Ctrl+Enter：压入待发弹夹队列
 *  - 词库胶囊点击插入光标处
 */
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { compilePrompt } from '../lib/compilePrompt'
import {
  state, addImages, pushComposerToQueue, copyCompiled, toast
} from '../lib/store'
import ImageCardList from './ImageCardList.vue'

const emit = defineEmits(['switch-tab'])
const ta = ref(null)

/* ---------- 光标处插入 ---------- */
function insertAtCursor(str) {
  const el = ta.value
  const t = state.composer.text
  if (!el) {
    state.composer.text = t + str
    return
  }
  const s = el.selectionStart ?? t.length
  const e = el.selectionEnd ?? s
  state.composer.text = t.slice(0, s) + str + t.slice(e)
  nextTick(() => {
    el.focus()
    el.selectionStart = el.selectionEnd = s + str.length
  })
}

/* ---------- Ctrl+V：图片拦截 / 文本兜底 ---------- */
async function onPaste(e) {
  e.preventDefault()
  const res = await window.pm.saveClipboardImages()
  if (res.ok && res.images && res.images.length) {
    const startNo = state.composer.images.length + 1
    addImages(res.images)
    const tokens = res.images.map((_, i) => `[图${startNo + i}]`).join(' ')
    insertAtCursor(tokens + ' ')
    toast(`已贴 ${res.images.length} 张图，标记插在光标处`)
  } else {
    try {
      const t = await navigator.clipboard.readText()
      if (t) insertAtCursor(t)
    } catch { /* ignore */ }
  }
}

/* ---------- 手动贴图按钮（截图工具抢焦点时的兜底） ---------- */
async function pasteImageManually() {
  const res = await window.pm.saveClipboardImages()
  if (res.ok && res.images && res.images.length) {
    const startNo = state.composer.images.length + 1
    addImages(res.images)
    const tokens = res.images.map((_, i) => `[图${startNo + i}]`).join(' ')
    insertAtCursor(tokens + ' ')
    toast(`已贴 ${res.images.length} 张图`)
  } else {
    toast('剪贴板中没有图片')
  }
}

/* ---------- 快捷键 ---------- */
function onKeydown(e) {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    e.preventDefault()
    enqueue()
  }
}

function enqueue() {
  const t = pushComposerToQueue()
  if (!t) toast('输入框是空的')
  else toast('已入队')
}

async function copyCurrent() {
  const c = state.composer
  if (!String(c.text).trim() && !c.images.length) {
    toast('输入框是空的')
    return
  }
  await copyCompiled({ text: c.text, images: c.images })
  toast('已复制' + (state.settings.relay ? '（含接力指令）' : ''))
}

function clearComposer() {
  state.composer.text = ''
  state.composer.images = []
}

/* ---------- Alt+Q 呼出时自动聚焦 / 词库插入事件 ---------- */
let offFocus = null
function onSnippetInsert(e) { insertAtCursor(e.detail + ' ') }

onMounted(() => {
  offFocus = window.pm.onFocusComposer(() => ta.value && ta.value.focus())
  window.addEventListener('pm:insert-snippet', onSnippetInsert)
})
onBeforeUnmount(() => {
  if (offFocus) offFocus()
  window.removeEventListener('pm:insert-snippet', onSnippetInsert)
})
</script>

<template>
  <section class="px-3 pt-2.5 pb-2 shrink-0 space-y-2 hairline">
    <!-- 主输入框 -->
    <textarea
      ref="ta"
      v-model="state.composer.text"
      class="field h-[72px] leading-relaxed"
      placeholder="写提示词… Ctrl+V 在光标处贴图，Ctrl+Enter 入队"
      @paste="onPaste"
      @keydown="onKeydown"
    />

    <!-- 图片分镜卡片 -->
    <ImageCardList @insert="(i) => insertAtCursor(`[图${i + 1}]`)" />

    <!-- 词库胶囊 -->
    <div v-if="state.snippets.length" class="flex items-center gap-1 overflow-x-auto">
      <button
        v-for="s in state.snippets.slice(0, 8)"
        :key="s.id"
        class="shrink-0 px-2 py-0.5 rounded-full bg-slate-400/[.05] border border-slate-400/15 text-slate-400 text-[10px] whitespace-nowrap hover:border-neon-cyan/50 hover:text-neon-cyan transition-colors"
        :title="s.text"
        @click="insertAtCursor(s.text + ' ')"
      >{{ s.text.length > 12 ? s.text.slice(0, 12) + '…' : s.text }}</button>
      <button
        class="shrink-0 px-2 py-0.5 rounded-full border border-dashed border-slate-500/40 text-slate-500 text-[10px] hover:text-slate-300 transition-colors"
        title="管理常用词库"
        @click="emit('switch-tab')"
      >+</button>
    </div>

    <!-- 操作行 -->
    <div class="flex items-center gap-1.5">
      <button class="btn" title="将剪贴板图片贴到光标处" @click="pasteImageManually">贴图</button>
      <button class="btn" title="编译（图片路径映射 + 批注）并复制" @click="copyCurrent">复制</button>
      <button class="btn btn-primary" title="压入待发队列 (Ctrl+Enter)" @click="enqueue">入队</button>
      <div class="flex-1" />
      <button
        v-if="state.composer.text || state.composer.images.length"
        class="btn btn-danger"
        @click="clearComposer"
      >清空</button>
    </div>
  </section>
</template>
