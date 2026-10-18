<script setup>
/**
 * 目标弹夹选择弹窗（MagazinePickerModal）
 * 用于保存提示词时选择目标弹夹：
 *  - 支持键盘快捷键 1-9 极速选择
 *  - 支持方向键 ↑↓ 选择 + Enter 确认
 *  - 支持 Esc 取消
 *  - 支持「记住并设为默认，以后不再提示」勾选
 */
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { state, closeMagazinePicker, t } from '../lib/store'

const selectedIndex = ref(0)
const rememberAsDefault = ref(false)

// 初始默认选中当前活跃弹夹
const initialIdx = state.magazines.findIndex((m) => m.id === state.activeMagazineId)
if (initialIdx > -1) {
  selectedIndex.value = initialIdx
}

function confirmSelection(idx = null) {
  const targetIdx = idx !== null ? idx : selectedIndex.value
  const target = state.magazines[targetIdx] || state.magazines[0]
  if (!target) return
  const cb = state.magazinePickerCallback
  closeMagazinePicker()
  if (cb) {
    cb(target.id, rememberAsDefault.value)
  }
}

function cancel() {
  closeMagazinePicker()
}

function onKeyDown(e) {
  if (e.key === 'Escape') {
    e.preventDefault()
    cancel()
    return
  }
  if (e.key === 'Enter') {
    e.preventDefault()
    confirmSelection()
    return
  }
  if (e.key === 'ArrowUp') {
    e.preventDefault()
    if (selectedIndex.value > 0) selectedIndex.value--
    return
  }
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    if (selectedIndex.value < state.magazines.length - 1) selectedIndex.value++
    return
  }
  // 数字键 1-9 快速选择
  const num = parseInt(e.key, 10)
  if (!isNaN(num) && num >= 1 && num <= state.magazines.length && num <= 9) {
    e.preventDefault()
    confirmSelection(num - 1)
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
    <div class="absolute inset-0 bg-slate-950/70 backdrop-blur-sm" @click="cancel" />

    <!-- 弹窗主体 -->
    <div
      class="relative w-full max-w-sm rounded-xl bg-slate-900 border border-slate-700/80 shadow-[0_16px_36px_rgba(0,0,0,0.5)] p-4 flex flex-col gap-3 z-10"
      @click.stop
    >
      <!-- 头部标题 -->
      <div class="flex items-center justify-between border-b border-slate-800/80 pb-2.5">
        <div class="flex items-center gap-2">
          <span class="text-sky-400">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
            </svg>
          </span>
          <span class="font-semibold text-slate-100 text-xs tracking-wide">
            {{ t('magazines.selectTarget') }}
          </span>
        </div>
        <button
          class="text-slate-400 hover:text-rose-400 transition-colors p-1"
          @click="cancel"
        >
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      <div class="text-[10px] text-slate-400 -mt-1 leading-normal">
        {{ t('magazines.selectTargetHint') }}
      </div>

      <!-- 弹夹选择列表 -->
      <div class="max-h-52 overflow-y-auto space-y-1.5 pr-0.5">
        <div
          v-for="(mag, idx) in state.magazines"
          :key="mag.id"
          class="flex items-center gap-2 px-2.5 py-2 rounded-lg border transition-all cursor-pointer"
          :class="selectedIndex === idx
            ? 'bg-sky-500/20 border-sky-400/80 text-sky-200 shadow-[0_0_8px_rgba(56,189,248,0.2)]'
            : 'bg-slate-800/50 border-slate-700/50 text-slate-300 hover:bg-slate-800 hover:border-slate-600'"
          @mouseenter="selectedIndex = idx"
          @click="confirmSelection(idx)"
        >
          <!-- 快捷数字键徽标 -->
          <span
            v-if="idx < 9"
            class="w-4 h-4 rounded text-[10px] font-bold flex items-center justify-center shrink-0"
            :class="selectedIndex === idx ? 'bg-sky-400 text-slate-950' : 'bg-slate-700 text-slate-300'"
          >
            {{ idx + 1 }}
          </span>

          <!-- 弹夹圆点 -->
          <span
            class="w-2 h-2 rounded-full shrink-0"
            :style="{ backgroundColor: mag.color || '#38bdf8' }"
          />

          <!-- 弹夹名称与描述 -->
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-1.5">
              <span class="text-xs font-medium truncate">{{ mag.name }}</span>
              <span
                v-if="mag.id === state.activeMagazineId"
                class="px-1 py-0.2 rounded text-[8.5px] bg-sky-500/15 text-sky-300 border border-sky-400/30"
              >
                {{ t('magazines.currentMagazine') }}
              </span>
            </div>
            <div v-if="mag.description" class="text-[9.5px] text-slate-400 truncate mt-0.5">
              {{ mag.description }}
            </div>
          </div>

          <!-- 任务条数 -->
          <span class="text-[9.5px] text-slate-400 shrink-0">
            {{ (mag.queue || []).filter(t => !t.done).length }} 待用
          </span>
        </div>
      </div>

      <!-- 设为默认勾选框 -->
      <label class="flex items-center gap-2 text-[10.5px] text-slate-300 cursor-pointer pt-1">
        <input
          v-model="rememberAsDefault"
          type="checkbox"
          class="rounded border-slate-700 bg-slate-800 text-sky-500 focus:ring-0 focus:ring-offset-0 cursor-pointer"
        >
        <span>{{ t('magazines.rememberDefault') }}</span>
      </label>

      <!-- 底部操作按钮 -->
      <div class="flex items-center justify-end gap-2 pt-1 border-t border-slate-800/80">
        <button class="btn !py-1 !px-3 text-xs" @click="cancel">
          {{ t('common.cancel') }}
        </button>
        <button class="btn btn-primary !py-1 !px-3.5 text-xs" @click="confirmSelection()">
          {{ t('common.save') }}
        </button>
      </div>
    </div>
  </div>
</template>
