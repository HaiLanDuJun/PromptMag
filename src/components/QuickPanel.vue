<script setup>
/**
 * 快捷输入面板（类似输入法悬浮窗）
 *  - 胶囊悬停后直接展开到此面板，可立即输入、Ctrl+V 粘贴文字或贴图、Ctrl+Enter 存弹夹
 *  - 不切 Tab、不离开当前窗口，用完自动收起回胶囊
 */
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import {
  state, addImages, pushComposerToQueue, toast, setMode, setAlwaysOnTop, readClipboardText
} from '../lib/store'

const ta = ref(null)

/* ---------- 光标处插入（未聚焦时自动聚焦并插到末尾） ---------- */
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
    toast(`已贴 ${res.images.length} 张图`)
    return
  }
  const txt = await readClipboardText()
  if (txt) {
    insertAtCursor(txt)
    toast('已粘贴文本')
    return
  }
  toast('剪贴板里没有可粘贴的图片或文字')
}

/** 粘贴目标若是别的输入框则不拦截，让它走浏览器默认行为 */
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

/* ---------- 保存 ---------- */
function onKeydown(e) {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    e.preventDefault()
    save()
  }
}

function save() {
  const t = pushComposerToQueue()
  if (!t) {
    toast('输入框是空的')
    return
  }
  toast('已存弹夹')
  ta.value && ta.value.focus()
}

const imgCount = () => state.composer.images.length
const pendingCount = () => state.queue.filter((t) => !t.done).length

onMounted(() => {
  nextTick(() => ta.value && ta.value.focus())
  // 挂在 document 上：即使光标不在输入框里（刚弹出、点了按钮）Ctrl+V 也能接到
  document.addEventListener('paste', onPaste)
})
onBeforeUnmount(() => {
  document.removeEventListener('paste', onPaste)
})
</script>

<template>
  <div class="quick">
    <!-- 顶部高光条 -->
    <div class="quick-glow" />

    <!-- 头部：拖拽区 + 展开 / 收起 -->
    <header class="drag-region quick-head">
      <span class="quick-logo">P</span>
      <span class="quick-title">PromptMag</span>
      <span v-if="pendingCount()" class="quick-count">{{ pendingCount() }}</span>

      <div class="flex-1" />

      <div class="no-drag flex items-center gap-1">
        <button
          class="qicon"
          :class="{ 'qicon-on': state.settings.alwaysOnTop }"
          :title="state.settings.alwaysOnTop ? '已置顶，不会被其他窗口覆盖（点击取消）' : '未置顶，会被其他窗口覆盖（点击置顶）'"
          @click="setAlwaysOnTop(!state.settings.alwaysOnTop)"
        >
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 17v5" /><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z" />
          </svg>
        </button>
        <button class="qicon" title="展开完整窗口" @click="setMode('full')">
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M15 3h6v6" /><path d="M9 21H3v-6" /><path d="M21 3l-7 7" /><path d="M3 21l7-7" />
          </svg>
        </button>
        <button class="qicon" title="收起为胶囊" @click="setMode('capsule')">
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round">
            <path d="M5 12h14" />
          </svg>
        </button>
      </div>
    </header>

    <!-- 输入区 -->
    <div class="quick-body">
      <textarea
        ref="ta"
        v-model="state.composer.text"
        class="quick-input"
        placeholder="输入提示词…  Ctrl+V 粘贴文字/图片 · Ctrl+Enter 存弹夹"
        @keydown="onKeydown"
      />
    </div>

    <!-- 操作行 -->
    <div class="quick-foot">
      <button class="qbtn" title="粘贴剪贴板内容（图片会落盘并插入 [图N]，文字直接粘贴）" @click="pasteFromClipboard">
        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="M21 15l-5-5L5 21" />
        </svg>
        贴图<span v-if="imgCount()" class="qbtn-badge">{{ imgCount() }}</span>
      </button>

      <div class="flex-1" />

      <button class="qbtn qbtn-primary" title="存入待发弹夹 (Ctrl+Enter)" @click="save">
        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 3v12" /><path d="M7 10l5 5 5-5" /><path d="M5 21h14" />
        </svg>
        存弹夹
      </button>
    </div>
  </div>
</template>
