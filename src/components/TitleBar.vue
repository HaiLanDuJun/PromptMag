<script setup>
import { ref } from 'vue'
import { state, setAlwaysOnTop, setOpacity, setRelay, chooseDataDir } from '../lib/store'

defineEmits(['collapse', 'mini'])

const showSettings = ref(false)

function hide() { window.pm.hideWindow() }
function openTasks() { window.pm.openPath(state.paths.tasksFile) }
function openDataDir() { window.pm.openPath(state.paths.homeDir) }

async function onChooseDir() {
  const r = await chooseDataDir()
  if (r && r.ok) showSettings.value = false
}
</script>

<template>
  <header class="drag-region relative flex items-center gap-2 px-3.5 h-9 shrink-0 hairline">
    <!-- 状态指示灯：接力开启时发光 -->
    <span
      class="w-1.5 h-1.5 rounded-full shrink-0"
      :class="state.settings.relay ? 'bg-neon-cyan shadow-[0_0_6px_#22d3ee]' : 'bg-slate-600'"
    />
    <span class="font-semibold text-slate-200 tracking-wide">PromptMag</span>

    <div class="flex-1" />

    <div class="no-drag flex items-center gap-1">
      <!-- 接力开关 -->
      <button
        class="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] transition-all"
        :class="state.settings.relay
          ? 'bg-neon-cyan/12 text-neon-cyan border border-neon-cyan/40'
          : 'text-slate-500 border border-slate-600/50 hover:text-slate-300'"
        :title="state.settings.relay
          ? '自动接力已开启：队列实时写入 next_tasks.md，复制时附带接力指令。点击关闭'
          : '开启 Agent 自动接力：队列实时同步 next_tasks.md（双向监听勾选状态）'"
        @click="setRelay(!state.settings.relay)"
      >接力</button>

      <!-- 置顶 -->
      <button
        class="icon-btn"
        :class="{ active: state.settings.alwaysOnTop }"
        :title="state.settings.alwaysOnTop ? '已置顶，点击取消' : '点击置顶'"
        @click="setAlwaysOnTop(!state.settings.alwaysOnTop)"
      >
        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 17v5" /><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z" />
        </svg>
      </button>

      <!-- 透明度 -->
      <label class="flex items-center px-1 cursor-pointer" title="窗口透明度 40%~100%">
        <input
          type="range" min="0.4" max="1" step="0.05"
          :value="state.settings.opacity"
          @input="setOpacity(Number($event.target.value))"
        >
      </label>

      <!-- next_tasks.md -->
      <button class="icon-btn" title="打开 next_tasks.md" @click="openTasks">
        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z" /><path d="M14 2v4a2 2 0 0 0 2 2h4" /><path d="M10 9H8" /><path d="M16 13H8" /><path d="M16 17H8" />
        </svg>
      </button>

      <!-- 设置 -->
      <button
        class="icon-btn"
        :class="{ active: showSettings }"
        title="设置"
        @click.stop="showSettings = !showSettings"
      >
        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      </button>

      <!-- 迷你输入（快捷面板） -->
      <button class="icon-btn" title="切换为迷你输入面板" @click="$emit('mini')">
        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M4 6h16" /><path d="M4 12h10" /><path d="M4 18h13" />
        </svg>
      </button>

      <!-- 收起为胶囊 -->
      <button class="icon-btn" title="收起为胶囊（悬停胶囊可重新展开）" @click="$emit('collapse')">
        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M7 15l5 5 5-5" /><path d="M7 9l5-5 5 5" />
        </svg>
      </button>

      <!-- 隐藏 -->
      <button class="icon-btn" title="隐藏窗口（Alt+Q 重新呼出）" @click="hide">
        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <path d="M5 12h14" />
        </svg>
      </button>
    </div>

    <!-- 设置面板 -->
    <div v-if="showSettings" class="settings-backdrop" @click="showSettings = false" />
    <div v-if="showSettings" class="settings-panel no-drag" @click.stop>
      <div class="settings-title">设置</div>

      <div class="settings-label">数据目录（图片 / 队列 / next_tasks.md）</div>
      <div class="settings-path" :title="state.paths.homeDir">{{ state.paths.homeDir }}</div>
      <div class="flex gap-2 mt-2">
        <button class="btn flex-1" @click="onChooseDir">更改…（迁移并重启）</button>
        <button class="btn" @click="openDataDir">打开</button>
      </div>

      <div class="settings-tip">
        更改后会把现有数据复制到新目录并自动重启应用。
      </div>
    </div>
  </header>
</template>
