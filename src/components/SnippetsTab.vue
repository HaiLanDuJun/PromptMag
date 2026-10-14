<script setup>
/**
 * Tab 2：常用词库
 *  保存高频指令前缀/后缀；「插入」写入主输入框光标处并切回队列 Tab
 */
import { ref } from 'vue'
import { state, addSnippet, removeSnippet, toast } from '../lib/store'

const draft = ref('')

function add() {
  if (!draft.value.trim()) return
  addSnippet(draft.value)
  draft.value = ''
  toast('已加入词库')
}

function insert(text) {
  window.dispatchEvent(new CustomEvent('pm:insert-snippet', { detail: text }))
  window.dispatchEvent(new CustomEvent('pm:switch-tab', { detail: 'queue' }))
}

async function copy(text) {
  await window.pm.copyText(text)
  toast('已复制')
}
</script>

<template>
  <div class="space-y-1.5">
    <!-- 新增 -->
    <div class="flex gap-1.5">
      <input
        v-model="draft"
        class="field flex-1 min-w-0 !py-1.5 text-[11px]"
        placeholder="输入常用指令，Enter 添加"
        @keydown.enter.prevent="add"
      >
      <button class="btn btn-primary" @click="add">添加</button>
    </div>

    <!-- 空状态 -->
    <div v-if="!state.snippets.length" class="pt-12 text-center space-y-1">
      <p class="text-slate-500">词库是空的</p>
      <p class="text-[10px] text-slate-600">添加后会显示为输入框下方的快捷胶囊</p>
    </div>

    <!-- 列表 -->
    <div
      v-for="s in state.snippets"
      :key="s.id"
      class="group flex items-center gap-2 rounded-xl px-2.5 py-2 bg-slate-400/[.03] border border-slate-400/10 hover:border-slate-400/25 transition-colors"
    >
      <span class="text-neon-cyan/60 text-[10px]">›</span>
      <p
        class="flex-1 min-w-0 truncate text-slate-300 cursor-pointer text-[11px]"
        :title="s.text"
        @click="insert(s.text)"
      >{{ s.text }}</p>
      <button class="icon-btn !w-6 !h-6 shrink-0" title="插入到输入框光标处" @click="insert(s.text)">
        <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M13 2 3 14h7l-1 8 10-12h-7z" />
        </svg>
      </button>
      <button class="icon-btn !w-6 !h-6 shrink-0" title="复制" @click="copy(s.text)">
        <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect width="14" height="14" x="8" y="8" rx="2" /><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
        </svg>
      </button>
      <button class="icon-btn !w-6 !h-6 shrink-0 danger" title="删除" @click="removeSnippet(s.id)">
        <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <path d="M18 6 6 18" /><path d="m6 6 12 12" />
        </svg>
      </button>
    </div>
  </div>
</template>
