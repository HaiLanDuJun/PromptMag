<script setup>
/**
 * 版本更新提醒弹窗（UpdateModal）
 * 完整支持应用内原生自动升级（无需跳转外部浏览器）：
 *  - 阶段 1：待用户确认 -> 显示新旧版本对照、Markdown 富文本更新日志、[确认自动升级]、[稍后提醒]、[忽略此版本]
 *  - 阶段 2：应用内流式下载 -> 实时发光进度条、下载百分比、已下载/总MB、实时下载网速、[取消下载]
 *  - 阶段 3：下载完成二次确认 -> 提示安装包就绪，用户确认 [立即重启完成升级] 或 [稍后安装]
 *  - 阶段 4：下载异常兜底 -> 提示错误、[重试下载]、[前往官网手动下载] 兜底
 */
import { computed, onMounted, onBeforeUnmount } from 'vue'
import { marked } from 'marked'
import {
  state, closeUpdateModal, ignoreUpdateVersion, openUpdateUrl, openReleaseNotesUrl,
  startInAppUpdate, cancelInAppUpdate, confirmInstallUpdate, t
} from '../lib/store'

const updateInfo = computed(() => state.updateStatus.info || {})
const currentVersion = computed(() => state.version || '1.9.17')
const latestVersion = computed(() => updateInfo.value.version || '1.9.17')

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

const renderedBody = computed(() => {
  const raw = updateInfo.value.body
  if (!raw) return '<p class="text-slate-500 italic">No release notes provided.</p>'
  try {
    return marked.parse(raw, { breaks: true, gfm: true })
  } catch (e) {
    return raw
  }
})

function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return '0 MB'
  const mb = bytes / (1024 * 1024)
  return mb.toFixed(1) + ' MB'
}

function onMarkdownClick(e) {
  const a = e.target.closest('a')
  if (a && a.href) {
    e.preventDefault()
    if (window.pm && window.pm.openExternal) {
      window.pm.openExternal(a.href)
    } else {
      window.open(a.href, '_blank')
    }
  }
}

