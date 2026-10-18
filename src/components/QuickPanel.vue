<script setup>
/**
 * 快捷输入面板（QuickPanel）
 *  - 契合用户需求：弹窗输入框粘贴图片不需要显示底部的图片卡片排，直接在框内呈现关联高亮框效果
 *  - 紧凑精致，操作流畅，支持双语国际化（i18n）
 */
import { nextTick, ref } from 'vue'
import {
  state, addImages, removeImage, pushComposerToQueue, requestSaveComposer,
  toast, setMode, setAlwaysOnTop, readClipboardText,
  t, currentLocale
} from '../lib/store'
import { parseCompiledPrompt } from '../lib/compilePrompt'
import PromptEditor from './PromptEditor.vue'

const promptEditor = ref(null)

/* ---------- 点击「添加/上传图片」按钮 ---------- */
async function onPickImages() {
  state.isDialogOpening = true
  if (promptEditor.value) {
    promptEditor.value.saveSelection()
  }
  try {
    const res = await window.pm.chooseImageFiles()
    if (res && res.ok && res.images && res.images.length) {
      if (promptEditor.value) {
        await promptEditor.value.bindImageToSelection(res.images)
      } else {
        addImages(res.images)
      }
      toast(t('toast.imagesAdded', { count: res.images.length }))
    }
  } catch (e) {
    console.error('chooseImageFiles error:', e)
  } finally {
    state.isDialogOpening = false
    setMode('quick')
    nextTick(() => {
      promptEditor.value && promptEditor.value.focus()
    })
  }
}

/* ---------- 粘贴纯文本（智能识别并还原已编译的提示词） ---------- */
async function pasteText() {
  const txt = await readClipboardText()
  if (txt) {
    const parsed = parseCompiledPrompt(txt)
    if (parsed) {
      if (parsed.images && parsed.images.length) {
        state.composer.images = parsed.images
      }
      state.composer.text = parsed.text
      toast(t('toast.restoredPrompt', { count: parsed.images.length }))
      return
    }
    state.composer.text = (state.composer.text ? state.composer.text + ' ' : '') + txt
    toast(t('toast.pastedText'))
    return
  }
  toast(t('toast.noClipboardText'))
}

/* ---------- 保存入库 ---------- */
function onEnter(e) {
  if (e.shiftKey) return // Shift+Enter 正常换行
  e.preventDefault()
  save()
}

function save() {
  const res = requestSaveComposer(() => {
    nextTick(() => promptEditor.value && promptEditor.value.focus())
  })
  if (!res) return
  nextTick(() => promptEditor.value && promptEditor.value.focus())
}
</script>

<template>
  <div class="drag-region flex flex-col p-3 w-full h-full box-border">
    <!-- 头部：标题与小操作 -->
    <div class="flex items-center justify-between px-1 h-6 shrink-0 mb-2">
      <div class="flex items-center gap-1.5">
        <span class="text-sky-400 flex items-center">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
          </svg>
        </span>
        <span class="text-slate-100 font-semibold text-[11px] tracking-wide">{{ t('quickPanel.title') }}</span>
      </div>

      <div class="no-drag flex items-center gap-1">
        <!-- 置顶开关 -->
        <button
          class="icon-btn !w-5 !h-5"
          :class="{ active: state.settings.alwaysOnTop }"
          :title="state.settings.alwaysOnTop ? t('quickPanel.pinned') : t('quickPanel.clickPin')"
          @click="setAlwaysOnTop(!state.settings.alwaysOnTop)"
        >
          <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 17v5" /><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z" />
          </svg>
        </button>
        <!-- 展开完整视图 -->
        <button
          class="icon-btn !w-5 !h-5"
          :title="t('quickPanel.expandFull')"
          @click="setMode('full')"
        >
          <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M15 3h6v6" /><path d="M9 21H3v-6" /><path d="M21 3l-7 7" /><path d="M3 21l7-7" />
          </svg>
        </button>
        <!-- 收起为悬浮图标 -->
        <button
          class="icon-btn !w-5 !h-5 hover:!text-rose-400"
          :title="t('quickPanel.collapseOrb') + ' (Esc)'"
          @click="setMode('capsule')"
        >
          <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
    </div>

    <!-- 弹窗输入框：纯净呈现图文关联框（严格限制在中间区域内滚动，严禁溢出压住底部按钮） -->
    <div class="no-drag flex-1 min-h-0 overflow-hidden flex flex-col mb-2.5">
      <PromptEditor
        ref="promptEditor"
        class="h-full flex-1 min-h-0"
        min-height="40px"
        :placeholder="t('quickPanel.placeholder')"
        @keydown-enter="onEnter"
      />
    </div>

    <!-- 底部操作行：固定在底部，永不被文本重叠 -->
    <div class="no-drag flex items-center gap-1.5 shrink-0 px-0.5">
      <button
        class="btn text-sky-400 border-sky-400/30 hover:border-sky-400 !py-1"
        :title="t('composer.uploadBtnTitle')"
        @mousedown.prevent
        @click="onPickImages"
      >
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
          <circle cx="8.5" cy="8.5" r="1.5" />
          <polyline points="21 15 16 10 5 21" />
        </svg>
        {{ t('quickPanel.uploadImg') }}
      </button>

      <button class="btn !py-1" :title="t('composer.pasteBtnTitle')" @click="pasteText">
        {{ t('quickPanel.pasteText') }}
      </button>

      <div class="flex-1" />

      <!-- 保存入库 (Enter) -->
      <button class="btn btn-primary !py-1 px-4" :title="t('quickPanel.saveBtn') + ' (Enter)'" @click="save">
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
        {{ t('quickPanel.saveBtn') }}
      </button>
    </div>
  </div>
</template>
