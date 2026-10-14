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
    toast(`🖼 已贴 ${res.images.length} 张图并插入标记`)
  } else {
    // 剪贴板不是图片，回退为粘贴文本
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
    toast(`🖼 已贴 ${res.images.length} 张图`)
  } else {
    toast('剪贴板中没有图片，先截图或复制图片再试')
  }
}

/* ---------- 快捷键 ---------- */
function onKeydown(e) {
  if ((e.ctrlKey || e.metaKey) && (e.key === 'Enter')) {
    e.preventDefault()
    enqueue()
  }
}

function enqueue() {
  const t = pushComposerToQueue()
  if (!t) toast('输入框为空：先写提示词或贴图')
  else toast('✓ 已压入弹夹队列')
}

async function copyCurrent() {
  const c = state.composer
  if (!String(c.text).trim() && !c.images.length) {
    toast('输入框为空：先写提示词或贴图')
    return
  }
  await copyCompiled({ text: c.text, images: c.images })
  toast('✓ 已复制编译后的 Prompt' + (state.settings.relay ? '（含接力指令）' : ''))
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
  <div class="px-2.5 pt-2 pb-1.5 border-b border-ink-700 bg-ink-900 shrink-0">
    <!-- 主输入框 -->
    <textarea
      ref="ta"
      v-model="state.composer.text"
      class="w-full h-20 px-2 py-1.5 rounded bg-ink-850 border border-ink-600 focus:border-neon-green/60 text-slate-200 leading-relaxed placeholder:text-slate-600"
      placeholder="写提示词… 光标处 Ctrl+V 直接贴图插入 [图1] 标记，Ctrl+Enter 入队"
      @paste="onPaste"
      @keydown="onKeydown"
    />

    <!-- 图片分镜卡片 -->
    <ImageCardList class="mt-1.5" @insert="(i) => insertAtCursor(`[图${i + 1}]`)" />

    <!-- 词库快捷胶囊 -->
    <div v-if="state.snippets.length" class="mt-1.5 flex items-center gap-1 overflow-x-auto pb-0.5">
      <span class="text-slate-600 text-[10px] shrink-0">词库</span>
      <button
        v-for="s in state.snippets.slice(0, 8)"
        :key="s.id"
        class="shrink-0 px-1.5 py-0.5 rounded-full bg-ink-800 border border-ink-600 text-slate-400 text-[10px] whitespace-nowrap hover:border-neon-cyan/60 hover:text-neon-cyan transition-colors"
        :title="s.text"
        @click="insertAtCursor(s.text + ' ')"
      >{{ s.text.length > 12 ? s.text.slice(0, 12) + '…' : s.text }}</button>
      <button
        class="shrink-0 px-1.5 py-0.5 rounded-full border border-dashed border-ink-600 text-slate-600 text-[10px] hover:text-slate-300"
        title="管理常用词库"
        @click="emit('switch-tab')"
      >＋</button>
    </div>

    <!-- 操作行 -->
    <div class="mt-1.5 flex items-center gap-1.5">
      <button class="btn" title="将剪贴板图片贴到光标处" @click="pasteImageManually">🖼 贴图</button>
      <button class="btn" title="编译（含图片路径映射 + 批注）并复制到剪贴板" @click="copyCurrent">📋 复制</button>
      <button class="btn btn-primary" title="压入待发弹夹队列 (Ctrl+Enter)" @click="enqueue">⚡ 入队</button>
      <div class="flex-1" />
      <button
        v-if="state.composer.text || state.composer.images.length"
        class="btn btn-danger"
        @click="clearComposer"
      >🧹 清空</button>
    </div>
  </div>
</template>
