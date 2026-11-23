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
import { state, addImages, removeImage, openImagePreview, toast, t, currentLocale, smartPastePlainText } from '../lib/store'
import { TOKEN_RE, FILE_TOKEN_RE, parseCompiledPrompt } from '../lib/compilePrompt'

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
      if (node.classList.contains('file-chip')) {
        result += '[文件: ' + (node.getAttribute('data-file-name') || '') + ']'
      } else if (node.classList.contains('kw-chip')) {
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
  badge.addEventListener('mousedown', (e) => {
    e.stopPropagation()
  })
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

  function focusText(atEnd = true) {
    textSpan.focus()
    const sel = window.getSelection()
    if (sel) {
      const r = document.createRange()
      r.selectNodeContents(textSpan)
      r.collapse(!atEnd)
      sel.removeAllRanges()
      sel.addRange(r)
    }
  }

  // 阻止冒泡，保证在关键词框内点击输入时，光标精准定位且不被外部容器劫持
  textSpan.addEventListener('mousedown', (e) => {
    e.stopPropagation()
  })
  textSpan.addEventListener('click', (e) => {
    e.stopPropagation()
  })

  // 框内修改时实时更新关联（支持中文输入法防抖）
  let isSpanComposing = false
  textSpan.addEventListener('compositionstart', () => {
    isSpanComposing = true
    isUserTyping = true
  })
  textSpan.addEventListener('compositionend', () => {
    isSpanComposing = false
    isUserTyping = true
    const currentIdx = Number(chip.getAttribute('data-img-idx'))
    if (state.composer.images[currentIdx]) {
      state.composer.images[currentIdx].note = textSpan.textContent.trim()
    }
    state.composer.text = serializeEditor()
    nextTick(() => { isUserTyping = false })
  })

  textSpan.addEventListener('input', () => {
    if (isSpanComposing) return
    isUserTyping = true
    const currentIdx = Number(chip.getAttribute('data-img-idx'))
    if (state.composer.images[currentIdx]) {
      state.composer.images[currentIdx].note = textSpan.textContent.trim()
    }
    state.composer.text = serializeEditor()
    nextTick(() => { isUserTyping = false })
  })

  textSpan.addEventListener('blur', () => {
    isSpanComposing = false
    isUserTyping = false
    const currentIdx = Number(chip.getAttribute('data-img-idx'))
    if (state.composer.images[currentIdx]) {
      state.composer.images[currentIdx].note = textSpan.textContent.trim()
    }
    state.composer.text = serializeEditor()
  })

  // 框内按回车/Tab 跳出框外；按退格且无内容时自动解绑删除；Ctrl+Enter 直接保存
  textSpan.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      e.stopPropagation()
      emit('keydown-enter', e)
      return
    }
    if ((e.key === 'Enter' || e.key === 'Tab') && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault()
      e.stopPropagation()
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
      e.stopPropagation()
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
  closeBtn.addEventListener('mousedown', (e) => {
    e.stopPropagation()
  })
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

  // 点击卡片任意非删除/非角标区域（如边框或留白），阻止默认并将光标聚焦至框内文本末尾
  chip.addEventListener('mousedown', (e) => {
    if (e.target === closeBtn || e.target === badge) return
    if (e.target !== textSpan) {
      e.preventDefault()
      e.stopPropagation()
      focusText(true)
    }
  })

  chip.addEventListener('click', (e) => {
    if (e.target === closeBtn || e.target === badge) return
    e.stopPropagation()
    if (e.target !== textSpan) {
      focusText(true)
    }
  })

  return chip
}

