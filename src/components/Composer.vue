<script setup>
/**
 * 完整形态输入区域（Composer）
 *  - 满足需求 1：输入框大幅扩容，支持舒适多行书写
 *  - 满足需求 2 & 3：选词贴图不丢词、高亮框强关联、右上角图N动态序号、框内随时可编辑
 *  - 图片排：缩略图列表与虚线「+ 添加图片」
 */
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import {
  state, addImages, pickAndAddImages, removeImage, pushComposerToQueue,
  copyCompiled, toast, readClipboardText, imgUrl, openImagePreview
} from '../lib/store'
import { parseCompiledPrompt } from '../lib/compilePrompt'
import PromptEditor from './PromptEditor.vue'

const emit = defineEmits(['switch-tab'])
const promptEditor = ref(null)

/* ---------- 点击「添加/上传图片」按钮 ---------- */
async function onPickImages() {
  if (promptEditor.value) {
    promptEditor.value.saveSelection()
  }
  const res = await window.pm.chooseImageFiles()
  if (res && res.ok && res.images && res.images.length) {
    if (promptEditor.value) {
      await promptEditor.value.bindImageToSelection(res.images)
    } else {
      addImages(res.images)
    }
    toast(`已添加并关联 ${res.images.length} 张图片`)
  }
}

/* ---------- 粘贴纯文本（智能识别并还原已编译的提示词） ---------- */
async function pasteText() {
  const t = await readClipboardText()
  if (t) {
    const parsed = parseCompiledPrompt(t)
    if (parsed) {
      if (parsed.images && parsed.images.length) {
        state.composer.images = parsed.images
      }
      state.composer.text = parsed.text
      toast(`已还原图片与关键词 [图${parsed.images.length}]`)
      return
    }
    state.composer.text = (state.composer.text ? state.composer.text + ' ' : '') + t
    toast('已粘贴文本')
    return
  }
  toast('剪贴板中无文本')
}

/* ---------- 复制编译后的完整 Prompt ---------- */
async function copyCurrent() {
  const c = state.composer
  if (!String(c.text).trim() && !c.images.length) {
    toast('输入框是空的')
    return
  }
  await copyCompiled({ text: c.text, images: c.images })
  toast('已复制完整提示词（含图片本地路径映射）')
}

/* ---------- 存入队列 / 保存 (Ctrl+Enter) ---------- */
function enqueue() {
  const t = pushComposerToQueue()
  if (!t) toast('请输入提示词或添加图片')
  else toast('已保存关键词')
}

function onEditorEnter(e) {
  if (e.ctrlKey || e.metaKey) {
    e.preventDefault()
    enqueue()
  }
}

function clearComposer() {
  state.composer.text = ''
  state.composer.images = []
}

function clearAllImages() {
  state.composer.images = []
  toast('已清空所有关联图片')
}

function insertSnippet(text) {
  state.composer.text = (state.composer.text ? state.composer.text + ' ' : '') + text + ' '
}

function openSnippetPicker() {
  if (promptEditor.value) {
    promptEditor.value.saveSelection()
  }
  window.pm.openSnippetPicker()
}
</script>

<template>
  <section class="px-3.5 pt-3 pb-2 shrink-0 flex flex-col gap-2.5 hairline">
    <!-- 提示词富文本输入区 (选词贴图强关联、右上角图N、双击可放大) -->
    <PromptEditor
      ref="promptEditor"
      min-height="115px"
      placeholder="输入关键词与提示词… 提示：先输入文字，选中某一段关键词后按 Ctrl+V 贴图，即可将图片与该词强关联并在框内随时修改"
      @keydown-enter="onEditorEnter"
    />

    <!-- 编辑框底部操作栏（规整左右分栏布局，不局促） -->
    <div class="flex items-center gap-1.5 py-0.5">
      <!-- 选取/上传图片 -->
      <button
        class="btn text-sky-400 border-sky-400/30 hover:border-sky-400"
        title="上传图片文件（选中文字后点击，将与选中文本强关联）"
        @click="onPickImages"
      >
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
          <circle cx="8.5" cy="8.5" r="1.5" />
          <polyline points="21 15 16 10 5 21" />
        </svg>
        贴图 / 上传
      </button>

      <!-- 常用词库专属弹窗 (Alt+C) -->
      <button
        class="btn text-amber-300 border-amber-400/30 hover:border-amber-400 hover:text-amber-200"
        title="打开专属常用词库弹窗 (Alt+C) 选中后直接复制并粘贴到光标处"
        @click="openSnippetPicker"
      >
        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </svg>
        常用词库
      </button>

      <!-- 粘贴纯文本 -->
      <button class="btn" title="粘贴剪贴板文字" @click="pasteText">
        粘贴
      </button>

      <div class="flex-1" />

      <!-- 清空 -->
      <button
        v-if="state.composer.text || state.composer.images.length"
        class="btn btn-danger"
        title="清空当前输入与图片"
        @click="clearComposer"
      >
        清空
      </button>

      <!-- 编译并复制 -->
      <button class="btn" title="编译提示词（含图文精确锚点）并复制到剪贴板" @click="copyCurrent">
        复制
      </button>

      <!-- 保存入库 (Ctrl+Enter) -->
      <button class="btn btn-primary" title="保存关键词 (Ctrl+Enter)" @click="enqueue">
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
        保存
      </button>
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
          <span>关联图片 ({{ state.composer.images.length }})</span>
          <span class="text-[10px] text-slate-400 font-normal ml-1">· 双击图片放大预览</span>
        </div>
        <button
          class="text-[10px] text-rose-400/80 hover:text-rose-300 transition-colors cursor-pointer"
          title="清空所有关联图片"
          @click="clearAllImages"
        >
          清空图片
        </button>
      </div>

      <!-- 图片缩略图横排 -->
      <div class="flex items-center gap-2.5 overflow-x-auto pb-1">
        <div
          v-for="(img, idx) in state.composer.images"
          :key="img.path"
          class="thumbnail-card group"
          title="双击放大查看大图"
          @dblclick="openImagePreview(img, idx, state.composer.images)"
        >
          <!-- 图片主体区域 -->
          <div class="thumbnail-preview-area">
            <img :src="imgUrl(img.path)" class="w-full h-full object-cover transition-transform duration-200 group-hover:scale-108" alt="thumb">
            
            <!-- 左上角图N角标 -->
            <span class="thumbnail-badge">
              图{{ idx + 1 }}
            </span>

            <!-- 悬浮居中放大提示图标 -->
            <div class="thumbnail-zoom-hint">
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
                <line x1="11" y1="8" x2="11" y2="14" />
                <line x1="8" y1="11" x2="14" y2="11" />
              </svg>
            </div>

            <!-- 删除按钮 -->
            <button
              class="thumbnail-del-btn"
              title="删除此图片"
              @click.stop="removeImage(idx)"
            >
              <svg viewBox="0 0 24 24" width="9" height="9" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          <!-- 底部独立关联词条：不覆盖画面，清晰利落 -->
          <div class="thumbnail-caption" :title="img.note || ('图' + (idx + 1))">
            {{ img.note || ('图' + (idx + 1)) }}
          </div>
        </div>

        <!-- 虚线「+ 添加图片」 -->
        <button
          class="add-image-dashed-box"
          title="上传更多图片"
          @click="onPickImages"
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          <span class="text-[10px] font-medium tracking-tight">添加图片</span>
        </button>
      </div>
    </div>
  </section>
</template>
