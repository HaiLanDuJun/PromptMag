<script setup>
/**
 * PromptEditor - 提示词与关键词强关联富文本输入器
 * 针对用户反馈修复：
 *  1. 贴图同步阻止默认行为，杜绝浏览器默认 paste 破坏选中的关键词文本
 *  2. 图片对应的关键词完整显示在框中（.kw-chip 内 .kw-text 自动伸展，不截断）
 *  3. 无选中文本直接贴图时，光标自动落入框内，用户键入的词直接完整写入框中
 *  4. 支持框内随时修改关键词，强关联持续生效
 */
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { state, addImages, removeImage, openImagePreview, toast, t, currentLocale } from '../lib/store'
import { TOKEN_RE, parseCompiledPrompt } from '../lib/compilePrompt'

const props = defineProps({
  minHeight: { type: String, default: '100px' },
  placeholder: { type: String, default: '' }
})

const emit = defineEmits(['keydown-enter'])

const editorRef = ref(null)
let isUserTyping = false
let savedSelection = null

/* ---------- 记住光标选区（避免点击外部贴图按钮时焦点丢失导致选区丢失） ---------- */
function saveSelection() {
  const sel = window.getSelection()
  if (!sel || !sel.rangeCount) return
  try {
    const range = sel.getRangeAt(0)
    if (editorRef.value && (editorRef.value === range.commonAncestorContainer || editorRef.value.contains(range.commonAncestorContainer))) {
      const text = sel.toString().trim()
      // 如果失焦且获取到的文字为空，但此前已记住有有效选中文本，则保留已有选区，避免失焦瞬间被置空
      if (!text && savedSelection && savedSelection.text && !document.hasFocus()) {
        return
      }
      savedSelection = {
        range: range.cloneRange(),
        text
      }
    }
  } catch { /* ignore */ }
}

/* ---------- 序列化：DOM -> 标准格式字符串 (如: "把 [图1: 导航栏] 改成深色") ---------- */
function serializeEditor() {
  if (!editorRef.value) return ''
  let result = ''

  function walk(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      result += node.nodeValue
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      if (node.classList.contains('kw-chip')) {
        const idx = Number(node.getAttribute('data-img-idx'))
        const textEl = node.querySelector('.kw-text')
        const note = (textEl ? textEl.textContent : '').trim()
        const imgNum = idx + 1
        const prefix = currentLocale.value === 'en' ? 'Img ' : '图'
        result += note ? `[${prefix}${imgNum}: ${note}]` : `[${prefix}${imgNum}]`
        // 强关联同步：同步写回 state.composer.images 对应图片的 note
        if (state.composer.images[idx]) {
          state.composer.images[idx].note = note
        }
      } else if (node.tagName === 'BR') {
        result += '\n'
      } else if (['DIV', 'P'].includes(node.tagName)) {
        if (result.length > 0 && !result.endsWith('\n')) result += '\n'
        for (const child of node.childNodes) walk(child)
        if (!result.endsWith('\n')) result += '\n'
      } else {
        for (const child of node.childNodes) walk(child)
      }
    }
  }

  for (const child of editorRef.value.childNodes) {
    walk(child)
  }
  return result
}

