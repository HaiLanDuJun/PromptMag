<script setup>
/**
 * 快捷输入面板（QuickPanel）
 *  - 契合用户需求：显示当前弹夹信息，支持快捷键 (Ctrl+Tab / Ctrl+M / Ctrl+1~9) 和点击快速切换弹夹
 *  - 弹窗输入框粘贴图片在框内呈现关联高亮框效果
 *  - 紧凑精致，操作流畅，支持双语国际化（i18n）
 */
import { nextTick, ref, computed, onMounted, onBeforeUnmount } from 'vue'
import {
  state, addImages, removeImage, pushComposerToQueue,
  toast, setMode, setAlwaysOnTop, readClipboardText,
  cycleMagazine, setActiveMagazine, getActiveMagazine,
  t, currentLocale
} from '../lib/store'
import { parseCompiledPrompt } from '../lib/compilePrompt'
import PromptEditor from './PromptEditor.vue'

const promptEditor = ref(null)
const dropdownRef = ref(null)
const isDropdownOpen = ref(false)

const currentMag = computed(() => getActiveMagazine() || state.magazines[0])
const currentMagName = computed(() => currentMag.value?.name || '')
const currentMagColor = computed(() => currentMag.value?.color || '#38bdf8')
const pendingCount = computed(() => (currentMag.value?.queue || []).filter((t) => !t.done).length)

function toggleDropdown(e) {
  if (e) e.stopPropagation()
  isDropdownOpen.value = !isDropdownOpen.value
}

function selectMag(id) {
  setActiveMagazine(id)
  isDropdownOpen.value = false
  nextTick(() => promptEditor.value && promptEditor.value.focus())
}

function onCycleMag(direction = 1) {
  cycleMagazine(direction)
  nextTick(() => promptEditor.value && promptEditor.value.focus())
}

/* ---------- 全局快捷键监听（在快捷输入框内可直接 Ctrl+Tab / Ctrl+M 切换弹夹） ---------- */
function onGlobalKeydown(e) {
  // 1. 快捷键切换弹夹：Ctrl+Tab, Ctrl+Shift+Tab, Ctrl+M, Alt+M
  if (
    (e.ctrlKey && e.key === 'Tab') ||
    (e.ctrlKey && (e.key === 'm' || e.key === 'M')) ||
    (e.altKey && (e.key === 'm' || e.key === 'M'))
  ) {
    e.preventDefault()
    e.stopPropagation()
    const direction = e.shiftKey ? -1 : 1
    onCycleMag(direction)
    return
  }

  // 2. 快捷键数字直达：Ctrl+1 ~ Ctrl+9
  if (e.ctrlKey && e.key >= '1' && e.key <= '9') {
    const idx = parseInt(e.key, 10) - 1
    if (idx >= 0 && idx < state.magazines.length) {
      e.preventDefault()
      e.stopPropagation()
      selectMag(state.magazines[idx].id)
      return
    }
  }

  // 3. Escape 键：如果下拉菜单展开则关闭下拉；否则收起为悬浮图标
  if (e.key === 'Escape') {
    e.preventDefault()
    e.stopPropagation()
    if (isDropdownOpen.value) {
      isDropdownOpen.value = false
    } else {
      setMode('capsule')
    }
    return
  }
}

function onClickOutside(e) {
  if (isDropdownOpen.value && dropdownRef.value && !dropdownRef.value.contains(e.target)) {
    isDropdownOpen.value = false
  }
}

onMounted(() => {
  window.addEventListener('keydown', onGlobalKeydown, true)
  window.addEventListener('click', onClickOutside, true)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onGlobalKeydown, true)
  window.removeEventListener('click', onClickOutside, true)
})

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
  // 支持软件内部正常换行：Ctrl+Enter 或 Cmd+Enter 保存入库；单独 Enter 正常换行
  if (e.ctrlKey || e.metaKey) {
    e.preventDefault()
    save()
  }
}

function save() {
  const res = pushComposerToQueue(state.activeMagazineId)
  if (!res) {
    toast(t('toast.pleaseInputOrImg'))
    return
  }
  if (res.targetMagazine) {
    toast(t('toast.savedToMagazine', { name: res.targetMagazine.name }))
  }
  nextTick(() => promptEditor.value && promptEditor.value.focus())
}
</script>

