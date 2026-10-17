<script setup>
/**
 * 专属收藏夹提示词弹窗（SnippetPicker）
 *  - 契合需求 3：添加快捷键（默认 Alt+C）开启专属弹窗，
 *    用户选择之后直接复制并且自动粘贴到光标处（无缝支持 VS Code/浏览器/微信/系统任何前台应用）
 *  - 支持全键盘操作：↑↓ 选择、Enter 填入、1-9 快捷数字键、Esc 关闭
 *  - 支持关键词实时模糊搜索与双语国际化
 */
import { computed, nextTick, onMounted, ref } from 'vue'
import { state, initStore, t, currentLocale } from '../lib/store'

const searchQuery = ref('')
const activeIndex = ref(0)
const searchInput = ref(null)

const filteredSnippets = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) return state.snippets
  return state.snippets.filter((s) => s.text.toLowerCase().includes(q))
})

async function onSelect(snippet) {
  if (!snippet || !snippet.text) return
  await window.pm.pasteSnippetAtCursor(snippet.text)
}

function onClose() {
  window.pm.closeSnippetPicker()
}

function onKeydown(e) {
  const list = filteredSnippets.value
  if (!list.length) {
    if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    }
    return
  }

  if (e.key === 'ArrowDown') {
    e.preventDefault()
    activeIndex.value = (activeIndex.value + 1) % list.length
    scrollActiveIntoView()
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    activeIndex.value = (activeIndex.value - 1 + list.length) % list.length
    scrollActiveIntoView()
  } else if (e.key === 'Enter') {
    e.preventDefault()
    onSelect(list[activeIndex.value])
  } else if (e.key === 'Escape') {
    e.preventDefault()
    onClose()
  } else if (!searchQuery.value && /^[1-9]$/.test(e.key)) {
    // 搜索框为空时按 1-9 快速选择对应编号
    const num = Number(e.key) - 1
    if (list[num]) {
      e.preventDefault()
      onSelect(list[num])
    }
  }
}

function scrollActiveIntoView() {
  nextTick(() => {
    const el = document.querySelector(`.picker-item[data-idx="${activeIndex.value}"]`)
    if (el) el.scrollIntoView({ block: 'nearest' })
  })
}

onMounted(async () => {
  await initStore()
  nextTick(() => searchInput.value && searchInput.value.focus())

  if (window.pm && window.pm.onSnippetPickerOpened) {
    window.pm.onSnippetPickerOpened(async () => {
      await initStore()
      searchQuery.value = ''
      activeIndex.value = 0
      nextTick(() => searchInput.value && searchInput.value.focus())
    })
  }

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') onClose()
  })
})
</script>

<template>
  <div class="snippet-picker-shell drag-region flex flex-col w-full h-full p-3 box-border">
    <!-- 头部：标题与快捷键标识 -->
    <div class="flex items-center justify-between px-1 h-7 shrink-0 mb-2">
      <div class="flex items-center gap-1.5">
        <span class="text-amber-400 flex items-center">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
          </svg>
        </span>
        <span class="text-slate-100 font-semibold text-[12px] tracking-wide">{{ t('snippetPicker.title') }}</span>
        <span
          v-if="state.settings.hotkeySnippets"
          class="px-1.5 py-0.2 rounded bg-amber-500/15 border border-amber-400/30 text-[9px] text-amber-300 font-bold ml-1"
        >
          {{ state.settings.hotkeySnippets }}
        </span>
      </div>

      <div class="no-drag flex items-center gap-1">
        <button
          class="icon-btn !w-5 !h-5 hover:!text-rose-400"
          :title="t('common.close') + ' (Esc)'"
          @click="onClose"
        >
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
    </div>

    <!-- 搜索输入框 -->
    <div class="no-drag shrink-0 mb-2.5">
      <div class="relative flex items-center">
        <span class="absolute left-3 text-slate-400 pointer-events-none flex items-center">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </span>
        <input
          ref="searchInput"
          v-model="searchQuery"
          type="text"
          class="picker-search-input"
          :placeholder="t('snippetPicker.searchPlaceholder')"
          @keydown="onKeydown"
        />
        <button
          v-if="searchQuery"
          class="absolute right-2.5 text-slate-500 hover:text-slate-300 text-xs cursor-pointer"
          @click="searchQuery = ''"
        >
          ×
        </button>
      </div>
    </div>

    <!-- 提示词列表 -->
    <div class="no-drag flex-1 min-h-0 overflow-y-auto space-y-1 pr-0.5">
      <!-- 空状态 -->
      <div v-if="!filteredSnippets.length" class="py-12 text-center text-slate-400 text-xs">
        <div class="text-slate-600 mb-1 flex justify-center">
          <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </div>
        <p>{{ searchQuery ? t('snippetPicker.emptySearch') : t('snippets.emptyTitle') }}</p>
      </div>

      <!-- 列表条目 -->
      <div
        v-for="(s, idx) in filteredSnippets"
        :key="s.id"
        class="picker-item group"
        :class="{ active: idx === activeIndex }"
        :data-idx="idx"
        @click="onSelect(s)"
        @mouseenter="activeIndex = idx"
      >
        <!-- 序号 / 数字快捷键角标 -->
        <span
          class="picker-num-badge shrink-0"
          :class="idx < 9 && !searchQuery ? 'is-shortcut' : ''"
          :title="idx < 9 && !searchQuery ? (currentLocale === 'en' ? `Press ${idx + 1} to select` : `按数字键 ${idx + 1} 快速选择`) : ''"
        >
          {{ idx + 1 }}
        </span>

        <!-- 提示词文字 -->
        <span class="picker-item-text truncate">
          {{ s.text }}
        </span>

        <!-- 右侧回车提示 -->
        <span class="picker-action-hint">
          <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="inline mr-0.5">
            <polyline points="9 10 4 15 9 20" />
            <path d="M20 4v7a4 4 0 0 1-4 4H4" />
          </svg>
          {{ currentLocale === 'en' ? 'Insert' : '填入' }}
        </span>
      </div>
    </div>

    <!-- 底部状态说明栏 -->
    <div class="no-drag flex items-center justify-between px-1 pt-2 shrink-0 border-t border-slate-700/40 text-[10px] text-slate-400">
      <div class="flex items-center gap-2">
        <span><kbd class="picker-kbd">↑↓</kbd> {{ currentLocale === 'en' ? 'Select' : '选择' }}</span>
        <span><kbd class="picker-kbd">Enter</kbd> {{ currentLocale === 'en' ? 'Paste to cursor' : '填入光标处' }}</span>
        <span><kbd class="picker-kbd">1-9</kbd> {{ currentLocale === 'en' ? 'Quick' : '快捷键' }}</span>
        <span><kbd class="picker-kbd">Esc</kbd> {{ currentLocale === 'en' ? 'Close' : '关闭' }}</span>
      </div>
      <span class="text-amber-400/80 font-medium">{{ currentLocale === 'en' ? state.snippets.length + ' Total' : '共 ' + state.snippets.length + ' 条' }}</span>
    </div>
  </div>
</template>
