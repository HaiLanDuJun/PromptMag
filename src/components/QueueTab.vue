<script setup>
/**
 * Tab 1：待发队列
 *  复制并弹出 / 仅复制 / 编辑回填 / 删除；Agent 勾选 next_tasks.md 后卡片自动变「已完成」
 */
import { computed } from 'vue'
import {
  state, removeTask, editBackfill, copyCompiled, clearDoneTasks, imgUrl, toast
} from '../lib/store'

const pending = computed(() => state.queue.filter((t) => !t.done))
const doneCount = computed(() => state.queue.length - pending.value.length)

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}
function hl(s) {
  return esc(s).replace(
    /\[图\s*(\d+)\s*\]/g,
    '<span class="img-token">[图$1]</span>'
  )
}

async function onCopyPop(t) {
  await copyCompiled(t, { pop: true })
  toast('已复制并弹出' + (state.settings.relay ? '（含接力指令）' : ''))
}
async function onCopy(t) {
  await copyCompiled(t)
  toast('已复制')
}
function onEdit(t) {
  editBackfill(t.id)
  toast('已回填到输入框')
}
</script>

<template>
  <div class="space-y-2">
    <!-- 空状态 -->
    <div v-if="!state.queue.length" class="pt-14 text-center space-y-1.5">
      <svg class="mx-auto text-slate-700" viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M4 7h16" /><path d="M4 12h10" /><path d="M4 17h7" />
      </svg>
      <p class="text-slate-500">队列是空的</p>
      <p class="text-[10px] text-slate-600 leading-relaxed">
        上方输入提示词，Ctrl+V 贴图<br>Ctrl+Enter 入队
      </p>
    </div>

    <!-- 统计 -->
    <div v-if="state.queue.length" class="flex items-center gap-2 text-[10px] text-slate-600">
      <span>待发 <b class="text-neon-green font-semibold">{{ pending.length }}</b></span>
      <span v-if="doneCount">· 已完成 <b class="text-slate-400 font-semibold">{{ doneCount }}</b></span>
      <div class="flex-1" />
      <button v-if="doneCount" class="btn !py-0.5 !px-2" @click="clearDoneTasks">清除已完成</button>
    </div>

    <!-- 队列卡片 -->
    <div
      v-for="(t, idx) in state.queue"
      :key="t.id"
      class="task-card space-y-2"
      :class="{ done: t.done }"
    >
      <!-- 状态行 -->
      <div class="flex items-center gap-1.5 text-[10px]">
        <span v-if="t.done" class="text-neon-green flex items-center gap-1">
          <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
          已完成
        </span>
        <span v-else class="text-slate-600">#{{ idx + 1 }} 待发</span>
        <div class="flex-1" />
        <span class="text-slate-700">{{ new Date(t.createdAt || Date.now()).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) }}</span>
      </div>

      <!-- 文本预览 -->
      <p
        v-if="t.text"
        class="whitespace-pre-wrap break-words leading-relaxed text-slate-300 max-h-24 overflow-y-auto text-[11px]"
        v-html="hl(t.text)"
      />
      <p v-else class="text-slate-600 italic text-[11px]">纯图片批注任务</p>

      <!-- 缩略图行 -->
      <div v-if="t.images && t.images.length" class="flex gap-1.5 overflow-x-auto pb-0.5">
        <div
          v-for="(img, i) in t.images"
          :key="img.path"
          class="shrink-0 w-[72px] rounded-lg border border-slate-400/10 overflow-hidden bg-black/30"
        >
          <div class="relative h-11">
            <img :src="imgUrl(img.path)" class="w-full h-full object-cover" alt="">
            <span class="shot-badge !text-[9px]">图{{ i + 1 }}</span>
          </div>
          <p
            class="px-1 py-0.5 text-[10px] leading-snug truncate text-slate-500"
            :title="img.note || '无批注'"
          >{{ img.note || '—' }}</p>
        </div>
      </div>

      <!-- 操作 -->
      <div class="flex items-center gap-1.5">
        <button class="btn btn-primary" title="编译复制并从队列移除" @click="onCopyPop(t)">复制并弹出</button>
        <button class="btn" title="仅编译复制，保留在队列" @click="onCopy(t)">复制</button>
        <button class="btn" title="回填到主输入框继续编辑" @click="onEdit(t)">回填</button>
        <div class="flex-1" />
        <button class="icon-btn danger" title="删除" @click="removeTask(t.id)">
          <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <path d="M3 6h18" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          </svg>
        </button>
      </div>
    </div>
  </div>
</template>
