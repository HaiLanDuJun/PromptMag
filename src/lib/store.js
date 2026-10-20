/**
 * PromptMag 全局状态管理（Vue 3 reactive 单例）
 * 职责：data.json 持久化、队列/词库/输入区状态、图片增删重排（自动重编 [图N] 标记）、
 *      next_tasks.md 实时同步、外部勾选状态回写。
 */
import { reactive, watch, toRaw } from 'vue'
import { compilePrompt, buildTasksFile, inferTaskType, buildRelayStartupPrompt } from './compilePrompt.js'
import { t, currentLocale, setLocale } from './i18n.js'

/* 浏览器直跑 vite（无 Electron 桥）时的兜底 mock，便于纯前端调试 */
if (typeof window !== 'undefined' && !window.pm) {
  window.pm = {
    getInitData: async () => ({
      data: {},
      paths: { homeDir: '', imagesDir: '', tasksFile: '', dataFile: '', magazinesDir: '' },
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
    openExternal (url) {
      if (typeof window !== 'undefined') window.open(url, '_blank')
    },
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
  version: '1.9.16',
  isSettingsOpen: false,
  updateStatus: {
    checking: false,
    checked: false,
    hasUpdate: false,
    info: null,
    error: null
  },
  isUpdateModalOpen: false,
  toast: '',
  paths: { homeDir: '', imagesDir: '', tasksFile: '', dataFile: '', magazinesDir: '' },
  isHotkeyRecording: false,
  settings: {
    alwaysOnTop: true, opacity: 1, relay: false, mode: 'full',
    hotkeyToggle: 'Alt+Q', hotkeyPop: 'Alt+V', hotkeySnippets: 'Alt+X', hotkeyCollect: 'Alt+T', hotkeyCycleMag: 'Ctrl+Tab',
    locale: 'zh', popMode: 'shotgun', autoCleanup: 'off',
    saveTargetMode: 'active', // 'active' (当前活动弹夹) | 'ask' (每次弹窗选择) | 'specific' (指定固定弹夹)
    defaultMagazineId: 'default',
    ignoredVersion: '',
    windowScaleMode: 'quick',
    hideTaskbar: true
  },
  magazines: [],
  activeMagazineId: 'default',
  isMagazinePickerOpen: false,
  magazinePickerCallback: null,
  isRelayStartupModalOpen: false,
  relayStartupTargetMagId: null,
  snippets: [],
  composer: { text: '', images: [] },
  queue: [],
  preview: null,
  isDialogOpening: false,
  editingTaskId: null,
  relayStatus: { isWriteLocked: false, lockedBy: null, taskId: null },
  filterTab: 'all'
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
  if (state.settings.mode === 'capsule') {
    return
  }
  state.toast = msg
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { state.toast = '' }, 1500)
}

/* ---------------- 持久化 data.json ---------------- */
let saveTimer = null
function scheduleSave() {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    const curMag = state.magazines.find((m) => m.id === state.activeMagazineId)
    if (curMag) {
      curMag.queue = state.queue
    }
    window.pm.saveData({
      settings: { ...toRaw(state.settings) },
      snippets: JSON.parse(JSON.stringify(state.snippets)),
      composer: JSON.parse(JSON.stringify(state.composer)),
      magazines: JSON.parse(JSON.stringify(state.magazines)),
      activeMagazineId: state.activeMagazineId,
      queue: JSON.parse(JSON.stringify(state.queue))
    })
  }, 300)
}

watch(
  () => [state.settings, state.snippets, state.composer, state.queue, state.magazines, state.activeMagazineId],
  scheduleSave,
  { deep: true }
)

/* ---------------- next_tasks.md 实时同步 ---------------- */
export function getActiveMagazine() {
  return state.magazines.find((m) => m.id === state.activeMagazineId) || state.magazines[0]
}

let tasksTimer = null
export function syncTasksFile() {
  if (!state.ready || !state.settings.relay) return
  clearTimeout(tasksTimer)
  tasksTimer = setTimeout(() => {
    const activeMag = getActiveMagazine()
    const activeId = activeMag ? activeMag.id : 'default'
    const popMode = state.settings.popMode || 'shotgun'

    // 1. 同步当前活跃弹夹并写入全局镜像 next_tasks.md 与专属弹夹 tasks.md
    if (activeMag) {
      const activeContent = buildTasksFile(activeMag.queue, state.settings.locale, {
        magazineId: activeMag.id,
        magazineName: activeMag.name,
        popMode
      })
      window.pm.writeTasks(activeContent, {
        magazineId: activeMag.id,
        magazineName: activeMag.name
      })
    }

    // 2. 同步其它所有弹夹专属的 tasks.md
    for (const mag of state.magazines) {
      if (mag.id === activeId) continue
      const magContent = buildTasksFile(mag.queue, state.settings.locale, {
        magazineId: mag.id,
        magazineName: mag.name,
        popMode
      })
      window.pm.writeTasks(magContent, {
        magazineId: mag.id,
        magazineName: mag.name,
        skipGlobal: true
      })
    }
  }, 120)
}

watch(
  () => [state.queue, state.magazines, state.settings.popMode, state.settings.relay],
  () => {
    if (state.settings.relay) {
      syncTasksFile()
    }
  },
  { deep: true }
)

