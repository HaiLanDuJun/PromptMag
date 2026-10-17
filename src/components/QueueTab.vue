<script setup>
/**
 * Tab 1：历史关键词列表（契合设计图 6 历史关键词模块）
 *  - 头部：历史关键词 | 清空
 *  - 列表项：[🔍 图标] 关键词名称 ... 日期时间 (MM-DD HH:mm)
 *  - 悬停：微光高亮并显示快速操作（复制、回填、删除）
 *  - 支持 Agent 自动接力状态标识与双语国际化
 */
import { computed } from 'vue'
import {
  state, removeTask, editBackfill, copyCompiled, clearAllQueue,
  toggleTaskDone, resetAllTasksPending, formatDateTime, toast, imgUrl, openImagePreview,
  t, currentLocale
} from '../lib/store'

// 历史列表按时间倒序（最新的在最前）
const historyItems = computed(() => {
  return [...state.queue].reverse()
})

const pendingCount = computed(() => state.queue.filter(tTask => !tTask.done).length)
const hasDoneItems = computed(() => state.queue.some(tTask => tTask.done))

async function onCopy(tTask) {
  await copyCompiled(tTask)
  toast(t('toast.copiedKeyword'))
}

function onEdit(tTask) {
  editBackfill(tTask.id)
  toast(t('toast.backfilled'))
}

function onRemove(tTask) {
  removeTask(tTask.id)
  toast(t('toast.removed'))
}

function onClearAll() {
  if (!state.queue.length) return
  clearAllQueue()
  toast(t('toast.clearedHistory'))
}

function onResetAll() {
  resetAllTasksPending()
}

function displayTitle(item) {
  if (!item) return ''
  const txt = String(item.text || '').trim()
  if (!txt) {
    if (item.images && item.images.length) {
      const firstNote = item.images.find(im => im.note && im.note.trim())
      if (firstNote) return firstNote.note.trim()
      return t('queue.imageCount', { count: item.images.length })
    }
    return t('queue.unnamed')
  }
  // 若内容为单个 [图N: 关键词] 或 [Img N: 关键词]，在历史列表中直接优雅展示关键词文字
  const singleMatch = txt.match(/^\[(?:图|Img|Image)\s*\d+\s*[:：]\s*([^\]]+)\]$/i)
  if (singleMatch && singleMatch[1]) {
    return singleMatch[1].trim()
  }
  return txt
}
</script>

<template>
  <div class="flex flex-col h-full">
    <!-- 模块头：历史关键词 + 待用统计 + 重置待用 + 清空 -->
    <div class="history-section-header">
      <div class="flex items-center gap-1.5">
        <span class="text-slate-300 font-semibold text-[12px]">{{ t('queue.title') }}</span>
        <span v-if="state.queue.length" class="text-[10px] text-sky-400 font-normal">({{ state.queue.length }})</span>
        <span
          v-if="pendingCount > 0"
          class="ml-1 px-1.5 py-0.2 rounded-full bg-emerald-500/15 border border-emerald-400/30 text-[9px] text-emerald-300 font-semibold"
          :title="t('queue.pendingTag', { count: pendingCount })"
        >
          {{ t('queue.pendingTag', { count: pendingCount }) }}
        </span>
      </div>

      <div class="flex items-center gap-2">
        <button
          v-if="hasDoneItems"
          class="text-[11px] text-emerald-400/80 hover:text-emerald-300 transition-colors cursor-pointer"
          :title="t('queue.resetAllPendingTitle')"
          @click="onResetAll"
        >
          {{ t('queue.resetAllPending') }}
        </button>
        <button
          v-if="state.queue.length"
          class="text-[11px] text-sky-400/80 hover:text-sky-300 transition-colors cursor-pointer"
          :title="t('queue.clearTitle')"
          @click="onClearAll"
        >
          {{ t('queue.clear') }}
        </button>
      </div>
    </div>

    <!-- 空状态 -->
    <div v-if="!state.queue.length" class="py-14 text-center space-y-2">
      <div class="text-sky-500/30 flex justify-center">
        <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
      </div>
      <p class="text-slate-400 text-[12px]">{{ t('queue.empty') }}</p>
    </div>

    <!-- 历史列表：状态 + 关键词名 + 图片角标 + 状态标签 + 时间 -->
    <div v-else class="space-y-0.5 overflow-y-auto flex-1 min-h-0 pr-0.5">
      <div
        v-for="item in historyItems"
        :key="item.id"
        class="history-item-row group"
        :class="{ 'is-done': item.done }"
        @click="onEdit(item)"
      >
        <!-- 状态图标：已使用显示对勾，未使用显示放大镜（点击可切换状态） -->
        <span
          class="shrink-0 flex items-center transition-colors cursor-pointer"
          :class="item.done ? 'text-slate-500 hover:text-emerald-400' : 'text-sky-400 group-hover:text-sky-300'"
          :title="t('queue.toggleDoneTitle')"
          @click.stop="toggleTaskDone(item.id)"
        >
          <svg v-if="item.done" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          <svg v-else viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </span>

        <!-- 关键词标题 -->
        <span
          class="history-title truncate"
          :class="{ 'line-through !text-slate-500': item.done }"
          :title="item.text || 'Image record'"
        >
          {{ displayTitle(item) }}
        </span>

        <!-- 附带图片角标（点击可全屏放大查看） -->
        <span
          v-if="item.images && item.images.length"
          class="shrink-0 px-1.5 py-0.2 rounded bg-sky-500/10 hover:bg-sky-500/25 border border-sky-400/25 hover:border-sky-400/50 text-[9px] text-sky-400 cursor-pointer transition-colors"
          :title="t('editor.badgeTitle')"
          @click.stop="openImagePreview(item.images[0], 0, item.images)"
        >
          {{ currentLocale === 'en' ? item.images.length + ' Img' : item.images.length + '图' }}
        </span>

        <!-- 状态标签：待使用（高亮） / 已使用（灰色），点击切换 -->
        <span
          class="queue-status-badge"
          :class="item.done ? 'done' : 'pending'"
          :title="t('queue.toggleDoneTitle')"
          @click.stop="toggleTaskDone(item.id)"
        >
          {{ item.done ? t('common.done') : t('common.pending') }}
        </span>

        <!-- 悬停快捷按钮（切换状态 / 复制 / 删除） -->
        <div class="hidden group-hover:flex items-center gap-1 shrink-0" @click.stop>
          <button
            class="icon-btn !w-5 !h-5"
            :title="t('queue.toggleDoneTitle')"
            @click="toggleTaskDone(item.id)"
          >
            <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </button>
          <button class="icon-btn !w-5 !h-5" :title="t('queue.copyTitle')" @click="onCopy(item)">
            <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
          </button>
          <button class="icon-btn !w-5 !h-5 danger" :title="t('queue.deleteTitle')" @click="onRemove(item)">
            <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <!-- 时间戳 MM-DD HH:mm -->
        <span class="history-time group-hover:hidden">
          {{ formatDateTime(item.createdAt) }}
        </span>
      </div>
    </div>
  </div>
</template>
