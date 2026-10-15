<script setup>
import { computed, onBeforeUnmount, ref } from 'vue'
import { state } from '../lib/store'

const emit = defineEmits(['open'])

const pendingCount = computed(() => state.queue.filter((t) => !t.done).length)

/* ---------------- 自定义拖拽：区分点击 / 拖动 ----------------
 * 系统 app-region:drag 会吞掉 click 事件，改为手动拖拽：
 * 按下后位移 > 4px 视为拖动（rAF 节流同步窗口位置），否则视为点击打开面板。
 */
let drag = null
let raf = null

async function onDown(e) {
  if (e.button !== 0) return
  drag = { sx: e.screenX, sy: e.screenY, wx: null, wy: null, moved: false }
  try {
    const b = await window.pm.getBounds()
    if (drag) { drag.wx = b.x; drag.wy = b.y }
  } catch { drag = null }
}

function onMove(e) {
  if (!drag || drag.wx === null) return
  const dx = e.screenX - drag.sx
  const dy = e.screenY - drag.sy
  if (!drag.moved && Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true
  if (!drag.moved) return
  const x = drag.wx + dx
  const y = drag.wy + dy
  if (raf) return
  raf = requestAnimationFrame(() => {
    raf = null
    window.pm.dragMoveTo(x, y)
  })
}

function onUp() {
  if (!drag) return
  const wasClick = !drag.moved
  drag = null
  if (raf) { cancelAnimationFrame(raf); raf = null }
  if (wasClick) emit('open')
}

window.addEventListener('mousemove', onMove)
window.addEventListener('mouseup', onUp)
onBeforeUnmount(() => {
  window.removeEventListener('mousemove', onMove)
  window.removeEventListener('mouseup', onUp)
})
</script>

<template>
  <!-- 胶囊条：点击打开快捷输入面板；按住拖动移动（不吞点击） -->
  <div
    class="capsule"
    title="悬停或点击直接输入 · 按住可拖拽移动"
    @mousedown="onDown"
    @mouseenter="$emit('open')"
  >
    <span
      class="w-1.5 h-1.5 rounded-full shrink-0"
      :class="state.settings.relay ? 'bg-neon-cyan shadow-[0_0_6px_#22d3ee]' : 'bg-slate-600'"
    />
    <span class="capsule-title">PromptMag</span>
    <span v-if="pendingCount" class="capsule-count">{{ pendingCount }}</span>
    <svg class="capsule-arrow" viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M4 9h12" /><path d="M4 15h16" /><path d="M14 6l6 6-6 6" />
    </svg>
  </div>
</template>