/* ---------------- 初始化 ---------------- */
export async function initStore() {
  const res = await window.pm.getInitData()
  const d = res.data || {}
  state.platform = res.platform || 'win32'
  state.version = res.version || '1.9.16'
  state.paths = { ...state.paths, ...(res.paths || {}) }
  state.settings = Object.assign(
    {
      alwaysOnTop: true, opacity: 1, relay: false, mode: 'full',
      hotkeyToggle: 'Alt+Q', hotkeyPop: 'Alt+V', hotkeySnippets: 'Alt+X', hotkeyCollect: 'Alt+T',
      locale: 'zh',
      popMode: 'shotgun',
      saveTargetMode: 'active',
      defaultMagazineId: 'default',
    ignoredVersion: '',
      autoCleanup: 'off',
      magazineAutoCleanup: {}
    },
    d.settings || {}
  )
  // 旧快捷键自动迁移与容错（Alt+C 会触发微信关闭窗口，Alt+S 会触发微信发消息）
  if (state.settings.hotkeySnippets === 'Alt+C') state.settings.hotkeySnippets = 'Alt+X'
  // 保证默认快捷键预先填写，不出现空未设置
  if (!state.settings.hotkeyToggle) state.settings.hotkeyToggle = 'Alt+Q'
  if (!state.settings.hotkeyPop) state.settings.hotkeyPop = 'Alt+V'
  if (!state.settings.hotkeySnippets) state.settings.hotkeySnippets = 'Alt+X'
  if (!state.settings.hotkeyCollect) state.settings.hotkeyCollect = 'Alt+T'
  if (!state.settings.hotkeyCycleMag) state.settings.hotkeyCycleMag = 'Ctrl+Tab'
  if (!state.settings.windowScaleMode) state.settings.windowScaleMode = 'quick'
  if (state.settings.hideTaskbar === undefined) state.settings.hideTaskbar = true

  if (state.settings.hotkeyCollect === 'Alt+S') state.settings.hotkeyCollect = 'Alt+T'
  if (state.settings.hotkeyToggle === undefined || state.settings.hotkeyToggle === null) state.settings.hotkeyToggle = 'Alt+Q'
  if (!['capsule', 'quick', 'full'].includes(state.settings.mode)) state.settings.mode = 'full'
  if (!['shotgun', 'revolver', 'pistol'].includes(state.settings.popMode)) state.settings.popMode = 'shotgun'
  if (!['active', 'ask', 'specific'].includes(state.settings.saveTargetMode)) state.settings.saveTargetMode = 'active'
  setLocale(state.settings.locale || 'zh')

  // 保证默认弹夹与收藏弹夹始终存在并位于前两位（默认弹夹在首位，收藏弹夹紧挨着默认弹夹）
  const loadedMags = Array.isArray(d.magazines) && d.magazines.length ? d.magazines : []

  // 1. 默认弹夹 (index 0)
  let defaultMag = loadedMags.find((m) => m.id === 'default')
  if (!defaultMag) {
    defaultMag = {
      id: 'default',
      name: currentLocale.value === 'en' ? 'Default Magazine' : '默认弹夹',
      description: currentLocale.value === 'en' ? 'General project prompts & tasks' : '默认通用项目提示词与任务',
      color: '#38bdf8',
      createdAt: Date.now(),
      autoCleanup: 'off',
      queue: Array.isArray(d.queue) ? d.queue : []
    }
  }

  // 2. 收藏弹夹 (index 1 - 紧随默认弹夹旁边)
  let favMag = loadedMags.find((m) => m.id === 'favorites')
  if (!favMag) {
    // 迁移旧版常用词库 snippets 到收藏弹夹
    const oldSnippets = Array.isArray(d.snippets) && d.snippets.length ? d.snippets : DEFAULT_SNIPPETS
    const migratedFavQueue = oldSnippets.map((s) => ({
      id: s.id || uid(),
      text: s.text,
      images: [],
      createdAt: Date.now(),
      done: false,
      status: 'pending',
      type: inferTaskType(s.text),
      agent: '',
      solver: '',
      solution: '',
      favorite: true
    }))

    favMag = {
      id: 'favorites',
      name: currentLocale.value === 'en' ? 'Favorites Magazine' : '收藏弹夹',
      description: currentLocale.value === 'en' ? 'Bookmarked favorite prompts & snippets' : '常用提示词与收藏模板',
      color: '#f59e0b',
      createdAt: Date.now(),
      isSpecial: true,
      autoCleanup: 'off',
      queue: migratedFavQueue
    }
  }

  // 3. 收集用户自建的其它项目弹夹（排除 default 和 favorites）
  const otherMags = loadedMags.filter((m) => m.id !== 'default' && m.id !== 'favorites')

  // 4. 组装 magazines 列表：保证默认弹夹在第 0 位，收藏弹夹在第 1 位（旁边），其它在后
  state.magazines = [defaultMag, favMag, ...otherMags]

  // 确保每个弹夹都有独立的 autoCleanup 配置（收藏弹夹恒为 'off' 受系统保护）
  state.magazines.forEach((m) => {
    if (m.id === 'favorites') {
      m.autoCleanup = 'off'
    } else {
      m.autoCleanup = m.autoCleanup || (state.settings.magazineAutoCleanup && state.settings.magazineAutoCleanup[m.id]) || state.settings.autoCleanup || 'off'
    }
  })

  // 同步收藏状态：若其它弹夹中有标记 favorite 的任务，确保其亦在收藏弹夹中
  state.magazines.forEach((m) => {
    if (m.id === 'favorites') return
    (m.queue || []).forEach((t) => {
      if (t.favorite && !favMag.queue.some((f) => f.id === t.id)) {
        favMag.queue.push(t)
      }
    })
  })

  const activeId = d.activeMagazineId && state.magazines.some((m) => m.id === d.activeMagazineId)
    ? d.activeMagazineId
    : state.magazines[0].id
  state.activeMagazineId = activeId
  const curMag = state.magazines.find((m) => m.id === activeId) || state.magazines[0]
  state.queue = curMag.queue
  state.snippets = favMag.queue

  const c = d.composer || {}
  state.composer = {
    text: String(c.text || ''),
    images: Array.isArray(c.images) ? c.images : []
  }
  state.ready = true

  window.pm.setOpacity(state.settings.opacity)
  window.pm.setAlwaysOnTop(state.settings.alwaysOnTop !== false)
  // 托盘菜单切换置顶时回传，保持 UI 开关一致
  window.pm.onAlwaysOnTopChanged((v) => { state.settings.alwaysOnTop = !!v })
  if (state.settings.relay) syncTasksFile()

  /* 全局快捷键事件绑定 */
  bindHotkeyEvents()
}

