/**
 * PromptMag 全局状态管理（Vue 3 reactive 单例）
 * 职责：data.json 持久化、队列/词库/输入区状态、图片增删重排（自动重编 [图N] 标记）、
 *      next_tasks.md 实时同步、外部勾选状态回写。
 */
import { reactive, watch, toRaw } from 'vue'
import { compilePrompt, buildTasksFile } from './compilePrompt'
import { t, currentLocale, setLocale } from './i18n'

/* 浏览器直跑 vite（无 Electron 桥）时的兜底 mock，便于纯前端调试 */
if (typeof window !== 'undefined' && !window.pm) {
  window.pm = {
    getInitData: async () => ({
      data: {},
      paths: { homeDir: '', imagesDir: '', tasksFile: '', dataFile: '' },
      platform: 'browser'
    }),
    saveData: async () => ({ ok: true }),
    saveClipboardImages: async () => ({ ok: false, error: 'no bridge' }),
    chooseImageFiles: async () => ({ ok: false, canceled: true }),
    readClipboardText: async () => ({ ok: false, text: '' }),
    copyText: async (t) => {
      try { await navigator.clipboard.writeText(String(t)) } catch { /* ignore */ }
      return { ok: true }
    },
    writeTasks: async () => ({ ok: true }),
    readTasks: async () => ({ exists: false, content: '', items: [] }),
    setOpacity () {},
    setAlwaysOnTop () {},
    hideWindow () {},
    toggleWindow () {},
    setMode () {},
    setQuickHeight () {},
    pointerIn () {},
    pointerOut () {},
    getBounds: async () => null,
    dragMoveTo () {},
    chooseDataDir: async () => ({ ok: false, canceled: true }),
    updateHotkeys () {},
    openPath () {},
    showItemInFolder () {},
    onFocusComposer: () => () => {},
    onTasksExternalChange: () => () => {},
    onModeChanged: () => () => {},
    onAlwaysOnTopChanged: () => () => {},
    onHotkeyPop: () => () => {},
    onHotkeyCollected: () => () => {},
    onHotkeysRegistered: () => () => {}
  }
}

export const uid = () =>
  't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)

const DEFAULT_SNIPPETS = [
  { id: uid(), text: '请先分析原因，不要直接改代码' },
  { id: uid(), text: '保持现有代码风格，不要重写无关代码' },
  { id: uid(), text: '改完给我一个变更摘要' },
  { id: uid(), text: '如果不确定需求，先停下来问我' },
  { id: uid(), text: '分步骤执行，每步说明你在做什么' }
]

export const state = reactive({
  ready: false,
  platform: 'win32',
  toast: '',
  paths: { homeDir: '', imagesDir: '', tasksFile: '', dataFile: '' },
  settings: {
    alwaysOnTop: true, opacity: 1, relay: false, mode: 'full',
    hotkeyToggle: 'Alt+Q', hotkeyPop: 'Alt+V', hotkeySnippets: 'Alt+X', hotkeyCollect: 'Alt+T',
    locale: 'zh', popMode: 'shotgun'
  },
  snippets: [],
  composer: { text: '', images: [] },
  queue: [],
  preview: null,
  isDialogOpening: false
})

/* ---------------- 图片全屏/放大预览 ---------------- */
export function openImagePreview(img, index = 0, list = []) {
  if (!img) return
  const fullList = Array.isArray(list) && list.length ? list : [img]
  const validIdx = typeof index === 'number' && index >= 0 && index < fullList.length ? index : 0
  state.preview = {
    img: fullList[validIdx] || img,
    index: validIdx,
    list: fullList
  }
}

export function closeImagePreview() {
  state.preview = null
}

/* ---------------- Toast ---------------- */
let toastTimer = null
export function toast(msg) {
  state.toast = msg
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { state.toast = '' }, 1500)
}

/* ---------------- 持久化 data.json ---------------- */
let saveTimer = null
function scheduleSave() {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    window.pm.saveData({
      settings: { ...toRaw(state.settings) },
      snippets: JSON.parse(JSON.stringify(state.snippets)),
      composer: JSON.parse(JSON.stringify(state.composer)),
      queue: JSON.parse(JSON.stringify(state.queue))
    })
  }, 300)
}

