<script setup>
/**
 * 完整形态标题栏（契合设计图 6 顶部栏）
 *  - 左侧：[文档图标] 保存关键词
 *  - 右侧：置顶、透明度、语言切换、设置、迷你、收起、关闭
 *  - 设置面板：分为【默认设置】、【快捷键】、【存储管理】、【版本与更新（含Git仓库）】4个专属 Tab
 */
import { ref, computed, watch } from 'vue'
import {
  state, setAlwaysOnTop, setOpacity, setRelay, chooseDataDir,
  setHotkeys, changeLocale, setPopMode, setAutoCleanupSetting, cleanupUnfavorited,
  getMagazineAutoCleanup, setMagazineAutoCleanup,
  setSaveTargetMode, setWindowScaleMode, setHideTaskbar, checkForUpdates, openUpdateModal,
  ignoreUpdateVersion, unignoreUpdateVersion, openUpdateUrl, t, currentLocale,
  setMode, toast, directDownloadLatest
} from '../lib/store'
import HotkeyInput from './HotkeyInput.vue'

defineEmits(['collapse', 'mini'])

const showSettings = ref(false)

watch(showSettings, (val) => {
  state.isSettingsOpen = val
  if (!val && state.settings.windowScaleMode !== 'full' && state.settings.mode === 'full') {
    // 关闭设置时，若用户已选定「默认缩放为悬浮窗」，则窗口自动缩放回悬浮窗形态！
    setMode('quick')
  }
})

function onSelectScaleMode(m) {
  setWindowScaleMode(m)
  if (m === 'quick') {
    toast(t('settings.windowScaleQuickToast'))
  } else {
    toast(t('settings.windowScaleFullToast'))
  }
}
const activeSettingsTab = ref('default') // 'default' | 'hotkeys' | 'storage' | 'version'
const selectedCleanupMagId = ref(state.activeMagazineId || 'default')
const cleanupMagazines = computed(() => {
  return state.magazines.filter(m => m.id !== 'favorites')
})
const currentCleanupMag = computed(() => {
  return cleanupMagazines.value.find(m => m.id === selectedCleanupMagId.value) || cleanupMagazines.value[0] || state.magazines[0]
})
const GITHUB_URL = 'https://github.com/HaiLanDuJun/PromptMag'

function hide() { window.pm.hideWindow() }
function openTasks() { window.pm.openPath(state.paths.tasksFile) }
function openDataDir() { window.pm.openPath(state.paths.homeDir) }
function openLog() {
  if (window.pm && window.pm.openLogFile) {
    window.pm.openLogFile()
  } else if (state.paths && state.paths.logFile) {
    window.pm.openPath(state.paths.logFile)
  }
}

function openExternalUrl(url) {
  if (window.pm && window.pm.openExternal) {
    window.pm.openExternal(url)
  } else {
    window.open(url, '_blank')
  }
}

function openGitHub() {
  openExternalUrl(GITHUB_URL)
}

function openReleases() {
  openExternalUrl(`${GITHUB_URL}/releases`)
}

function openIssues() {
  openExternalUrl(`${GITHUB_URL}/issues`)
}

async function onChooseDir() {
  const r = await chooseDataDir()
  if (r && r.ok) showSettings.value = false
}

function onHotkeyChange(which, v) {
  setHotkeys({ [which]: v })
}

function toggleLang() {
  changeLocale(currentLocale.value === 'zh' ? 'en' : 'zh')
}
</script>

