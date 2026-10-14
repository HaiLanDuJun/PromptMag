<script setup>
/**
 * Tab 1：待发弹夹队列
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
  toast('✓ 已复制并弹出弹夹' + (state.settings.relay ? '（含接力指令）' : ''))
}
async function onCopy(t) {
  await copyCompiled(t)
  toast('✓ 已复制编译后的 Prompt')
}
function onEdit(t) {
  editBackfill(t.id)
  toast('已回填到输入框，可继续编辑')
}
</script>

<template>
  <div class="p-2 space-y-2">
    <!-- 空状态 -->
    <div v-if="!state.queue.length" class="mt-10 text-center text-slate-600 space-y-2">
      <div class="text-2xl"> 🧲 </div>
      <p>弹夹是空的</p>
      <p class="text-[11px] leading-relaxed text-slate-700">
        在上方输入框写提示词，光标处 Ctrl+V 贴图<br>
        Ctrl+Enter 压入队列
      </p>
    </div>

    <!-- 头部统计 -->
    <div v-if="state.queue.length" class="flex items-center gap-2 text-[10px] text-slate-600">
      <span>待发 <b class="text-neon-green">{{ pending.length }}</b></span>
      <span v-if="doneCount">已完成 <b class="text-slate-400">{{ doneCount }}</b></span>
      <div class="flex-1" />
      <button v-if="doneCount" class="btn !py-0.5 !px-1.5" @click="clearDoneTasks">清除已完成</button>
    </div>

    <!-- 队列卡片 -->
    <div
      v-for="(t, idx) in state.queue"
      :key="t.id"
      class="rounded border p-2 space-y-1.5 transition-colors"
      :class="t.done
        ? 'border-neon-green/30 bg-neon-green/5 opacity-70'
        : 'border-ink-600 bg-ink-850 hover:border-ink-600/80'"
    >
      <!-- 状态行 -->
      <div class="flex items-center gap-1.5 text-[10px] text-slate-600">
        <span v-if="t.done" class="text-neon-green">✓ 已完成（Agent 已勾选）</span>
        <span v-else class="text-slate-500">#{{ idx + 1 }} 待发</span>
        <div class="flex-1" />
        <span>{{ new Date(t.createdAt || Date.now()).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) }}</span>
      </div>

      <!-- 文本预览（[图N] 高亮） -->
      <p
        v-if="t.text"
        class="whitespace-pre-wrap break-words leading-relaxed text-slate-300 max-h-28 overflow-y-auto"
        v-html="hl(t.text)"
      />
      <p v-else class="text-slate-600 italic">（纯图片批注任务）</p>

      <!-- 图片缩略图行 -->
      <div v-if="t.images && t.images.length" class="flex gap-1.5 overflow-x-auto pb-0.5">
        <div
          v-for="(img, i) in t.images"
          :key="img.path"
          class="shrink-0 w-20 rounded border border-ink-600 overflow-hidden bg-ink-800"
        >
          <div class="relative h-12">
            <img :src="imgUrl(img.path)" class="w-full h-full object-cover" alt="">
            <span class="absolute left-0 top-0 px-1 rounded-br bg-neon-amber/90 text-ink-950 text-[10px] font-bold">#图{{ i + 1 }}</span>
          </div>
          <p
            class="px-1 py-0.5 text-[10px] leading-snug truncate text-slate-400"
            :title="img.note || '无批注'"
          >{{ img.note || '—' }}</p>
        </div>
      </div>

      <!-- 操作按钮 -->
      <div class="flex items-center gap-1">
        <button class="btn btn-primary" title="编译 + 复制到剪贴板，并从队列移除" @click="onCopyPop(t)">⧉ 复制并弹出</button>
        <button class="btn" title="仅编译复制，保留在队列" @click="onCopy(t)">📋 仅复制</button>
        <button class="btn btn-amber" title="回填到主输入框继续编辑" @click="onEdit(t)">✏️ 编辑回填</button>
        <div class="flex-1" />
        <button class="btn btn-danger" title="删除" @click="removeTask(t.id)">🗑</button>
      </div>
    </div>
  </div>
</template>
