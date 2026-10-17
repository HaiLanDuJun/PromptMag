<script setup>
/**
 * 快捷键录制输入框
 *  - 严格支持单个快捷键，也可置空（为空则不触发该功能）
 *  - 点击进入录制态 -> 按下「修饰键 + 字母/数字/F1-F12/方向键」生成 Electron accelerator
 *  - 支持 Backspace/Delete 清空，Esc 取消录制
 *  - 支持点击右侧 ✕ 按钮一键清空置空
 */
import { computed, ref } from 'vue'
import { t } from '../lib/store'

const props = defineProps({
  modelValue: { type: String, default: '' },
  placeholder: { type: String, default: '' }
})
const emit = defineEmits(['update:modelValue'])

const recording = ref(false)

const displayPlaceholder = computed(() => props.placeholder || t('settings.hotkeyNone'))

function toAccelerator(e) {
  const mods = []
  if (e.ctrlKey || e.metaKey) mods.push('Ctrl')
  if (e.altKey) mods.push('Alt')
  if (e.shiftKey) mods.push('Shift')
  const key = e.key
  // 单独的修饰键不算
  if (['Control', 'Shift', 'Alt', 'Meta'].includes(key)) return null
  // 必须至少带一个修饰键（避免纯打字裸按键与日常输入冲突）
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
  if (e.key === 'Escape') {
    recording.value = false
    return
  }
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

function clear(e) {
  e.preventDefault()
  e.stopPropagation()
  emit('update:modelValue', '')
  recording.value = false
}
</script>

<template>
  <div class="hotkey-input-wrapper">
    <input
      class="hotkey-input"
      :class="{ recording, 'is-empty': !modelValue && !recording }"
      readonly
      :value="recording ? t('settings.recordingHint') : (modelValue || displayPlaceholder)"
      :title="modelValue ? modelValue + ' (点击可重新录制，或点击 ✕ 清空)' : displayPlaceholder"
      @focus="recording = true"
      @blur="recording = false"
      @keydown="onKeydown"
    >
    <button
      v-if="modelValue && !recording"
      type="button"
      class="hotkey-clear-btn"
      :title="t('settings.clearHotkeyTitle')"
      @mousedown.prevent="clear"
    >
      ✕
    </button>
  </div>
</template>
