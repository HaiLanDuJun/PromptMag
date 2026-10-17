<script setup>
/**
 * 收起形态：悬浮图标（玻璃圆球 / 悬浮徽标）
 *  - 契合设计图 1、2、3：未选中悬浮收起 / 边缘收缩 / 悬停展开
 *  - 悬停展开成快捷输入面板，点击也能打开
 *  - 按住拖动可移动（位移 > 4px 算拖动，否则算点击）
 */
import { computed, onBeforeUnmount } from 'vue'
import { state, currentLocale } from '../lib/store'

const emit = defineEmits(['open'])

const pendingCount = computed(() => state.queue.filter((t) => !t.done).length)

/* ---------------- 自定义拖拽：区分点击 / 拖动 ---------------- */
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
  <!-- 悬浮图标：契合设计图的深蓝微光毛玻璃 + 关键词文档图标 -->
  <div
    class="ball"
    :title="currentLocale === 'en' ? 'Floating Orb · Hover or click to open · Drag to move' : '悬浮图标 · 悬停或点击直接输入 · 按住可拖拽移动'"
    @mousedown="onDown"
    @mouseenter="$emit('open')"
  >
    <!-- 文档/关键词折角图标 -->
    <svg viewBox="0 0 24 24" width="23" height="23" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="ball-icon">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
    </svg>
    <span v-if="pendingCount" class="ball-badge">{{ pendingCount > 9 ? '9+' : pendingCount }}</span>
  </div>
</template>
