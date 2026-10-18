<script setup>
/**
 * Tab 1：历史关键词与提示词弹夹
 *  - 头部：历史关键词 | 过滤（全部 / 待用 / 收藏） | 出弹模式 | 自动接力状态 | 清理未收藏
 *  - 列表项：[⭐ 收藏] [🔍 状态] 关键词名称 ... 图片角标 ... 多Agent状态标签 (doing/done/解决者)
 *  - 支持显示 Agent 认领人、写锁保护、解决者与解决方案
 *  - 收藏的提示词图片存入独立目录并受防删保护
 */
import { computed, ref } from 'vue'
import {
  state, removeTask, editBackfill, copyCompiled, clearAllQueue,
  toggleTaskDone, resetAllTasksPending, formatDateTime, toast, openImagePreview,
  cyclePopMode, toggleFavorite, cleanupUnfavorited,
  setActiveMagazine, createMagazine, renameMagazine, deleteMagazine, openRelayStartupModal, getActiveMagazine,
  t, currentLocale
} from '../lib/store'

const filterTab = ref('all') // 'all' | 'pending' | 'favorite'

const activeMagazine = computed(() => getActiveMagazine())

function onSwitchMag(id) {
  setActiveMagazine(id)
}

function onNewMagazine() {
  const name = window.prompt(t('magazines.namePlaceholder'))
  if (name && name.trim()) {
    createMagazine(name.trim())
  }
}

function onRenameMagazine(mag) {
  if (!mag) return
  const newName = window.prompt(t('magazines.renameTitle'), mag.name)
  if (newName && newName.trim() && newName.trim() !== mag.name) {
    renameMagazine(mag.id, newName.trim())
  }
}

function onDeleteMagazine(mag) {
  if (!mag) return
  if (window.confirm(t('magazines.deleteConfirm', { name: mag.name }))) {
    deleteMagazine(mag.id)
  }
}

function onOpenRelayStartup(magId = null) {
  openRelayStartupModal(magId || state.activeMagazineId)
}

const pendingCount = computed(() => state.queue.filter(tTask => !tTask.done).length)
const doneCount = computed(() => state.queue.filter(tTask => tTask.done).length)
const favoriteCount = computed(() => state.queue.filter(tTask => tTask.favorite).length)
const unfavoritedCount = computed(() => state.queue.filter(tTask => !tTask.favorite).length)
const hasDoneItems = computed(() => state.queue.some(tTask => tTask.done))

// 历史列表按时间倒序（最新的在最前）并根据 filterTab 过滤
const historyItems = computed(() => {
  const list = [...state.queue].reverse()
  if (filterTab.value === 'pending') return list.filter(t => !t.done)
  if (filterTab.value === 'done') return list.filter(t => t.done)
  if (filterTab.value === 'favorite') return list.filter(t => t.favorite)
  return list
})

const popMode = computed(() => state.settings.popMode || 'shotgun')
const popModeIcon = computed(() => {
  if (popMode.value === 'revolver') return '🎲'
  if (popMode.value === 'pistol') return '🎯'
  return '💥'
})
const popModeLabel = computed(() => {
  if (popMode.value === 'revolver') return t('settings.popModeRevolver')
  if (popMode.value === 'pistol') return t('settings.popModePistol')
  return t('settings.popModeShotgun')
})
const popModeTooltip = computed(() => {
  const desc = popMode.value === 'revolver' ? t('settings.popModeRevolverDesc') : popMode.value === 'pistol' ? t('settings.popModePistolDesc') : t('settings.popModeShotgunDesc')
  return `${popModeLabel.value} · ${desc} (${t('queue.clickToSwitch')})`
})
const popModeBadgeClass = computed(() => {
  if (popMode.value === 'revolver') return 'bg-amber-500/15 border-amber-400/40 text-amber-300 hover:bg-amber-500/25'
  if (popMode.value === 'pistol') return 'bg-purple-500/15 border-purple-400/40 text-purple-300 hover:bg-purple-500/25'
  return 'bg-sky-500/15 border-sky-400/40 text-sky-300 hover:bg-sky-500/25'
})

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

async function onClearAll() {
  if (!state.queue.length) return
  const magName = activeMagazine.value?.name || t('magazines.currentMagazine')
  if (!window.confirm(t('queue.clearConfirm', { name: magName }))) return
  await clearAllQueue()
  toast(t('toast.clearedHistory'))
}

function onResetAll() {
  resetAllTasksPending()
}

async function onCleanUnfavorited() {
  await cleanupUnfavorited('unused', activeMagazine.value?.id)
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
  const singleMatch = txt.match(/^\[(?:图|Img|Image)\s*\d+\s*[:：]\s*([^\]]+)\]$/i)
  if (singleMatch && singleMatch[1]) {
    return singleMatch[1].trim()
  }
  return txt
}
</script>

