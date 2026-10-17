<script setup>
/**
 * Tab 2：常用词库
 *  保存高频指令前缀/后缀；「插入」写入主输入框光标处并切回主列表
 *  全面支持双语国际化（i18n）
 */
import { ref } from 'vue'
import { state, addSnippet, removeSnippet, toast, t } from '../lib/store'

const draft = ref('')

function add() {
  if (!draft.value.trim()) return
  addSnippet(draft.value)
  draft.value = ''
  toast(t('toast.addedToSnippets'))
}

function insert(text) {
  window.dispatchEvent(new CustomEvent('pm:insert-snippet', { detail: text }))
  window.dispatchEvent(new CustomEvent('pm:switch-tab', { detail: 'queue' }))
}

async function copy(text) {
  await window.pm.copyText(text)
  toast(t('toast.copied'))
}
</script>

<template>
  <div class="space-y-2 pt-1">
    <!-- 新增词库条目 -->
    <div class="flex gap-1.5">
      <input
        v-model="draft"
        class="field flex-1 min-w-0 !py-1.5 text-[11px]"
        :placeholder="t('snippets.addPlaceholder')"
        @keydown.enter.prevent="add"
      >
      <button class="btn btn-primary" @click="add">{{ t('snippets.addBtn') }}</button>
    </div>

    <!-- 空状态 -->
    <div v-if="!state.snippets.length" class="pt-10 text-center space-y-1">
      <p class="text-slate-400">{{ t('snippets.emptyTitle') }}</p>
      <p class="text-[10px] text-slate-500">{{ t('snippets.emptyDesc') }}</p>
    </div>

    <!-- 列表 -->
    <div
      v-for="s in state.snippets"
      :key="s.id"
      class="group flex items-center gap-2 rounded-xl px-2.5 py-2 bg-sky-500/[.03] border border-sky-400/15 hover:border-sky-400/35 transition-colors"
    >
      <span class="text-sky-400/60 text-[10px]">›</span>
      <p
        class="flex-1 min-w-0 truncate text-slate-200 cursor-pointer text-[11px]"
        :title="s.text"
        @click="insert(s.text)"
      >{{ s.text }}</p>
      <button class="icon-btn !w-6 !h-6 shrink-0" :title="t('snippets.insertTitle')" @click="insert(s.text)">
        <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M13 2 3 14h7l-1 8 10-12h-7z" />
        </svg>
      </button>
      <button class="icon-btn !w-6 !h-6 shrink-0" :title="t('snippets.copyTitle')" @click="copy(s.text)">
        <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect width="14" height="14" x="8" y="8" rx="2" /><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
        </svg>
      </button>
      <button class="icon-btn !w-6 !h-6 shrink-0 danger" :title="t('snippets.deleteTitle')" @click="removeSnippet(s.id)">
        <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  </div>
</template>
