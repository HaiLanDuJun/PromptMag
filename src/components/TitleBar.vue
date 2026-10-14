<script setup>
import { state, setAlwaysOnTop, setOpacity, setRelay } from '../lib/store'

function hide() { window.pm.hideWindow() }
function openTasks() { window.pm.openPath(state.paths.tasksFile) }
</script>

<template>
  <div class="titlebar-drag flex items-center gap-2 px-2.5 h-8 bg-ink-850 border-b border-ink-700 shrink-0">
    <span class="text-neon-green font-bold">▣</span>
    <span class="font-bold text-slate-100 tracking-wide">PromptMag</span>
    <span class="text-slate-600 text-[10px] hidden sm:inline">CLI 提示词弹夹</span>
    <div class="flex-1" />

    <div class="no-drag flex items-center gap-1.5">
      <!-- Agent 自动接力开关 -->
      <button
        class="flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] transition-colors"
        :class="state.settings.relay
          ? 'bg-neon-cyan/15 border-neon-cyan/60 text-neon-cyan'
          : 'border-ink-600 text-slate-500 hover:text-slate-300'"
        :title="state.settings.relay
          ? '自动接力已开启：队列实时写入 next_tasks.md，复制时尾部注入接力指令。点击关闭'
          : '开启 Agent 自动接力：队列实时同步 next_tasks.md（双向监听勾选状态）'"
        @click="setRelay(!state.settings.relay)"
      >
        <span class="w-1.5 h-1.5 rounded-full" :class="state.settings.relay ? 'bg-neon-cyan animate-pulse' : 'bg-slate-600'" />
        接力
      </button>

      <!-- 置顶 -->
      <button
        class="icon-btn"
        :class="{ on: state.settings.alwaysOnTop }"
        :title="state.settings.alwaysOnTop ? '已置顶，点击取消' : '点击置顶'"
        @click="setAlwaysOnTop(!state.settings.alwaysOnTop)"
      >📌</button>

      <!-- 透明度 -->
      <label class="flex items-center gap-1 text-slate-600" title="窗口透明度 40%~100%">
        <span class="text-[11px] leading-none">🌁</span>
        <input
          class="w-14"
          type="range" min="0.4" max="1" step="0.05"
          :value="state.settings.opacity"
          @input="setOpacity(Number($event.target.value))"
        >
      </label>

      <!-- next_tasks.md -->
      <button class="icon-btn" title="打开 next_tasks.md" @click="openTasks">📄</button>

      <!-- 隐藏 -->
      <button class="icon-btn" title="隐藏窗口（Alt+Q 重新呼出）" @click="hide">—</button>
    </div>
  </div>
</template>
