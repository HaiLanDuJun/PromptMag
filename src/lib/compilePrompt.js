/**
 * compilePrompt - 面向 CLI 大模型的「无歧义 Prompt 编译器」
 *
 * 设计目标：让 CLI 端大模型 100% 不会认错图片顺序。
 *  1. 正文内联展开：`[图N]` -> `[图N (本地路径: "绝对路径")]`
 *  2. 底部精确索引表：无论用户写的是内联 `[图N]` 还是口语「第一张图」，都生成严谨映射块
 *  3. 纯图片批注模式：正文几乎为空、批注为主时，自动汇总为分步指令列表
 *  4. 自动接力 Hook：开启后追加读取 next_tasks.md 的系统指令
 */

export const CN_NUM = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十']

export const TOKEN_RE = /\[图\s*(\d+)(?:\s*[:：]\s*([^\]]*))?\]/g
const EXPANDED_RE = /\[图\d+ \(本地路径: "[^"]*"\)(?::\s*[^\]]*)?\]/g
// 注意：非全局正则，避免 .test() 受 lastIndex 影响产生漏检
const ORDINAL_RE = /第[一二三四五六七八九十1-9]+\s*张图|图\s*[1-9]\s*(?=[的地中里面上和与,，。]|$)/

export function cnNum(n) {
  if (n <= 10) return CN_NUM[n]
  if (n < 20) return '十' + CN_NUM[n - 10]
  const tens = Math.floor(n / 10)
  const ones = n % 10
  return CN_NUM[tens] + '十' + (ones ? CN_NUM[ones] : '')
}

export function validImages(task) {
  return ((task && task.images) || []).filter((i) => i && i.path)
}

export function imgLabel(i) {
  return '图' + i
}

function quote(p) {
  return '"' + String(p).replace(/"/g, '') + '"'
}

/** 正文内联展开：[图N] / [图N: 说明] -> [图N (本地路径: "..."): 说明] */
export function expandInlineTokens(text, images) {
  return String(text || '').replace(TOKEN_RE, (m, n, note) => {
    const img = images[Number(n) - 1]
    if (!img) return m
    const desc = (note || (img && img.note) || '').trim()
    const descStr = desc ? ': ' + desc : ''
    return '[图' + n + ' (本地路径: ' + quote(img.path) + ')' + descStr + ']'
  })
}

/** 去掉所有图片标记后，正文还剩多少实质内容 */
export function bodyWithoutTokens(text) {
  return String(text || '')
    .replace(EXPANDED_RE, '')
    .replace(TOKEN_RE, '')
    .trim()
}

function hasNaturalOrdinal(text) {
  return ORDINAL_RE.test(String(text || ''))
}

/** 生成底部精确索引映射块 */
export function buildMappingBlock(images) {
  if (!images.length) return ''
  const lines = images.map((img, i) => {
    const note = (img.note || '').trim()
    return '- 【' + imgLabel(i + 1) + ' / 第' + cnNum(i + 1) + '张图】路径: ' + quote(img.path) +
      (note ? ' | 针对此图的说明: ' + note : '')
  })
  return [
    '',
    '---',
    '### 📎 附加上下文图片精确映射（请严格按编号对应读取本地图片文件）：',
    ...lines
  ].join('\n')
}

/** 纯图片批注模式 -> 分步指令列表 */
export function buildStepInstructions(images) {
  const steps = images.map((img, i) => {
    const note = (img.note || '').trim()
    return (i + 1) + '. 【' + imgLabel(i + 1) + '】本地路径: ' + quote(img.path) +
      (note ? ' | 请执行: ' + note : '')
  })
  return '请严格按照上述图片编号顺序，逐张完成对应处理（每张图的任务以编号后说明为准，不要混淆图片顺序）：\n' + steps.join('\n')
}

/** Agent 自动接力 Hook */
export function buildRelayHook(tasksPath) {
  return [
    '',
    '---',
    '【PromptMag · Agent 自动接力指令】完成上述任务后，请立即读取本地文件：',
    '"' + tasksPath + '"',
    '按文件自上而下的顺序，找到第一个未完成的 "- [ ]" 任务并继续执行；每完成一个任务，',
    '请将其对应的 "- [ ]" 手动修改为 "- [x]"，然后继续下一个，直至文件中没有未完成任务为止。'
  ].join('\n')
}

/**
 * 主编译器：将「正文 + 图片 + 批注」组装成大模型不会认错顺序的结构化 Prompt
 */
export function compilePrompt(task, opts = {}) {
  const tasksPath = opts.tasksPath || ''
  const relay = !!opts.relay
  const images = validImages(task)
  let body = String((task && task.text) || '').trim()
  body = expandInlineTokens(body, images)

  const leftover = bodyWithoutTokens(body)
  const hasNotes = images.some((i) => (i.note || '').trim())

  // 3. 纯图片批注模式：正文没有实质内容（或仅剩图片标记），全靠卡片批注驱动
  if (images.length && leftover.length === 0 && hasNotes) {
    body = buildStepInstructions(images)
  }

  // 自然语言兼容提示（用户口语化写了「第一张图」等）
  let ordinalHint = ''
  if (images.length && hasNaturalOrdinal(body)) {
    ordinalHint = '\n\n（注：正文中提到的「第N张图 / 图N」均指下方图片精确映射表中的图N，请严格按编号读取对应本地文件。）'
  }

  const parts = [body + ordinalHint, buildMappingBlock(images)].filter(Boolean)
  let out = parts.join('\n')

  if (relay && tasksPath) out += buildRelayHook(tasksPath)
  return out.trim()
}

/**
 * 单行紧凑编译（用于写入 next_tasks.md）
 */
export function compileTaskLine(task, num) {
  const done = !!(task && task.done)
  const images = validImages(task)
  let text = String((task && task.text) || '')
    .replace(TOKEN_RE, (m, n, note) => {
      const img = images[Number(n) - 1]
      const desc = (note || (img && img.note) || '').trim()
      const descStr = desc ? '(' + desc + ')' : ''
      return img ? '[图' + n + descStr + ': ' + quote(img.path) + ']' : m
    })
    .replace(/\s+/g, ' ')
    .trim()

  const leftover = bodyWithoutTokens(text)
  if (images.length && !leftover && images.some((i) => (i.note || '').trim())) {
    text = '请依次处理：' + images
      .map((img, i) => (i + 1) + ')' + imgLabel(i + 1) + ((img.note || '').trim() ? '(' + img.note.trim() + ')' : '') + ' 路径:' + img.path)
      .join(' ; ')
  }
  if (!text) text = images.length ? '请处理以下图片' : '（空任务）'

  const maps = images
    .map((img, i) => imgLabel(i + 1) + ': ' + quote(img.path) + ((img.note || '').trim() ? '(说明: ' + img.note.trim() + ')' : ''))
    .join(' ; ')

  const id = (task && task.id) || ''
  return '- [' + (done ? 'x' : ' ') + '] ' + num + '. ' + text + (maps ? ' | 图片映射 -> ' + maps : '') + (id ? ' <!--pm:' + id + '-->' : '')
}

/** 生成完整的 next_tasks.md 内容 */
export function buildTasksFile(queue) {
  const header = [
    '# PromptMag · Agent 自动接力任务队列',
    '<!-- 由 PromptMag 自动生成。Agent 每完成一个任务，请把对应的 "- [ ]" 改为 "- [x]"，PromptMag 会同步回界面状态 -->',
    ''
  ].join('\n')
  if (!queue || !queue.length) return header + '(当前无待办任务)\n'
  return header + queue.map((t, i) => compileTaskLine(t, i + 1)).join('\n') + '\n'
}

/** 解析 next_tasks.md（与主进程保持一致，供 UI 预览/同步使用） */
export function parseTasksLines(content) {
  const items = []
  String(content || '').split(/\r?\n/).forEach((line, i) => {
    const m = line.match(/^\s*-\s*\[([ xX])\]\s*(.+)$/)
    if (!m) return
    const body = m[2]
    const idm = body.match(/<!--\s*pm:([A-Za-z0-9_-]+)\s*-->/)
    items.push({
      line: i,
      done: m[1].toLowerCase() === 'x',
      id: idm ? idm[1] : null,
      text: body.replace(/<!--\s*pm:[A-Za-z0-9_-]+\s*-->/, '').trim()
    })
  })
  return items
}

/**
 * 反编译：将已编译的 Prompt 还原为 { text, images }
 * 允许用户重新粘贴导出的提示词时，自动还原为纯净的图文关联框与关键词
 */
export function parseCompiledPrompt(rawText) {
  if (!rawText || typeof rawText !== 'string') return null
  const text = rawText.trim()
  if (!text.includes('### 📎 附加上下文图片精确映射') && !text.includes('【图') && !text.includes('图片映射 ->')) {
    return null
  }

  const images = []
  // 匹配多行映射块：- 【图1 / 第一张图】路径: "..." (| 针对此图的说明: ...)?
  const blockRegex = /-\s*【图\s*(\d+)[^】]*】\s*路径:\s*"([^"]+)"(?:\s*\|\s*针对此图的说明:\s*([^\r\n]+))?/g
  let m
  while ((m = blockRegex.exec(text)) !== null) {
    const idx = Number(m[1]) - 1
    const imgPath = m[2]
    const note = (m[3] || '').trim()
    images[idx] = { path: imgPath, name: imgPath.split(/[/\\]/).pop(), note }
  }

  // 匹配单行任务映射：图1: "..."((说明: ...))?
  if (!images.length) {
    const singleRegex = /图\s*(\d+)\s*:\s*"([^"]+)"(?:\s*\(说明:\s*([^)]*)\))?/g
    while ((m = singleRegex.exec(text)) !== null) {
      const idx = Number(m[1]) - 1
      const imgPath = m[2]
      const note = (m[3] || '').trim()
      images[idx] = { path: imgPath, name: imgPath.split(/[/\\]/).pop(), note }
    }
  }

  const validImgs = images.filter(Boolean)
  if (!validImgs.length) return null

  // 提取正文：截取 '---' 之前的内容
  let body = text.split(/\r?\n\s*---\s*\r?\n/)[0].trim()

  // 移除可能附带的自然语言提示
  body = body.replace(/（注：正文中提到的「第N张图.*?）/gs, '').trim()

  // 还原内联路径标记：[图1 (本地路径: "..."): 说明] -> [图1: 说明]
  body = body.replace(/\[图\s*(\d+)\s*\(本地路径:\s*"[^"]*"\)(?:\s*[:：]\s*([^\]]*))?\]/g, (match, n, note) => {
    const cleanNote = (note || '').trim()
    return cleanNote ? `[图${n}: ${cleanNote}]` : `[图${n}]`
  })

  // 如果正文中原本没有 [图N] 标记，但有 1 张图片，并且正文是关键词（如 1111）
  if (!body.includes('[图') && validImgs.length === 1) {
    const word = body || validImgs[0].note || ''
    body = word ? `[图1: ${word}]` : `[图1]`
    validImgs[0].note = word
  }

  return { text: body, images: validImgs }
}