/* ---------- 创建关联框节点 (关键词完整显示在框中 + 右上角图N角标 + 框内可编辑) ---------- */
function createChipNode(imgIdx, keyword = '') {
  const chip = document.createElement('span')
  chip.className = 'kw-chip'
  chip.setAttribute('contenteditable', 'false')
  chip.setAttribute('data-img-idx', String(imgIdx))

  // 右上角角标：图N / Img N（支持点击或双击放大查看大图）
  const badge = document.createElement('span')
  badge.className = 'kw-badge'
  badge.textContent = currentLocale.value === 'en' ? `Img ${imgIdx + 1}` : `图${imgIdx + 1}`
  badge.title = t('editor.badgeTitle')
  badge.addEventListener('click', (e) => {
    e.preventDefault()
    e.stopPropagation()
    const currentIdx = Number(chip.getAttribute('data-img-idx'))
    const img = state.composer.images[currentIdx]
    if (img) openImagePreview(img, currentIdx, state.composer.images)
  })
  chip.appendChild(badge)

  // 框内关键词可编辑容器 (完整显示，不截断)
  const textSpan = document.createElement('span')
  textSpan.className = 'kw-text'
  textSpan.setAttribute('contenteditable', 'plaintext-only')
  textSpan.textContent = keyword

  // 框内修改时实时更新关联
  textSpan.addEventListener('input', () => {
    isUserTyping = true
    const currentIdx = Number(chip.getAttribute('data-img-idx'))
    if (state.composer.images[currentIdx]) {
      state.composer.images[currentIdx].note = textSpan.textContent.trim()
    }
    state.composer.text = serializeEditor()
    nextTick(() => { isUserTyping = false })
  })

  // 框内按回车/Tab 跳出框外；按退格且无内容时自动解绑删除
  textSpan.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault()
      textSpan.blur()
      // 将光标移到框外后方
      let nextNode = chip.nextSibling
      if (!nextNode || nextNode.nodeType !== Node.TEXT_NODE) {
        nextNode = document.createTextNode(' ')
        chip.after(nextNode)
      }
      const r = document.createRange()
      r.setStart(nextNode, nextNode.nodeValue.length > 0 ? 1 : 0)
      r.collapse(true)
      const s = window.getSelection()
      if (s) {
        s.removeAllRanges()
        s.addRange(r)
      }
    } else if (e.key === 'Backspace' && !textSpan.textContent) {
      e.preventDefault()
      const currentIdx = Number(chip.getAttribute('data-img-idx'))
      removeImage(currentIdx)
    }
  })

  chip.appendChild(textSpan)

  // 角标解绑/删除按钮
  const closeBtn = document.createElement('span')
  closeBtn.className = 'kw-close'
  closeBtn.textContent = '×'
  closeBtn.title = t('editor.deleteBinding')
  closeBtn.addEventListener('click', (e) => {
    e.preventDefault()
    e.stopPropagation()
    const currentIdx = Number(chip.getAttribute('data-img-idx'))
    removeImage(currentIdx)
  })
  chip.appendChild(closeBtn)

  // 双击卡片快速放大预览图片
  chip.addEventListener('dblclick', (e) => {
    if (e.target === closeBtn) return
    const currentIdx = Number(chip.getAttribute('data-img-idx'))
    const img = state.composer.images[currentIdx]
    if (img) openImagePreview(img, currentIdx, state.composer.images)
  })

  // 点击卡片任意非删除区域，直接聚焦至关键词编辑区
  chip.addEventListener('click', (e) => {
    if (e.target === closeBtn || e.target === badge) return
    textSpan.focus()
  })

  return chip
}

/* ---------- 反序列化：字符串 -> DOM (渲染带框的高亮关键词) ---------- */
function renderFromText(text) {
  if (!editorRef.value || isUserTyping) return
  editorRef.value.innerHTML = ''
  if (!text) return

  const frag = document.createDocumentFragment()
  let lastIndex = 0

  const re = new RegExp(TOKEN_RE.source, 'g')
  let match

  while ((match = re.exec(text)) !== null) {
    const rawMatch = match[0]
    const matchIndex = match.index
    const imgNum = Number(match[1])
    const imgIdx = imgNum - 1
    const note = (match[2] || (state.composer.images[imgIdx] && state.composer.images[imgIdx].note) || '').trim()

    // 匹配项之前的纯文本
    if (matchIndex > lastIndex) {
      const plain = text.slice(lastIndex, matchIndex)
      plain.split('\n').forEach((line, i) => {
        if (i > 0) frag.appendChild(document.createElement('br'))
        if (line) frag.appendChild(document.createTextNode(line))
      })
    }

    // 插入关联高亮框（关键词完整显示）
    const chip = createChipNode(imgIdx, note)
    frag.appendChild(chip)

    lastIndex = matchIndex + rawMatch.length
  }

  // 剩余纯文本
  if (lastIndex < text.length) {
    const plain = text.slice(lastIndex)
    plain.split('\n').forEach((line, i) => {
      if (i > 0) frag.appendChild(document.createElement('br'))
      if (line) frag.appendChild(document.createTextNode(line))
    })
  }

  editorRef.value.appendChild(frag)
}

/* ---------- 刷新所有角标序号（满足需求 3：图片排序动态变化） ---------- */
function refreshBadges() {
  if (!editorRef.value) return
  const chips = editorRef.value.querySelectorAll('.kw-chip')
  chips.forEach((chip, i) => {
    chip.setAttribute('data-img-idx', String(i))
    const badge = chip.querySelector('.kw-badge')
    if (badge) badge.textContent = `图${i + 1}`
    const textEl = chip.querySelector('.kw-text')
    if (state.composer.images[i] && textEl && !textEl.textContent.trim()) {
      textEl.textContent = state.composer.images[i].note || ''
    }
  })
}