watch(
  () => [state.settings, state.snippets, state.composer, state.queue],
  scheduleSave,
  { deep: true }
)

/* ---------------- next_tasks.md 实时同步 ---------------- */
let tasksTimer = null
export function syncTasksFile() {
  if (!state.ready || !state.settings.relay) return
  clearTimeout(tasksTimer)
  tasksTimer = setTimeout(() => {
    window.pm.writeTasks(buildTasksFile(state.queue, state.settings.locale))
  }, 150)
}

watch(() => state.queue, syncTasksFile, { deep: true })

/* ---------------- 初始化 ---------------- */
export async function initStore() {
  const res = await window.pm.getInitData()
  const d = res.data || {}
  state.platform = res.platform || 'win32'
  state.paths = { ...state.paths, ...(res.paths || {}) }
  state.settings = Object.assign(
    {
      alwaysOnTop: true, opacity: 1, relay: false, mode: 'full',
      hotkeyToggle: 'Alt+Q', hotkeyPop: 'Alt+V', hotkeySnippets: 'Alt+X', hotkeyCollect: 'Alt+T',
      locale: 'zh',
      popMode: 'shotgun'
    },
    d.settings || {}
  )
  // 旧快捷键自动迁移与容错（Alt+C 会触发微信关闭窗口，Alt+S 会触发微信发消息）
  if (state.settings.hotkeySnippets === 'Alt+C') state.settings.hotkeySnippets = 'Alt+X'
  if (state.settings.hotkeyCollect === 'Alt+S') state.settings.hotkeyCollect = 'Alt+T'
  if (state.settings.hotkeyToggle === undefined || state.settings.hotkeyToggle === null) state.settings.hotkeyToggle = 'Alt+Q'
  if (!['capsule', 'quick', 'full'].includes(state.settings.mode)) state.settings.mode = 'full'
  if (!['shotgun', 'revolver', 'pistol'].includes(state.settings.popMode)) state.settings.popMode = 'shotgun'
  setLocale(state.settings.locale || 'zh')

  state.snippets =
    Array.isArray(d.snippets) && d.snippets.length
      ? d.snippets
      : DEFAULT_SNIPPETS.slice()
  const c = d.composer || {}
  state.composer = {
    text: String(c.text || ''),
    images: Array.isArray(c.images) ? c.images : []
  }
  state.queue = Array.isArray(d.queue) ? d.queue : []
  state.ready = true

  window.pm.setOpacity(state.settings.opacity)
  window.pm.setAlwaysOnTop(state.settings.alwaysOnTop !== false)
  // 托盘菜单切换置顶时回传，保持 UI 开关一致
  window.pm.onAlwaysOnTopChanged((v) => { state.settings.alwaysOnTop = !!v })
  if (state.settings.relay) syncTasksFile()

  /* 全局快捷键事件绑定 */
  bindHotkeyEvents()
}

/* ---------------- 出弹模式（霰弹枪: 先保存先出 / 左轮: 随机弹出 / 手枪: 先入后出） ---------------- */
export function setPopMode(m) {
  const mode = ['shotgun', 'revolver', 'pistol'].includes(m) ? m : 'shotgun'
  state.settings.popMode = mode
  const modeKey = mode === 'shotgun' ? 'settings.popModeShotgun' : mode === 'revolver' ? 'settings.popModeRevolver' : 'settings.popModePistol'
  toast(t('toast.popModeChanged', { mode: t(modeKey) }))
}

export function cyclePopMode() {
  const MODES = ['shotgun', 'revolver', 'pistol']
  const curIdx = MODES.indexOf(state.settings.popMode || 'shotgun')
  const next = MODES[(curIdx + 1) % MODES.length]
  setPopMode(next)
}

