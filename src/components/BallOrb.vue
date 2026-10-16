<script setup>
/**
 * 收起形态：玻璃圆球
 *  - 悬停展开成快捷输入面板，点击也能打开
 *  - 按住拖动可移动（点击与拖拽互不干扰：位移 > 4px 才算拖动）
 */
import { computed, onBeforeUnmount } from 'vue'
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
  <!-- 玻璃圆球：点击打开快捷输入面板；按住拖动移动（不吞点击） -->
  <div
    class="ball"
    :class="{ 'ball-relay': state.settings.relay }"
    title="悬停或点击直接输入 · 按住可拖拽移动"
    @mousedown="onDown"
    @mouseenter="$emit('open')"
  >
    <span class="ball-logo" />
    <span v-if="pendingCount" class="ball-badge">{{ pendingCount > 9 ? '9+' : pendingCount }}</span>
  </div>
</template>