<template>
  <header class="drag-region relative flex items-center justify-between px-3.5 h-10 shrink-0 hairline">
    <!-- 顶栏左侧：[文档图标] 标题 -->
    <div class="flex items-center gap-2">
      <span class="text-sky-400 flex items-center shrink-0">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
        </svg>
      </span>
      <span class="font-semibold text-slate-100 text-[13px] tracking-wide">{{ t('titleBar.title') }}</span>
      <!-- 状态指示灯：接力开启时发光 -->
      <span
        v-if="state.settings.relay"
        class="w-1.5 h-1.5 rounded-full bg-sky-400 shadow-[0_0_6px_#38bdf8] shrink-0"
        :title="t('titleBar.relayActive')"
      />
    </div>

    <!-- 顶栏右侧：操作按钮 -->
    <div class="no-drag flex items-center gap-1">
      <!-- 快捷语言切换按键 -->
      <button
        class="icon-btn !w-7 !h-6 text-[10px] font-bold tracking-tight text-slate-300 hover:text-sky-300 border border-slate-700/60 rounded px-1"
        :title="t('titleBar.switchLang')"
        @click="toggleLang"
      >
        {{ currentLocale === 'zh' ? 'EN' : '中' }}
      </button>

      <!-- 置顶 -->
      <button
        class="icon-btn"
        :class="{ active: state.settings.alwaysOnTop }"
        :title="state.settings.alwaysOnTop ? t('titleBar.alwaysOnTopOn') : t('titleBar.alwaysOnTopOff')"
        @click="setAlwaysOnTop(!state.settings.alwaysOnTop)"
      >
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 17v5" /><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z" />
        </svg>
      </button>

      <!-- 透明度 -->
      <label class="flex items-center px-1 cursor-pointer" :title="t('titleBar.opacity')">
        <input
          type="range" min="0.4" max="1" step="0.05"
          :value="state.settings.opacity"
          @input="setOpacity(Number($event.target.value))"
        >
      </label>

      <!-- 设置 -->
      <button
        class="icon-btn relative"
        :class="{ active: showSettings }"
        :title="t('titleBar.settings')"
        @click.stop="showSettings = !showSettings"
      >
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
        <span
          v-if="state.updateStatus.hasUpdate && state.settings.ignoredVersion !== state.updateStatus.info?.version"
          class="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-sky-400 ring-2 ring-slate-900 animate-pulse"
        />
      </button>

      <!-- 迷你胶囊输入 -->
      <button class="icon-btn" :title="t('titleBar.miniMode')" @click="$emit('mini')">
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M4 6h16" /><path d="M4 12h10" /><path d="M4 18h13" />
        </svg>
      </button>

      <!-- 收起为悬浮图标 -->
      <button class="icon-btn" :title="t('titleBar.collapseToOrb')" @click="$emit('collapse')">
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M7 15l5 5 5-5" /><path d="M7 9l5-5 5 5" />
        </svg>
      </button>

      <!-- 关闭 / 隐藏 -->
      <button
        class="icon-btn hover:!text-rose-400"
        :title="state.settings.hotkeyToggle ? t('titleBar.closeWindowWithKey', { key: state.settings.hotkeyToggle }) : t('titleBar.closeWindow')"
        @click="hide"
      >
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>

    <!-- 设置浮层 -->
    <div v-if="showSettings" class="settings-backdrop" @click="showSettings = false" />
    <div v-if="showSettings" class="settings-panel no-drag" @click.stop>
      <div class="flex items-center justify-between mb-2.5">
        <div class="settings-title !mb-0">{{ t('settings.title') }}</div>
        <button
          type="button"
          class="w-5 h-5 rounded flex items-center justify-center text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors cursor-pointer text-xs"
          @click="showSettings = false"
        >
          ✕
        </button>
      </div>

      <!-- 四大分类 Tab 切换器 -->
      <div class="grid grid-cols-4 gap-1 p-0.5 mb-3 bg-slate-900/90 rounded-lg border border-slate-700/70 select-none">
        <button
          v-for="tabKey in ['default', 'hotkeys', 'storage', 'version']"
          :key="tabKey"
          type="button"
          class="relative py-1 px-1 rounded-md text-[10.5px] font-medium transition-all text-center truncate cursor-pointer"
          :class="activeSettingsTab === tabKey
            ? 'bg-sky-500/20 text-sky-200 border border-sky-400/40 shadow-sm font-semibold'
            : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 border border-transparent'"
          @click="activeSettingsTab = tabKey"
        >
          {{ t(`settings.tabs.${tabKey}`) }}
          <span
            v-if="tabKey === 'version' && state.updateStatus.hasUpdate && state.settings.ignoredVersion !== state.updateStatus.info?.version"
            class="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-sky-400 animate-pulse"
          />
        </button>
      </div>

      <!-- ==================== Tab 1: 默认设置 ==================== -->
      <div v-if="activeSettingsTab === 'default'" class="space-y-3">
        <!-- 界面与提示词语言 -->
        <div>
          <div class="settings-label">{{ t('settings.language') }}</div>
          <div class="flex items-center gap-2">
            <button
              class="btn flex-1 !py-1 text-xs"
              :class="currentLocale === 'zh' ? 'btn-primary' : ''"
              @click="changeLocale('zh')"
            >
              {{ t('settings.langZh') }}
            </button>
            <button
              class="btn flex-1 !py-1 text-xs"
              :class="currentLocale === 'en' ? 'btn-primary' : ''"
              @click="changeLocale('en')"
            >
              {{ t('settings.langEn') }}
            </button>
          </div>
        </div>

        <!-- 窗口缩放基准（默认形态） -->
        <div>
          <div class="settings-label">{{ t('settings.windowScaleModeTitle') }}</div>
          <div class="text-[10px] text-slate-400 mb-1.5 leading-snug">{{ t('settings.windowScaleModeDesc') }}</div>
          <div class="grid grid-cols-2 gap-1.5">
            <!-- 默认缩放为悬浮窗 -->
            <button
              type="button"
              class="flex flex-col items-center text-center p-2 rounded-lg border transition-all text-xs cursor-pointer select-none"
              :class="state.settings.windowScaleMode !== 'full'
                ? 'bg-sky-500/20 border-sky-400 text-sky-200 shadow-[0_0_8px_rgba(56,189,248,0.25)] font-semibold'
                : 'bg-slate-800/60 border-slate-700/60 text-slate-400 hover:text-slate-200 hover:border-slate-600'"
              :title="t('settings.windowScaleQuickDesc')"
              @click="onSelectScaleMode('quick')"
            >
              <span class="text-sm mb-0.5">🪟</span>
              <span class="text-[10.5px] leading-tight">{{ t('settings.windowScaleQuick') }}</span>
              <span class="text-[8.5px] text-slate-400 mt-0.5 leading-tight opacity-75">{{ t('settings.windowScaleQuickShort') }}</span>
            </button>

            <!-- 原窗口缩放 -->
            <button
              type="button"
              class="flex flex-col items-center text-center p-2 rounded-lg border transition-all text-xs cursor-pointer select-none"
              :class="state.settings.windowScaleMode === 'full'
                ? 'bg-purple-500/20 border-purple-400 text-purple-200 shadow-[0_0_8px_rgba(168,85,247,0.25)] font-semibold'
                : 'bg-slate-800/60 border-slate-700/60 text-slate-400 hover:text-slate-200 hover:border-slate-600'"
              :title="t('settings.windowScaleFullDesc')"
              @click="onSelectScaleMode('full')"
            >
              <span class="text-sm mb-0.5">🖥️</span>
              <span class="text-[10.5px] leading-tight">{{ t('settings.windowScaleFull') }}</span>
              <span class="text-[8.5px] text-slate-400 mt-0.5 leading-tight opacity-75">{{ t('settings.windowScaleFullShort') }}</span>
            </button>
          </div>
        </div>

        <!-- 桌面栏（任务栏）图标显示 -->
        <div>
          <div class="settings-label">{{ t('settings.hideTaskbarTitle') }}</div>
          <div class="flex items-center justify-between p-2 rounded-lg bg-slate-900/60 border border-slate-800">
            <div class="flex flex-col pr-2">
              <span class="text-[11px] text-slate-300">{{ t('settings.hideTaskbarDesc') }}</span>
              <span class="text-[9px] text-slate-400 opacity-75 mt-0.5">{{ t('settings.hideTaskbarTip') }}</span>
            </div>
            <button
              type="button"
              class="btn !py-0.5 !px-2.5 shrink-0 text-xs"
              :class="state.settings.hideTaskbar ? 'btn-primary' : ''"
              @click="setHideTaskbar(!state.settings.hideTaskbar)"
            >
              {{ state.settings.hideTaskbar ? t('settings.hideTaskbarOn') : t('settings.hideTaskbarOff') }}
            </button>
          </div>
        </div>

        <!-- 出弹模式选择器 (卡片三选一) -->
        <div>
          <div class="settings-label">{{ t('settings.popModeTitle') }}</div>
          <div class="text-[10px] text-slate-400 mb-1.5 leading-snug">{{ t('settings.popModeDesc') }}</div>
          <div class="grid grid-cols-3 gap-1.5">
            <!-- 霰弹枪模式 -->
            <button
              class="flex flex-col items-center text-center p-1.5 rounded-lg border transition-all text-xs cursor-pointer select-none"
              :class="state.settings.popMode === 'shotgun'
                ? 'bg-sky-500/20 border-sky-400 text-sky-200 shadow-[0_0_8px_rgba(56,189,248,0.25)] font-semibold'
                : 'bg-slate-800/60 border-slate-700/60 text-slate-400 hover:text-slate-200 hover:border-slate-600'"
              :title="t('settings.popModeShotgunDesc')"
              @click="setPopMode('shotgun')"
            >
              <span class="text-sm mb-0.5">💥</span>
              <span class="text-[10px] leading-tight">{{ t('settings.popModeShotgun') }}</span>
              <span class="text-[8.5px] text-slate-400 mt-0.5 leading-tight opacity-75">{{ t('settings.popModeShotgunShort') }}</span>
            </button>

            <!-- 左轮模式 -->
            <button
              class="flex flex-col items-center text-center p-1.5 rounded-lg border transition-all text-xs cursor-pointer select-none"
              :class="state.settings.popMode === 'revolver'
                ? 'bg-amber-500/20 border-amber-400 text-amber-200 shadow-[0_0_8px_rgba(245,158,11,0.25)] font-semibold'
                : 'bg-slate-800/60 border-slate-700/60 text-slate-400 hover:text-slate-200 hover:border-slate-600'"
              :title="t('settings.popModeRevolverDesc')"
              @click="setPopMode('revolver')"
            >
              <span class="text-sm mb-0.5">🎲</span>
              <span class="text-[10px] leading-tight">{{ t('settings.popModeRevolver') }}</span>
              <span class="text-[8.5px] text-slate-400 mt-0.5 leading-tight opacity-75">{{ t('settings.popModeRevolverShort') }}</span>
            </button>

            <!-- 手枪模式 -->
            <button
              class="flex flex-col items-center text-center p-1.5 rounded-lg border transition-all text-xs cursor-pointer select-none"
              :class="state.settings.popMode === 'pistol'
                ? 'bg-purple-500/20 border-purple-400 text-purple-200 shadow-[0_0_8px_rgba(168,85,247,0.25)] font-semibold'
                : 'bg-slate-800/60 border-slate-700/60 text-slate-400 hover:text-slate-200 hover:border-slate-600'"
              :title="t('settings.popModePistolDesc')"
              @click="setPopMode('pistol')"
            >
              <span class="text-sm mb-0.5">🎯</span>
              <span class="text-[10px] leading-tight">{{ t('settings.popModePistol') }}</span>
              <span class="text-[8.5px] text-slate-400 mt-0.5 leading-tight opacity-75">{{ t('settings.popModePistolShort') }}</span>
            </button>
          </div>
        </div>

        <!-- 保存目标弹夹策略 -->
        <div>
          <div class="settings-label">{{ t('settings.saveTargetModeTitle') }}</div>
          <div class="text-[10px] text-slate-400 mb-1.5 leading-snug">{{ t('settings.saveTargetModeDesc') }}</div>
          <div class="grid grid-cols-3 gap-1.5 mb-2">
            <button
              class="flex flex-col items-center text-center p-1.5 rounded-lg border transition-all text-xs cursor-pointer select-none"
              :class="state.settings.saveTargetMode === 'active'
                ? 'bg-sky-500/20 border-sky-400 text-sky-200 shadow-[0_0_8px_rgba(56,189,248,0.25)] font-semibold'
                : 'bg-slate-800/60 border-slate-700/60 text-slate-400 hover:text-slate-200 hover:border-slate-600'"
              :title="t('settings.saveTargetActiveDesc')"
              @click="setSaveTargetMode('active')"
            >
              <span class="text-sm mb-0.5">📂</span>
              <span class="text-[10px] leading-tight">{{ t('settings.saveTargetActive') }}</span>
            </button>
            <button
              class="flex flex-col items-center text-center p-1.5 rounded-lg border transition-all text-xs cursor-pointer select-none"
              :class="state.settings.saveTargetMode === 'ask'
                ? 'bg-amber-500/20 border-amber-400 text-amber-200 shadow-[0_0_8px_rgba(245,158,11,0.25)] font-semibold'
                : 'bg-slate-800/60 border-slate-700/60 text-slate-400 hover:text-slate-200 hover:border-slate-600'"
              :title="t('settings.saveTargetAskDesc')"
              @click="setSaveTargetMode('ask')"
            >
              <span class="text-sm mb-0.5">❓</span>
              <span class="text-[10px] leading-tight">{{ t('settings.saveTargetAsk') }}</span>
            </button>
            <button
              class="flex flex-col items-center text-center p-1.5 rounded-lg border transition-all text-xs cursor-pointer select-none"
              :class="state.settings.saveTargetMode === 'specific'
                ? 'bg-purple-500/20 border-purple-400 text-purple-200 shadow-[0_0_8px_rgba(168,85,247,0.25)] font-semibold'
                : 'bg-slate-800/60 border-slate-700/60 text-slate-400 hover:text-slate-200 hover:border-slate-600'"
              :title="t('settings.saveTargetSpecificDesc')"
              @click="setSaveTargetMode('specific')"
            >
              <span class="text-sm mb-0.5">📌</span>
              <span class="text-[10px] leading-tight">{{ t('settings.saveTargetSpecific') }}</span>
            </button>
          </div>
          <div v-if="state.settings.saveTargetMode === 'specific'" class="flex items-center gap-1.5 px-0.5">
            <span class="text-[10.5px] text-slate-300 shrink-0">{{ t('settings.defaultMagSelect') }}</span>
            <select
              v-model="state.settings.defaultMagazineId"
              class="bg-slate-900 border border-slate-700 rounded px-2 py-0.5 text-[11px] text-slate-200 outline-none flex-1 focus:border-purple-400"
            >
              <option v-for="mag in state.magazines" :key="mag.id" :value="mag.id">
                {{ mag.name }}
              </option>
            </select>
          </div>
        </div>

        <!-- Agent 自动接力 -->
        <div>
          <div class="settings-label">{{ t('settings.relayTitle') }}</div>
          <div class="flex items-center justify-between p-2 rounded-lg bg-slate-900/60 border border-slate-800">
            <span class="text-[11px] text-slate-300">{{ t('settings.relayDesc') }}</span>
            <button
              class="btn !py-0.5 !px-2.5"
              :class="state.settings.relay ? 'btn-primary' : ''"
              @click="setRelay(!state.settings.relay)"
            >
              {{ state.settings.relay ? t('settings.relayOn') : t('settings.relayOff') }}
            </button>
          </div>
        </div>
      </div>

      <!-- ==================== Tab 2: 快捷键 ==================== -->
      <div v-if="activeSettingsTab === 'hotkeys'" class="space-y-2.5">
        <div class="settings-label">{{ t('settings.hotkeysTitle') }}</div>

        <div class="hotkey-row">
          <span class="hotkey-desc" :title="t('settings.hotkeyToggleDesc')">{{ t('settings.hotkeyToggleLabel') }}</span>
          <HotkeyInput
            :model-value="state.settings.hotkeyToggle"
            @update:model-value="(v) => onHotkeyChange('toggle', v)"
          />
        </div>

        <div class="hotkey-row">
          <span class="hotkey-desc" :title="t('settings.hotkeyPopDesc')">{{ t('settings.hotkeyPopLabel') }}</span>
          <HotkeyInput
            :model-value="state.settings.hotkeyPop"
            @update:model-value="(v) => onHotkeyChange('pop', v)"
          />
        </div>

        <div class="hotkey-row">
          <span class="hotkey-desc" :title="t('settings.hotkeySnippetsDesc')">{{ t('settings.hotkeySnippetsLabel') }}</span>
          <HotkeyInput
            :model-value="state.settings.hotkeySnippets"
            @update:model-value="(v) => onHotkeyChange('snippets', v)"
          />
        </div>

        <div class="hotkey-row">
          <span class="hotkey-desc" :title="t('settings.hotkeyCollectDesc')">{{ t('settings.hotkeyCollectLabel') }}</span>
          <HotkeyInput
            :model-value="state.settings.hotkeyCollect"
            @update:model-value="(v) => onHotkeyChange('collect', v)"
          />
        </div>

        <!-- 快速切换弹夹快捷键（支持用户自定义） -->
        <div class="hotkey-row border-t border-sky-500/20 pt-2 mt-1">
          <div class="flex flex-col">
            <span class="hotkey-desc text-sky-300 font-medium" :title="t('settings.hotkeyCycleMagDesc')">
              🔄 {{ t('settings.hotkeyCycleMagLabel') }}
            </span>
          </div>
          <HotkeyInput
            :model-value="state.settings.hotkeyCycleMag || 'Ctrl+Tab'"
            @update:model-value="(v) => onHotkeyChange('cycleMag', v)"
          />
        </div>

        <!-- 换弹快捷键作用域与说明提示 -->
        <div class="p-2 rounded-lg bg-sky-500/10 border border-sky-400/25 text-[10px] text-sky-200 leading-relaxed space-y-1">
          <div class="font-semibold text-sky-300 flex items-center gap-1">
            <span>💡</span>
            <span>{{ t('settings.hotkeyScopeTip') }}</span>
          </div>
          <div class="text-slate-300 text-[9.5px]">
            {{ t('settings.hotkeyCycleMagHelp') }}
          </div>
        </div>

        <div class="settings-tip">
          {{ t('settings.hotkeyTip') }}
        </div>
      </div>

      <!-- ==================== Tab 3: 存储管理 ==================== -->
      <div v-if="activeSettingsTab === 'storage'" class="space-y-3">
        <!-- 数据存放目录 -->
        <div>
          <div class="settings-label">{{ t('settings.dataDirTitle') }}</div>
          <div class="settings-path select-all" :title="state.paths.homeDir">{{ state.paths.homeDir }}</div>
          <div class="flex gap-2 mt-2">
            <button class="btn flex-1 text-xs" @click="onChooseDir">{{ t('settings.changeDir') }}</button>
            <button class="btn text-xs" @click="openDataDir">{{ t('settings.openDir') }}</button>
          </div>
        </div>

        <!-- 任务流通管道文件 (next_tasks.md) -->
        <div>
          <div class="settings-label">{{ t('settings.tasksFilePath') }}</div>
          <div class="settings-path select-all" :title="state.paths.tasksFile">{{ state.paths.tasksFile }}</div>
          <div class="flex gap-2 mt-2">
            <button class="btn w-full text-xs" @click="openTasks">{{ t('settings.openTasksBtn') }}</button>
          </div>
        </div>

        <!-- 运行诊断日志 (main.log) -->
        <div>
          <div class="settings-label">{{ t('settings.logFilePath') }}</div>
          <div class="settings-path select-all" :title="state.paths.logFile || ''">{{ state.paths.logFile || '' }}</div>
          <div class="flex gap-2 mt-2">
            <button class="btn w-full text-xs" @click="openLog" :title="t('settings.openLogTip')">{{ t('settings.openLog') }}</button>
          </div>
        </div>

        <!-- 未收藏提示词自动清理设置与手动清理 -->
        <div class="border-t border-slate-800 pt-2.5">
          <div class="settings-label">{{ t('settings.autoCleanupTitle') }}</div>

          <!-- 第一步：选择要配置的弹夹（不显示收藏夹） -->
          <div class="text-[10px] text-slate-300 font-medium mb-1.5 flex items-center justify-between">
            <span>{{ t('settings.autoCleanupMagSelect') }}</span>
            <span v-if="currentCleanupMag" class="text-[9.5px] text-sky-400">
              {{ currentCleanupMag.name }}
            </span>
          </div>
          <div class="flex items-center gap-1 overflow-x-auto pb-1 mb-2 select-none">
            <button
              v-for="mag in cleanupMagazines"
              :key="mag.id"
              type="button"
              class="px-2 py-0.8 rounded-lg border text-[10px] font-medium transition-all shrink-0 cursor-pointer flex items-center gap-1"
              :class="selectedCleanupMagId === mag.id
                ? 'bg-sky-500/20 border-sky-400 text-sky-200 shadow-[0_0_6px_rgba(56,189,248,0.2)]'
                : 'bg-slate-800/60 border-slate-700/60 text-slate-400 hover:text-slate-200 hover:border-slate-600'"
              @click="selectedCleanupMagId = mag.id"
            >
              <span
                class="w-1.5 h-1.5 rounded-full shrink-0"
                :style="{ backgroundColor: mag.color || '#38bdf8' }"
              />
              <span class="max-w-[75px] truncate">{{ mag.name }}</span>
            </button>
          </div>

          <!-- 普通弹夹自动清理规则 -->
          <div>
            <div class="text-[10px] text-slate-400 mb-1.5 leading-snug">
              {{ t('settings.autoCleanupMagDesc', { name: currentCleanupMag?.name || '' }) }}
            </div>
            <div class="grid grid-cols-3 gap-1.5 mb-2">
              <button
                v-for="opt in ['off', 'done_only', '1d', '3d', '7d', '30d']"
                :key="opt"
                type="button"
                class="btn !py-1 !px-0.5 text-[9.5px] truncate text-center"
                :class="getMagazineAutoCleanup(selectedCleanupMagId) === opt ? 'btn-primary !border-sky-400' : 'text-slate-400'"
                @click="setMagazineAutoCleanup(selectedCleanupMagId, opt)"
              >
                {{ opt === 'off' ? t('settings.autoCleanupOff') : t('settings.autoCleanup_' + opt) }}
              </button>
            </div>
            <button
              class="btn btn-danger w-full !py-1 text-xs mb-1 flex items-center justify-center gap-1.5 cursor-pointer"
              @click="cleanupUnfavorited('used', selectedCleanupMagId)"
            >
              <span>🧹</span>
              <span>{{ t('settings.cleanUnfavoritedNow') }}</span>
            </button>
          </div>

          <!-- 收藏夹受保护提示 -->
          <div class="text-[9.5px] text-amber-400/80 flex items-center gap-1 mt-1.5 select-none">
            <span>⭐</span>
            <span>{{ t('settings.favoritesProtectedNotice') }}</span>
          </div>
        </div>
      </div>

      <!-- ==================== Tab 4: 版本与更新（包括git仓库） ==================== -->
      <div v-if="activeSettingsTab === 'version'" class="space-y-3">
        <!-- 版本信息与更新检测卡片 -->
        <div class="settings-label">{{ t('settings.versionTitle') }}</div>
        <div class="p-2.5 rounded-xl bg-slate-900/90 border border-slate-700/80 text-xs">
          <!-- 当前版本号与检查按钮 -->
          <div class="flex items-center justify-between mb-2">
            <div class="flex items-center gap-1.5">
              <span class="text-sky-400 font-semibold text-[11.5px]">PromptMag</span>
              <span class="font-mono text-[10px] px-1.5 py-0.2 rounded bg-sky-500/15 text-sky-300 border border-sky-400/30">
                v{{ state.version }}
              </span>
            </div>

            <button
              type="button"
              class="text-[10px] text-sky-400 hover:text-sky-300 flex items-center gap-1 px-1.5 py-0.5 rounded border border-sky-500/30 hover:border-sky-400/60 bg-sky-500/10 cursor-pointer disabled:opacity-50 transition-all"
              :disabled="state.updateStatus.checking"
              @click="checkForUpdates(true)"
            >
              <span v-if="state.updateStatus.checking" class="animate-spin text-[9px]">⌛</span>
              <span>{{ state.updateStatus.checking ? t('settings.checkingUpdate') : t('settings.checkUpdate') }}</span>
            </button>
          </div>

          <!-- 发现新版本 -->
          <div
            v-if="state.updateStatus.hasUpdate && state.updateStatus.info"
            class="p-2 rounded-lg bg-sky-500/10 border border-sky-400/40 text-[11px] flex flex-col gap-1.5"
          >
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-1 font-semibold text-sky-300">
                <span>🚀</span>
                <span>{{ t('settings.hasNewVersion') }}</span>
                <span class="font-mono text-sky-200 underline">v{{ state.updateStatus.info.version }}</span>
              </div>
              <span
                v-if="state.settings.ignoredVersion === state.updateStatus.info.version"
                class="text-[9px] text-amber-300 font-medium px-1 py-0.2 rounded bg-amber-500/20 border border-amber-400/30"
              >
                {{ t('settings.ignoredVersionLabel') }}
              </span>
            </div>

            <div v-if="state.updateStatus.info.name" class="text-[10px] text-slate-300 truncate" :title="state.updateStatus.info.name">
              {{ state.updateStatus.info.name }}
            </div>

            <!-- 操作按钮组 -->
            <div class="flex items-center gap-1.5 mt-0.5">
              <button
                type="button"
                class="btn btn-primary flex-1 !py-1 text-[10.5px] font-medium cursor-pointer"
                @click="openUpdateModal"
              >
                {{ t('settings.updateNow') }}
              </button>

              <button
                v-if="state.settings.ignoredVersion === state.updateStatus.info.version"
                type="button"
                class="btn flex-1 !py-1 text-[10.5px] text-amber-300 hover:text-amber-200 cursor-pointer"
                @click="unignoreUpdateVersion"
              >
                {{ t('settings.unignore') }}
              </button>
              <button
                v-else
                type="button"
                class="btn flex-1 !py-1 text-[10.5px] text-slate-400 hover:text-slate-200 cursor-pointer"
                @click="ignoreUpdateVersion(state.updateStatus.info.version)"
              >
                {{ t('settings.ignoreVersion') }}
              </button>
            </div>
          </div>

          <!-- 已是最新版本 -->
          <div
            v-else-if="state.updateStatus.checked"
            class="flex items-center justify-between pt-0.5"
          >
            <div class="flex items-center gap-1 text-[10.5px] text-emerald-400 font-medium">
              <span>✓</span>
              <span>{{ t('settings.upToDate') }} (v{{ state.version }})</span>
            </div>
            <button
              type="button"
              class="text-[9.5px] text-sky-400 hover:text-sky-300 underline cursor-pointer"
              @click="openUpdateModal"
            >
              {{ t('settings.viewReleaseNotes') }}
            </button>
          </div>

          <!-- 检测更新遇到网络错误卡片 -->
          <div
            v-else-if="state.updateStatus.error"
            class="p-2.5 rounded-lg bg-rose-500/10 border border-rose-400/40 text-[11px] flex flex-col gap-1.5"
          >
            <div class="flex items-center justify-between text-rose-300 font-semibold">
              <div class="flex items-center gap-1">
                <span>⚠️</span>
                <span>{{ t('settings.updateErrorTitle') }}</span>
              </div>
              <button
                type="button"
                class="text-[9.5px] text-sky-400 hover:text-sky-300 underline cursor-pointer"
                @click="checkForUpdates(true)"
              >
                {{ t('settings.retryCheck') }}
              </button>
            </div>

            <p class="text-[10px] text-slate-300 leading-snug">
              {{ t('settings.updateErrorDesc') }}
            </p>

            <div class="grid grid-cols-2 gap-1.5 mt-0.5">
              <button
                type="button"
                class="btn btn-primary !py-1 text-[10.5px] font-medium flex items-center justify-center gap-1 cursor-pointer"
                @click="directDownloadLatest('portable')"
              >
                <span>⚡</span>
                <span>{{ t('settings.directDownloadPortable') }}</span>
              </button>
              <button
                type="button"
                class="btn !py-1 text-[10.5px] text-sky-300 border-sky-500/40 hover:border-sky-400 flex items-center justify-center gap-1 cursor-pointer"
                @click="directDownloadLatest('setup')"
              >
                <span>📦</span>
                <span>{{ t('settings.directDownloadSetup') }}</span>
              </button>
            </div>
          </div>

          <!-- 查看运行日志入口 -->
          <div class="mt-2.5 pt-2 border-t border-slate-800/80 flex items-center justify-between">
            <span class="text-[10px] text-slate-400 truncate max-w-[210px]" :title="state.paths.logFile || ''">{{ t('settings.logFilePath') }}</span>
            <button
              type="button"
              class="text-[10px] text-sky-400 hover:text-sky-300 flex items-center gap-1 px-2 py-0.5 rounded border border-sky-500/30 hover:border-sky-400/60 bg-sky-500/10 cursor-pointer transition-all shrink-0"
              @click="openLog"
              :title="t('settings.openLogTip')"
            >
              <span>📄</span>
              <span>{{ t('settings.openLog') }}</span>
            </button>
          </div>
        </div>

        <!-- Git 仓库与开源社区卡片 -->
        <div class="p-2.5 rounded-xl bg-gradient-to-br from-slate-800/90 to-slate-900/90 border border-slate-700/80 shadow-md">
          <div class="flex items-center gap-2 mb-1.5">
            <span class="text-white shrink-0">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
              </svg>
            </span>
            <span class="text-xs font-semibold text-slate-100">{{ t('settings.githubSectionTitle') }}</span>
            <span class="text-[10px] text-amber-400 ml-auto font-medium">⭐ PromptMag</span>
          </div>

          <div class="text-[9.5px] text-slate-400 font-mono mb-2 truncate bg-slate-950/60 px-1.5 py-1 rounded border border-slate-800">
            {{ GITHUB_URL }}
          </div>

          <p class="text-[10px] text-slate-400 mb-2 leading-relaxed">
            {{ t('settings.githubDesc') }}
          </p>

          <button
            class="w-full py-1.5 px-3 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 border border-amber-400/40 hover:border-amber-400 text-amber-300 font-medium text-xs flex items-center justify-center gap-1.5 transition-all shadow-[0_0_10px_rgba(245,158,11,0.15)] cursor-pointer mb-2"
            @click="openGitHub"
          >
            <span>⭐</span>
            <span>{{ t('settings.githubStarBtn') }}</span>
          </button>

          <!-- 快捷链接：Releases 与 Issues -->
          <div class="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              class="btn !py-1 text-[10px] text-slate-300 hover:text-sky-300 border-slate-700/80 hover:border-sky-500/40 flex items-center justify-center gap-1 truncate"
              @click="openReleases"
            >
              <span>📦</span>
              <span class="truncate">{{ t('settings.githubReleases') }}</span>
            </button>
            <button
              type="button"
              class="btn !py-1 text-[10px] text-slate-300 hover:text-amber-300 border-slate-700/80 hover:border-amber-500/40 flex items-center justify-center gap-1 truncate"
              @click="openIssues"
            >
              <span>💬</span>
              <span class="truncate">{{ t('settings.githubIssues') }}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  </header>
</template>