/* ---------- 创建文件胶囊节点（长文本已落盘为 .txt，框内以紧凑胶囊呈现，类似聊天输入框的附件卡片） ---------- */
function escapeRegexpStr(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function createFileChipNode(fileName) {
  const chip = document.createElement('span')
  chip.className = 'file-chip'
  chip.setAttribute('contenteditable', 'false')
  chip.setAttribute('data-file-name', fileName)

  const f = (state.composer.files || []).find((x) => x && x.name === fileName)
  const preview = f && f.preview ? String(f.preview) : ''

  // 类型图标
  const icon = document.createElement('span')
  icon.className = 'file-chip-icon'
  icon.textContent = '📄'
  chip.appendChild(icon)

  // 标签：优先展示内容预览（前12字，同聊天输入框附件胶囊），无预览时回退文件名
  const label = document.createElement('span')
  label.className = 'file-chip-label'
  label.textContent = preview ? preview + '…' : fileName
  chip.appendChild(label)

  // 删除按钮
  const closeBtn = document.createElement('span')
  closeBtn.className = 'file-chip-close'
  closeBtn.textContent = '×'
  closeBtn.title = t('editor.deleteBinding')
  closeBtn.addEventListener('mousedown', (e) => e.stopPropagation())
  closeBtn.addEventListener('click', (e) => {
    e.preventDefault()
    e.stopPropagation()
    removeFileChip(chip)
  })
  chip.appendChild(closeBtn)

  // 点击胶囊任意非删除区域：阻止光标进入，保持内容不可编辑
  chip.addEventListener('mousedown', (e) => {
    if (e.target !== closeBtn) {
      e.preventDefault()
      e.stopPropagation()
    }
  })

  // 悬浮提示：文件名 + 绝对路径
  chip.title = f && f.path ? fileName + '\n' + f.path : fileName
  return chip
}

/** 删除文件胶囊：同步剥离 composer.text 中的锚点，并清理无引用的孤儿文件记录 */
function removeFileChip(chip) {
  if (!chip || !chip.parentNode) return
  const name = chip.getAttribute('data-file-name') || ''
  chip.remove()
  onInput()
  if (name) {
    const stillRef = new RegExp('\\[(?:文件|File)\\s*[:：]\\s*' + escapeRegexpStr(name) + '\\s*\\]', 'i')
    if (!stillRef.test(state.composer.text || '')) {
      state.composer.files = (state.composer.files || []).filter((f) => f && f.name !== name)
    }
  }
}

/** 自愈：files 记录仍在但正文锚点丢失（异常路径误删了锚点文本）→ 自动补回短锚点 */
function repairMissingFileAnchors() {
  const files = state.composer.files || []
  if (!files.length) return
  let text = String(state.composer.text || '')
  let changed = false
  for (const f of files) {
    if (!f || !f.name) continue
    const nameRe = new RegExp('\\[(?:文件|File)\\s*[:：]\\s*' + escapeRegexpStr(f.name) + '\\s*\\]', 'i')
    if (nameRe.test(text)) continue
    if (f.path && text.includes(f.path)) continue // 已展开路径形式视为仍在
    text = (text ? text.replace(/\s+$/, '') + ' ' : '') + '[文件: ' + f.name + ']'
    changed = true
  }
  if (changed) {
    state.composer.text = text
    pasteLog('anchors-repaired', { count: files.length })
  }
}

function renderFromText(text) {
  if (!editorRef.value || isUserTyping) return
  const current = serializeEditor()
  if (!text || !text.trim()) {
    if (state.composer.images.length === 0) {
      editorRef.value.innerHTML = ''
      return
    }
  }
  if (current === text && (editorRef.value.childNodes.length > 0 || !text)) {
    return
  }
  editorRef.value.innerHTML = ''
  if (!text) return

  const frag = document.createDocumentFragment()
  let lastIndex = 0

  // 合并扫描图片锚点 [图N: note] 与文件锚点 [文件: xxx.txt]，按出现顺序统一渲染
  const re = new RegExp(TOKEN_RE.source + '|' + FILE_TOKEN_RE.source, 'gi')
  let match

  while ((match = re.exec(text)) !== null) {
    const rawMatch = match[0]
    const matchIndex = match.index
    const isFileToken = /^\[(?:文件|File)\s*[:：]/i.test(rawMatch)

    // 匹配项之前的纯文本
    if (matchIndex > lastIndex) {
      const plain = text.slice(lastIndex, matchIndex)
      plain.split('\n').forEach((line, i) => {
        if (i > 0) frag.appendChild(document.createElement('br'))
        if (line) frag.appendChild(document.createTextNode(line))
      })
    }

    if (isFileToken) {
      // 文件胶囊（长文本已落盘为 .txt）
      // 注意：合并正则中 FILE_TOKEN_RE 的捕获组是第 3 组（TOKEN_RE 占据 1、2 组）
      const fileName = (match[3] || '').trim()
      frag.appendChild(createFileChipNode(fileName))
    } else {
      // 插入关联高亮框（关键词完整显示）
      const imgNum = Number(match[1])
      const imgIdx = imgNum - 1
      const note = (match[2] || (state.composer.images[imgIdx] && state.composer.images[imgIdx].note) || '').trim()
      const chip = createChipNode(imgIdx, note)
      frag.appendChild(chip)
    }

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

/* ---------- 清空所有卡片并彻底重置输入框 ---------- */
function clearAllChips() {
  if (!editorRef.value) return
  const chips = editorRef.value.querySelectorAll('.kw-chip')
  chips.forEach((c) => c.remove())
  const fileChips = editorRef.value.querySelectorAll('.file-chip')
  fileChips.forEach((c) => c.remove())
  if (!editorRef.value.textContent.trim()) {
    editorRef.value.innerHTML = ''
  }
}

/* ---------- 刷新与同步所有卡片序号、孤儿卡片清理 ---------- */
function syncChipsWithImages() {
  if (!editorRef.value) return
  const chips = Array.from(editorRef.value.querySelectorAll('.kw-chip'))
  const imgCount = state.composer.images.length

  if (imgCount === 0) {
    // 只清理关键词胶囊；文件胶囊（[文件: xxx.txt]）与图片无关，绝不能连带删除，
    // 否则下次输入序列化时正文锚点会被连带抹掉（退出重开后内容"消失"的根因）
    chips.forEach((c) => c.remove())
    return
  }

  // 若卡片数量多于图片数量，移除末尾孤儿卡片
  if (chips.length > imgCount) {
    for (let i = imgCount; i < chips.length; i++) {
      chips[i].remove()
    }
  }

  // 刷新剩余卡片的序号与角标
  const remainingChips = editorRef.value.querySelectorAll('.kw-chip')
  remainingChips.forEach((chip, i) => {
    chip.setAttribute('data-img-idx', String(i))
    const badge = chip.querySelector('.kw-badge')
    if (badge) badge.textContent = currentLocale.value === 'en' ? `Img ${i + 1}` : `图${i + 1}`
    const textEl = chip.querySelector('.kw-text')
    if (state.composer.images[i] && textEl && !textEl.textContent.trim()) {
      textEl.textContent = state.composer.images[i].note || ''
    }
  })
}

const refreshBadges = syncChipsWithImages

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

  // 仅当用户明确选中文本时，才将选中文本作为图片描述关联；未选中文本时绝不自动侵入已有文字
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

  // 删除选区中的文字（未选中文本时 range 为折叠点，删除 0 内容），并在同一位置无缝插入带右上角图N角标的高亮卡片框
  range.deleteContents()
  const chip = createChipNode(startIdx, selectedWord)
  range.insertNode(chip)

  // 在卡片框后追加一个空格
  const spacer = document.createTextNode(' ')
  chip.after(spacer)

  const sel = window.getSelection()
  // 关键修复：光标统一置于卡片后的空格后，输入框原有文字完整保留，后续键入文字自然追加在图片后方
  const newRange = document.createRange()
  newRange.setStartAfter(spacer)
  newRange.collapse(true)
  if (sel) {
    sel.removeAllRanges()
    sel.addRange(newRange)
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

  // 2. 检测剪贴板内容：先读文本，再判定图片/文件引用
  //    注意：IDE（如 IntelliJ/VS Code）复制代码时剪贴板可能同时携带 Files 等杂项格式，
  //    不能仅凭 types 含 'Files' 就按图片流程处理，否则长文本既不转 txt 也不插入。
  const types = (e.clipboardData && e.clipboardData.types) || []
  const items = (e.clipboardData && e.clipboardData.items) || []
  const rawText = e.clipboardData ? String(e.clipboardData.getData('text/plain') || '') : ''
  let hasImageItem = false
  for (let i = 0; i < items.length; i++) {
    if (items[i].type && items[i].type.startsWith('image/')) {
      hasImageItem = true
      break
    }
  }
  const hasFiles = types.includes('Files')
  const trimmed = rawText.trim()
  // 文本仅为单个路径（资源管理器/IDE 复制文件引用）时才按图片/文件流程处理
  const textIsPathLike = !!trimmed && trimmed.length <= 300 && !trimmed.includes('\n')
  const isImagePaste = hasImageItem || (hasFiles && (!trimmed || textIsPathLike))

  pasteLog('paste', { types: types.join('|'), hasFiles, hasImageItem, textLen: rawText.length, isImagePaste })

  try {
    if (isImagePaste) {
      e.preventDefault()
      const res = await window.pm.saveClipboardImages()
      if (res && res.ok && res.images && res.images.length) {
        await bindImageToSelection(res.images, capturedRange, capturedText)

        // 若剪贴板中同时包含图文混合纯文本（如微信复制图文消息），且非纯图片路径，一并按智能管线处理
        const clipboardText = trimmed
        if (clipboardText && !/\.(png|jpe?g|gif|webp|bmp)$/i.test(clipboardText) && !clipboardText.startsWith('file://')) {
          const parsed = parseCompiledPrompt(clipboardText)
          if (parsed) {
            // 已编译提示词：还原图文锚点
            if (parsed.images && parsed.images.length) {
              state.composer.images = parsed.images
            }
            state.composer.text = parsed.text
            toast(`已还原图片与关键词 [图${parsed.images.length}]`)
            return
          }
          // 长文本：自动落盘为 .txt 并在光标处插入 [文件: xxx.txt] 短锚点
          const r = await smartPastePlainText(clipboardText, {
            onAnchor: (anchor) => {
              insertTextAtCursor(anchor)
              onInput()
            }
          })
          if (r.handled) return
          document.execCommand('insertText', false, clipboardText)
          onInput()
        }

        toast(`已关联图片与关键词 [图${state.composer.images.length}]`)
        return
      }
      // 未存下任何图片：带文本则继续按文本流程，否则到此为止（已阻止默认粘贴）
      if (!trimmed) return
    }

    // 文本粘贴（含 Files+长文本并存的场景）：智能还原已编译提示词 / 长文本自动转 .txt / 普通文本插入
    const plain = rawText
    if (plain) {
      e.preventDefault()
      const r = await smartPastePlainText(plain)
      pasteLog('paste-result', { handled: r.handled, anchor: r.anchor })
      if (r.handled) {
        // 长文本已落盘：在光标处插入 [文件: xxx.txt] 短锚点
        if (r.anchor) insertTextAtCursor(r.anchor)
        return
      }
      document.execCommand('insertText', false, plain)
      onInput()
    } else if (!isImagePaste) {
      // 既无文本也非图片/文件引用：阻止默认粘贴防止脏数据入框
      e.preventDefault()
    }
  } catch (err) {
    // 兜底：粘贴链路任何异常都不允许浏览器默认行为把原文整段怼进编辑器
    try { e.preventDefault() } catch (_) { /* ignore */ }
    pasteLog('paste-error', { message: String((err && err.message) || err) })
    toast(currentLocale.value === 'en' ? 'Paste failed, content not inserted' : '粘贴处理失败，内容未插入')
  }
}

/** 渲染层诊断日志：经主进程写入运行日志，便于回溯粘贴/拖拽等链路问题 */
function pasteLog(tag, data) {
  try {
    window.pm && window.pm.rendererLog && window.pm.rendererLog(`[Editor] ${tag} ${JSON.stringify(data)}`)
  } catch { /* ignore */ }
}

/* ---------- 拖拽兜底：从 IDE/浏览器拖拽文本入框同样走智能管线（默认 drop 会绕过粘贴转换） ---------- */
function onDragOver(e) {
  e.preventDefault()
}

async function onDrop(e) {
  const rawText = e.dataTransfer ? String(e.dataTransfer.getData('text/plain') || '') : ''
  const hasFiles = !!(e.dataTransfer && e.dataTransfer.types && e.dataTransfer.types.includes('Files'))
  pasteLog('drop', { textLen: rawText.length, hasFiles })
  if (hasFiles && !rawText) {
    // 文件拖拽（截图/图片文件等）暂不支持，阻止默认行为避免打乱编辑器内容
    e.preventDefault()
    toast(currentLocale.value === 'en'
      ? 'File drag is not supported yet. Please copy it and press Ctrl+V'
      : '暂不支持拖入文件，请复制后按 Ctrl+V 粘贴')
    return
  }
  if (!rawText) return
  e.preventDefault()
  try {
    const r = await smartPastePlainText(rawText)
    pasteLog('drop-result', { handled: r.handled, anchor: r.anchor })
    if (r.handled) {
      if (r.anchor) insertTextAtCursor(r.anchor)
      return
    }
    document.execCommand('insertText', false, rawText)
    onInput()
  } catch (err) {
    pasteLog('drop-error', { message: String((err && err.message) || err) })
  }
}

let isComposing = false

function onCompositionStart() {
  isComposing = true
  isUserTyping = true
}

function onCompositionEnd() {
  isComposing = false
  onInput()
}

function onInput() {
  isUserTyping = true
  // 即使处于组词中（isComposing）也持续序列化，避免输入法状态异常卡死时
  // DOM 与 state 永久脱节（正文改动丢失）；组词期间只跳过 DOM 重渲染
  state.composer.text = serializeEditor()
  if (!isComposing) {
    nextTick(() => { isUserTyping = false })
  }
}

function focusEditor(e) {
  if (e && editorRef.value && editorRef.value.contains(e.target)) return
  if (editorRef.value) {
    editorRef.value.focus()
    const sel = window.getSelection()
    if (sel) {
      const r = document.createRange()
      r.selectNodeContents(editorRef.value)
      r.collapse(false)
      sel.removeAllRanges()
      sel.addRange(r)
    }
  }
}

function onKeydown(e) {
  if (e.key === 'Enter') {
    // 避免来自 chip 内部按键重复冒泡触发二次保存
    if (e.target && e.target.closest && e.target.closest('.kw-chip')) return
    emit('keydown-enter', e)
  }
}

/* ---------- 外部变化同步 ---------- */
watch(
  () => state.composer.text,
  (val) => {
    if (!isUserTyping) {
      renderFromText(val)
      syncChipsWithImages()
    }
  },
  { immediate: true }
)

watch(
  () => state.composer.images.length,
  () => {
    isUserTyping = false
    syncChipsWithImages()
    if (state.composer.images.length > 0) {
      renderFromText(state.composer.text)
      syncChipsWithImages()
    }
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

function onEditorBlur(e) {
  isComposing = false
  isUserTyping = false
  saveSelection(e)
}

defineExpose({
  focus: () => editorRef.value && editorRef.value.focus(),
  bindImageToSelection,
  saveSelection,
  insertTextAtCursor,
  clearAllChips,
  syncFromStore: () => {
    isUserTyping = false
    repairMissingFileAnchors()
    renderFromText(state.composer.text)
    syncChipsWithImages()
  }
})

let unsubFocus = null

onMounted(() => {
  repairMissingFileAnchors()
  renderFromText(state.composer.text)
  syncChipsWithImages()
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
  <div class="prompt-editor-card h-full flex flex-col min-h-0 cursor-text" @click="focusEditor">
    <div
      ref="editorRef"
      class="prompt-editor-content flex-1 min-h-0 select-text"
      :style="{ minHeight }"
      contenteditable="true"
      :data-placeholder="placeholder"
      @input="onInput"
      @compositionstart="onCompositionStart"
      @compositionend="onCompositionEnd"
      @paste="onPaste"
      @dragover="onDragOver"
      @drop="onDrop"
      @keydown="onKeydown"
      @mouseup="saveSelection"
      @keyup="saveSelection"
      @blur="onEditorBlur"
      @focus="saveSelection"
    />
  </div>
</template>