<template>
  <div class="flex flex-col h-full">
    <!-- 顶栏：项目多弹夹导航栏与快速管理 -->
    <div class="flex items-center gap-1.5 pb-2 border-b border-slate-800/80 mb-2 overflow-x-auto select-none">
      <div class="flex items-center gap-1 flex-1 min-w-0 overflow-x-auto">
        <button
          v-for="mag in state.magazines"
          :key="mag.id"
          class="flex items-center gap-1.5 px-2 py-1 rounded-lg border text-[11px] font-medium transition-all shrink-0 cursor-pointer"
          :class="mag.id === state.activeMagazineId
            ? (mag.id === 'favorites' ? 'bg-amber-500/20 border-amber-400 text-amber-200 shadow-[0_0_8px_rgba(245,158,11,0.2)]' : 'bg-sky-500/20 border-sky-400 text-sky-200 shadow-[0_0_8px_rgba(56,189,248,0.2)]')
            : 'bg-slate-800/50 border-slate-700/60 text-slate-400 hover:text-slate-200 hover:border-slate-600'"
          @click="onSwitchMag(mag.id)"
        >
          <span v-if="mag.id === 'favorites'" class="text-[11px] leading-none">⭐</span>
          <span
            v-else
            class="w-1.5 h-1.5 rounded-full shrink-0"
            :style="{ backgroundColor: mag.color || '#38bdf8' }"
          />
          <span class="max-w-[85px] truncate">{{ mag.name }}</span>
          <span class="text-[9.5px] opacity-75">
            ({{ (mag.queue || []).filter(t => !t.done).length }})
          </span>
        </button>

        <!-- 新建弹夹按键 -->
        <button
          class="px-1.5 py-1 rounded-lg border border-dashed border-slate-700 hover:border-sky-400 text-slate-400 hover:text-sky-300 text-[10.5px] transition-all flex items-center gap-1 shrink-0 cursor-pointer"
          :title="t('magazines.newMagazine')"
          @click="onNewMagazine"
        >
          <span>+</span>
          <span>{{ t('magazines.newMagazine') }}</span>
        </button>
      </div>

      <!-- 当前弹夹专属快捷操作：重命名 / 删除 / 接力启动指令 -->
      <div v-if="activeMagazine" class="flex items-center gap-1 shrink-0">
        <!-- 生成接力启动指令 -->
        <button
          class="px-1.5 py-0.5 rounded border border-amber-400/40 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 hover:text-amber-200 text-[10px] font-medium flex items-center gap-1 transition-all cursor-pointer"
          :title="t('magazines.relayStartupTitle')"
          @click="onOpenRelayStartup(activeMagazine.id)"
        >
          <span>⚡</span>
          <span>{{ t('magazines.relayStartup') }}</span>
        </button>

        <!-- 重命名弹夹（收藏弹夹受系统保护不可重命名） -->
        <button
          v-if="activeMagazine.id !== 'favorites'"
          class="icon-btn !w-5 !h-5 text-slate-400 hover:text-slate-200"
          :title="t('magazines.renameTitle')"
          @click="onRenameMagazine(activeMagazine)"
        >
          <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
          </svg>
        </button>

        <!-- 删除弹夹（至少保留 1 个，默认弹夹与收藏弹夹为系统级保护弹夹） -->
        <button
          v-if="activeMagazine.id !== 'default' && activeMagazine.id !== 'favorites' && state.magazines.length > 1"
          class="icon-btn !w-5 !h-5 danger"
          :title="t('magazines.deleteTitle')"
          @click="onDeleteMagazine(activeMagazine)"
        >
          <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          </svg>
        </button>
      </div>
    </div>

    <!-- 过滤器与快捷控制栏（去重合并：无需再重复当前弹夹名称，各功能规整于单行） -->
    <div class="flex items-center justify-between gap-1.5 my-1.5 px-0.5 select-none shrink-0">
      <div class="flex items-center gap-1 flex-wrap">
        <button
          class="px-2 py-0.5 rounded-full text-[10px] font-medium transition-all cursor-pointer"
          :class="filterTab === 'all' ? 'bg-sky-500/20 text-sky-300 border border-sky-400/40' : 'text-slate-400 hover:text-slate-200 border border-transparent'"
          @click="filterTab = 'all'"
        >
          {{ t('queue.all') }} ({{ state.queue.length }})
        </button>
        <button
          class="px-2 py-0.5 rounded-full text-[10px] font-medium transition-all cursor-pointer"
          :class="filterTab === 'pending' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/40' : 'text-slate-400 hover:text-slate-200 border border-transparent'"
          @click="filterTab = 'pending'"
        >
          {{ t('common.pending') }} ({{ pendingCount }})
        </button>

        <!-- 收藏弹夹显示「已使用」，普通弹夹显示「已收藏 ⭐」 -->
        <button
          v-if="activeMagazine && activeMagazine.id === 'favorites'"
          class="px-2 py-0.5 rounded-full text-[10px] font-medium transition-all cursor-pointer"
          :class="filterTab === 'done' ? 'bg-slate-700/60 text-slate-200 border border-slate-600' : 'text-slate-400 hover:text-slate-200 border border-transparent'"
          @click="filterTab = 'done'"
        >
          {{ t('common.done') }} ({{ doneCount }})
        </button>
        <button
          v-else
          class="px-2 py-0.5 rounded-full text-[10px] font-medium transition-all flex items-center gap-0.5 cursor-pointer"
          :class="filterTab === 'favorite' ? 'bg-amber-500/20 text-amber-300 border border-amber-400/40' : 'text-slate-400 hover:text-slate-200 border border-transparent'"
          @click="filterTab = 'favorite'"
        >
          <span class="text-amber-400 text-[10px]">⭐</span>
          <span>{{ t('queue.favorites') }} ({{ favoriteCount }})</span>
        </button>

        <!-- 出弹模式快速切换徽标 -->
        <button
          class="ml-1 px-1.5 py-0.2 rounded-full text-[9px] font-semibold transition-all border flex items-center gap-1 cursor-pointer select-none"
          :class="popModeBadgeClass"
          :title="popModeTooltip"
          @click="cyclePopMode"
        >
          <span class="text-[9.5px]">{{ popModeIcon }}</span>
          <span>{{ popModeLabel }}</span>
        </button>
      </div>

      <div class="flex items-center gap-2">
        <button
          v-if="hasDoneItems"
          class="text-[10.5px] text-emerald-400/80 hover:text-emerald-300 transition-colors cursor-pointer"
          :title="t('queue.resetAllPendingTitle')"
          @click="onResetAll"
        >
          {{ t('queue.resetAllPending') }}
        </button>
        <button
          v-if="activeMagazine && activeMagazine.id !== 'favorites' && unfavoritedCount > 0"
          class="text-[10px] text-rose-400/80 hover:text-rose-300 transition-colors cursor-pointer px-1.5 py-0.5 rounded hover:bg-rose-500/10 flex items-center gap-1"
          :title="t('queue.cleanUnfavoritedTitle')"
          @click="onCleanUnfavorited"
        >
          <span>🧹</span>
          <span>{{ t('queue.cleanUnfavorited') }}</span>
        </button>
        <button
          v-if="state.queue.length"
          class="text-[10.5px] text-sky-400/80 hover:text-sky-300 transition-colors cursor-pointer"
          :title="t('queue.clearTitle')"
          @click="onClearAll"
        >
          {{ t('queue.clear') }}
        </button>
      </div>
    </div>

    <!-- 文件修改写锁提示横幅（当有 Agent 正在独占修改文件时显式提示） -->
    <div
      v-if="state.relayStatus.isWriteLocked"
      class="mb-1.5 px-2.5 py-1.5 rounded-lg bg-amber-500/15 border border-amber-400/40 flex items-center gap-1.5 text-[10.5px] text-amber-200 shadow-[0_0_10px_rgba(245,158,11,0.15)] shrink-0 animate-pulse"
    >
      <span class="text-amber-400">🔒</span>
      <span class="font-bold text-amber-300">[{{ state.relayStatus.lockedBy || 'Agent' }}]</span>
      <span class="truncate">{{ t('queue.writeLockedNotice', { agent: state.relayStatus.lockedBy || 'Agent' }) }}</span>
    </div>

    <!-- 空状态 -->
    <div v-if="!historyItems.length" class="py-14 text-center space-y-2">
      <div class="text-sky-500/30 flex justify-center">
        <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
      </div>
      <p class="text-slate-400 text-[12px]">
        {{ activeMagazine && activeMagazine.id === 'favorites' ? t('queue.emptyFavorites') : t('queue.empty') }}
      </p>
    </div>

    <!-- 历史列表：收藏 + 状态 + 关键词名 + 图片角标 + Agent状态标签 + 时间 -->
    <div v-else class="space-y-1 overflow-y-auto flex-1 min-h-0 pr-0.5">
      <div
        v-for="item in historyItems"
        :key="item.id"
        class="history-item-row group flex flex-col !items-stretch !p-1.5 gap-1"
        :class="{ 'is-done': item.done, '!border-amber-400/30 bg-amber-500/[.03]': item.favorite }"
        @click="onEdit(item)"
      >
        <div class="flex items-center gap-1.5 w-full min-w-0">
          <!-- 收藏星星按钮 -->
          <button
            class="shrink-0 flex items-center transition-colors cursor-pointer p-0.5 rounded hover:bg-slate-700/40"
            :class="item.favorite ? 'text-amber-400 hover:text-amber-300' : 'text-slate-600 hover:text-amber-300/80'"
            :title="item.favorite ? t('queue.unfavoriteTitle') : t('queue.favoriteTitle')"
            @click.stop="toggleFavorite(item.id)"
          >
            <svg viewBox="0 0 24 24" width="13" height="13" :fill="item.favorite ? 'currentColor' : 'none'" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
          </button>

          <!-- 状态图标：已使用显示对勾，未使用显示圆圈（点击切换状态） -->
          <span
            class="shrink-0 flex items-center transition-colors cursor-pointer"
            :class="item.done ? 'text-slate-500 hover:text-emerald-400' : 'text-sky-400 group-hover:text-sky-300'"
            :title="t('queue.toggleDoneTitle')"
            @click.stop="toggleTaskDone(item.id)"
          >
            <svg v-if="item.done" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            <svg v-else viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </span>

          <!-- 关键词标题 -->
          <span
            class="history-title truncate flex-1 min-w-0"
            :class="{ 'line-through !text-slate-500': item.done }"
            :title="item.text || 'Image record'"
          >
            {{ displayTitle(item) }}
          </span>

          <!-- 附带图片角标（点击全屏放大预览） -->
          <span
            v-if="item.images && item.images.length"
            class="shrink-0 px-1.5 py-0.2 rounded bg-sky-500/10 hover:bg-sky-500/25 border border-sky-400/25 hover:border-sky-400/50 text-[9px] text-sky-400 cursor-pointer transition-colors"
            :title="t('editor.badgeTitle')"
            @click.stop="openImagePreview(item.images[0], 0, item.images)"
          >
            {{ currentLocale === 'en' ? item.images.length + ' Img' : item.images.length + '图' }}
          </span>

          <!-- 自动接力进行中（doing）状态徽标 -->
          <span
            v-if="item.status === 'doing'"
            class="shrink-0 px-1.5 py-0.2 rounded bg-amber-500/20 border border-amber-400/40 text-[9px] text-amber-300 font-semibold flex items-center gap-0.5 animate-pulse"
            :title="`Agent: ${item.agent || 'Agent'} (${item.type === 'write' ? '文件修改独占锁' : '并发只读'})`"
          >
            <span>⚡</span>
            <span>{{ item.agent || 'Agent' }}</span>
            <span v-if="item.type === 'write'" class="text-[8px] opacity-80">🔒</span>
          </span>

          <!-- 状态标签：已完成（显示解决者姓名） / 待使用 -->
          <span
            v-else-if="item.done || item.status === 'done'"
            class="queue-status-badge done shrink-0"
            :title="item.solution ? `${t('queue.solver')}: ${item.solver || item.agent || 'Agent'} | ${t('queue.solution')}: ${item.solution}` : t('queue.toggleDoneTitle')"
            @click.stop="toggleTaskDone(item.id)"
          >
            {{ item.solver || item.agent ? `${item.solver || item.agent} ✓` : t('common.done') }}
          </span>
          <span
            v-else
            class="queue-status-badge pending shrink-0"
            :title="t('queue.toggleDoneTitle')"
            @click.stop="toggleTaskDone(item.id)"
          >
            {{ t('common.pending') }}
          </span>

          <!-- 悬停快捷按钮（收藏 / 切换状态 / 复制 / 删除） -->
          <div class="hidden group-hover:flex items-center gap-1 shrink-0" @click.stop>
            <button
              class="icon-btn !w-5 !h-5"
              :class="{ 'text-amber-400': item.favorite }"
              :title="item.favorite ? t('queue.unfavoriteTitle') : t('queue.favoriteTitle')"
              @click="toggleFavorite(item.id)"
            >
              <svg viewBox="0 0 24 24" width="11" height="11" :fill="item.favorite ? 'currentColor' : 'none'" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
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
          <span class="history-time group-hover:hidden shrink-0">
            {{ formatDateTime(item.createdAt) }}
          </span>
        </div>

        <!-- 解决方案随附行（若 Agent 汇报了解决者和解决方案） -->
        <div
          v-if="item.solution"
          class="flex items-center gap-1.5 text-[9.5px] text-emerald-300/80 pl-6 pr-1 w-full bg-emerald-500/[.04] py-0.5 rounded border border-emerald-500/10"
          :title="`${t('queue.solver')}: ${item.solver || 'Agent'} | ${t('queue.solution')}: ${item.solution}`"
        >
          <span class="text-emerald-400 shrink-0 font-medium">↳ [{{ item.solver || 'Agent' }}]</span>
          <span class="truncate text-slate-300 flex-1">{{ item.solution }}</span>
        </div>
      </div>
    </div>
  </div>
</template>
