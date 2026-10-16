/**
 * PromptMag 全局状态管理（Vue 3 reactive 单例）
 * 职责：data.json 持久化、队列/词库/输入区状态、图片增删重排（自动重编 [图N] 标记）、
 *      next_tasks.md 实时同步、外部勾选状态回写。
 */
import { reactive, watch, toRaw } from 'vue'
import { compilePrompt, buildTasksFile } from './compilePrompt'

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
  settings: { alwaysOnTop: true, opacity: 1, relay: false, mode: 'full', hotkeyPop: 'Alt+V', hotkeyCollect: 'Alt+S' },
  snippets: [],
  composer: { text: '', images: [] },
  queue: []
})

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
    window.pm.writeTasks(buildTasksFile(state.queue))
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
    { alwaysOnTop: true, opacity: 1, relay: false, mode: 'full', hotkeyPop: 'Alt+V', hotkeyCollect: 'Alt+S' },
    d.settings || {}
  )
  if (!['capsule', 'quick', 'full'].includes(state.settings.mode)) state.settings.mode = 'full'
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

/* ---------------- 全局快捷键：弹出最旧未用 / 收录选中 ---------------- */
function bindHotkeyEvents() {
  /* 快捷键 1：复制弹夹里最老的未使用提示词，并标记为已使用（done） */
  window.pm.onHotkeyPop(async () => {
    const task = state.queue.find((t) => !t.done)
    if (!task) { toast('弹夹空了：没有未使用的提示词'); return }
    try {
      await copyCompiled(task)
      task.done = true
      toast('已复制最旧未用提示词（标记为已使用）')
    } catch { toast('复制失败') }
  })

  /* 快捷键 2：收录当前选中文字到词库 */
  window.pm.onHotkeyCollected(({ ok, text }) => {
    if (ok && text && text.trim()) {
      addSnippet(text.trim())
      toast('已收录选中文字到词库')
    } else {
      toast('没有捕获到选中文本')
    }
  })

  /* 快捷键注册失败回执（例如与其他软件冲突） */
  window.pm.onHotkeysRegistered(({ ok, pop, collect }) => {
    if (!ok) toast(`快捷键注册失败：${pop} / ${collect}（可能与其他软件冲突）`)
  })
}

export function setHotkeys({ pop, collect } = {}) {
  if (pop) state.settings.hotkeyPop = pop
  if (collect) state.settings.hotkeyCollect = collect
  window.pm.updateHotkeys({ pop: state.settings.hotkeyPop, collect: state.settings.hotkeyCollect })
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

/* ---------------- 图片操作（自动重编 [图N] 标记） ---------------- */
function remapTokens(text, oldImages, newImages) {
  const newIndexOfPath = new Map(newImages.map((im, i) => [im.path, i + 1]))
  return String(text || '').replace(/\[图\s*(\d+)\s*\]/g, (m, n) => {
    const old = oldImages[Number(n) - 1]
    if (!old) return m
    const next = newIndexOfPath.get(old.path)
    return next ? '[图' + next + ']' : '' // 已删除图片的标记一并移除
  })
}

export function addImages(imgs) {
  (imgs || []).forEach((im) => {
    state.composer.images.push({ path: im.path, name: im.name || '', note: '' })
  })
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

export function clearDoneTasks() {
  state.queue = state.queue.filter((t) => !t.done)
}

export async function copyCompiled(task, { pop = false } = {}) {
  const text = compilePrompt(task, {
    tasksPath: state.paths.tasksFile,
    relay: state.settings.relay
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
    toast('自动接力已开启')
  } else {
    toast('自动接力已关闭（next_tasks.md 保留）')
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
  const r = await window.pm.chooseDataDir()
  if (r && r.ok) {
    toast('数据目录已更改，应用即将重启')
  } else if (r && r.error) {
    toast('更改失败：' + r.error)
  }
  return r
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
