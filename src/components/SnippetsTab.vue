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
  toast('✓ 已加入词库')
}

function insert(text) {
  window.dispatchEvent(new CustomEvent('pm:insert-snippet', { detail: text }))
  window.dispatchEvent(new CustomEvent('pm:switch-tab', { detail: 'queue' }))
}

async function copy(text) {
  await window.pm.copyText(text)
  toast('✓ 已复制')
}
</script>

<template>
  <div class="p-2 space-y-2">
    <!-- 新增 -->
    <div class="flex gap-1.5">
      <input
        v-model="draft"
        class="flex-1 min-w-0 px-2 py-1.5 rounded bg-ink-850 border border-ink-600 focus:border-neon-green/60 text-slate-200"
        placeholder="输入常用指令，如：请先分析原因不要直接改代码"
        @keydown.enter.prevent="add"
      >
      <button class="btn btn-primary" @click="add">＋ 添加</button>
    </div>

    <!-- 空状态 -->
    <div v-if="!state.snippets.length" class="mt-8 text-center text-slate-600">
      <p>词库是空的</p>
      <p class="text-[11px] text-slate-700 mt-1">添加后会在主输入框下方显示为快捷胶囊</p>
    </div>

    <!-- 列表 -->
    <div
      v-for="s in state.snippets"
      :key="s.id"
      class="group flex items-center gap-1.5 rounded border border-ink-600 bg-ink-850 px-2 py-1.5 hover:border-ink-600/80"
    >
      <span class="text-neon-cyan/70">›</span>
      <p
        class="flex-1 min-w-0 truncate text-slate-300 cursor-pointer"
        :title="s.text"
        @click="insert(s.text)"
      >{{ s.text }}</p>
      <button class="icon-btn shrink-0" title="插入到输入框光标处" @click="insert(s.text)">↵</button>
      <button class="icon-btn shrink-0" title="复制" @click="copy(s.text)">📋</button>
      <button class="icon-btn shrink-0 hover:text-red-400" title="删除" @click="removeSnippet(s.id)">✕</button>
    </div>
  </div>
</template>
