<script setup>
/**
 * 快捷键录制输入框
 * 点击进入录制态 -> 按下「修饰键 + 字母/数字/F1-F12/方向键」生成 Electron accelerator
 * Esc 取消录制；Backspace/Delete 清空
 */
import { ref } from 'vue'

const props = defineProps({
  modelValue: { type: String, default: '' },
  placeholder: { type: String, default: '点击录制快捷键' }
})
const emit = defineEmits(['update:modelValue'])

const recording = ref(false)

function toAccelerator(e) {
  const mods = []
  if (e.ctrlKey || e.metaKey) mods.push('Ctrl')
  if (e.altKey) mods.push('Alt')
  if (e.shiftKey) mods.push('Shift')
  const key = e.key
  // 单独的修饰键不算
  if (['Control', 'Shift', 'Alt', 'Meta'].includes(key)) return null
  // 必须至少带一个修饰键（避免裸按键与打字冲突）
  if (!mods.length) return null
  let k = null
  if (/^[a-z]$/i.test(key)) k = key.toUpperCase()
  else if (/^\d$/.test(key)) k = key
  else if (/^F([1-9]|1[0-2])$/.test(key)) k = key
  else {
    const map = {
      ' ': 'Space', ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right',
      Insert: 'Insert', Delete: 'Delete', Home: 'Home', End: 'End',
      PageUp: 'PageUp', PageDown: 'PageDown', Tab: 'Tab', Backspace: 'Backspace'
    }
    k = map[key] || null
  }
  if (!k) return null
  return [...mods, k].join('+')
}

function onKeydown(e) {
  if (!recording.value) return
  e.preventDefault()
  e.stopPropagation()
  if (e.key === 'Escape') { recording.value = false; return }
  if (e.key === 'Backspace' || e.key === 'Delete') {
    emit('update:modelValue', '')
    recording.value = false
    return
  }
  const acc = toAccelerator(e)
  if (acc) {
    emit('update:modelValue', acc)
    recording.value = false
  }
}
</script>

<template>
  <input
    class="hotkey-input"
    :class="{ recording }"
    readonly
    :value="recording ? '按下组合键…（Esc 取消）' : (modelValue || placeholder)"
    @focus="recording = true"
    @blur="recording = false"
    @keydown="onKeydown"
  >
</template>