/* ---------------- 语言切换 ---------------- */
export function changeLocale(lang) {
  const next = lang === 'en' ? 'en' : 'zh'
  state.settings.locale = next
  setLocale(next)
  if (state.settings.relay) syncTasksFile()
  toast(t('toast.langChanged', { lang: next === 'en' ? 'English' : '简体中文' }))
}

/* ---------------- 全局快捷键：弹出提示词 / 收录选中 / 插入常用词 ---------------- */
function bindHotkeyEvents() {
  /* 快捷键 1：根据出弹模式复制弹夹里未使用的提示词，标记为已使用（done），并自动粘贴到前台窗口光标处 */
  window.pm.onHotkeyPop(async (payload) => {
    const fgHwnd = payload && payload.fgHwnd ? payload.fgHwnd : '0'
    const pending = state.queue.filter((t) => !t.done)
    if (!pending.length) {
      if (state.queue.length > 0) {
        toast(t('toast.magAllDone'))
      } else {
        toast(t('toast.magEmpty'))
      }
      return
    }

    const mode = state.settings.popMode || 'shotgun'
    let task = null
    if (mode === 'revolver') {
      // 左轮模式：随机轮盘抽取一条待用提示词
      const rIdx = Math.floor(Math.random() * pending.length)
      task = pending[rIdx]
    } else if (mode === 'pistol') {
      // 手枪模式：先入的最后弹出（后进先出 LIFO：最新保存的先弹出）
      task = pending[pending.length - 1]
    } else {
      // 霰弹枪模式（默认）：先入先出 FIFO（最先保存的先弹出）
      task = pending[0]
    }

    try {
      await copyCompiled(task)
      task.done = true
      const remaining = state.queue.filter((t) => !t.done).length
      const modeKey = mode === 'shotgun' ? 'settings.popModeShotgun' : mode === 'revolver' ? 'settings.popModeRevolver' : 'settings.popModePistol'
      toast(t('toast.poppedPrompt', { mode: t(modeKey), n: remaining }))
      // 关键：通知主进程将剪贴板内容直接粘贴到前台窗口光标处！
      if (window.pm && window.pm.pasteToForeground) {
        await window.pm.pasteToForeground(fgHwnd)
      }
    } catch (e) {
      toast(t('toast.popFailed'))
    }
  })

  /* 快捷键 2：收录当前选中文字到词库 */
  window.pm.onHotkeyCollected(({ ok, text }) => {
    if (ok && text && text.trim()) {
      addSnippet(text.trim())
      toast(t('toast.collectedSnippet'))
    } else {
      toast(t('toast.noSelectedText'))
    }
  })

  /* 快捷键注册失败回执（例如与其他软件冲突） */
  window.pm.onHotkeysRegistered(({ ok, failedKeys, toggle, pop, collect, snippets }) => {
    if (!ok) {
      const failed = Array.isArray(failedKeys) && failedKeys.length
        ? failedKeys.join(' / ')
        : [toggle, pop, collect, snippets].filter(Boolean).join(' / ')
      toast(currentLocale.value === 'en'
        ? `Failed to register hotkey (${failed}, may be occupied by another app)`
        : `部分快捷键注册失败（${failed}，可能已被其他系统软件占用）`)
    }
  })

  /* 常用词插入到主输入框事件 */
  if (window.pm.onSnippetInserted) {
    window.pm.onSnippetInserted((text) => {
      if (!text) return
      const hasEditor = document.querySelector('.prompt-editor-content')
      if (hasEditor) {
        window.dispatchEvent(new CustomEvent('pm:insert-snippet-at-cursor', { detail: text }))
      } else {
        state.composer.text = (state.composer.text ? state.composer.text + ' ' : '') + text
      }
      toast(t('toast.copiedSnippet'))
    })
  }
}