function onKeyDown(e) {
  if (e.key === 'Escape' && !state.updateStatus.downloading) {
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
    <div class="absolute inset-0 bg-slate-950/75 backdrop-blur-sm" @click="!state.updateStatus.downloading && closeUpdateModal()" />

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
          v-if="!state.updateStatus.downloading"
          class="text-slate-400 hover:text-rose-400 transition-colors p-1 cursor-pointer"
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

      <!-- 更新日志说明 (支持 Markdown 丰富排版渲染) -->
      <div class="flex flex-col gap-1 min-h-0 flex-1">
        <div class="text-[10px] text-slate-400 font-medium flex items-center justify-between">
          <span>{{ t('updateModal.releaseNotes') }}</span>
          <button
            class="text-[9.5px] text-sky-400 hover:text-sky-300 underline cursor-pointer"
            @click="openReleaseNotesUrl()"
          >
            GitHub Release ↗
          </button>
        </div>
        <div
          class="markdown-content flex-1 overflow-y-auto max-h-48 p-2.5 rounded-lg bg-slate-950/80 border border-slate-800 select-text"
          v-html="renderedBody"
          @click="onMarkdownClick"
        />
      </div>

      <!-- ================= 阶段 2: 正在应用内下载 ================= -->
      <div v-if="state.updateStatus.downloading" class="flex flex-col gap-2 p-3 rounded-xl bg-slate-950/90 border border-sky-500/40 shadow-[0_0_16px_rgba(56,189,248,0.15)]">
        <div class="flex items-center justify-between text-xs">
          <span class="text-sky-300 font-medium flex items-center gap-1.5">
            <svg class="animate-spin w-3.5 h-3.5 text-sky-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <circle cx="12" cy="12" r="10" stroke-opacity="0.25" />
              <path d="M12 2a10 10 0 0 1 10 10" />
            </svg>
            {{ t('updateModal.btnDownloading') }} (v{{ latestVersion }})
          </span>
          <span v-if="state.updateStatus.downloadSpeed" class="font-mono text-sky-400 text-[11px] font-semibold bg-sky-500/10 px-1.5 py-0.5 rounded border border-sky-500/30">
            {{ state.updateStatus.downloadSpeed }}
          </span>
        </div>
        <!-- 进度条轨道 -->
        <div class="w-full h-2 rounded-full bg-slate-800 overflow-hidden relative">
          <div
            class="h-full bg-gradient-to-r from-sky-500 via-sky-400 to-cyan-300 transition-all duration-200 rounded-full shadow-[0_0_10px_rgba(56,189,248,0.7)]"
            :style="{ width: state.updateStatus.downloadProgress + '%' }"
          />
        </div>
        <div class="flex items-center justify-between text-[10px] text-slate-400 font-mono">
          <span>
            {{ formatBytes(state.updateStatus.downloadedBytes) }} / {{ formatBytes(state.updateStatus.totalBytes) }} ({{ state.updateStatus.downloadProgress }}%)
          </span>
          <button
            type="button"
            class="text-slate-400 hover:text-rose-400 cursor-pointer font-sans transition-colors"
            @click="cancelInAppUpdate"
          >
            {{ t('updateModal.btnCancelDownload') }}
          </button>
        </div>
      </div>

      <!-- ================= 阶段 3: 下载完成，用户确认立即重启升级 ================= -->
      <div v-else-if="state.updateStatus.downloadComplete" class="flex flex-col gap-2 p-3 rounded-xl bg-emerald-950/40 border border-emerald-500/50 shadow-[0_0_16px_rgba(16,185,129,0.2)]">
        <div class="flex items-center gap-2 text-emerald-300 font-bold text-xs">
          <span>🎉</span>
          <span>{{ t('updateModal.downloadCompleteTitle') }}</span>
        </div>
        <p class="text-[11px] text-emerald-200/90 leading-snug">
          {{ t('updateModal.downloadCompleteDesc') }}
        </p>
        <div class="flex items-center justify-end gap-2 mt-1">
          <button
            type="button"
            class="btn !py-1.5 !px-3 text-xs text-slate-300 hover:text-white cursor-pointer"
            @click="closeUpdateModal"
          >
            {{ t('updateModal.btnInstallLater') }}
          </button>
          <button
            type="button"
            class="btn btn-primary !py-1.5 !px-3.5 text-xs font-bold !bg-emerald-500 hover:!bg-emerald-400 !border-emerald-400 text-slate-950 flex items-center gap-1.5 cursor-pointer shadow-[0_0_12px_rgba(16,185,129,0.45)]"
            @click="confirmInstallUpdate"
          >
            <span>⚡</span>
            <span>{{ t('updateModal.btnRestartNow') }}</span>
          </button>
        </div>
      </div>

      <!-- ================= 阶段 4: 下载失败错误提示 ================= -->
      <div v-else-if="state.updateStatus.downloadError" class="flex flex-col gap-2 p-2.5 rounded-lg bg-rose-950/40 border border-rose-500/40 text-xs">
        <div class="flex items-center gap-1.5 text-rose-300 font-medium">
          <span>⚠️</span>
          <span class="truncate">{{ state.updateStatus.downloadError }}</span>
        </div>
        <div class="flex items-center justify-end gap-2">
          <button
            type="button"
            class="btn !py-1 !px-2.5 text-[11px] text-rose-300 hover:text-rose-100 hover:border-rose-400/60"
            @click="startInAppUpdate"
          >
            {{ t('updateModal.btnRetryDownload') }}
          </button>
          <button
            type="button"
            class="text-[10px] text-sky-400 hover:text-sky-300 underline cursor-pointer"
            @click="openUpdateUrl('https://promptmag.dev/')"
          >
            {{ t('updateModal.btnManualDownload') }}
          </button>
        </div>
      </div>

      <!-- ================= 阶段 1: 待用户确认升级 (初始状态) ================= -->
      <div v-else class="flex items-center justify-between gap-2 pt-1 border-t border-slate-800/80">
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

          <!-- 确认自动升级 (需用户确认，应用内直接高速下载，无需跳转网页) -->
          <button
            type="button"
            class="btn btn-primary !py-1.5 !px-3.5 text-xs font-semibold flex items-center gap-1.5 cursor-pointer shadow-[0_0_12px_rgba(56,189,248,0.35)]"
            @click="startInAppUpdate"
          >
            <span>🚀</span>
            <span>{{ t('updateModal.btnAutoUpdate') }}</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
