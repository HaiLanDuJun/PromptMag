<script setup>
/**
 * 版本更新提醒弹窗（UpdateModal）
 * 提醒用户有新版本可用：
 *  - 显示当前版本号与最新版本号
 *  - 展示更新日志/发行说明
 *  - 用户可选择立即更新（前往下载）
 *  - 用户可选择忽略此版本（不再主动弹窗提醒）
 *  - 用户可选择稍后提醒
 */
import { computed, onMounted, onBeforeUnmount } from 'vue'
import {
  state, closeUpdateModal, ignoreUpdateVersion, openUpdateUrl, t
} from '../lib/store'

const updateInfo = computed(() => state.updateStatus.info || {})
const currentVersion = computed(() => state.version || '1.9.8')
const latestVersion = computed(() => updateInfo.value.version || '1.9.9')

const formattedDate = computed(() => {
  if (!updateInfo.value.publishedAt) return ''
  try {
    const d = new Date(updateInfo.value.publishedAt)
    return d.toLocaleDateString(state.settings.locale === 'zh' ? 'zh-CN' : 'en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    })
  } catch {
    return ''
  }
})

function onKeyDown(e) {
  if (e.key === 'Escape') {
    e.preventDefault()
    closeUpdateModal()
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
    <div class="absolute inset-0 bg-slate-950/75 backdrop-blur-sm" @click="closeUpdateModal" />

    <!-- 弹窗主体 -->
    <div
      class="relative w-full max-w-md rounded-xl bg-slate-900 border border-sky-500/40 shadow-[0_20px_50px_rgba(0,0,0,0.7),0_0_20px_rgba(56,189,248,0.2)] p-4 flex flex-col gap-3 z-10 max-h-[90vh]"
      @click.stop
    >
      <!-- 头部 -->
      <div class="flex items-center justify-between border-b border-slate-800 pb-2.5">
        <div class="flex items-center gap-2">
          <span class="text-sky-400 text-base animate-bounce">
            🚀
          </span>
          <span class="font-semibold text-slate-100 text-xs tracking-wide">
            {{ t('updateModal.title', { version: latestVersion }) }}
          </span>
        </div>
        <button
          class="text-slate-400 hover:text-rose-400 transition-colors p-1"
          :title="t('updateModal.btnRemindLater')"
          @click="closeUpdateModal"
        >
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      <!-- 版本对照卡片 -->
      <div class="flex items-center justify-between p-2.5 rounded-lg bg-slate-950/70 border border-slate-800 text-xs">
        <div class="flex items-center gap-2">
          <span class="text-[11px] text-slate-400">{{ t('updateModal.badgeCurrent') }}:</span>
          <span class="font-mono text-slate-300 font-semibold px-2 py-0.5 rounded bg-slate-800/80 border border-slate-700/60">
            v{{ currentVersion }}
          </span>
        </div>
        <span class="text-sky-400 text-sm font-bold">➔</span>
        <div class="flex items-center gap-2">
          <span class="text-[11px] text-slate-400">{{ t('updateModal.badgeNew') }}:</span>
          <span class="font-mono text-sky-300 font-bold px-2 py-0.5 rounded bg-sky-500/20 border border-sky-400/40 shadow-[0_0_8px_rgba(56,189,248,0.3)]">
            v{{ latestVersion }}
          </span>
        </div>
      </div>

      <!-- 发布标题与时间 -->
      <div v-if="updateInfo.name || formattedDate" class="flex items-center justify-between text-[11px] text-slate-300 px-0.5">
        <span class="font-medium truncate max-w-[280px]" :title="updateInfo.name">{{ updateInfo.name }}</span>
        <span v-if="formattedDate" class="text-slate-500 text-[10px] shrink-0 font-mono">{{ formattedDate }}</span>
      </div>

      <!-- 更新日志说明 -->
      <div class="flex flex-col gap-1 min-h-0 flex-1">
        <div class="text-[10px] text-slate-400 font-medium flex items-center justify-between">
          <span>{{ t('updateModal.releaseNotes') }}</span>
          <button
            class="text-[9.5px] text-sky-400 hover:text-sky-300 underline cursor-pointer"
            @click="openUpdateUrl()"
          >
            GitHub Release ↗
          </button>
        </div>
        <div class="flex-1 overflow-y-auto max-h-48 p-2.5 rounded-lg bg-slate-950/80 border border-slate-800 text-[11px] text-slate-300 leading-relaxed font-sans whitespace-pre-wrap select-text">
          {{ updateInfo.body || 'No release notes provided.' }}
        </div>
      </div>

      <!-- 底部操作按钮 -->
      <div class="flex items-center justify-between gap-2 pt-1 border-t border-slate-800/80">
        <!-- 忽略此版本按钮 -->
        <button
          type="button"
          class="btn !py-1.5 !px-2.5 text-[11px] text-slate-400 hover:text-amber-300 hover:border-amber-400/50 cursor-pointer"
          :title="t('updateModal.btnIgnore')"
          @click="ignoreUpdateVersion()"
        >
          {{ t('updateModal.btnIgnore') }}
        </button>

        <div class="flex items-center gap-2">
          <!-- 稍后提醒 -->
          <button
            type="button"
            class="btn !py-1.5 !px-3 text-[11px] text-slate-300 hover:text-white cursor-pointer"
            @click="closeUpdateModal"
          >
            {{ t('updateModal.btnRemindLater') }}
          </button>

          <!-- 立即更新 -->
          <button
            type="button"
            class="btn btn-primary !py-1.5 !px-3.5 text-xs font-semibold flex items-center gap-1.5 cursor-pointer shadow-[0_0_12px_rgba(56,189,248,0.35)]"
            @click="openUpdateUrl()"
          >
            <span>🚀</span>
            <span>{{ t('updateModal.btnUpdate') }}</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