export function setHotkeys(patch = {}) {
  const keys = ['toggle', 'pop', 'snippets', 'collect']
  const mapKey = {
    toggle: 'hotkeyToggle',
    pop: 'hotkeyPop',
    snippets: 'hotkeySnippets',
    collect: 'hotkeyCollect'
  }

  // 1. 单快捷键约束：每个功能快捷键只能设置一个，也可以为空（置空后彻底禁用该快捷键）
  // 检查是否与其他已设快捷键冲突，若有重复则自动清空旧冲突项并弹出提示
  for (const [k, newVal] of Object.entries(patch)) {
    if (!keys.includes(k)) continue
    const targetProp = mapKey[k]
    const val = typeof newVal === 'string' ? newVal.trim() : ''

    if (val) {
      for (const otherKey of keys) {
        if (otherKey === k) continue
        const otherProp = mapKey[otherKey]
        if (state.settings[otherProp] === val) {
          state.settings[otherProp] = ''
          toast(t('settings.hotkeyConflictAutoCleared', { key: val }))
        }
      }
    }
    state.settings[targetProp] = val
  }

  window.pm.updateHotkeys({
    toggle: state.settings.hotkeyToggle || '',
    pop: state.settings.hotkeyPop || '',
    collect: state.settings.hotkeyCollect || '',
    snippets: state.settings.hotkeySnippets || ''
  })
}

/* ---------------- 剪贴板文本读取（主进程优先，浏览器 API 兜底） ---------------- */
export async function readClipboardText() {
  try {
    const r = await window.pm.readClipboardText()
    if (r && r.ok && r.text) return r.text
  } catch { /* ignore */ }
  try {
    const t = await navigator.clipboard.readText()
    if (t) return t
  } catch { /* ignore */ }
  return ''
}

/* 双向监听：CLI Agent 把 "- [ ]" 勾成 "- [x]" 时同步回 UI */
export function bindExternalEvents() {
  window.pm.onTasksExternalChange(({ items }) => {
    (items || []).forEach((it) => {
      if (!it.id) return
      const q = state.queue.find((t) => t.id === it.id)
      if (q && !!q.done !== !!it.done) {
        q.done = !!it.done
        if (q.done) toast('Agent 已完成任务：' + (q.text || '').slice(0, 18) + '…')
      }
    })
  })
}

/* ---------------- 图片操作（自动重编 [图N: 关键词] 标记） ---------------- */
function remapTokens(text, oldImages, newImages) {
  const newIndexOfPath = new Map(newImages.map((im, i) => [im.path, i + 1]))
  return String(text || '').replace(/\[图\s*(\d+)(?:\s*[:：]\s*([^\]]*))?\]/g, (m, n, note) => {
    const old = oldImages[Number(n) - 1]
    if (!old) return m
    const next = newIndexOfPath.get(old.path)
    if (!next) return '' // 已删除图片的标记一并移除
    const suffix = note !== undefined && note !== null && note.trim() ? ': ' + note.trim() : ''
    return '[图' + next + suffix + ']'
  })
}

export function addImages(imgs, initialNote = '') {
  (imgs || []).forEach((im) => {
    state.composer.images.push({
      path: im.path,
      name: im.name || '',
      note: (im.note || initialNote || '').trim()
    })
  })
}

export async function pickAndAddImages(initialNote = '') {
  state.isDialogOpening = true
  try {
    const res = await window.pm.chooseImageFiles()
    if (res && res.ok && res.images && res.images.length) {
      addImages(res.images, initialNote)
      toast(`已添加 ${res.images.length} 张图片`)
      return res.images
    }
  } catch (e) {
    toast('选择图片失败')
  } finally {
    state.isDialogOpening = false
  }
  return []
}

export function removeImage(idx) {
  const old = state.composer.images.slice()
  state.composer.images.splice(idx, 1)
  state.composer.text = remapTokens(state.composer.text, old, state.composer.images)
}

export function reorderImage(from, to) {
  if (from === to) return
  const imgs = state.composer.images
  const old = imgs.slice()
  const [moved] = imgs.splice(from, 1)
  imgs.splice(to, 0, moved)
  state.composer.text = remapTokens(state.composer.text, old, imgs)
}

export function imgUrl(p) {
  return 'pmimg://local/' + encodeURIComponent(p)
}

export function formatDateTime(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const h = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  return `${m}-${day} ${h}:${min}`
}