/* ---------------- 多弹夹管理与切换 ---------------- */
export function setActiveMagazine(id) {
  const mag = state.magazines.find((m) => m.id === id)
  if (!mag) return
  const oldMag = state.magazines.find((m) => m.id === state.activeMagazineId)
  if (oldMag) {
    oldMag.queue = state.queue
  }
  state.activeMagazineId = mag.id
  state.queue = mag.queue
  if (state.settings.relay) {
    syncTasksFile()
  }
  toast(t('toast.magazineSwitched', { name: mag.name }))
}

export function cycleMagazine(direction = 1) {
  if (!state.magazines || !state.magazines.length) return null
  const curIdx = state.magazines.findIndex((m) => m.id === state.activeMagazineId)
  const baseIdx = curIdx >= 0 ? curIdx : 0
  const nextIdx = (baseIdx + direction + state.magazines.length) % state.magazines.length
  const nextMag = state.magazines[nextIdx]
  setActiveMagazine(nextMag.id)
  return nextMag
}

export function createMagazine(name, description = '', color = '#38bdf8') {
  const trimmed = String(name || '').trim() || (currentLocale.value === 'en' ? 'New Magazine' : '新弹夹')
  const newMag = {
    id: uid(),
    name: trimmed,
    description: String(description || '').trim(),
    color: color || '#38bdf8',
    createdAt: Date.now(),
    autoCleanup: 'off',
    queue: []
  }
  state.magazines.push(newMag)
  setActiveMagazine(newMag.id)
  toast(t('toast.magazineCreated', { name: trimmed }))
  return newMag
}

export function renameMagazine(id, newName) {
  const mag = state.magazines.find((m) => m.id === id)
  if (!mag) return
  const trimmed = String(newName || '').trim()
  if (!trimmed) return
  mag.name = trimmed
  if (state.settings.relay && state.activeMagazineId === id) {
    syncTasksFile()
  }
  toast(t('toast.magazineRenamed', { name: trimmed }))
}

export function deleteMagazine(id) {
  if (id === 'default' || id === 'favorites') {
    toast(t('toast.cannotDeleteSystemMagazine'))
    return false
  }
  if (state.magazines.length <= 1) {
    toast(t('toast.cannotDeleteLastMagazine'))
    return false
  }
  const idx = state.magazines.findIndex((m) => m.id === id)
  if (idx === -1) return false
  const [deleted] = state.magazines.splice(idx, 1)
  if (state.activeMagazineId === id) {
    const next = state.magazines[0]
    state.activeMagazineId = next.id
    state.queue = next.queue
    if (state.settings.relay) syncTasksFile()
  }
  toast(t('toast.magazineDeleted', { name: deleted.name }))
  return true
}

export function setSaveTargetMode(m, defaultMagId = null) {
  state.settings.saveTargetMode = ['active', 'ask', 'specific'].includes(m) ? m : 'active'
  if (defaultMagId) state.settings.defaultMagazineId = defaultMagId
}


export function setWindowScaleMode(m) {
  state.settings.windowScaleMode = m === 'full' ? 'full' : 'quick'
  saveStateDebounced()
  if (window.pm && window.pm.setWindowScaleMode) {
    window.pm.setWindowScaleMode(state.settings.windowScaleMode)
  }
}

export function setHideTaskbar(hide) {
  state.settings.hideTaskbar = !!hide
  saveStateDebounced()
  if (window.pm && window.pm.setHideTaskbar) {
    window.pm.setHideTaskbar(state.settings.hideTaskbar)
  }
}

/* ---------------- 弹窗控制器 ---------------- */
export function openMagazinePicker(callback = null) {
  state.magazinePickerCallback = callback
  state.isMagazinePickerOpen = true
}

export function closeMagazinePicker() {
  state.isMagazinePickerOpen = false
  state.magazinePickerCallback = null
}

export function openRelayStartupModal(magId = null) {
  state.relayStartupTargetMagId = magId || state.activeMagazineId
  state.isRelayStartupModalOpen = true
}

export function closeRelayStartupModal() {
  state.isRelayStartupModalOpen = false
  state.relayStartupTargetMagId = null
}

