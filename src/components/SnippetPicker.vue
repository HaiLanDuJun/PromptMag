<script setup>
/**
 * 专属弹窗（SnippetPicker & AccountsPicker）
 *  - 契合需求：
 *    1. 常用收藏提示词：快捷键（默认 Alt+X）开启专属弹窗，直接复制并自动粘贴到光标处；
 *    2. 测试账号密码：快捷键（默认 Alt+Z）或 Tab 切换弹出，直接复制/填入密码或账号到光标处；
 *  - 支持全键盘操作：
 *    - Tab / Ctrl+Tab：切换「常用收藏」与「账号密码」
 *    - ↑↓：选择条目
 *    - Enter：收藏提示词填入 / 账号密码填入密码
 *    - Shift+Enter：账号密码填入账号
 *    - Space：显隐选中账号密码（10秒防窥自动恢复）
 *    - 1-9：数字快捷直选
 *    - Esc：关闭弹窗
 *  - 支持关键词实时模糊搜索与双语国际化
 */
import { computed, nextTick, onMounted, reactive, ref } from 'vue'
import {
  state, initStore, t, currentLocale,
  revealPassword, isPasswordEncrypted
} from '../lib/store'

const activeTab = ref('snippets') // 'snippets' | 'accounts'
const searchQuery = ref('')
const activeIndex = ref(0)
const searchInput = ref(null)

// 账号密码明文显示映射与定时器（10秒防窥自动恢复）
const accountRevealed = reactive({})
let revealTimers = {}

async function toggleAccountReveal(acc, e) {
  if (e) e.stopPropagation()
  if (!acc) return
  if (accountRevealed[acc.id]) {
    accountRevealed[acc.id] = false
    clearTimeout(revealTimers[acc.id])
    delete acc._pickerPlain
    return
  }
  const plain = await revealPassword(acc)
  acc._pickerPlain = plain
  accountRevealed[acc.id] = true
  clearTimeout(revealTimers[acc.id])
  revealTimers[acc.id] = setTimeout(() => {
    accountRevealed[acc.id] = false
    delete acc._pickerPlain
  }, 10000)
}

const filteredSnippets = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  const favMag = state.magazines.find((m) => m.id === 'favorites')
  const list = (favMag && Array.isArray(favMag.queue) ? favMag.queue : state.snippets) || []
  if (!q) return list
  return list.filter((s) => (s.text || '').toLowerCase().includes(q))
})

const filteredAccounts = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  const list = state.accounts || []
  if (!q) return list
  return list.filter((a) =>
    (a.title || '').toLowerCase().includes(q) ||
    (a.username || '').toLowerCase().includes(q) ||
    (a.note || '').toLowerCase().includes(q)
  )
})

const currentList = computed(() => {
  return activeTab.value === 'snippets' ? filteredSnippets.value : filteredAccounts.value
})

function switchTab(tab) {
  activeTab.value = tab
  searchQuery.value = ''
  activeIndex.value = 0
  nextTick(() => searchInput.value && searchInput.value.focus())
}

async function onSelectSnippet(snippet) {
  if (!snippet) return
  const text = snippet.text || ''
  if (text) {
    await window.pm.pasteSnippetAtCursor(text)
  }
}

async function onPasteAccount(acc, type = 'password') {
  if (!acc) return
  let text = ''
  if (type === 'username') {
    text = acc.username || ''
  } else {
    // 默认填入密码明文
    text = await revealPassword(acc)
  }
  if (text) {
    await window.pm.pasteSnippetAtCursor(text)
  }
}

function onClose() {
  window.pm.closeSnippetPicker()
}

