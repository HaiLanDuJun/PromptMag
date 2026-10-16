<script setup>
/**
 * 主输入区（Composer）
 *  - Ctrl+V：图片则落盘并在「光标处」插入 [图N] 内联标记；纯文本则直接粘贴
 *  - Ctrl+Enter：压入待发弹夹队列
 *  - 词库胶囊点击插入光标处
 */
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { compilePrompt } from '../lib/compilePrompt'
import {
  state, addImages, pushComposerToQueue, copyCompiled, toast, readClipboardText
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
  el.focus()
  const focused = document.activeElement === el
  const s = focused ? (el.selectionStart ?? t.length) : t.length
  const e = focused ? (el.selectionEnd ?? s) : t.length
  state.composer.text = t.slice(0, s) + str + t.slice(e)
  nextTick(() => {
    el.focus()
    el.selectionStart = el.selectionEnd = s + str.length
  })
}

/* ---------- 粘贴：优先图片，其次纯文本 ---------- */
async function pasteFromClipboard() {
  const res = await window.pm.saveClipboardImages()
  if (res.ok && res.images && res.images.length) {
    const startNo = state.composer.images.length + 1
    addImages(res.images)
    const tokens = res.images.map((_, i) => `[图${startNo + i}]`).join(' ')
    insertAtCursor(tokens + ' ')
    toast(`已贴 ${res.images.length} 张图，标记插在光标处`)
    return
  }
  const t = await readClipboardText()
  if (t) {
    insertAtCursor(t)
    toast('已粘贴文本')
    return
  }
  toast('剪贴板里没有可粘贴的图片或文字')
}

/** 粘贴目标若是别的输入框（批注、词库等）则不拦截，让它走浏览器默认行为 */
function isOwnPasteTarget(e) {
  const el = e && e.target
  if (!el || !el.tagName) return true
  const tag = String(el.tagName).toLowerCase()
  if (tag === 'textarea' || tag === 'input') return el === ta.value
  return true
}

async function onPaste(e) {
  if (!isOwnPasteTarget(e)) return
  e.preventDefault()
  await pasteFromClipboard()
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
  // 挂在 document 上：焦点不在输入框时 Ctrl+V 也能接到
  document.addEventListener('paste', onPaste)
})
onBeforeUnmount(() => {
  if (offFocus) offFocus()
  window.removeEventListener('pm:insert-snippet', onSnippetInsert)
  document.removeEventListener('paste', onPaste)
})
</script>

<template>
  <section class="px-3 pt-2.5 pb-2 shrink-0 space-y-2 hairline">
    <!-- 主输入框 -->
    <textarea
      ref="ta"
      v-model="state.composer.text"
      class="field h-[72px] leading-relaxed"
      placeholder="写提示词… Ctrl+V 在光标处粘贴文字/图片，Ctrl+Enter 入队"
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
      <button class="btn" title="粘贴剪贴板内容（图片落盘插入 [图N]，文字直接粘贴）" @click="pasteFromClipboard">粘贴</button>
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