export async function copyRelayStartupPrompt(magId = null, agentType = 'claude') {
  const mag = magId ? (state.magazines.find((m) => m.id === magId) || getActiveMagazine()) : getActiveMagazine()
  if (!mag) return ''

  // 关键：自动开启接力功能并立即同步最新任务文件落盘！
  if (!state.settings.relay) {
    state.settings.relay = true
  }
  syncTasksFile()

  const specificTasksPath = state.paths.magazinesDir
    ? `${state.paths.magazinesDir.replace(/\\/g, '/')}/${mag.id}/tasks.md`
    : (state.paths.tasksFile || '')

  const promptText = buildRelayStartupPrompt(mag, {
    tasksPath: specificTasksPath,
    locale: state.settings.locale,
    agentType,
    popMode: state.settings.popMode || 'shotgun'
  })
  await window.pm.copyText(promptText)
  toast(t('toast.copiedRelayStartupPrompt', { name: mag.name }))
  return promptText
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
      // 悬浮窗状态下（capsule 悬浮球或 quick 悬浮面板），不用显示提示，也不用专门展开显示提示
      if (state.settings.mode === 'full') {
        if (state.queue.length > 0) {
          toast(t('toast.magAllDone'))
        } else {
          toast(t('toast.magEmpty'))
        }
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
      // 关键：通知主进程将剪贴板内容直接粘贴到前台窗口光标处！
      if (window.pm && window.pm.pasteToForeground) {
        await window.pm.pasteToForeground(fgHwnd)
      }
      task.done = true
      const remaining = state.queue.filter((t) => !t.done).length
      const modeKey = mode === 'shotgun' ? 'settings.popModeShotgun' : mode === 'revolver' ? 'settings.popModeRevolver' : 'settings.popModePistol'
      toast(t('toast.poppedPrompt', { mode: t(modeKey), n: remaining }))
    } catch (e) {
      toast(t('toast.popFailed'))
    }
  })

  /* 快捷键 2：收录当前选中的文字/图片到收藏弹夹 */
  window.pm.onHotkeyCollected(({ ok, text, images }) => {
    const validImages = Array.isArray(images) ? images : []
    const hasText = !!(text && text.trim())
    const hasImages = validImages.length > 0

    if (ok && (hasText || hasImages)) {
      addSnippet(text, validImages)
      if (hasImages && hasText && !text.startsWith('[图')) {
        toast(currentLocale.value === 'en' ? 'Collected selected text & image to Favorites' : '已收录选中文本与图片到收藏弹夹')
      } else if (hasImages) {
        toast(currentLocale.value === 'en' ? 'Collected selected image to Favorites' : '已收录选中图片到收藏弹夹')
      } else {
        toast(t('toast.collectedSnippet'))
      }
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

  /* 快捷键：全局快速切换弹夹 */
  if (window.pm && window.pm.onCycleMagazine) {
    window.pm.onCycleMagazine((event, payload) => {
      const reverse = payload?.reverse || false
      cycleMagazine(reverse ? -1 : 1)
      const cur = getActiveMagazine()
      if (cur) toast(t('toast.magazineSwitched', { name: cur.name }))
    })
  }
}

export function setHotkeys(patch = {}) {
  const keys = ['toggle', 'pop', 'snippets', 'collect', 'cycleMag']
  const mapKey = {
    toggle: 'hotkeyToggle',
    pop: 'hotkeyPop',
    snippets: 'hotkeySnippets',
    collect: 'hotkeyCollect',
    cycleMag: 'hotkeyCycleMag'
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
    snippets: state.settings.hotkeySnippets || '',
    cycleMag: state.settings.hotkeyCycleMag || ''
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

/* 双向监听：CLI Agent 接力状态（认领 doing、完成 done、解决者/方案回写、写锁状态） */
export function bindExternalEvents() {
  window.pm.onTasksExternalChange(({ items, writeLock }) => {
    let hasStateChanges = false
    ;(items || []).forEach((it) => {
      if (!it.id) return
      // 更新当前活跃队列与对应弹夹
      const q = state.queue.find((t) => t.id === it.id)
      let foundInAnyMag = null
      for (const m of state.magazines) {
        const found = (m.queue || []).find((t) => t.id === it.id)
        if (found) {
          foundInAnyMag = found
          break
        }
      }
      const targetTask = q || foundInAnyMag
      if (targetTask) {
        const oldDone = !!targetTask.done
        const newDone = !!it.done || it.status === 'done'
        const oldStatus = targetTask.status
        const newStatus = it.status || (newDone ? 'done' : 'pending')

        if (oldDone !== newDone || oldStatus !== newStatus || targetTask.solver !== it.solver || targetTask.solution !== it.solution) {
          hasStateChanges = true
        }

        targetTask.done = newDone
        targetTask.status = newStatus
        if (it.agent) targetTask.agent = it.agent
        if (it.solver) targetTask.solver = it.solver
        if (it.solution) targetTask.solution = it.solution
        if (it.type) targetTask.type = it.type

        if (!oldDone && newDone) {
          const solverName = targetTask.solver || targetTask.agent || 'Agent'
          const sol = targetTask.solution ? ` (${targetTask.solution})` : ''
          toast(`Agent [${solverName}] 已完成任务：${(targetTask.text || '').slice(0, 18)}…${sol}`)
        } else if (oldStatus !== 'doing' && newStatus === 'doing') {
          const agentName = targetTask.agent || 'Agent'
          toast(`Agent [${agentName}] 已认领接力任务：${(targetTask.text || '').slice(0, 18)}…`)
        }
      }
    })

    if (hasStateChanges) {
      scheduleSave()
    }

    state.relayStatus = writeLock ? {
      isWriteLocked: true,
      lockedBy: writeLock.agent,
      taskId: writeLock.taskId
    } : {
      isWriteLocked: false,
      lockedBy: null,
      taskId: null
    }
  })

  if (window.pm.onQueueUpdated) {
    window.pm.onQueueUpdated(({ queue }) => {
      if (Array.isArray(queue)) {
        state.queue = queue
      }
    })
  }
}

/* ---------------- 图片操作（自动重编 [图N: 关键词] 标记） ---------------- */
function remapTokens(text, oldImages, newImages) {
  const newIndexOfItem = new Map(newImages.map((im, i) => [im, i + 1]))
  const updated = String(text || '').replace(/\[(?:图|Img|Image)\s*(\d+)(?:\s*[:：]\s*([^\]]*))?\]/gi, (m, n, note) => {
    const old = oldImages[Number(n) - 1]
    if (!old) return ''
    const next = newIndexOfItem.get(old)
    if (!next) return '' // 已删除图片的标记一并移除
    const prefix = /Img|Image/i.test(m) || currentLocale.value === 'en' ? 'Img ' : '图'
    const suffix = note !== undefined && note !== null && note.trim() ? ': ' + note.trim() : ''
    return '[' + prefix + next + suffix + ']'
  })
  const cleaned = updated.replace(/[ \t]{2,}/g, ' ')
  return cleaned.trim() === '' ? '' : cleaned
}

export function clearAllImages() {
  state.composer.images = []
  const cleaned = (state.composer.text || '')
    .replace(/\[(?:图|Img|Image)\s*\d+(?:\s*[:：]\s*[^\]]*)?\]/gi, '')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
  state.composer.text = cleaned
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
  if (idx < 0 || idx >= state.composer.images.length) return
  const old = state.composer.images.slice()
  state.composer.images.splice(idx, 1)
  const newText = remapTokens(state.composer.text, old, state.composer.images)
  state.composer.text = newText.trim() === '' ? '' : newText
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
export function pushComposerToQueue(targetMagId = null) {
  const c = state.composer
  if (!String(c.text).trim() && !c.images.length) return null
  const textStr = String(c.text)

  // 1. 如果处于编辑状态，执行更新原有任务（不删除，原地更新最新内容）
  if (state.editingTaskId) {
    const editId = state.editingTaskId
    let target = null
    let targetMag = null
    for (const m of state.magazines) {
      const found = (m.queue || []).find((t) => t.id === editId)
      if (found) {
        target = found
        targetMag = m
        break
      }
    }
    if (!target) {
      target = state.queue.find((t) => t.id === editId)
      targetMag = getActiveMagazine()
    }

    if (target) {
      target.text = textStr
      target.images = JSON.parse(JSON.stringify(c.images))
      target.type = inferTaskType(textStr)
      target.updatedAt = Date.now()

      // 保存完后自动把编译后的最新结构化 Prompt 写入系统剪贴板
      copyCompiled(target, { magazineId: targetMag ? targetMag.id : state.activeMagazineId }).catch(() => {})
      c.text = ''
      c.images = []
      state.editingTaskId = null
      toast(t('toast.promptUpdated'))
      return { task: target, targetMagazine: targetMag, isUpdate: true }
    }
    state.editingTaskId = null
  }

  // 2. 正常新增任务
  const isTargetFav = (targetMagId === 'favorites') || (state.activeMagazineId === 'favorites')
  const task = {
    id: uid(),
    text: textStr,
    images: JSON.parse(JSON.stringify(c.images)),
    createdAt: Date.now(),
    done: false,
    status: 'pending',
    type: inferTaskType(textStr),
    agent: '',
    solver: '',
    solution: '',
    favorite: isTargetFav
  }

  const targetId = targetMagId || (
    state.settings.saveTargetMode === 'specific' && state.settings.defaultMagazineId
      ? state.settings.defaultMagazineId
      : state.activeMagazineId
  )

  const targetMag = state.magazines.find((m) => m.id === targetId) || getActiveMagazine()
  if (targetMag) {
    targetMag.queue.push(task)
    if (targetMag.id === state.activeMagazineId && state.queue !== targetMag.queue) {
      state.queue = targetMag.queue
    }
  } else {
    state.queue.push(task)
  }

  // 保存完后自动把编译后的结构化 Prompt 写入系统剪贴板（附带项目弹夹任务文件）
  copyCompiled(task, { magazineId: targetMag ? targetMag.id : state.activeMagazineId }).catch(() => {})
  c.text = ''
  c.images = []
  return { task, targetMagazine: targetMag }
}

export function requestSaveComposer(onSelectDone = null) {
  const c = state.composer
  if (!String(c.text).trim() && !c.images.length) {
    toast(t('toast.pleaseInputOrImg'))
    return false
  }

  // 若处于编辑中，直接更新当前正在编辑的任务，无需选择弹夹
  if (state.editingTaskId) {
    const res = pushComposerToQueue()
    if (onSelectDone) onSelectDone(res)
    return true
  }

  if (state.settings.saveTargetMode === 'ask') {
    openMagazinePicker((selectedMagId, setAsDefault) => {
      if (setAsDefault) {
        state.settings.saveTargetMode = 'specific'
        state.settings.defaultMagazineId = selectedMagId
      }
      const res = pushComposerToQueue(selectedMagId)
      if (res && res.targetMagazine) {
        toast(t('toast.savedToMagazine', { name: res.targetMagazine.name }))
      }
      if (onSelectDone) onSelectDone(res)
    })
    return true
  }

  const res = pushComposerToQueue()
  if (res && res.targetMagazine) {
    toast(t('toast.savedAndCopied'))
  }
  if (onSelectDone) onSelectDone(res)
  return true
}

export function removeTask(id) {
  const i = state.queue.findIndex((t) => t.id === id)
  if (i > -1) {
    const [removed] = state.queue.splice(i, 1)
    // 若在收藏弹夹中删除，同步将其它弹夹对应任务取消收藏
    if (state.activeMagazineId === 'favorites') {
      state.magazines.forEach((m) => {
        if (m.id !== 'favorites') {
          const found = (m.queue || []).find((t) => t.id === id)
          if (found) found.favorite = false
        }
      })
      const favMag = state.magazines.find((m) => m.id === 'favorites')
      if (favMag) state.snippets = favMag.queue
    } else {
      // 若在普通弹夹删除，同时从收藏弹夹移出
      const favMag = state.magazines.find((m) => m.id === 'favorites')
      if (favMag) {
        const fIdx = favMag.queue.findIndex((t) => t.id === id)
        if (fIdx > -1) favMag.queue.splice(fIdx, 1)
        state.snippets = favMag.queue
      }
    }
    // 若被删除项未收藏，后台调度检查清理无引用图片
    if (removed && !removed.favorite && window.pm && window.pm.cleanupUnfavorited) {
      window.pm.cleanupUnfavorited('1d').catch(() => {})
    }
  }
}

/** 收藏 / 取消收藏提示词（收藏时在收藏弹夹独立创建副本与图片，两者完全独立互不影响） */
export async function toggleFavorite(id) {
  let target = null
  let sourceMag = null
  for (const m of state.magazines) {
    const found = (m.queue || []).find((t) => t.id === id)
    if (found) {
      target = found
      sourceMag = m
      break
    }
  }
  if (!target) return

  // 收藏弹夹中不允许取消收藏（通过删除按钮直接删除）
  if (sourceMag && sourceMag.id === 'favorites') return

  target.favorite = !target.favorite
  const isFav = target.favorite

  const favMag = state.magazines.find((m) => m.id === 'favorites')
  if (isFav) {
    // 独立在收藏弹夹创建一个一模一样的提示词+图片副本（解耦互不影响）
    let clonedTask = null
    if (window.pm && window.pm.toggleFavorite) {
      try {
        const res = await window.pm.toggleFavorite(toRaw(target))
        if (res && res.ok && res.favorite) {
          clonedTask = res.favorite
        }
      } catch (err) {
        console.error('toggleFavorite IPC error:', err)
      }
    }
    if (!clonedTask) {
      clonedTask = {
        ...toRaw(target),
        id: uid(),
        originTaskId: target.id,
        favorite: true,
        favoritedAt: Date.now(),
        images: JSON.parse(JSON.stringify(target.images || []))
      }
    }
    target.favoritedId = clonedTask.id
    if (favMag) {
      if (!favMag.queue.some((t) => t.id === clonedTask.id)) {
        favMag.queue.unshift(clonedTask)
      }
      state.snippets = favMag.queue
    }
    toast(t('toast.favorited'))
  } else {
    // 在源弹夹取消收藏，若收藏弹夹存在对应副本则同步移除
    if (window.pm && window.pm.toggleFavorite) {
      try {
        await window.pm.toggleFavorite(toRaw(target))
      } catch { /* ignore */ }
    }
    if (favMag) {
      const fIdx = favMag.queue.findIndex((t) => t.id === target.favoritedId || t.originTaskId === target.id)
      if (fIdx > -1) {
        favMag.queue.splice(fIdx, 1)
      }
      state.snippets = favMag.queue
    }
    target.favoritedId = null
    toast(t('toast.unfavorited'))
  }
  saveStateDebounced()
}

/** 获取特定弹夹的自动清理规则（收藏弹夹恒为 'off' 保护） */
export function getMagazineAutoCleanup(magId) {
  if (!magId || magId === 'favorites') return 'off'
  const mag = state.magazines.find((m) => m.id === magId)
  if (mag && mag.autoCleanup) return mag.autoCleanup
  if (state.settings.magazineAutoCleanup && state.settings.magazineAutoCleanup[magId]) {
    return state.settings.magazineAutoCleanup[magId]
  }
  return state.settings.autoCleanup || 'off'
}

/** 设置特定弹夹的自动清理规则（收藏弹夹受系统保护不可设置） */
export function setMagazineAutoCleanup(magId, val) {
  if (!magId || magId === 'favorites') return
  const rule = ['off', 'done_only', '1d', '3d', '7d', '30d'].includes(val) ? val : 'off'
  const mag = state.magazines.find((m) => m.id === magId)
  if (mag) {
    mag.autoCleanup = rule
  }
  if (!state.settings.magazineAutoCleanup) {
    state.settings.magazineAutoCleanup = {}
  }
  state.settings.magazineAutoCleanup[magId] = rule
  if (magId === state.activeMagazineId) {
    state.settings.autoCleanup = rule
  }
  const modeKey = rule === 'off' ? 'settings.autoCleanupOff' : `settings.autoCleanup_${rule}`
  toast(t('toast.autoCleanupChanged', { mode: t(modeKey) }))
}

/** 定时/手动清理未收藏且已使用（或未使用）的提示词及其图片（收藏弹夹永久免清理） */
export async function cleanupUnfavorited(criteria = 'used', targetMagId = null) {
  const targetId = targetMagId || state.activeMagazineId
  if (targetId === 'favorites') {
    toast(t('toast.favoritesProtectedNotice'))
    return { ok: true, isFavoritesProtected: true, deletedPrompts: 0, deletedImages: 0 }
  }
  const crit = criteria || getMagazineAutoCleanup(targetId) || 'used'
  if (crit === 'off') {
    return { ok: true, deletedPrompts: 0, deletedImages: 0 }
  }

  if (window.pm && window.pm.cleanupUnfavorited) {
    const res = await window.pm.cleanupUnfavorited(crit, targetId)
    if (res && res.ok) {
      const now = Date.now()
      const targetMag = state.magazines.find((m) => m.id === targetId)
      const filterQueue = (q) => (q || []).filter((t) => {
        if (t.favorite) return true
        if (crit === 'unused' || crit === 'unfavorite_and_unused') return !!t.done
        if (crit === 'all') return false
        if (crit === 'done_only' || crit === 'done' || crit === 'used' || crit === 'unfavorite_and_used') return !t.done
        if (crit === '1d') return (now - (t.createdAt || 0)) <= 24 * 3600 * 1000
        if (crit === '3d') return (now - (t.createdAt || 0)) <= 3 * 24 * 3600 * 1000
        if (crit === '7d') return (now - (t.createdAt || 0)) <= 7 * 24 * 3600 * 1000
        if (crit === '30d') return (now - (t.createdAt || 0)) <= 30 * 24 * 3600 * 1000
        return true
      })
      if (targetMag) {
        targetMag.queue = filterQueue(targetMag.queue)
        if (state.activeMagazineId === targetId) {
          state.queue = targetMag.queue
        }
      } else {
        state.queue = filterQueue(state.queue)
      }
      toast(t('toast.cleanedUnfavorited', { count: res.deletedPrompts, imgCount: res.deletedImages }))
      return res
    }
  }
}

export function setAutoCleanupSetting(val) {
  setMagazineAutoCleanup(state.activeMagazineId, val)
}

export function startEditingTask(id) {
  let target = null
  for (const m of state.magazines) {
    const found = (m.queue || []).find((t) => t.id === id)
    if (found) {
      target = found
      break
    }
  }
  if (!target) target = state.queue.find((t) => t.id === id)
  if (!target) return
  state.editingTaskId = target.id
  state.composer.text = String(target.text || '')
  state.composer.images = JSON.parse(JSON.stringify(target.images || []))
  toast(t('toast.editingStarted'))
}

export function cancelEditingTask() {
  state.editingTaskId = null
  state.composer.text = ''
  state.composer.images = []
  toast(t('toast.editCancelled'))
}

export function editBackfill(id) {
  startEditingTask(id)
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
  const curMag = getActiveMagazine()
  if (curMag) curMag.queue = state.queue
}

export async function clearAllQueue() {
  const curMag = getActiveMagazine()
  const targetMagId = curMag ? curMag.id : state.activeMagazineId
  // 先通知底层彻底清理本弹夹未收藏提示词及非保护图片
  if (window.pm && window.pm.cleanupUnfavorited && targetMagId !== 'favorites') {
    try {
      await window.pm.cleanupUnfavorited('all', targetMagId)
    } catch { /* ignore */ }
  }
  state.queue = []
  if (curMag) {
    curMag.queue = []
    if (curMag.id === 'favorites') {
      state.magazines.forEach((m) => {
        if (m.id !== 'favorites') {
          (m.queue || []).forEach((t) => { t.favorite = false })
        }
      })
      state.snippets = []
    }
  }
}

export async function copyCompiled(task, { pop = false, magazineId = null } = {}) {
  const mag = magazineId ? state.magazines.find((m) => m.id === magazineId) : getActiveMagazine()
  const magId = mag ? mag.id : state.activeMagazineId
  const magName = mag ? mag.name : ''
  const specificTasksPath = state.paths.magazinesDir
    ? `${state.paths.magazinesDir.replace(/\\/g, '/')}/${magId}/tasks.md`
    : (state.paths.tasksFile || '')

  const text = compilePrompt(task, {
    tasksPath: specificTasksPath,
    relay: state.settings.relay,
    locale: state.settings.locale,
    magazineId: magId,
    magazineName: magName
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
  if (mode === 'capsule') {
    state.toast = ''
  }
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

/* ---------------- 收藏弹夹提示词 (替代旧版独立词库) ---------------- */
export function addSnippet(text, images = []) {
  const t = String(text || '').trim()
  const validImages = Array.isArray(images) ? images : []
  if (!t && !validImages.length) return
  const favMag = state.magazines.find((m) => m.id === 'favorites')
  const item = {
    id: uid(),
    text: t || (validImages.length === 1 ? '[图1]' : validImages.map((_, i) => `[图${i + 1}]`).join(' ')),
    images: validImages,
    createdAt: Date.now(),
    done: false,
    status: 'pending',
    type: inferTaskType(t),
    agent: '',
    solver: '',
    solution: '',
    favorite: true
  }
  if (favMag) {
    favMag.queue.unshift(item)
    state.snippets = favMag.queue
  } else {
    state.snippets.unshift(item)
  }
}

export function removeSnippet(id) {
  const favMag = state.magazines.find((m) => m.id === 'favorites')
  if (favMag) {
    const i = favMag.queue.findIndex((s) => s.id === id)
    if (i > -1) favMag.queue.splice(i, 1)
    state.snippets = favMag.queue
  } else {
    const i = state.snippets.findIndex((s) => s.id === id)
    if (i > -1) state.snippets.splice(i, 1)
  }
}

export function getFavoritesList() {
  const favMag = state.magazines.find((m) => m.id === 'favorites')
  return favMag ? favMag.queue : state.snippets
}

/* ---------------- 版本更新检测 ---------------- */
/**
 * 语义化版本号比较 (例如 '1.9.9' vs '1.9.9')
 * 返回 1 (v1 > v2), -1 (v1 < v2), 0 (v1 == v2)
 */
export function compareVersions(v1, v2) {
  if (!v1 && !v2) return 0
  if (!v1) return -1
  if (!v2) return 1
  const clean = (v) => String(v).trim().replace(/^[^\d]*/, '')
  const parts1 = clean(v1).split(/[.-]/).map((n) => parseInt(n, 10) || 0)
  const parts2 = clean(v2).split(/[.-]/).map((n) => parseInt(n, 10) || 0)
  const len = Math.max(parts1.length, parts2.length)
  for (let i = 0; i < len; i++) {
    const p1 = parts1[i] !== undefined ? parts1[i] : 0
    const p2 = parts2[i] !== undefined ? parts2[i] : 0
    if (p1 > p2) return 1
    if (p1 < p2) return -1
  }
  return 0
}

/**
 * 检查 GitHub Releases 最新版本
 * @param {boolean} manual 是否为用户手动点击检查更新
 */
export async function checkForUpdates(manual = false) {
  if (state.updateStatus.checking) return
  state.updateStatus.checking = true
  state.updateStatus.error = null

  if (manual) {
    toast(t('updateModal.checkingToast'))
  }

  try {
    let res
    if (window.pm && window.pm.checkUpdate) {
      res = await window.pm.checkUpdate()
    } else {
      const r = await fetch('https://api.github.com/repos/HaiLanDuJun/PromptMag/releases/latest', {
        headers: { 'Accept': 'application/vnd.github.v3+json' }
      })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const d = await r.json()
      res = {
        ok: true,
        data: {
          tagName: d.tag_name,
          version: (d.tag_name || '').replace(/^v/i, ''),
          name: d.name,
          body: d.body,
          htmlUrl: d.html_url,
          publishedAt: d.published_at,
          assets: (d.assets || []).map((a) => ({ name: a.name, downloadUrl: a.browser_download_url, size: a.size }))
        }
      }
    }

    if (!res || !res.ok || !res.data) {
      throw new Error(res?.error || 'Failed to fetch release info')
    }

    const latest = res.data
    const current = state.version || '1.9.16'
    const isNewer = compareVersions(latest.version, current) > 0

    state.updateStatus.checked = true
    state.updateStatus.hasUpdate = isNewer
    state.updateStatus.info = latest

    if (isNewer) {
      const isIgnored = state.settings.ignoredVersion && state.settings.ignoredVersion === latest.version
      if (manual || !isIgnored) {
        state.isUpdateModalOpen = true
        if (state.settings.mode === 'capsule') {
          setMode('full')
        }
      }
    } else {
      if (manual) {
        toast(t('updateModal.upToDateToast', { version: current }))
      }
    }
  } catch (err) {
    console.error('[PromptMag] Check update failed:', err)
    state.updateStatus.error = err && err.message ? err.message : String(err)
    if (manual) {
      toast(t('updateModal.checkFailedToast'))
    }
  } finally {
    state.updateStatus.checking = false
  }
}

/**
 * 忽略当前新版本（不再弹窗提醒）
 */
export function ignoreUpdateVersion(ver) {
  const versionToIgnore = ver || state.updateStatus.info?.version
  if (versionToIgnore) {
    state.settings.ignoredVersion = versionToIgnore
    toast(t('updateModal.ignoredToast', { version: versionToIgnore }))
  }
  state.isUpdateModalOpen = false
}

/**
 * 取消忽略版本更新
 */
export function unignoreUpdateVersion() {
  const oldIgnored = state.settings.ignoredVersion
  state.settings.ignoredVersion = ''
  if (oldIgnored) {
    toast(t('updateModal.unignoredToast', { version: oldIgnored }))
  }
  if (state.updateStatus.hasUpdate) {
    state.isUpdateModalOpen = true
  }
}

/**
 * 打开外部更新链接或安装包下载
 */
/**
 * 打开外部更新链接或安装包下载（默认跳转官网 https://promptmag.dev/）
 */
export function openUpdateUrl(url) {
  const targetUrl = url || 'https://promptmag.dev/'
  if (window.pm && window.pm.openExternal) {
    window.pm.openExternal(targetUrl)
  } else {
    window.open(targetUrl, '_blank')
  }
}

/**
 * 打开 GitHub Release 发行版详情页面
 */
export function openReleaseNotesUrl(url) {
  const targetUrl = url || state.updateStatus.info?.htmlUrl || 'https://github.com/HaiLanDuJun/PromptMag/releases/latest'
  if (window.pm && window.pm.openExternal) {
    window.pm.openExternal(targetUrl)
  } else {
    window.open(targetUrl, '_blank')
  }


}

export function openUpdateModal() {
  state.isUpdateModalOpen = true
  if (state.settings.mode === 'capsule') {
    setMode('full')
  }
}

export function closeUpdateModal() {
  state.isUpdateModalOpen = false
}

export { t, currentLocale } from './i18n.js'


/** 匹配键盘事件与 Accelerator 字符串（如 'Ctrl+Tab', 'Ctrl+M', 'Alt+M'） */
export function matchAccelerator(e, acc) {
  if (!acc || typeof acc !== 'string') return false
  const parts = acc.split('+').map((p) => p.trim())
  const key = parts[parts.length - 1]
  const hasCtrl = parts.includes('Ctrl')
  const hasAlt = parts.includes('Alt')
  const hasShift = parts.includes('Shift')
  const hasMeta = parts.includes('Meta') || parts.includes('Cmd')

  if (!!(e.ctrlKey || e.metaKey) !== (hasCtrl || hasMeta)) return false
  if (!!e.altKey !== hasAlt) return false
  if (!!e.shiftKey !== hasShift) return false

  if (/^[A-Za-z]$/.test(key)) {
    return (e.key && e.key.toUpperCase() === key.toUpperCase()) || (e.code === ('Key' + key.toUpperCase()))
  }
  if (/^\d$/.test(key)) {
    return e.key === key || e.code === ('Digit' + key)
  }
  if (key === 'Tab') return e.key === 'Tab' || e.code === 'Tab'
  if (key === 'Space') return e.key === ' ' || e.code === 'Space'
  return e.key && e.key.toLowerCase() === key.toLowerCase()
}