function onKeydown(e) {
  // Tab 快捷切换分类
  if (e.key === 'Tab') {
    e.preventDefault()
    switchTab(activeTab.value === 'snippets' ? 'accounts' : 'snippets')
    return
  }

  const list = currentList.value
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
    const item = list[activeIndex.value]
    if (activeTab.value === 'snippets') {
      onSelectSnippet(item)
    } else {
      onPasteAccount(item, e.shiftKey ? 'username' : 'password')
    }
  } else if (e.key === ' ' && activeTab.value === 'accounts' && (!searchQuery.value || e.ctrlKey)) {
    // 空格键快速显隐密码（搜索框为空或按 Ctrl+Space 时生效）
    e.preventDefault()
    const item = list[activeIndex.value]
    if (item) toggleAccountReveal(item)
  } else if (e.key === 'Escape') {
    e.preventDefault()
    onClose()
  } else if (!searchQuery.value && /^[1-9]$/.test(e.key)) {
    // 搜索框为空时按 1-9 快速选择对应编号
    const num = Number(e.key) - 1
    if (list[num]) {
      e.preventDefault()
      if (activeTab.value === 'snippets') {
        onSelectSnippet(list[num])
      } else {
        onPasteAccount(list[num], e.shiftKey ? 'username' : 'password')
      }
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
    window.pm.onSnippetPickerOpened(async (data) => {
      await initStore()
      if (data && data.tab) {
        activeTab.value = data.tab === 'accounts' ? 'accounts' : 'snippets'
      }
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
    <!-- 头部：分类 Tab 切换与快捷键标识 -->
    <div class="flex items-center justify-between px-1 h-7 shrink-0 mb-2">
      <!-- 左侧：Tabs 切换 -->
      <div class="no-drag flex items-center gap-1 bg-slate-900/80 p-0.5 rounded-lg border border-slate-700/60">
        <button
          class="picker-tab-btn"
          :class="{ active: activeTab === 'snippets' }"
          :title="t('snippetPicker.tabSnippetsTip')"
          @click="switchTab('snippets')"
        >
          <span class="text-amber-400">⭐</span>
          <span>{{ t('snippetPicker.tabSnippets') }}</span>
          <span v-if="state.settings.hotkeySnippets" class="picker-tab-badge">{{ state.settings.hotkeySnippets }}</span>
        </button>
        <button
          class="picker-tab-btn"
          :class="{ active: activeTab === 'accounts' }"
          :title="t('snippetPicker.tabAccountsTip')"
          @click="switchTab('accounts')"
        >
          <span class="text-sky-400">🔐</span>
          <span>{{ t('snippetPicker.tabAccounts') }}</span>
          <span v-if="state.settings.hotkeyAccounts" class="picker-tab-badge">{{ state.settings.hotkeyAccounts }}</span>
        </button>
      </div>

      <!-- 右侧：Tab切换按键提示 + 关闭 -->
      <div class="no-drag flex items-center gap-1.5">
        <span class="text-[9.5px] text-slate-400 hidden sm:inline-flex items-center gap-1">
          <kbd class="picker-kbd">Tab</kbd> {{ t('snippetPicker.switchTabHint') }}
        </span>
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
          :placeholder="activeTab === 'snippets' ? t('snippetPicker.searchPlaceholder') : t('snippetPicker.searchAccountsPlaceholder')"
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

    <!-- 列表内容区 -->
    <div class="no-drag flex-1 min-h-0 overflow-y-auto space-y-1.5 pr-0.5">
      <!-- 1. 收藏提示词列表 -->
      <template v-if="activeTab === 'snippets'">
        <!-- 空状态 -->
        <div v-if="!filteredSnippets.length" class="py-12 text-center text-slate-400 text-xs">
          <div class="text-slate-600 mb-1 flex justify-center">
            <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </div>
          <p>{{ searchQuery ? t('snippetPicker.emptySearch') : t('snippets.emptyTitle') }}</p>
        </div>

        <!-- 收藏提示词条目 -->
        <div
          v-for="(s, idx) in filteredSnippets"
          :key="s.id"
          class="picker-item group"
          :class="{ active: idx === activeIndex }"
          :data-idx="idx"
          @click="onSelectSnippet(s)"
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
            {{ s.text || (s.images && s.images.length ? (currentLocale === 'en' ? `[${s.images.length} Images]` : `[${s.images.length} 张图片]`) : (currentLocale === 'en' ? 'Untitled Prompt' : '未命名提示词')) }}
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
      </template>

      <!-- 2. 测试账号密码列表 -->
      <template v-else>
        <!-- 空状态 -->
        <div v-if="!filteredAccounts.length" class="py-12 text-center text-slate-400 text-xs">
          <div class="text-slate-600 mb-1 flex justify-center text-2xl">🔐</div>
          <p>{{ searchQuery ? t('snippetPicker.emptySearch') : t('snippetPicker.emptyAccounts') }}</p>
          <p v-if="!searchQuery" class="text-[10px] text-slate-500 mt-1">{{ t('snippetPicker.emptyAccountsHint') }}</p>
        </div>

        <!-- 账号条目 -->
        <div
          v-for="(acc, idx) in filteredAccounts"
          :key="acc.id"
          class="picker-item picker-account-item group"
          :class="{ active: idx === activeIndex }"
          :data-idx="idx"
          @click="onPasteAccount(acc, 'password')"
          @mouseenter="activeIndex = idx"
        >
          <!-- 序号 / 数字快捷键角标 -->
          <span
            class="picker-num-badge shrink-0"
            :class="idx < 9 && !searchQuery ? 'is-shortcut' : ''"
            :title="idx < 9 && !searchQuery ? (currentLocale === 'en' ? `Press ${idx + 1} for password, Shift+${idx + 1} for username` : `按数字键 ${idx + 1} 填入密码，Shift+${idx + 1} 填入账号`) : ''"
          >
            {{ idx + 1 }}
          </span>

          <!-- 账号核心信息 -->
          <div class="flex-1 min-w-0 flex flex-col gap-1">
            <div class="flex items-center gap-1.5">
              <span class="picker-item-text font-medium truncate">{{ acc.title }}</span>
              <span
                class="text-[9px] px-1 py-0.2 rounded shrink-0"
                :class="isPasswordEncrypted(acc) ? 'text-sky-400 bg-sky-500/15 border border-sky-400/30' : 'text-amber-400 bg-amber-500/15 border border-amber-400/30'"
              >
                {{ isPasswordEncrypted(acc) ? '🔒' : '⚠️' }}
              </span>
            </div>

            <!-- 用户名与密码预览条 -->
            <div class="flex items-center gap-2 text-[10.5px]">
              <span v-if="acc.username" class="text-slate-300 font-mono truncate max-w-[150px]" :title="acc.username">
                <span class="text-slate-500 text-[9px] mr-0.5">U:</span>{{ acc.username }}
              </span>
              <span v-if="acc.password" class="text-slate-400 font-mono flex items-center gap-1">
                <span class="text-slate-500 text-[9px]">P:</span>
                <span class="text-slate-300">{{ accountRevealed[acc.id] ? (acc._pickerPlain || '') : '••••••••' }}</span>
                <button
                  class="hover:text-amber-300 text-slate-500 p-0.5 transition-colors cursor-pointer"
                  :title="accountRevealed[acc.id] ? t('accounts.hidePassword') : t('accounts.showPassword')"
                  @click.stop="toggleAccountReveal(acc, $event)"
                >
                  <svg v-if="!accountRevealed[acc.id]" viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />
                  </svg>
                  <svg v-else viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" />
                  </svg>
                </button>
              </span>
            </div>
          </div>

          <!-- 右侧快速选择/填入按钮 -->
          <div class="flex items-center gap-1 shrink-0 self-center">
            <button
              v-if="acc.username"
              class="picker-sub-btn hover:!border-sky-400 hover:!text-sky-300"
              :title="t('snippetPicker.pasteUsername') + ' (Shift+Enter)'"
              @click.stop="onPasteAccount(acc, 'username')"
            >
              {{ t('accounts.usernameShort') }}
            </button>
            <button
              v-if="acc.password"
              class="picker-sub-btn hover:!border-amber-400 hover:!text-amber-300"
              :title="t('snippetPicker.pastePassword') + ' (Enter)'"
              @click.stop="onPasteAccount(acc, 'password')"
            >
              {{ t('accounts.passwordShort') }}
            </button>
          </div>
        </div>
      </template>
    </div>

    <!-- 底部状态说明栏 -->
    <div class="no-drag flex items-center justify-between px-1 pt-2 shrink-0 border-t border-slate-700/40 text-[10px] text-slate-400">
      <div v-if="activeTab === 'snippets'" class="flex items-center gap-2">
        <span><kbd class="picker-kbd">↑↓</kbd> {{ currentLocale === 'en' ? 'Select' : '选择' }}</span>
        <span><kbd class="picker-kbd">Enter</kbd> {{ currentLocale === 'en' ? 'Paste to cursor' : '填入光标处' }}</span>
        <span><kbd class="picker-kbd">1-9</kbd> {{ currentLocale === 'en' ? 'Quick' : '快捷键' }}</span>
        <span><kbd class="picker-kbd">Tab</kbd> {{ t('snippetPicker.switchTabHint') }}</span>
        <span><kbd class="picker-kbd">Esc</kbd> {{ currentLocale === 'en' ? 'Close' : '关闭' }}</span>
      </div>
      <div v-else class="flex items-center gap-2">
        <span><kbd class="picker-kbd">Enter</kbd> {{ t('snippetPicker.pastePassword') }}</span>
        <span><kbd class="picker-kbd">⇧Enter</kbd> {{ t('snippetPicker.pasteUsername') }}</span>
        <span><kbd class="picker-kbd">Space</kbd> {{ currentLocale === 'en' ? 'Reveal' : '显隐' }}</span>
        <span><kbd class="picker-kbd">Tab</kbd> {{ t('snippetPicker.switchTabHint') }}</span>
        <span><kbd class="picker-kbd">Esc</kbd> {{ currentLocale === 'en' ? 'Close' : '关闭' }}</span>
      </div>
      <span class="text-amber-400/80 font-medium">
        {{ currentLocale === 'en' ? currentList.length + ' Total' : '共 ' + currentList.length + ' 条' }}
      </span>
    </div>
  </div>
</template>
