<script setup>
/**
 * Tab 1：历史关键词与提示词弹夹
 *  - 头部：历史关键词 | 过滤（全部 / 待用 / 收藏） | 出弹模式 | 自动接力状态 | 清理未收藏
 *  - 列表项：[⭐ 收藏] [🔍 状态] 关键词名称 ... 图片角标 ... 多Agent状态标签 (doing/done/解决者)
 *  - 支持显示 Agent 认领人、写锁保护、解决者与解决方案
 *  - 收藏的提示词图片存入独立目录并受防删保护
 */
import { computed, ref, nextTick } from 'vue'
import {
  state, removeTask, editBackfill, copyCompiled, clearAllQueue,
  toggleTaskDone, resetAllTasksPending, formatDateTime, toast, openImagePreview,
  cyclePopMode, toggleFavorite, cleanupUnfavorited, startEditingTask,
  setActiveMagazine, createMagazine, renameMagazine, deleteMagazine, openRelayStartupModal, getActiveMagazine,
  attentionList, attentionCount, approveProposedTask, rejectProposedTask, answerBlockedTask, updateTaskMandate,
  t, currentLocale
} from '../lib/store'

const filterTab = ref('all') // 'all' | 'pending' | 'favorite'

const activeMagazine = computed(() => getActiveMagazine())

const magTabsRef = ref(null)
function onMagTabsWheel(e) {
  if (magTabsRef.value) {
    magTabsRef.value.scrollLeft += e.deltaY || e.deltaX
  }
}

function onSwitchMag(id) {
  setActiveMagazine(id)
}

// 1. 编辑提示词确认弹窗
const showEditConfirmModal = ref(false)
const taskToEdit = ref(null)
const editMandateStrength = ref('explicit')
const editMandateLevel = ref(2)

function onClickItem(item) {
  if (!item) return
  if (state.editingTaskId === item.id) return
  taskToEdit.value = item
  editMandateStrength.value = item.mandate?.strength || 'explicit'
  editMandateLevel.value = item.mandate?.level || 2
  showEditConfirmModal.value = true
}

function confirmEditTask() {
  if (taskToEdit.value) {
    updateTaskMandate(taskToEdit.value.id, {
      strength: editMandateStrength.value,
      level: editMandateLevel.value
    })
    startEditingTask(taskToEdit.value.id)
  }
  showEditConfirmModal.value = false
  taskToEdit.value = null
}

function cancelEditConfirm() {
  showEditConfirmModal.value = false
  taskToEdit.value = null
}

// 2. 新建弹夹弹窗（替换原生 window.prompt，支持自动聚焦与输入保证）
const showNewMagModal = ref(false)
const newMagNameInput = ref('')
const newMagInputRef = ref(null)

function onNewMagazine() {
  newMagNameInput.value = ''
  showNewMagModal.value = true
  nextTick(() => {
    newMagInputRef.value?.focus()
  })
}

function submitNewMag() {
  const name = newMagNameInput.value && newMagNameInput.value.trim()
  if (name) {
    createMagazine(name)
  }
  showNewMagModal.value = false
  newMagNameInput.value = ''
}

function closeNewMagModal() {
  showNewMagModal.value = false
  newMagNameInput.value = ''
}

// 3. 重命名弹夹弹窗（替换原生 window.prompt）
const showRenameMagModal = ref(false)
const renameMagTarget = ref(null)
const renameMagInput = ref('')
const renameMagInputRef = ref(null)

function onRenameMagazine(mag) {
  if (!mag) return
  renameMagTarget.value = mag
  renameMagInput.value = mag.name || ''
  showRenameMagModal.value = true
  nextTick(() => {
    renameMagInputRef.value?.focus()
  })
}

function submitRenameMag() {
  const newName = renameMagInput.value && renameMagInput.value.trim()
  if (renameMagTarget.value && newName && newName !== renameMagTarget.value.name) {
    renameMagazine(renameMagTarget.value.id, newName)
  }
  showRenameMagModal.value = false
  renameMagTarget.value = null
  renameMagInput.value = ''
}

function closeRenameMagModal() {
  showRenameMagModal.value = false
  renameMagTarget.value = null
  renameMagInput.value = ''
}

// 4. 删除弹夹深度定制弹窗（替换原生 window.confirm）
const showDeleteMagModal = ref(false)
const magToDelete = ref(null)

