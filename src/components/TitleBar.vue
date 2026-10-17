<script setup>
/**
 * 完整形态标题栏（契合设计图 6 顶部栏）
 *  - 左侧：[文档图标] 保存关键词
 *  - 右侧：置顶、透明度、设置、迷你、收起、关闭
 */
import { ref } from 'vue'
import { state, setAlwaysOnTop, setOpacity, setRelay, chooseDataDir, setHotkeys } from '../lib/store'
import HotkeyInput from './HotkeyInput.vue'

defineEmits(['collapse', 'mini'])

const showSettings = ref(false)

function hide() { window.pm.hideWindow() }
function openTasks() { window.pm.openPath(state.paths.tasksFile) }
function openDataDir() { window.pm.openPath(state.paths.homeDir) }

async function onChooseDir() {
  const r = await chooseDataDir()
  if (r && r.ok) showSettings.value = false
}

function onHotkeyChange(which, v) {
  setHotkeys(
    which === 'pop' ? { pop: v } : which === 'collect' ? { collect: v } : { snippets: v }
  )
}
</script>

<template>
  <header class="drag-region relative flex items-center justify-between px-3.5 h-10 shrink-0 hairline">
    <!-- 图 6 顶栏左侧：[文档图标] 保存关键词 -->
    <div class="flex items-center gap-2">
      <span class="text-sky-400 flex items-center shrink-0">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
        </svg>
      </span>
      <span class="font-semibold text-slate-100 text-[13px] tracking-wide">保存关键词</span>
      <!-- 状态指示灯：接力开启时发光 -->
      <span
        v-if="state.settings.relay"
        class="w-1.5 h-1.5 rounded-full bg-sky-400 shadow-[0_0_6px_#38bdf8] shrink-0"
        title="Agent 自动接力已开启"
      />
    </div>

    <!-- 图 6 顶栏右侧：操作按钮 -->
    <div class="no-drag flex items-center gap-1">
      <!-- 置顶 -->
      <button
        class="icon-btn"
        :class="{ active: state.settings.alwaysOnTop }"
        :title="state.settings.alwaysOnTop ? '窗口置顶（开启中）' : '点击置顶窗口'"
        @click="setAlwaysOnTop(!state.settings.alwaysOnTop)"
      >
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 17v5" /><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z" />
        </svg>
      </button>

      <!-- 透明度 -->
      <label class="flex items-center px-1 cursor-pointer" title="窗口透明度">
        <input
          type="range" min="0.4" max="1" step="0.05"
          :value="state.settings.opacity"
          @input="setOpacity(Number($event.target.value))"
        >
      </label>

      <!-- 设置 -->
      <button
        class="icon-btn"
        :class="{ active: showSettings }"
        title="设置"
        @click.stop="showSettings = !showSettings"
      >
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      </button>

      <!-- 迷你胶囊输入 -->
      <button class="icon-btn" title="迷你快捷输入面板" @click="$emit('mini')">
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M4 6h16" /><path d="M4 12h10" /><path d="M4 18h13" />
        </svg>
      </button>

      <!-- 收起为悬浮图标 -->
      <button class="icon-btn" title="收起为悬浮图标" @click="$emit('collapse')">
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M7 15l5 5 5-5" /><path d="M7 9l5-5 5 5" />
        </svg>
      </button>

      <!-- 关闭 / 隐藏 -->
      <button class="icon-btn hover:!text-rose-400" title="关闭窗口 (Alt+Q 重新呼出)" @click="hide">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>

    <!-- 设置浮层 -->
    <div v-if="showSettings" class="settings-backdrop" @click="showSettings = false" />
    <div v-if="showSettings" class="settings-panel no-drag" @click.stop>
      <div class="settings-title">应用设置</div>

      <div class="settings-label">全局快捷键</div>
      <div class="hotkey-row">
        <span class="hotkey-desc" title="复制弹夹里最老的未使用提示词，并标记为已使用">弹出最旧未用</span>
        <HotkeyInput
          :model-value="state.settings.hotkeyPop"
          @update:model-value="(v) => onHotkeyChange('pop', v)"
        />
      </div>
      <div class="hotkey-row">
        <span class="hotkey-desc" title="把当前选中文字一键收录到词库">收录选中文字</span>
        <HotkeyInput
          :model-value="state.settings.hotkeyCollect"
          @update:model-value="(v) => onHotkeyChange('collect', v)"
        />
      </div>
      <div class="hotkey-row">
        <span class="hotkey-desc" title="呼出专属收藏夹提示词弹窗，选择后直接复制并粘贴到光标处">常用词库弹窗</span>
        <HotkeyInput
          :model-value="state.settings.hotkeySnippets"
          @update:model-value="(v) => onHotkeyChange('snippets', v)"
        />
      </div>
      <div class="settings-tip">
        支持直接键盘按键录制，录制完成后自动全局注册。
      </div>

      <div class="settings-label mt-3">Agent 自动接力 (next_tasks.md)</div>
      <div class="flex items-center justify-between mb-2">
        <span class="text-[11px] text-slate-300">双向同步 next_tasks.md</span>
        <button
          class="btn !py-0.5 !px-2.5"
          :class="state.settings.relay ? 'btn-primary' : ''"
          @click="setRelay(!state.settings.relay)"
        >{{ state.settings.relay ? '已开启' : '已关闭' }}</button>
      </div>

      <div class="settings-label">数据存放目录</div>
      <div class="settings-path" :title="state.paths.homeDir">{{ state.paths.homeDir }}</div>
      <div class="flex gap-2 mt-2">
        <button class="btn flex-1" @click="onChooseDir">更改目录（迁移重启）</button>
        <button class="btn" @click="openDataDir">打开</button>
      </div>
    </div>
  </header>
</template>