/* ---------- 核心逻辑：选词贴图并强行关联 (关键词完整显示在框中) ---------- */
async function bindImageToSelection(imagesList, forcedRange = null, forcedText = '') {
  if (!imagesList || !imagesList.length) return

  let selectedWord = forcedText
  let range = forcedRange

  if (!range && savedSelection) {
    range = savedSelection.range
    selectedWord = selectedWord || savedSelection.text || ''
  }

  if (!range) {
    const sel = window.getSelection()
    if (sel && sel.rangeCount) {
      const r = sel.getRangeAt(0)
      if (editorRef.value && (editorRef.value === r.commonAncestorContainer || editorRef.value.contains(r.commonAncestorContainer))) {
        range = r
        selectedWord = selectedWord || sel.toString().trim()
      }
    }
  }

  // 智能兜底：若没有明确选中文本，但编辑器内只有纯文本且无任何已有 chip，则自动将全部纯文本作为关联词框选
  if ((!selectedWord || !selectedWord.trim()) && editorRef.value) {
    const existingChips = editorRef.value.querySelectorAll('.kw-chip')
    const rawText = editorRef.value.textContent.trim()
    if (existingChips.length === 0 && rawText) {
      range = document.createRange()
      range.selectNodeContents(editorRef.value)
      selectedWord = rawText
    }
  }

  // 若无选区，插在末尾
  if (!range) {
    range = document.createRange()
    if (editorRef.value.lastChild) {
      range.selectNodeContents(editorRef.value)
      range.collapse(false)
    } else {
      range.setStart(editorRef.value, 0)
      range.collapse(true)
    }
  }

  const startIdx = state.composer.images.length
  addImages(imagesList, selectedWord)

  // 删除选区中的文字，并在同一位置无缝插入带右上角图N角标的高亮卡片框
  range.deleteContents()
  const chip = createChipNode(startIdx, selectedWord)
  range.insertNode(chip)

  // 在卡片框后追加一个空格
  const spacer = document.createTextNode(' ')
  chip.after(spacer)

  const textEl = chip.querySelector('.kw-text')
  const sel = window.getSelection()

  // 关键：若无初始选中词，光标立即定位到框内 .kw-text 中，用户键入的词直接完整显示在框中！
  if (!selectedWord) {
    nextTick(() => {
      textEl.focus()
      const r = document.createRange()
      r.selectNodeContents(textEl)
      r.collapse(false)
      if (sel) {
        sel.removeAllRanges()
        sel.addRange(r)
      }
    })
  } else {
    // 已有选词，完整保留并在框内显示，光标放在框后空格处
    const newRange = document.createRange()
    newRange.setStartAfter(spacer)
    newRange.collapse(true)
    if (sel) {
      sel.removeAllRanges()
      sel.addRange(newRange)
    }
  }

  savedSelection = null
  isUserTyping = true
  state.composer.text = serializeEditor()
  nextTick(() => {
    isUserTyping = false
    refreshBadges()
  })
}

/* ---------- 粘贴事件拦截（同步捕获选区，防丢失） ---------- */
async function onPaste(e) {
  // 1. 同步捕获当前选区与文字
  const sel = window.getSelection()
  let capturedRange = null
  let capturedText = ''
  if (sel && sel.rangeCount) {
    const r = sel.getRangeAt(0)
    if (editorRef.value && editorRef.value.contains(r.commonAncestorContainer)) {
      capturedRange = r.cloneRange()
      capturedText = sel.toString().trim()
      // 若当前光标在已有的 chip 内部，避免嵌套，将插入点移至该 chip 后方
      const parentChip = r.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
        ? r.commonAncestorContainer.closest('.kw-chip')
        : r.commonAncestorContainer.parentElement?.closest('.kw-chip')
      if (parentChip) {
        capturedRange = document.createRange()
        capturedRange.setStartAfter(parentChip)
        capturedRange.collapse(true)
        capturedText = ''
      }
    }
  }
  if (!capturedRange && savedSelection) {
    capturedRange = savedSelection.range
    capturedText = savedSelection.text || ''
  }

  // 2. 检测剪贴板是否含图片
  const types = (e.clipboardData && e.clipboardData.types) || []
  const items = (e.clipboardData && e.clipboardData.items) || []
  let isImagePaste = types.includes('Files')
  for (let i = 0; i < items.length; i++) {
    if (items[i].type && items[i].type.startsWith('image/')) {
      isImagePaste = true
      break
    }
  }

  // 只要剪贴板有图片特征，同步阻止默认行为，杜绝浏览器默认 paste 抹除选区！
  if (isImagePaste) {
    e.preventDefault()
  }

  const res = await window.pm.saveClipboardImages()
  if (res && res.ok && res.images && res.images.length) {
    e.preventDefault()
    await bindImageToSelection(res.images, capturedRange, capturedText)
    toast(`已关联图片与关键词 [图${state.composer.images.length}]`)
    return
  }

  // 纯文本粘贴（智能识别已编译的提示词结构并还原）
  if (!isImagePaste) {
    e.preventDefault()
    const text = e.clipboardData ? e.clipboardData.getData('text/plain') : await window.pm.readClipboardText()
    if (text) {
      const parsed = parseCompiledPrompt(text)
      if (parsed) {
        if (parsed.images && parsed.images.length) {
          state.composer.images = parsed.images
        }
        state.composer.text = parsed.text
        toast(`已还原图片与关键词 [图${parsed.images.length}]`)
        return
      }
      document.execCommand('insertText', false, text)
      onInput()
    }
  }
}