/* ---------------- 队列操作 ---------------- */
export function pushComposerToQueue() {
  const c = state.composer
  if (!String(c.text).trim() && !c.images.length) return null
  const task = {
    id: uid(),
    text: String(c.text),
    images: JSON.parse(JSON.stringify(c.images)),
    createdAt: Date.now(),
    done: false
  }
  state.queue.push(task)
  // 保存完后自动把编译后的结构化 Prompt 写入当前用户的系统剪贴板
  copyCompiled(task).catch(() => {})
  c.text = ''
  c.images = []
  return task
}

export function removeTask(id) {
  const i = state.queue.findIndex((t) => t.id === id)
  if (i > -1) state.queue.splice(i, 1)
}

export function editBackfill(id) {
  const t = state.queue.find((x) => x.id === id)
  if (!t) return
  state.composer.text = String(t.text || '')
  state.composer.images = JSON.parse(JSON.stringify(t.images || []))
  removeTask(id)
}

export function toggleTaskDone(id) {
  const tTask = state.queue.find((x) => x.id === id)
  if (!tTask) return
  tTask.done = !tTask.done
  toast(tTask.done ? t('toast.taskMarkedDone') : t('toast.taskMarkedPending'))
}

export function resetAllTasksPending() {
  state.queue.forEach((tTask) => { tTask.done = false })
  toast(t('toast.resetAllPending'))
}

export function clearDoneTasks() {
  state.queue = state.queue.filter((tTask) => !tTask.done)
}

export function clearAllQueue() {
  state.queue = []
}

export async function copyCompiled(task, { pop = false } = {}) {
  const text = compilePrompt(task, {
    tasksPath: state.paths.tasksFile,
    relay: state.settings.relay,
    locale: state.settings.locale
  })
  await window.pm.copyText(text)
  if (pop) removeTask(task.id)
  return text
}

/* ---------------- 设置 ---------------- */
export function setAlwaysOnTop(v) {
  state.settings.alwaysOnTop = !!v
  window.pm.setAlwaysOnTop(!!v)
}

export function setOpacity(v) {
  const val = Math.min(1, Math.max(0.4, Number(v) || 1))
  state.settings.opacity = val
  window.pm.setOpacity(val)
}

export function setRelay(v) {
  state.settings.relay = !!v
  if (v) {
    syncTasksFile()
    toast(t('toast.autoRelayOn'))
  } else {
    toast(t('toast.autoRelayOff'))
  }
}

/* ---------------- 形态：capsule / quick / full ---------------- */
const MODES = ['capsule', 'quick', 'full']
let lastModeAt = 0

/**
 * 切换形态。带 400ms 冷却，避免窗口缩放后光标恰好落在新形态上
 * 触发「收起 -> 立刻展开」的抖动循环。
 */
export function setMode(m) {
  const mode = MODES.includes(m) ? m : 'full'
  if (state.settings.mode === mode) return
  if (Date.now() - lastModeAt < 400) return
  lastModeAt = Date.now()
  state.settings.mode = mode
  window.pm.setMode(mode)
}

/** 主进程回显形态（Alt+Q 自动展开等场景） */
export function bindModeSync(applyFn) {
  return window.pm.onModeChanged((m) => applyFn(m))
}

/* ---------------- 数据目录 ---------------- */
export async function chooseDataDir() {
  state.isDialogOpening = true
  try {
    const r = await window.pm.chooseDataDir()
    if (r && r.ok) {
      toast('数据目录已更改，应用即将重启')
    } else if (r && r.error) {
      toast('更改失败：' + r.error)
    }
    return r
  } finally {
    state.isDialogOpening = false
  }
}

/* ---------------- 词库 ---------------- */
export function addSnippet(text) {
  const t = String(text || '').trim()
  if (!t) return
  state.snippets.push({ id: uid(), text: t })
}

export function removeSnippet(id) {
  const i = state.snippets.findIndex((s) => s.id === id)
  if (i > -1) state.snippets.splice(i, 1)
}

export { t, currentLocale } from './i18n'