function onDeleteMagazine(mag) {
  if (!mag) return
  magToDelete.value = mag
  showDeleteMagModal.value = true
}

function confirmDeleteMag() {
  if (magToDelete.value) {
    deleteMagazine(magToDelete.value.id)
  }
  showDeleteMagModal.value = false
  magToDelete.value = null
}

function cancelDeleteMag() {
  showDeleteMagModal.value = false
  magToDelete.value = null
}

function onOpenRelayStartup(magId = null) {
  openRelayStartupModal(magId || state.activeMagazineId)
}

const doingCount = computed(() => state.queue.filter(tTask => tTask.status === 'doing').length)
const pendingCount = computed(() => state.queue.filter(tTask => !tTask.done && tTask.status !== 'done' && tTask.status !== 'proposed' && tTask.status !== 'blocked').length)
const doneCount = computed(() => state.queue.filter(tTask => tTask.done || tTask.status === 'done').length)
const favoriteCount = computed(() => state.queue.filter(tTask => tTask.favorite).length)
const unfavoritedCount = computed(() => state.queue.filter(tTask => !tTask.favorite).length)
const hasDoneItems = computed(() => state.queue.some(tTask => tTask.done || tTask.status === 'done'))

const answerInputs = ref({})
function onAnswer(taskId) {
  const ans = answerInputs.value[taskId]
  if (ans && ans.trim()) {
    answerBlockedTask(taskId, ans.trim())
    delete answerInputs.value[taskId]
  }
}

function formatDuration(ts) {
  if (!ts) return ''
  const diff = Math.max(0, Date.now() - ts)
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return currentLocale.value === 'en' ? 'Just now' : '刚刚'
  if (mins < 60) return currentLocale.value === 'en' ? `Waiting ${mins}m` : `已等 ${mins} 分钟`
  const hours = Math.floor(mins / 60)
  return currentLocale.value === 'en' ? `Waiting ${hours}h` : `已等 ${hours} 小时`
}

const observeStats = computed(() => state.observeStats || { proposed: 0, accepted: 0, rejected: 0 })
const acceptanceRate = computed(() => {
  const total = (observeStats.value.accepted || 0) + (observeStats.value.rejected || 0)
  if (total === 0) return null
  return Math.round(((observeStats.value.accepted || 0) / total) * 100)
})

