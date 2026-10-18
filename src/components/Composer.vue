<script setup>
/**
 * 完整形态输入区域（Composer）
 *  - 满足需求 1：输入框大幅扩容，支持舒适多行书写
 *  - 满足需求 2 & 3：选词贴图不丢词、高亮框强关联、右上角图N动态序号、框内随时可编辑
 *  - 图片排：缩略图列表与虚线「+ 添加图片」
 *  - 全面支持中英双语（i18n）
 */
import { nextTick, ref } from 'vue'
import {
  state, addImages, requestSaveComposer,
  copyCompiled, toast, readClipboardText, cancelEditingTask,
  t
} from '../lib/store.js'
import { parseCompiledPrompt } from '../lib/compilePrompt.js'
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

/* ---------- 复制编译后的完整 Prompt ---------- */
async function copyCurrent() {
  const c = state.composer
  if (!String(c.text).trim() && !c.images.length) {
    toast(t('toast.composerEmpty'))
    return
  }
  await copyCompiled({ text: c.text, images: c.images })
  toast(t('toast.copiedFullPrompt'))
}

/* ---------- 存入队列 / 保存 (Ctrl+Enter) ---------- */
function enqueue() {
  requestSaveComposer()
}

function onEditorEnter(e) {
  if (e.ctrlKey || e.metaKey) {
    e.preventDefault()
    enqueue()
  }
}

function clearComposer() {
  if (state.editingTaskId) {
    cancelEditingTask()
    return
  }
  state.composer.text = ''
  state.composer.images = []
}

function clearAllImages() {
  state.composer.images = []
  toast(t('toast.clearedImages'))
}
</script>

<template>
  <section class="px-3.5 pt-3 pb-2 shrink-0 flex flex-col gap-2.5 hairline">
    <!-- 提示词富文本输入区 (选词贴图强关联、右上角图N、双击可放大) -->
    <PromptEditor
      ref="promptEditor"
      min-height="115px"
      :placeholder="t('composer.placeholder')"
      @keydown-enter="onEditorEnter"
    />

    <!-- 编辑框底部操作栏（规整左右分栏布局，不局促） -->
    <!-- 操作按钮工具栏 -->
    <div class="flex items-center justify-between gap-1.5 pt-0.5 select-none">
      <div class="flex items-center gap-1.5">
        <!-- 选取/上传图片 -->
        <button
          class="btn text-sky-400 border-sky-400/30 hover:border-sky-400"
          :title="t('composer.uploadBtnTitle')"
          @mousedown.prevent
          @click="onPickImages"
        >
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <polyline points="21 15 16 10 5 21" />
          </svg>
          {{ t('composer.uploadBtn') }}
        </button>

        <!-- 粘贴纯文本 -->
        <button class="btn" :title="t('composer.pasteBtnTitle')" @click="pasteText">
          {{ t('composer.pasteBtn') }}
        </button>
      </div>

      <div class="flex items-center gap-1.5 ml-auto">
        <!-- 清空 / 取消编辑 -->
        <button
          v-if="state.composer.text || state.composer.images.length || state.editingTaskId"
          class="btn btn-danger"
          :title="state.editingTaskId ? t('composer.cancelEdit') : t('composer.clearBtnTitle')"
          @click="clearComposer"
        >
          {{ state.editingTaskId ? t('composer.cancelEdit') : t('composer.clearBtn') }}
        </button>

        <!-- 编译并复制 -->
        <button class="btn" :title="t('composer.copyBtnTitle')" @click="copyCurrent">
          {{ t('composer.copyBtn') }}
        </button>

        <!-- 保存入库 / 保存修改 (Ctrl+Enter) -->
        <button
          class="btn btn-primary"
          :class="{ '!bg-amber-500/25 !border-amber-400 !text-amber-200 shadow-[0_0_8px_rgba(245,158,11,0.2)]': state.editingTaskId }"
          :title="state.editingTaskId ? t('composer.saveEditBtnTitle') : t('composer.saveBtnTitle')"
          @click="enqueue"
        >
          <svg v-if="state.editingTaskId" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          <svg v-else viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          {{ state.editingTaskId ? t('composer.saveEditBtn') : t('composer.saveBtn') }}
        </button>
      </div>
    </div>

    <!-- 图片展示排（舒适宽敞卡片 + 双击放大 + 词条独立下栏，彻底告别挤在一起） -->
    <div v-if="state.composer.images.length" class="image-shelf-card flex flex-col gap-2">
      <!-- 顶栏标题与统计 -->
      <div class="flex items-center justify-between px-1">
        <div class="flex items-center gap-1.5 text-sky-400 font-medium text-[11px]">
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <polyline points="21 15 16 10 5 21" />
          </svg>
          <span>{{ t('composer.relatedImages') }} ({{ state.composer.images.length }})</span>
          <span class="text-[10px] text-sky-300/80 font-normal ml-1 bg-sky-500/10 px-1.5 py-0.5 rounded border border-sky-400/20">{{ t('composer.doubleClickPreview') }}</span>
        </div>
        <button
          class="text-[10px] text-rose-400/80 hover:text-rose-300 transition-colors cursor-pointer"
          :title="t('composer.clearImagesTitle')"
          @click="clearAllImages"
        >
          {{ t('composer.clearImages') }}
        </button>
      </div>

      <!-- 图片缩略图横排 -->
      <div class="flex items-center gap-2.5 overflow-x-auto pb-1">
        <div
          v-for="(img, idx) in state.composer.images"
          :key="img.path"
          class="thumbnail-card group"
          :title="t('editor.badgeTitle')"
          @dblclick="openImagePreview(img, idx, state.composer.images)"
        >
          <!-- 图片主体区域（单击与双击均可全屏预览查看） -->
          <div
            class="thumbnail-preview-area"
            @click="openImagePreview(img, idx, state.composer.images)"
          >
            <img :src="imgUrl(img.path)" class="w-full h-full object-cover transition-transform duration-200 group-hover:scale-108" alt="thumb">
            
            <!-- 左上角图N角标 -->
            <span class="thumbnail-badge">
              {{ currentLocale === 'en' ? 'Img ' + (idx + 1) : '图' + (idx + 1) }}
            </span>

            <!-- 悬浮居中放大提示图标 -->
            <div class="thumbnail-zoom-hint" :title="t('composer.doubleClickPreview')">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
                <line x1="11" y1="8" x2="11" y2="14" />
                <line x1="8" y1="11" x2="14" y2="11" />
              </svg>
              <span class="text-[9px] font-semibold leading-none">{{ currentLocale === 'en' ? 'Zoom' : '双击放大' }}</span>
            </div>

            <!-- 删除按钮 -->
            <button
              class="thumbnail-del-btn"
              :title="t('composer.deleteImageTitle')"
              @click.stop="removeImage(idx)"
            >
              <svg viewBox="0 0 24 24" width="9" height="9" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          <!-- 底部独立关联词条：不覆盖画面，清晰利落 -->
          <div class="thumbnail-caption" :title="img.note || (currentLocale === 'en' ? 'Img ' + (idx + 1) : '图' + (idx + 1))">
            {{ img.note || (currentLocale === 'en' ? 'Img ' + (idx + 1) : '图' + (idx + 1)) }}
          </div>
        </div>

        <!-- 虚线「+ 添加图片」 -->
        <button
          class="add-image-dashed-box"
          :title="t('composer.addMoreImagesTitle')"
          @click="onPickImages"
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          <span class="text-[10px] font-medium tracking-tight">{{ t('composer.addMoreImages') }}</span>
        </button>
      </div>
    </div>
  </section>
</template>
