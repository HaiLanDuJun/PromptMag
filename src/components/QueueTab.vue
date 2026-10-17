<script setup>
/**
 * Tab 1：历史关键词列表（契合设计图 6 历史关键词模块）
 *  - 头部：历史关键词 | 清空
 *  - 列表项：[🔍 图标] 关键词名称 ... 日期时间 (MM-DD HH:mm)
 *  - 悬停：微光高亮并显示快速操作（复制、回填、删除）
 *  - 支持 Agent 自动接力状态标识
 */
import { computed } from 'vue'
import {
  state, removeTask, editBackfill, copyCompiled, clearAllQueue,
  toggleTaskDone, resetAllTasksPending, formatDateTime, toast, imgUrl, openImagePreview
} from '../lib/store'

// 历史列表按时间倒序（最新的在最前）
const historyItems = computed(() => {
  return [...state.queue].reverse()
})

const pendingCount = computed(() => state.queue.filter(t => !t.done).length)
const hasDoneItems = computed(() => state.queue.some(t => t.done))

async function onCopy(t) {
  await copyCompiled(t)
  toast('已复制关键词')
}

function onEdit(t) {
  editBackfill(t.id)
  toast('已回填到输入框')
}

function onRemove(t) {
  removeTask(t.id)
  toast('已移除')
}

function onClearAll() {
  if (!state.queue.length) return
  clearAllQueue()
  toast('已清空历史关键词')
}

function onResetAll() {
  resetAllTasksPending()
}

function displayTitle(item) {
  if (!item) return ''
  const t = String(item.text || '').trim()
  if (!t) {
    if (item.images && item.images.length) {
      const firstNote = item.images.find(im => im.note && im.note.trim())
      if (firstNote) return firstNote.note.trim()
      return `[${item.images.length} 张图片]`
    }
    return '未命名关键词'
  }
  // 若内容为单个 [图N: 关键词]，在历史列表中直接优雅展示关键词文字（同图二）
  const singleMatch = t.match(/^\[图\s*\d+\s*[:：]\s*([^\]]+)\]$/)
  if (singleMatch && singleMatch[1]) {
    return singleMatch[1].trim()
  }
  return t
}
</script>

<template>
  <div class="flex flex-col h-full">
    <!-- 模块头：历史关键词 + 待用统计 + 重置待用 + 清空 -->
    <div class="history-section-header">
      <div class="flex items-center gap-1.5">
        <span class="text-slate-300 font-semibold text-[12px]">历史关键词</span>
        <span v-if="state.queue.length" class="text-[10px] text-sky-400 font-normal">({{ state.queue.length }})</span>
        <span
          v-if="pendingCount > 0"
          class="ml-1 px-1.5 py-0.2 rounded-full bg-emerald-500/15 border border-emerald-400/30 text-[9px] text-emerald-300 font-semibold"
          title="弹夹中尚未使用的提示词数量"
        >
          待用 {{ pendingCount }}
        </span>
      </div>

      <div class="flex items-center gap-2">
        <button
          v-if="hasDoneItems"
          class="text-[11px] text-emerald-400/80 hover:text-emerald-300 transition-colors cursor-pointer"
          title="将所有已使用的提示词一键恢复为待使用"
          @click="onResetAll"
        >
          全部重置待用
        </button>
        <button
          v-if="state.queue.length"
          class="text-[11px] text-sky-400/80 hover:text-sky-300 transition-colors cursor-pointer"
          @click="onClearAll"
        >
          清空
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
      <p class="text-slate-400 text-[12px]">暂无历史关键词</p>
      <p class="text-[11px] text-slate-500">在上方输入框输入关键词或上传图片，按 Enter 保存</p>
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
          :title="item.done ? '已使用（点击恢复为待用）' : '待使用（点击标记为已用）'"
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
          :title="item.text || '纯图片记录'"
        >
          {{ displayTitle(item) }}
        </span>

        <!-- 附带图片角标（点击可全屏放大查看） -->
        <span
          v-if="item.images && item.images.length"
          class="shrink-0 px-1.5 py-0.2 rounded bg-sky-500/10 hover:bg-sky-500/25 border border-sky-400/25 hover:border-sky-400/50 text-[9px] text-sky-400 cursor-pointer transition-colors"
          title="点击放大查看此关键词关联的所有图片"
          @click.stop="openImagePreview(item.images[0], 0, item.images)"
        >
          {{ item.images.length }}图
        </span>

        <!-- 状态标签：待使用（高亮） / 已使用（灰色），点击切换 -->
        <span
          class="queue-status-badge"
          :class="item.done ? 'done' : 'pending'"
          :title="item.done ? '已使用过（点击恢复为待使用）' : '待使用（点击标记为已使用）'"
          @click.stop="toggleTaskDone(item.id)"
        >
          {{ item.done ? '已使用' : '待使用' }}
        </span>

        <!-- 悬停快捷按钮（切换状态 / 复制 / 删除） -->
        <div class="hidden group-hover:flex items-center gap-1 shrink-0" @click.stop>
          <button
            class="icon-btn !w-5 !h-5"
            :title="item.done ? '恢复为待使用' : '标记为已使用'"
            @click="toggleTaskDone(item.id)"
          >
            <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </button>
          <button class="icon-btn !w-5 !h-5" title="复制" @click="onCopy(item)">
            <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
          </button>
          <button class="icon-btn !w-5 !h-5 danger" title="删除" @click="onRemove(item)">
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