function onInput() {
  isUserTyping = true
  state.composer.text = serializeEditor()
  nextTick(() => { isUserTyping = false })
}

function onKeydown(e) {
  if (e.key === 'Enter') {
    emit('keydown-enter', e)
  }
}

/* ---------- 外部变化同步 ---------- */
watch(
  () => state.composer.text,
  (val) => {
    if (!isUserTyping) {
      renderFromText(val)
      refreshBadges()
    }
  },
  { immediate: true }
)

watch(
  () => state.composer.images.length,
  () => {
    refreshBadges()
  }
)

/* ---------- 在当前光标处精确插入文本并恢复焦点与光标位置 ---------- */
function insertTextAtCursor(text) {
  if (!text || !editorRef.value) return

  // 1. 恢复编辑器焦点
  editorRef.value.focus()

  const sel = window.getSelection()
  let range = null

  // 优先从已记住的光标选区还原
  if (savedSelection && savedSelection.range) {
    try {
      if (editorRef.value.contains(savedSelection.range.commonAncestorContainer)) {
        range = savedSelection.range
      }
    } catch {
      range = null
    }
  }

  // 尝试当前窗口 selection
  if (!range && sel && sel.rangeCount) {
    const r = sel.getRangeAt(0)
    if (editorRef.value.contains(r.commonAncestorContainer)) {
      range = r
    }
  }

  // 若无可用选区，默认插入到末尾
  if (!range) {
    range = document.createRange()
    range.selectNodeContents(editorRef.value)
    range.collapse(false)
  }

  if (range) {
    // 若原选区有文字，替换原文字；若仅是光标，直接在光标处插入
    range.deleteContents()
    const textNode = document.createTextNode(text)
    range.insertNode(textNode)

    // 光标精确移至刚插入文字末尾
    const newRange = document.createRange()
    newRange.setStartAfter(textNode)
    newRange.collapse(true)
    if (sel) {
      sel.removeAllRanges()
      sel.addRange(newRange)
    }
    savedSelection = {
      range: newRange.cloneRange(),
      text: ''
    }

    // 触发序列化并同步至 state.composer.text
    onInput()
  }
}

function onInsertSnippetEvent(e) {
  const text = (e && e.detail) || ''
  if (text) {
    insertTextAtCursor(text)
  }
}

defineExpose({
  focus: () => editorRef.value && editorRef.value.focus(),
  bindImageToSelection,
  saveSelection,
  insertTextAtCursor
})

let unsubFocus = null

onMounted(() => {
  renderFromText(state.composer.text)
  refreshBadges()
  document.addEventListener('selectionchange', saveSelection)
  window.addEventListener('pm:insert-snippet-at-cursor', onInsertSnippetEvent)
  if (window.pm && window.pm.onFocusComposer) {
    unsubFocus = window.pm.onFocusComposer(() => {
      editorRef.value?.focus()
    })
  }
})

onBeforeUnmount(() => {
  document.removeEventListener('selectionchange', saveSelection)
  window.removeEventListener('pm:insert-snippet-at-cursor', onInsertSnippetEvent)
  if (unsubFocus) unsubFocus()
})
</script>

<template>
  <div class="prompt-editor-card h-full flex flex-col min-h-0">
    <div
      ref="editorRef"
      class="prompt-editor-content flex-1 min-h-0"
      :style="{ minHeight }"
      contenteditable="true"
      :data-placeholder="placeholder"
      @input="onInput"
      @paste="onPaste"
      @keydown="onKeydown"
      @mouseup="saveSelection"
      @keyup="saveSelection"
      @blur="saveSelection"
      @focus="saveSelection"
    />
  </div>
</template>