<template>
  <div class="drag-region flex flex-col p-3 w-full h-full box-border">
    <!-- 头部：标题、弹夹信息与控制按钮 -->
    <div class="flex items-center justify-between px-1 h-6 shrink-0 mb-2">
      <div class="flex items-center gap-1.5 min-w-0">
        <!-- 展开为完整面板 -->
        <button
          type="button"
          class="no-drag icon-btn !w-5 !h-5 text-sky-400 hover:text-sky-300 hover:bg-sky-500/15 shrink-0"
          :title="t('quickPanel.expandFull')"
          @click="setMode('full')"
        >
          <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M15 3h6v6" /><path d="M9 21H3v-6" /><path d="M21 3l-7 7" /><path d="M3 21l7-7" />
          </svg>
        </button>

        <!-- 弹夹信息徽章 / 快捷切换药丸 -->
        <div ref="dropdownRef" class="no-drag relative flex items-center">
          <div
            class="flex items-center h-5.5 rounded-full text-[11px] font-medium transition-all duration-150 border overflow-hidden"
            :style="{
              backgroundColor: `${currentMagColor}18`,
              borderColor: `${currentMagColor}40`,
              color: currentMagColor
            }"
          >
            <!-- 点击药丸主体：轮流切换至下一个弹夹 -->
            <button
              type="button"
              class="flex items-center gap-1.5 px-2 py-0.5 h-full hover:brightness-125 transition-colors cursor-pointer select-none"
              :title="`${currentMagName} (${t('quickPanel.pendingCount', { count: pendingCount })}) - ${t('quickPanel.switchMagHint')}`"
              @click="onCycleMag(1)"
            >
              <span class="w-1.5 h-1.5 rounded-full shrink-0 shadow-sm" :style="{ backgroundColor: currentMagColor }" />
              <span class="max-w-[85px] truncate font-medium">{{ currentMagName }}</span>
              <span class="text-[10px] opacity-80 font-mono">({{ pendingCount }})</span>
            </button>

            <!-- 点击右侧箭头：展开弹夹完整列表 -->
            <button
              type="button"
              class="px-1.5 h-full hover:brightness-125 transition-colors border-l border-white/10 flex items-center justify-center cursor-pointer"
              :title="t('quickPanel.magList')"
              @click="toggleDropdown"
            >
              <svg
                viewBox="0 0 24 24"
                width="9"
                height="9"
                fill="none"
                stroke="currentColor"
                stroke-width="2.5"
                stroke-linecap="round"
                stroke-linejoin="round"
                class="transition-transform duration-150"
                :class="{ 'rotate-180': isDropdownOpen }"
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
          </div>

          <!-- 下拉弹夹选择列表 -->
          <div
            v-if="isDropdownOpen"
            class="absolute top-7 left-0 z-50 min-w-[190px] max-w-[240px] max-h-[140px] overflow-y-auto bg-slate-900/95 backdrop-blur-md border border-slate-700/80 rounded-lg shadow-2xl py-1 px-1 flex flex-col gap-0.5 text-xs"
          >
            <button
              v-for="(mag, idx) in state.magazines"
              :key="mag.id"
              type="button"
              class="flex items-center justify-between px-2 py-1.5 rounded-md hover:bg-slate-800/80 transition-colors text-left group cursor-pointer"
              :class="{ 'bg-slate-800/60 font-semibold': mag.id === state.activeMagazineId }"
              @click="selectMag(mag.id)"
            >
              <div class="flex items-center gap-1.5 min-w-0">
                <span class="w-2 h-2 rounded-full shrink-0" :style="{ backgroundColor: mag.color || '#38bdf8' }" />
                <span class="truncate text-slate-200 group-hover:text-white max-w-[100px]">{{ mag.name }}</span>
                <span class="text-[10px] text-slate-400 font-mono">({{ (mag.queue || []).filter((t) => !t.done).length }})</span>
              </div>
              <div class="flex items-center gap-1 shrink-0 ml-2">
                <span v-if="idx < 9" class="text-[9px] text-slate-500 font-mono">Ctrl+{{ idx + 1 }}</span>
                <svg
                  v-if="mag.id === state.activeMagazineId"
                  viewBox="0 0 24 24"
                  width="12"
                  height="12"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2.5"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  class="text-sky-400"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
            </button>

            <!-- 底部快捷键提示 -->
            <div class="border-t border-slate-800 mt-1 pt-1 px-2 py-0.5 text-[9px] text-slate-400 tracking-tight text-center select-none">
              {{ t('quickPanel.shortcutHint') }}
            </div>
          </div>
        </div>
      </div>

      <div class="no-drag flex items-center gap-1 shrink-0">
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
      <button
        class="btn btn-primary !py-1 px-4 flex items-center gap-1"
        :title="`${t('quickPanel.saveBtn')} (${currentMagName}) · Ctrl+Enter`"
        @click="save"
      >
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
        {{ t('quickPanel.saveBtn') }}
      </button>
    </div>
  </div>
</template>
