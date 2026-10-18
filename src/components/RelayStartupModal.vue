<script setup>
/**
 * Agent 接力启动指令生成器弹窗（RelayStartupModal）
 * 解决不同项目不同接力任务、不同 Agent 循环工作指令适配问题：
 *  - 支持选择项目弹夹
 *  - 支持选择 Agent 类型（Claude Code / Antigravity agy / 通用 Agent）
 *  - 动态生成无歧义的接力启动指令
 *  - 一键复制到剪贴板，方便在终端一键运行
 */
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import {
  state, closeRelayStartupModal, copyRelayStartupPrompt,
  getActiveMagazine, toast, t
} from '../lib/store'
import { buildRelayStartupPrompt } from '../lib/compilePrompt'

const selectedMagId = ref(state.relayStartupTargetMagId || state.activeMagazineId || 'default')
const selectedAgent = ref('claude') // 'claude' | 'agy' | 'general'

const currentMag = computed(() => {
  return state.magazines.find((m) => m.id === selectedMagId.value) || getActiveMagazine()
})

const specificTasksPath = computed(() => {
  const mag = currentMag.value
  const magId = mag ? mag.id : 'default'
  return state.paths.magazinesDir
    ? `${state.paths.magazinesDir.replace(/\\/g, '/')}/${magId}/tasks.md`
    : `${state.paths.homeDir.replace(/\\/g, '/')}/magazines/${magId}/tasks.md`
})

const generatedPrompt = computed(() => {
  return buildRelayStartupPrompt(currentMag.value, {
    tasksPath: specificTasksPath.value,
    locale: state.settings.locale,
    agentType: selectedAgent.value,
    popMode: state.settings.popMode || 'shotgun'
  })
})

async function onCopy() {
  await copyRelayStartupPrompt(selectedMagId.value, selectedAgent.value)
  toast(t('relayStartupModal.copiedToast'))
  closeRelayStartupModal()
}

function onKeyDown(e) {
  if (e.key === 'Escape') {
    e.preventDefault()
    closeRelayStartupModal()
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKeyDown)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeyDown)
})
</script>

<template>
  <div class="fixed inset-0 z-50 flex items-center justify-center p-3 select-none">
    <!-- 背景遮罩 -->
    <div class="absolute inset-0 bg-slate-950/75 backdrop-blur-sm" @click="closeRelayStartupModal" />

    <!-- 弹窗主体 -->
    <div
      class="relative w-full max-w-md rounded-xl bg-slate-900 border border-slate-700/80 shadow-[0_20px_40px_rgba(0,0,0,0.6)] p-4 flex flex-col gap-3 z-10 max-h-[90vh]"
      @click.stop
    >
      <!-- 头部 -->
      <div class="flex items-center justify-between border-b border-slate-800 pb-2.5">
        <div class="flex items-center gap-2">
          <span class="text-amber-400">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
            </svg>
          </span>
          <span class="font-semibold text-slate-100 text-xs tracking-wide">
            {{ t('relayStartupModal.title') }}
          </span>
        </div>
        <button
          class="text-slate-400 hover:text-rose-400 transition-colors p-1"
          @click="closeRelayStartupModal"
        >
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      <div class="text-[10px] text-slate-400 -mt-1 leading-normal">
        {{ t('relayStartupModal.subtitle') }}
      </div>

      <!-- 选项配置区域 -->
      <div class="grid grid-cols-2 gap-2 bg-slate-800/40 p-2.5 rounded-lg border border-slate-800">
        <!-- 弹夹选择 -->
        <div class="flex flex-col gap-1">
          <label class="text-[10px] font-medium text-slate-300">
            {{ t('relayStartupModal.magazineLabel') }}
          </label>
          <select
            v-model="selectedMagId"
            class="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200 outline-none focus:border-sky-400"
          >
            <option
              v-for="mag in state.magazines"
              :key="mag.id"
              :value="mag.id"
            >
              {{ mag.name }} ({{ (mag.queue || []).filter(t => !t.done).length }} 待办)
            </option>
          </select>
        </div>

        <!-- Agent 目标类型选择 -->
        <div class="flex flex-col gap-1">
          <label class="text-[10px] font-medium text-slate-300">
            {{ t('relayStartupModal.targetAgent') }}
          </label>
          <select
            v-model="selectedAgent"
            class="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200 outline-none focus:border-sky-400"
          >
            <option value="claude">{{ t('relayStartupModal.claudeLoop') }}</option>
            <option value="agy">{{ t('relayStartupModal.agyRelay') }}</option>
            <option value="general">{{ t('relayStartupModal.generalAgent') }}</option>
          </select>
        </div>
      </div>

      <!-- 启动提示词内容预览 -->
      <div class="flex flex-col gap-1 flex-1 min-h-0">
        <div class="flex items-center justify-between text-[10px] text-slate-400">
          <div class="flex items-center gap-2">
            <span>{{ t('relayStartupModal.promptPreview') }}</span>
            <span class="text-[9.5px] px-1.5 py-0.5 rounded bg-slate-800 text-amber-300 border border-slate-700/60 flex items-center gap-1 font-mono">
              <span v-if="state.settings.popMode === 'shotgun'">💥 {{ t('settings.popModeShotgun') }}</span>
              <span v-else-if="state.settings.popMode === 'pistol'">🎯 {{ t('settings.popModePistol') }}</span>
              <span v-else>🎲 {{ t('settings.popModeRevolver') }}</span>
            </span>
          </div>
          <span class="text-sky-400 text-[9.5px] truncate max-w-[180px]" :title="specificTasksPath">
            {{ specificTasksPath }}
          </span>
        </div>
        <textarea
          :value="generatedPrompt"
          readonly
          class="w-full h-44 bg-slate-950/80 border border-slate-800 rounded-lg p-2.5 text-[11px] text-slate-300 font-mono resize-none outline-none leading-relaxed select-text"
        />
      </div>

      <!-- 底部操作按钮 -->
      <div class="flex items-center justify-between pt-1 border-t border-slate-800">
        <span class="text-[10px] text-slate-400">
          复制后直接在 Claude Code / CLI 终端中粘贴发送
        </span>
        <div class="flex items-center gap-2">
          <button class="btn !py-1 !px-3 text-xs" @click="closeRelayStartupModal">
            {{ t('relayStartupModal.close') }}
          </button>
          <button class="btn btn-primary !py-1 !px-3.5 text-xs flex items-center gap-1.5" @click="onCopy">
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
            {{ t('relayStartupModal.copyPrompt') }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