// 历史列表按时间倒序（最新的在最前）并根据 filterTab 过滤；Attention 中的 blocked 与 proposed 不在普通列表重复打扰
const historyItems = computed(() => {
  const list = [...state.queue].filter(t => t.status !== 'blocked' && t.status !== 'proposed').reverse()
  if (filterTab.value === 'pending') return list.filter(t => !t.done && t.status !== 'done')
  if (filterTab.value === 'done') return list.filter(t => t.done || t.status === 'done')
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

const showClearConfirmModal = ref(false)

function onClearAll() {
  if (!state.queue.length) return
  showClearConfirmModal.value = true
}

async function confirmClearAll() {
  showClearConfirmModal.value = false
  await clearAllQueue()
  toast(t('toast.clearedHistory'))
}

function cancelClearAll() {
  showClearConfirmModal.value = false
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
    <div class="flex items-center justify-between gap-1 pb-1.5 border-b border-slate-800/80 mb-1.5 select-none">
      <!-- 左侧：多弹夹标签（支持平滑横向滚动与滚轮） -->
      <div
        ref="magTabsRef"
        class="flex items-center gap-1 flex-1 min-w-0 overflow-x-auto no-scrollbar py-0.5"
        @wheel.prevent="onMagTabsWheel"
      >
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
          <span class="max-w-[75px] truncate">{{ mag.name }}</span>
          <span class="text-[9.5px] opacity-75">
            ({{ (mag.queue || []).filter(t => !t.done).length }})
          </span>
        </button>
      </div>

      <!-- 右侧固定控制区（外置固定，绝对不被遮挡、不随列表滚动） -->
      <div class="flex items-center gap-1 shrink-0 pl-1 border-l border-slate-800/80">
        <!-- 生成接力启动指令（当前项目弹夹专属，外置于弹夹控制栏，逻辑统一且不挤占队列排版） -->
        <button
          v-if="activeMagazine && activeMagazine.id !== 'favorites'"
          class="px-2 py-1 rounded-lg border border-amber-400/40 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 hover:text-amber-200 text-[10.5px] font-medium flex items-center gap-1 shrink-0 cursor-pointer transition-all shadow-sm"
          :title="t('magazines.relayStartupTitle')"
          @click="onOpenRelayStartup(activeMagazine.id)"
        >
          <span>⚡</span>
          <span>{{ t('magazines.relayStartup') }}</span>
        </button>

        <!-- 新建弹夹按键（常驻固定显示，不再被挤出或遮挡） -->
        <button
          class="px-2 py-1 rounded-lg border border-dashed border-sky-400/40 hover:border-sky-400 bg-sky-500/10 hover:bg-sky-500/20 text-sky-300 hover:text-sky-200 text-[10.5px] font-medium flex items-center gap-1 shrink-0 cursor-pointer transition-all shadow-sm"
          :title="t('magazines.newMagazine')"
          @click="onNewMagazine"
        >
          <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          <span>{{ t('magazines.newBtnShort') }}</span>
        </button>

        <!-- 当前弹夹专属快捷操作：重命名 / 删除（仅非系统弹夹） -->
        <div v-if="activeMagazine && activeMagazine.id !== 'favorites'" class="flex items-center gap-0.5 shrink-0">
          <!-- 重命名弹夹 -->
          <button
            class="icon-btn !w-5 !h-5 text-slate-400 hover:text-slate-200"
            :title="t('magazines.renameTitle')"
            @click="onRenameMagazine(activeMagazine)"
          >
            <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
            </svg>
          </button>

          <!-- 删除弹夹 -->
          <button
            v-if="activeMagazine.id !== 'default' && state.magazines.length > 1"
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
    </div>

    <!-- 过滤器与快捷控制栏（严守单行排版，杜绝折行产生第二行） -->
    <div class="flex items-center justify-between gap-1.5 my-1.5 px-0.5 select-none shrink-0 flex-nowrap">
      <!-- 1. 若为收藏弹夹：简洁展示收藏提示词数量，隐藏出弹模式与待用/已用切换 -->
      <div v-if="activeMagazine && activeMagazine.id === 'favorites'" class="flex items-center gap-1.5">
        <span class="px-2.5 py-0.8 rounded-full text-[10.5px] font-medium bg-amber-500/15 border border-amber-400/40 text-amber-200 flex items-center gap-1 shadow-[0_0_6px_rgba(245,158,11,0.15)]">
          <span>⭐</span>
          <span>{{ t('queue.all') }} ({{ state.queue.length }})</span>
        </span>
      </div>

      <!-- 2. 若为普通项目弹夹：正常提供全部 / 待用 / 收藏过滤 + 出弹模式切换（单行排布无换行） -->
      <div v-else class="flex items-center gap-1 flex-nowrap min-w-0">
        <button
          class="px-2 py-0.5 rounded-full text-[10px] font-medium transition-all cursor-pointer shrink-0"
          :class="filterTab === 'all' ? 'bg-sky-500/20 text-sky-300 border border-sky-400/40' : 'text-slate-400 hover:text-slate-200 border border-transparent'"
          @click="filterTab = 'all'"
        >
          {{ t('queue.all') }} ({{ state.queue.length }})
        </button>
        <button
          class="px-2 py-0.5 rounded-full text-[10px] font-medium transition-all cursor-pointer shrink-0"
          :class="filterTab === 'pending' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/40' : 'text-slate-400 hover:text-slate-200 border border-transparent'"
          @click="filterTab = 'pending'"
        >
          {{ t('common.pending') }} ({{ pendingCount }})
        </button>
        <button
          class="px-2 py-0.5 rounded-full text-[10px] font-medium transition-all flex items-center gap-0.5 cursor-pointer shrink-0"
          :class="filterTab === 'favorite' ? 'bg-amber-500/20 text-amber-300 border border-amber-400/40' : 'text-slate-400 hover:text-slate-200 border border-transparent'"
          @click="filterTab = 'favorite'"
        >
          <span class="text-amber-400 text-[10px]">⭐</span>
          <span>{{ t('queue.favorites') }} ({{ favoriteCount }})</span>
        </button>

        <!-- 出弹模式快速切换徽标 -->
        <button
          class="ml-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-semibold transition-all border flex items-center gap-1 cursor-pointer select-none shrink-0"
          :class="popModeBadgeClass"
          :title="popModeTooltip"
          @click="cyclePopMode"
        >
          <span class="text-[9.5px]">{{ popModeIcon }}</span>
          <span>{{ popModeLabel }}</span>
        </button>
      </div>

      <!-- 右侧控制组：全部重置为待用 / 清空（单行收敛） -->
      <div class="flex items-center gap-1.5 shrink-0">
        <button
          v-if="hasDoneItems && (!activeMagazine || activeMagazine.id !== 'favorites')"
          class="text-[10px] text-emerald-400/80 hover:text-emerald-300 transition-colors cursor-pointer px-1 py-0.5 rounded hover:bg-emerald-500/10 shrink-0"
          :title="t('queue.resetAllPendingTitle')"
          @click="onResetAll"
        >
          {{ t('queue.resetAllPending') }}
        </button>

        <button
          v-if="state.queue.length"
          class="text-[10px] text-sky-400/80 hover:text-sky-300 transition-colors cursor-pointer px-1 py-0.5 rounded hover:bg-sky-500/10 shrink-0"
          :title="t('queue.clearTitle')"
          @click="onClearAll"
        >
          {{ t('queue.clear') }}
        </button>
      </div>
    </div>

    <!-- 简明状态统计汇总行（进行中 x · 已完成 y，仅数字） -->
    <div v-if="activeMagazine && activeMagazine.id !== 'favorites' && state.queue.length" class="flex items-center justify-between text-[10px] text-slate-400 px-1 py-0.5 mb-1 select-none shrink-0">
      <div class="flex items-center gap-2">
        <span>进行中 <b class="text-amber-400 font-semibold">{{ doingCount }}</b></span>
        <span class="text-slate-600">·</span>
        <span>待办 <b class="text-sky-300 font-semibold">{{ pendingCount }}</b></span>
        <span class="text-slate-600">·</span>
        <span>已完成 <b class="text-emerald-400 font-semibold">{{ doneCount }}</b></span>
      </div>
      <div v-if="acceptanceRate !== null" class="text-[9.5px]">
        Observe 采纳率: <b class="text-emerald-400 font-semibold">{{ acceptanceRate }}%</b>
      </div>
    </div>

    <!-- Attention 注意力面板（只显示等人的事：blocked 挂起任务与 proposed 待批提案；为空时零占位完全不渲染） -->
    <div
      v-if="attentionList.length > 0"
      class="mb-2 p-2 rounded-xl bg-gradient-to-br from-amber-500/15 via-rose-500/10 to-slate-900 border border-amber-400/50 shadow-[0_4px_16px_rgba(245,158,11,0.15)] flex flex-col gap-2 shrink-0 select-text"
    >
      <div class="flex items-center justify-between border-b border-amber-500/20 pb-1 select-none">
        <div class="flex items-center gap-1.5">
          <span class="text-amber-400 text-xs animate-bounce">🔔</span>
          <span class="text-[11px] font-bold text-amber-200">Attention · 等待你处理 ({{ attentionList.length }})</span>
        </div>
        <div v-if="acceptanceRate !== null" class="text-[9.5px] text-slate-400">
          采纳率: <span class="font-bold text-emerald-400">{{ acceptanceRate }}%</span> ({{ observeStats.accepted }}/{{ (observeStats.accepted || 0) + (observeStats.rejected || 0) }})
        </div>
      </div>

      <div class="flex flex-col gap-2 max-h-52 overflow-y-auto pr-0.5">
        <div
          v-for="item in attentionList"
          :key="item.id"
          class="p-2 rounded-lg bg-slate-900/90 border text-xs flex flex-col gap-1.5 transition-all"
          :class="item.status === 'blocked' ? 'border-amber-400/60 shadow-[0_0_8px_rgba(245,158,11,0.2)]' : 'border-sky-400/60 shadow-[0_0_8px_rgba(56,189,248,0.2)]'"
        >
          <!-- 项头部：类型徽标 + 任务标题 + 等待时长 + 停止/撤销按钮 -->
          <div class="flex items-center justify-between gap-1.5 select-none">
            <div class="flex items-center gap-1.5 min-w-0 flex-1">
              <span
                v-if="item.status === 'blocked'"
                class="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-500/20 border border-amber-400/60 text-amber-300 shrink-0"
              >
                ❓ 任务挂起 Blocked
              </span>
              <span
                v-else
                class="px-1.5 py-0.5 rounded text-[9px] font-bold bg-sky-500/20 border border-sky-400/60 text-sky-300 shrink-0"
              >
                📋 待批准 OBSERVE
              </span>

              <span class="font-medium text-slate-100 truncate" :title="item.text">
                {{ displayTitle(item) }}
              </span>
            </div>

            <div class="flex items-center gap-1.5 shrink-0">
              <span class="text-[9.5px] text-slate-400 font-mono">
                {{ formatDuration(item.statusSince) }}
              </span>
              <button
                class="text-[10px] text-rose-400 hover:text-rose-300 px-1 py-0.5 rounded hover:bg-rose-500/10 cursor-pointer transition-colors"
                :title="t('queue.stopTaskTitle', '停止并删除该任务（撤回授权）')"
                @click.stop="onRemove(item)"
              >
                停止
              </button>
            </div>
          </div>

          <!-- 若为 Blocked 项：显示提问原文 + 输入框 + 回答并继续 -->
          <div v-if="item.status === 'blocked'" class="flex flex-col gap-1.5 pl-1.5 border-l-2 border-amber-400/70 ml-0.5 mt-0.5">
            <div class="text-[11px] text-amber-100 bg-amber-500/10 p-1.5 rounded border border-amber-400/20 leading-relaxed break-words">
              <span class="font-bold text-amber-300">Q: </span>
              {{ item.blockedQuestion || '任务无法继续，需要您做出决定。' }}
            </div>
            <div class="flex items-center gap-1.5">
              <input
                v-model="answerInputs[item.id]"
                type="text"
                class="flex-1 text-xs py-1 px-2 rounded bg-slate-800 border border-slate-700 text-slate-100 outline-none focus:border-amber-400 select-text cursor-text"
                placeholder="输入回答（将回写为 > A: 子行并恢复待办）..."
                @keydown.enter="onAnswer(item.id)"
              />
              <button
                class="btn btn-primary !py-1 !px-2.5 text-[11px] shrink-0 cursor-pointer !bg-amber-600 hover:!bg-amber-500 text-white"
                @click="onAnswer(item.id)"
              >
                回答并继续
              </button>
            </div>
          </div>

          <!-- 若为 Proposed 项：显示授权等级 + 批准/拒绝按钮 -->
          <div v-else-if="item.status === 'proposed'" class="flex items-center justify-between gap-2 pt-1 border-t border-slate-800/80">
            <div class="text-[10px] text-slate-400 flex items-center gap-1">
              <span>来源: Agent 自生成</span>
              <span class="px-1 py-0.2 rounded bg-slate-800 border border-slate-700 text-[9px] text-sky-300">
                L{{ item.mandate?.level || 2 }} 权限
              </span>
            </div>
            <div class="flex items-center gap-1.5 select-none">
              <button
                class="px-2 py-0.8 rounded text-[10.5px] font-medium bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-400/30 cursor-pointer transition-colors"
                @click="rejectProposedTask(item.id)"
              >
                拒绝
              </button>
              <button
                class="px-2.5 py-0.8 rounded text-[10.5px] font-medium bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-400/40 cursor-pointer transition-colors flex items-center gap-1"
                @click="approveProposedTask(item.id)"
              >
                <span>✓</span>
                <span>批准</span>
              </button>
            </div>
          </div>
        </div>
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
        class="history-item-row group flex flex-col !items-stretch !p-1.5 gap-1 transition-all cursor-pointer"
        :class="{
          'is-done': (activeMagazine?.id !== 'favorites') && item.done,
          '!border-amber-400 !bg-amber-500/15 shadow-[0_0_8px_rgba(245,158,11,0.25)]': state.editingTaskId === item.id,
          '!border-amber-400/30 bg-amber-500/[.03]': state.editingTaskId !== item.id && item.favorite
        }"
        @click="onClickItem(item)"
      >
        <div class="flex items-center gap-1.5 w-full min-w-0">
          <!-- 收藏星星按钮：仅在普通项目弹夹显示；收藏弹夹不显示星星按钮 -->
          <button
            v-if="activeMagazine && activeMagazine.id !== 'favorites'"
            class="shrink-0 flex items-center transition-colors cursor-pointer p-0.5 rounded hover:bg-slate-700/40"
            :class="item.favorite ? 'text-amber-400 hover:text-amber-300' : 'text-slate-600 hover:text-amber-300/80'"
            :title="item.favorite ? t('queue.unfavoriteTitle') : t('queue.favoriteTitle')"
            @click.stop="toggleFavorite(item.id)"
          >
            <svg viewBox="0 0 24 24" width="13" height="13" :fill="item.favorite ? 'currentColor' : 'none'" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
          </button>
          <span v-else class="text-amber-400 text-xs shrink-0 select-none">⭐</span>

          <!-- 关键词标题 -->
          <span
            class="history-title truncate flex-1 min-w-0"
            :class="{ 'line-through !text-slate-500': (activeMagazine?.id !== 'favorites') && item.done }"
            :title="item.text || 'Image record'"
          >
            {{ displayTitle(item) }}
          </span>

          <!-- 编辑中状态徽标 -->
          <span
            v-if="state.editingTaskId === item.id"
            class="shrink-0 px-1.5 py-0.2 rounded bg-amber-500/25 border border-amber-400/80 text-[9px] text-amber-200 font-semibold flex items-center gap-0.5 animate-pulse"
          >
            <span>✏️</span>
            <span>{{ t('queue.editingBadge') }}</span>
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

          <!-- Mandate 授权徽标（L3 高危或亲令显式标记） -->
          <span
            v-if="item.mandate"
            class="shrink-0 px-1 py-0.2 rounded text-[8.5px] font-medium border"
            :class="item.mandate.level === 3
              ? 'bg-rose-500/20 border-rose-400/50 text-rose-300 font-bold'
              : (item.mandate.strength === 'explicit'
                ? 'bg-emerald-500/15 border-emerald-400/30 text-emerald-300'
                : 'bg-slate-800/80 border-slate-700 text-slate-400')"
            :title="`Mandate: L${item.mandate.level || 2} · ${item.mandate.strength === 'explicit' ? '亲自下达' : '自动推断'} (${item.mandate.issuer || 'user'})`"
          >
            L{{ item.mandate.level || 2 }}{{ item.mandate.strength === 'explicit' ? '·亲' : '' }}
          </span>

          <!-- 状态标签：已完成 / 待使用（仅在普通项目弹夹显示；收藏弹夹不显示） -->
          <template v-if="activeMagazine && activeMagazine.id !== 'favorites'">
            <span
              v-if="item.done || item.status === 'done'"
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
          </template>

          <!-- 悬停快捷按钮（彻底去重：只保留复制与删除按钮，移除多余的重复收藏星星） -->
          <div class="hidden group-hover:flex items-center gap-1 shrink-0" @click.stop>
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

    <!-- 弹窗 1：编辑提示词二次确认弹窗 -->
    <div v-if="showEditConfirmModal" class="fixed inset-0 z-50 flex items-center justify-center p-3 select-none">
      <div class="absolute inset-0 bg-slate-950/70 backdrop-blur-sm" @click="cancelEditConfirm" />
      <div class="relative w-full max-w-sm rounded-xl bg-slate-900 border border-slate-700/80 shadow-[0_16px_36px_rgba(0,0,0,0.5)] p-4 flex flex-col gap-3 z-10" @click.stop>
        <div class="flex items-center justify-between border-b border-slate-800/80 pb-2">
          <div class="flex items-center gap-2">
            <span class="text-amber-400">✏️</span>
            <span class="font-semibold text-slate-100 text-xs">{{ t('queue.editConfirmTitle') }}</span>
          </div>
          <button class="text-slate-400 hover:text-slate-200 p-1 cursor-pointer" @click="cancelEditConfirm">✕</button>
        </div>
        <p class="text-[11px] text-slate-300 leading-relaxed">
          {{ t('queue.editConfirmNotice') }}
        </p>
        <div v-if="taskToEdit" class="p-2 rounded-lg bg-slate-800/60 border border-slate-700/60 text-xs text-sky-200 whitespace-pre-wrap break-words max-h-36 overflow-y-auto font-mono">
          {{ taskToEdit.text || displayTitle(taskToEdit) }}
        </div>

        <!-- Mandate 授权配置小控件（强度 + 动作等级下拉） -->
        <div v-if="taskToEdit" class="flex flex-col gap-1.5 p-2 rounded-lg bg-slate-800/40 border border-slate-700/50 text-xs">
          <div class="text-[10px] font-semibold text-slate-300 flex items-center gap-1">
            <span>🛡️</span>
            <span>授权边界（Mandate）</span>
          </div>
          <div class="grid grid-cols-2 gap-2">
            <div class="flex flex-col gap-1">
              <label class="text-[9.5px] text-slate-400">签发强度</label>
              <select
                v-model="editMandateStrength"
                class="bg-slate-800 border border-slate-700 text-slate-200 text-[11px] rounded px-1.5 py-1 outline-none focus:border-sky-400"
              >
                <option value="explicit">我亲自下达 (explicit)</option>
                <option value="inferred">自动生成 (inferred)</option>
              </select>
            </div>
            <div class="flex flex-col gap-1">
              <label class="text-[9.5px] text-slate-400">允许动作等级</label>
              <select
                v-model.number="editMandateLevel"
                class="bg-slate-800 border border-slate-700 text-slate-200 text-[11px] rounded px-1.5 py-1 outline-none focus:border-sky-400"
              >
                <option :value="1">1级: 只读与改代码</option>
                <option :value="2">2级: 运行命令与测试</option>
                <option :value="3">3级: 删除/Push/发版 (高危)</option>
              </select>
            </div>
          </div>
        </div>
        <div class="flex items-center justify-end gap-2 pt-1 border-t border-slate-800/80">
          <button class="btn !py-1 !px-3 text-xs" @click="cancelEditConfirm">{{ t('common.cancel') }}</button>
          <button class="btn btn-primary !py-1 !px-3 text-xs cursor-pointer" @click="confirmEditTask">{{ t('queue.confirmEditBtn') }}</button>
        </div>
      </div>
    </div>

    <!-- 弹窗 2：新建项目弹夹弹窗（替换原生 window.prompt，输入框强制聚焦与可写） -->
    <div v-if="showNewMagModal" class="fixed inset-0 z-50 flex items-center justify-center p-3">
      <div class="absolute inset-0 bg-slate-950/70 backdrop-blur-sm" @click="closeNewMagModal" />
      <div class="relative w-full max-w-sm rounded-xl bg-slate-900 border border-slate-700/80 shadow-[0_16px_36px_rgba(0,0,0,0.5)] p-4 flex flex-col gap-3 z-10 select-text" @click.stop>
        <div class="flex items-center justify-between border-b border-slate-800/80 pb-2">
          <div class="flex items-center gap-2">
            <span class="text-sky-400">📁</span>
            <span class="font-semibold text-slate-100 text-xs">{{ t('magazines.newModalTitle') }}</span>
          </div>
          <button class="text-slate-400 hover:text-slate-200 p-1 cursor-pointer" @click="closeNewMagModal">✕</button>
        </div>
        <div class="flex flex-col gap-1.5">
          <label class="text-[10.5px] text-slate-400">{{ t('magazines.nameLabel') }}</label>
          <input
            ref="newMagInputRef"
            v-model="newMagNameInput"
            type="text"
            class="text-xs w-full py-1.5 px-2.5 rounded-lg bg-slate-800 border border-slate-700 focus:border-sky-400 text-slate-100 outline-none select-text cursor-text"
            :placeholder="t('magazines.namePlaceholder')"
            @keydown.enter.prevent="submitNewMag"
            @keydown.esc.prevent="closeNewMagModal"
          />
        </div>
        <div class="flex items-center justify-end gap-2 pt-1 border-t border-slate-800/80">
          <button class="btn !py-1 !px-3 text-xs cursor-pointer" @click="closeNewMagModal">{{ t('common.cancel') }}</button>
          <button class="btn btn-primary !py-1 !px-3 text-xs cursor-pointer" @click="submitNewMag">{{ t('magazines.createBtn') }}</button>
        </div>
      </div>
    </div>

    <!-- 弹窗 3：重命名弹夹弹窗（替换原生 window.prompt） -->
    <div v-if="showRenameMagModal" class="fixed inset-0 z-50 flex items-center justify-center p-3">
      <div class="absolute inset-0 bg-slate-950/70 backdrop-blur-sm" @click="closeRenameMagModal" />
      <div class="relative w-full max-w-sm rounded-xl bg-slate-900 border border-slate-700/80 shadow-[0_16px_36px_rgba(0,0,0,0.5)] p-4 flex flex-col gap-3 z-10 select-text" @click.stop>
        <div class="flex items-center justify-between border-b border-slate-800/80 pb-2">
          <div class="flex items-center gap-2">
            <span class="text-sky-400">✏️</span>
            <span class="font-semibold text-slate-100 text-xs">{{ t('magazines.renameModalTitle') }}</span>
          </div>
          <button class="text-slate-400 hover:text-slate-200 p-1 cursor-pointer" @click="closeRenameMagModal">✕</button>
        </div>
        <div class="flex flex-col gap-1.5">
          <label class="text-[10.5px] text-slate-400">{{ t('magazines.nameLabel') }}</label>
          <input
            ref="renameMagInputRef"
            v-model="renameMagInput"
            type="text"
            class="text-xs w-full py-1.5 px-2.5 rounded-lg bg-slate-800 border border-slate-700 focus:border-sky-400 text-slate-100 outline-none select-text cursor-text"
            :placeholder="t('magazines.namePlaceholder')"
            @keydown.enter.prevent="submitRenameMag"
            @keydown.esc.prevent="closeRenameMagModal"
          />
        </div>
        <div class="flex items-center justify-end gap-2 pt-1 border-t border-slate-800/80">
          <button class="btn !py-1 !px-3 text-xs cursor-pointer" @click="closeRenameMagModal">{{ t('common.cancel') }}</button>
          <button class="btn btn-primary !py-1 !px-3 text-xs cursor-pointer" @click="submitRenameMag">{{ t('magazines.saveBtn') }}</button>
        </div>
      </div>
    </div>

    <!-- 弹窗 4：清空弹夹深度定制确认弹窗（UI风格与应用深度统一） -->
    <div v-if="showClearConfirmModal" class="fixed inset-0 z-50 flex items-center justify-center p-3 select-none">
      <div class="absolute inset-0 bg-slate-950/75 backdrop-blur-sm" @click="cancelClearAll" />
      <div class="relative w-full max-w-sm rounded-xl bg-slate-900 border border-slate-700/80 shadow-[0_16px_36px_rgba(0,0,0,0.6)] p-4 flex flex-col gap-3 z-10" @click.stop>
        <div class="flex items-center justify-between border-b border-slate-800/80 pb-2">
          <div class="flex items-center gap-2">
            <span class="text-rose-400 text-sm">🗑️</span>
            <span class="font-semibold text-slate-100 text-xs">{{ t('queue.clearTitle') }}</span>
          </div>
          <button class="text-slate-400 hover:text-slate-200 p-1 cursor-pointer transition-colors" @click="cancelClearAll">✕</button>
        </div>
        <p class="text-[11.5px] text-slate-300 leading-relaxed">
          {{ t('queue.clearConfirm', { name: activeMagazine?.name || t('magazines.currentMagazine') }) }}
        </p>
        <div class="flex items-center justify-end gap-2 pt-1 border-t border-slate-800/80">
          <button class="btn !py-1 !px-3 text-xs cursor-pointer" @click="cancelClearAll">{{ t('common.cancel') }}</button>
          <button class="btn btn-danger !py-1 !px-3 text-xs cursor-pointer" @click="confirmClearAll">{{ t('queue.clear') }}</button>
        </div>
      </div>
    </div>

    <!-- 弹窗 5：删除项目弹夹深度定制确认弹窗（UI风格与应用深度统一） -->
    <div v-if="showDeleteMagModal" class="fixed inset-0 z-50 flex items-center justify-center p-3 select-none">
      <div class="absolute inset-0 bg-slate-950/75 backdrop-blur-sm" @click="cancelDeleteMag" />
      <div class="relative w-full max-w-sm rounded-xl bg-slate-900 border border-slate-700/80 shadow-[0_16px_36px_rgba(0,0,0,0.6)] p-4 flex flex-col gap-3 z-10" @click.stop>
        <div class="flex items-center justify-between border-b border-slate-800/80 pb-2">
          <div class="flex items-center gap-2">
            <span class="text-rose-400 text-sm">🗑️</span>
            <span class="font-semibold text-slate-100 text-xs">{{ t('magazines.deleteTitle') }}</span>
          </div>
          <button class="text-slate-400 hover:text-slate-200 p-1 cursor-pointer transition-colors" @click="cancelDeleteMag">✕</button>
        </div>
        <p class="text-[11.5px] text-slate-300 leading-relaxed">
          {{ t('magazines.deleteConfirm', { name: magToDelete?.name || '' }) }}
        </p>
        <div class="flex items-center justify-end gap-2 pt-1 border-t border-slate-800/80">
          <button class="btn !py-1 !px-3 text-xs cursor-pointer" @click="cancelDeleteMag">{{ t('common.cancel') }}</button>
          <button class="btn btn-danger !py-1 !px-3 text-xs cursor-pointer" @click="confirmDeleteMag">{{ t('magazines.delete') }}</button>
        </div>
      </div>
    </div>
  </div>
</template>
