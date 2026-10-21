/**
 * PromptMag - Electron 主进程
 * 职责：
 *  1. 无边框置顶悬浮窗 + Alt+Q 全局呼出/隐藏
 *  2. 剪贴板图片拦截落盘到 ~/.prompt-mag/images/
 *  3. data.json 状态持久化 + next_tasks.md 实时同步与 fs.watch 双向监听
 */
const {
  app,
  BrowserWindow,
  ipcMain,
  clipboard,
  globalShortcut,
  Tray,
  Menu,
  nativeImage,
  shell,
  protocol,
  net,
  dialog,
  screen
} = require('electron')
const path = require('node:path')
const fs = require('node:fs')
const os = require('node:os')
const zlib = require('node:zlib')
const { spawn, execFileSync } = require('node:child_process')
const { pathToFileURL } = require('node:url')

// pmimg:// 本地图片协议需在 app ready 前注册特权（standard + fetch 支持）
protocol.registerSchemesAsPrivileged([
  { scheme: 'pmimg', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }
])

/* ------------------------------------------------------------------ */
/* 路径常量（数据目录可在应用内更改，配置存于 %APPDATA%/prompt-mag）      */
/* ------------------------------------------------------------------ */
const CONFIG_DIR = path.join(process.env.APPDATA || os.homedir(), 'prompt-mag')
const CONFIG_FILE = path.join(CONFIG_DIR, 'app-config.json')

/** 解析数据目录：优先用户自定义，默认 ~/.prompt-mag */
function resolveDataDir() {
  try {
    const cfg = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'))
    if (cfg && typeof cfg.dataDir === 'string' && cfg.dataDir.trim()) {
      return path.resolve(cfg.dataDir)
    }
  } catch { /* 无配置或损坏，用默认 */ }
  return path.join(os.homedir(), '.prompt-mag')
}

const P = { home: resolveDataDir() }
P.images = path.join(P.home, 'images')
P.dataFile = path.join(P.home, 'data.json')
P.tasksFile = path.join(P.home, 'next_tasks.md')
P.favorites = path.join(P.home, 'favorites')
P.favImages = path.join(P.favorites, 'images')
P.favDataFile = path.join(P.favorites, 'favorites.json')
P.magazinesDir = path.join(P.home, 'magazines')
P.logFile = path.join(P.home, 'main.log')
P.windowState = path.join(P.home, 'window-state.json')

/* 可自定义全局快捷键（设置面板可改，每个功能至多1个，也可置空禁用，存于 data.json settings） */
const HOTKEY_DEFAULTS = {
  toggle: 'Alt+Q',
  pop: 'Alt+V',
  snippets: 'Alt+X',
  collect: 'Alt+T',
  cycleMag: 'Ctrl+Tab'
}
let customHotkeys = { ...HOTKEY_DEFAULTS }
let currentlyRegisteredHotkeys = new Set()

/* 开发服务端口（与 vite.config.js 保持一致），不再使用 5173 */
const DEV_PORT = Number(process.env.PM_DEV_PORT) || 5199

/* 三种形态尺寸 */
const BALL = { width: 56, height: 56 }      // 收起形态：玻璃圆球/悬浮图标
const QUICK = { width: 440, height: 195 }
const FULL_DEFAULT = { width: 420, height: 560 }
const FULL_MIN = { width: 360, height: 460 }
/* 边缘吸附：离边小于该距离且窗口失焦时，半缩进屏幕边缘 */
const EDGE_THRESHOLD = 90
const TUCK_DELAY = 350

const isDev = !app.isPackaged

// GPU 进程在本机会 Access Violation，用 in-process-gpu 规避独立 GPU 进程崩溃。
// 注意：不能用 disableHardwareAcceleration / disable-gpu ——
// Windows 上软件渲染会导致 transparent 透明窗口完全不可见（Electron 已知问题）。
app.commandLine.appendSwitch('in-process-gpu')

/* ---------------- 诊断日志（高精度北京时间 UTC+8） ---------------- */
function getBeijingTimeString(d = new Date()) {
  const utc = d.getTime() + (d.getTimezoneOffset() * 60000)
  const bj = new Date(utc + (8 * 3600000))
  const pad = (n, len = 2) => String(n).padStart(len, '0')
  return `${pad(bj.getFullYear(), 4)}-${pad(bj.getMonth() + 1)}-${pad(bj.getDate())} ${pad(bj.getHours())}:${pad(bj.getMinutes())}:${pad(bj.getSeconds())}.${pad(bj.getMilliseconds(), 3)}`
}

function formatLogArg(arg) {
  if (arg === null) return 'null'
  if (arg === undefined) return 'undefined'
  if (arg instanceof Error) return arg.stack || `${arg.name}: ${arg.message}`
  if (typeof arg === 'object') {
    try {
      return JSON.stringify(arg)
    } catch {
      return String(arg)
    }
  }
  return String(arg)
}

function log(...args) {
  try {
    ensureDirs()
    try {
      if (fs.existsSync(P.logFile)) {
        const stat = fs.statSync(P.logFile)
        if (stat.size > 5 * 1024 * 1024) {
          const oldLogFile = path.join(P.home, 'main.log.old')
          try { if (fs.existsSync(oldLogFile)) fs.unlinkSync(oldLogFile) } catch {}
          fs.renameSync(P.logFile, oldLogFile)
        }
      }
    } catch { /* ignore */ }

    const timeStr = getBeijingTimeString()
    const msg = args.map(formatLogArg).join(' ')
    fs.appendFileSync(P.logFile, `[${timeStr}] ${msg}\n`, 'utf8')
    if (isDev) {
      console.log(`[${timeStr}]`, ...args)
    }
  } catch { /* ignore */ }
}

log('================================================================================')
log('=== PromptMag 应用程序启动 ===')
log('[Init] 版本号:', app.getVersion(), '| 打包状态:', app.isPackaged)
log('[Init] 系统平台:', process.platform, process.arch, os.release())
log('[Init] Node 版本:', process.versions.node, '| Electron 版本:', process.versions.electron, '| Chrome 版本:', process.versions.chrome)
log('[Init] 可执行文件路径:', process.execPath)
log('[Init] 数据目录 (P.home):', P.home)
log('[Init] 诊断日志 (P.logFile):', P.logFile)
log('================================================================================')

let mainWindow = null
let snippetWindow = null
let tray = null
let tasksWatcher = null
let watchTimer = null
let lastWrittenFileMap = new Map() // filePath (normalized) -> string content
let lastExternalHwnd = '0'

function getPasteHelperPath() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'app.asar.unpacked', 'electron', 'bin', 'paste-helper.exe')
    : path.join(__dirname, 'bin', 'paste-helper.exe')
}

function getWindowHwndStrings(win) {
  if (!win || win.isDestroyed()) return []
  try {
    const buf = win.getNativeWindowHandle()
    const set = new Set()
    if (buf.length >= 8) {
      set.add(buf.readBigInt64LE(0).toString())
      set.add(buf.readBigUInt64LE(0).toString())
    }
    if (buf.length >= 4) {
      set.add(buf.readInt32LE(0).toString())
      set.add(buf.readUInt32LE(0).toString())
    }
    return Array.from(set)
  } catch {
    return []
  }
}

function isPromptMagHwnd(hwndStr) {
  if (!hwndStr || hwndStr === '0') return false
  const s = String(hwndStr).trim()
  const allHwnds = new Set([
    ...getWindowHwndStrings(mainWindow),
    ...getWindowHwndStrings(snippetWindow)
  ])
  return allHwnds.has(s)
}

function updateLastExternalHwnd(hwnd) {
  if (hwnd && hwnd !== '0' && !isPromptMagHwnd(hwnd)) {
    lastExternalHwnd = String(hwnd).trim()
  }
}

function normFilePath(p) {
  return p ? path.resolve(p).toLowerCase() : ''
}
let quitting = false
let imgSeq = 0
/* 形态状态：capsule(胶囊) / quick(快捷输入) / full(完整) */
let mode = 'full'
let animating = false
let fullSize = { ...FULL_DEFAULT }
/* 边缘吸附状态 */
let tucked = false
let tuckHome = null
let tuckTimer = null

/* 置顶状态（主进程持有权威值，任何 show/focus/模式切换都会重新断言一次，
   避免被后来的窗口抢走 Z 序） */
let alwaysOnTop = true

/* ------------------------------------------------------------------ */
/* 工具函数                                                            */
/* ------------------------------------------------------------------ */
function ensureDirs() {
  fs.mkdirSync(P.home, { recursive: true })
  fs.mkdirSync(P.images, { recursive: true })
  fs.mkdirSync(P.favorites, { recursive: true })
  fs.mkdirSync(P.favImages, { recursive: true })
  fs.mkdirSync(P.magazinesDir, { recursive: true })
}

function readJsonSafe(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return null
  }
}

function writeJsonAtomic(file, obj) {
  ensureDirs()
  const tmp = file + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2), 'utf8')
  fs.renameSync(tmp, file)
}

function uniqueImagePath(ext = '.png') {
  ensureDirs()
  const ts = Date.now()
  let p
  do {
    imgSeq += 1
    p = path.join(P.images, `img_${ts}_${String(imgSeq).padStart(2, '0')}${ext}`)
  } while (fs.existsSync(p))
  return p
}

/** 从剪贴板读取被复制的本地文件路径（资源管理器复制文件场景） */
function readClipboardFilePaths() {
  const out = []
  const pushUris = (s) => {
    s.split(/\r?\n/).forEach((line) => {
      const t = line.trim()
      if (!t) return
      if (t.startsWith('file://')) {
        try {
          const u = new URL(t)
          out.push(decodeURIComponent(u.pathname).replace(/^\//, '').replace(/\//g, path.sep))
        } catch { /* ignore */ }
      } else if (fs.existsSync(t)) {
        out.push(t)
      }
    })
  }
  try {
    const b = clipboard.readBuffer('text/uri-list')
    if (b && b.length) pushUris(b.toString('utf8'))
  } catch { /* ignore */ }
  try {
    const w = clipboard.readBuffer('FileNameW')
    if (w && w.length) {
      w.toString('utf16le').split('\0').filter(Boolean).forEach((x) => {
        if (fs.existsSync(x)) out.push(x)
      })
    }
  } catch { /* ignore */ }
  return [...new Set(out)]
}

/** 保存剪贴板图片（截图 or 复制的图片文件）到 images 目录 */
function saveClipboardImages() {
  const results = []
  try {
    const img = clipboard.readImage()
    if (img && !img.isEmpty()) {
      ensureDirs()
      const p = uniqueImagePath('.png')
      fs.writeFileSync(p, img.toPNG())
      results.push({ path: p, name: path.basename(p) })
      return { ok: true, images: results }
    }
    for (const f of readClipboardFilePaths()) {
      if (!/\.(png|jpe?g|gif|webp|bmp)$/i.test(f)) continue
      if (!fs.existsSync(f)) continue
      ensureDirs()
      const dest = uniqueImagePath(path.extname(f).toLowerCase())
      fs.copyFileSync(f, dest)
      results.push({ path: dest, name: path.basename(dest) })
    }
  } catch (e) {
    return { ok: false, error: String(e && e.message ? e.message : e) }
  }
  if (!results.length) return { ok: false, error: '剪贴板中未找到图片' }
  return { ok: true, images: results }
}

/* --------------------------- next_tasks.md & 多Agent接力 -------------------------- */
let currentRevision = 1
let sweepTimer = null
let autoCleanupTimer = null

/** 解析任务内容（三态机 + 机器注释 + 解决历史容错） */
function parseTasksContent(content) {
  const items = []
  const lines = String(content || '').split(/\r?\n/)
  let currentItem = null

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i]
    const m = rawLine.match(/^\s*-\s*\[([ xX✓vV~/\-])\]\s*(.+)$/)
    if (m) {
      const symbol = m[1]
      const body = m[2]
      const done = ['x', 'X', '✓', 'v', 'V'].includes(symbol)
      const doing = ['~', '/', '-'].includes(symbol)
      let status = done ? 'done' : (doing ? 'doing' : 'pending')

      const idm = body.match(/<!--\s*pm:([A-Za-z0-9_-]+)(.*?)\s*-->/)
      let id = idm ? idm[1] : null
      let agent = ''
      let taskType = 'write'
      let heartbeat = null
      let doneAt = null

      if (idm && idm[2]) {
        const metaStr = idm[2]
        const stMatch = metaStr.match(/\bst:(pending|doing|done)\b/)
        if (stMatch) status = stMatch[1]
        const agentMatch = metaStr.match(/\bagent:([^\s>]+)/)
        if (agentMatch) agent = agentMatch[1]
        const typeMatch = metaStr.match(/\btype:(write|read)\b/)
        if (typeMatch) taskType = typeMatch[1]
        const hbMatch = metaStr.match(/\bhb:(\d+)/)
        if (hbMatch) heartbeat = Number(hbMatch[1])
        const doneAtMatch = metaStr.match(/\bdoneAt:(\d+)/)
        if (doneAtMatch) doneAt = Number(doneAtMatch[1])
      }

      // 关键防护：以实际复选框标记为最终权威判定
      if (done) status = 'done'
      else if (doing && status !== 'done') status = 'doing'

      const text = body.replace(/<!--\s*pm:[A-Za-z0-9_-]+.*?\s*-->/, '').trim()
      currentItem = {
        line: i,
        id,
        done: status === 'done' || done,
        status,
        type: taskType,
        agent,
        solver: status === 'done' ? agent : '',
        solution: '',
        heartbeat,
        doneAt,
        text
      }
      items.push(currentItem)
      continue
    }

    if (currentItem) {
      const solMatch = rawLine.match(/^\s*>\s*(?:解决者|Solved by)\s*:\s*([^|]+)\|\s*(?:解决方案|Resolution)\s*:\s*(.+)$/i)
      if (solMatch) {
        currentItem.solver = solMatch[1].trim()
        currentItem.solution = solMatch[2].trim()
        currentItem.status = 'done'
        currentItem.done = true
        continue
      }
      const claimMatch = rawLine.match(/^\s*>\s*(?:认领者|Claimed by)\s*:\s*([^|]+)/i)
      if (claimMatch && currentItem.status !== 'done') {
        currentItem.agent = claimMatch[1].trim()
        currentItem.status = 'doing'
        continue
      }
    }
  }

  return items
}

function parseTasksMetadata(content) {
  const m = String(content || '').match(/<!--pm:rev:(\d+)(.*?)\s*-->/)
  if (!m) return { revision: 1, activeLock: null }
  const rev = Number(m[1]) || 1
  const lockMatch = m[2].match(/\bactiveLock:([^\s>]+)/)
  return { revision: rev, activeLock: lockMatch ? lockMatch[1] : null }
}

function getActiveWriteLock(items) {
  const active = (items || []).find((it) => it.status === 'doing' && it.type === 'write')
  if (!active) return null
  return {
    taskId: active.id,
    agent: active.agent || 'Agent',
    heartbeat: active.heartbeat || null
  }
}

function broadcastTasksState() {
  if (!mainWindow || mainWindow.isDestroyed()) return
  ensureDirs()

  const filesToCheck = []
  if (fs.existsSync(P.tasksFile)) {
    filesToCheck.push({ file: P.tasksFile, magazineId: null })
  }

  if (fs.existsSync(P.magazinesDir)) {
    try {
      const entries = fs.readdirSync(P.magazinesDir, { withFileTypes: true })
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const magTasksFile = path.join(P.magazinesDir, entry.name, 'tasks.md')
          if (fs.existsSync(magTasksFile)) {
            filesToCheck.push({ file: magTasksFile, magazineId: entry.name })
          }
        }
      }
    } catch (err) {
      log('scan magazines tasks error:', err && err.message)
    }
  }

  let anyExternalChange = false
  const allChangedItems = []
  let activeWriteLock = null

  for (const { file, magazineId } of filesToCheck) {
    try {
      const norm = normFilePath(file)
      const content = fs.readFileSync(file, 'utf8')
      const last = lastWrittenFileMap.get(norm)

      // 自身写入触发的变更，忽略
      if (last !== undefined && content === last) {
        continue
      }

      // 外部发生改动！
      lastWrittenFileMap.set(norm, content)
      anyExternalChange = true

      const items = parseTasksContent(content)
      const meta = parseTasksMetadata(content)
      const lock = getActiveWriteLock(items)
      if (lock) activeWriteLock = lock
      currentRevision = meta.revision || currentRevision

      for (const it of items) {
        allChangedItems.push({ ...it, magazineId })
      }
    } catch (err) {
      log('broadcastTasksState read error for', file, err && err.message)
    }
  }

  if (anyExternalChange && allChangedItems.length > 0) {
    mainWindow.webContents.send('pm:tasks-external', {
      exists: true,
      items: allChangedItems,
      revision: currentRevision,
      writeLock: activeWriteLock
    })
  }
}

function scheduleTasksCheck() {
  clearTimeout(watchTimer)
  watchTimer = setTimeout(broadcastTasksState, 120)
}

/**
 * 监听整个主数据目录，彻底根治单个文件被原子删除替换后 fs.watch 永久失明的问题
 */
function startTasksWatch() {
  if (tasksWatcher) return
  ensureDirs()
  if (!fs.existsSync(P.tasksFile)) {
    try {
      fs.writeFileSync(P.tasksFile, '', 'utf8')
    } catch { /* ignore */ }
  }
  try {
    if (fs.existsSync(P.tasksFile)) {
      lastWrittenFileMap.set(normFilePath(P.tasksFile), fs.readFileSync(P.tasksFile, 'utf8'))
    }
    if (fs.existsSync(P.magazinesDir)) {
      const entries = fs.readdirSync(P.magazinesDir, { withFileTypes: true })
      for (const ent of entries) {
        if (ent.isDirectory()) {
          const mFile = path.join(P.magazinesDir, ent.name, 'tasks.md')
          if (fs.existsSync(mFile)) {
            lastWrittenFileMap.set(normFilePath(mFile), fs.readFileSync(mFile, 'utf8'))
          }
        }
      }
    }
  } catch { /* ignore */ }

  try {
    tasksWatcher = fs.watch(P.home, { persistent: true, recursive: true }, (eventType, filename) => {
      if (!filename || filename === 'next_tasks.md' || filename.endsWith('.md')) {
        scheduleTasksCheck()
      }
    })
    tasksWatcher.on('error', (err) => {
      log('tasks directory watcher error:', err && err.message)
      try { tasksWatcher.close() } catch { /* ignore */ }
      tasksWatcher = null
      setTimeout(startTasksWatch, 1500)
    })
    tasksWatcher.on('close', () => {
      tasksWatcher = null
      setTimeout(startTasksWatch, 1500)
    })
  } catch (err) {
    log('failed to watch directory:', err && err.message)
    tasksWatcher = null
    setTimeout(startTasksWatch, 1500)
  }
}

/** 写入单个任务文件（带 Windows 占用重试） */
function writeSingleTaskFile(targetPath, content) {
  const targetDir = path.dirname(targetPath)
  try { fs.mkdirSync(targetDir, { recursive: true }) } catch { /* ignore */ }
  const tmpFile = path.join(targetDir, `.tasks_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.tmp`)
  fs.writeFileSync(tmpFile, content, 'utf8')

  let success = false
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      if (fs.existsSync(targetPath)) {
        try { fs.unlinkSync(targetPath) } catch { /* ignore */ }
      }
      fs.renameSync(tmpFile, targetPath)
      success = true
      break
    } catch {
      const end = Date.now() + 25 * (attempt + 1)
      while (Date.now() < end) {}
    }
  }

  if (!success) {
    try {
      fs.copyFileSync(tmpFile, targetPath)
      fs.unlinkSync(tmpFile)
      success = true
    } catch (e) {
      log('atomic write single file failed:', targetPath, e && e.message)
      return false
    }
  }
  return true
}

/** 原子写入任务队列文件（带乐观锁修订号与多弹夹独立同步） */
function writeTasksAtomic(content, options = {}) {
  ensureDirs()
  currentRevision += 1
  let finalContent = String(content || '')

  if (!finalContent.includes('<!--pm:rev:')) {
    finalContent = `<!--pm:rev:${currentRevision} updated:${new Date().toISOString()}-->\n` + finalContent
  } else {
    finalContent = finalContent.replace(/<!--pm:rev:\d+(.*?)\s*-->/, `<!--pm:rev:${currentRevision} updated:${new Date().toISOString()}$1-->`)
  }

  // 1. 同步写入全局镜像 P.tasksFile (~/.prompt-mag/next_tasks.md)
  if (!options || !options.skipGlobal) {
    lastWrittenFileMap.set(normFilePath(P.tasksFile), finalContent)
    writeSingleTaskFile(P.tasksFile, finalContent)
  }

  // 2. 若传入特定弹夹 magazineId，同步写入专属弹夹任务文件 (~/.prompt-mag/magazines/<id>/tasks.md)
  if (options && options.magazineId) {
    const magTasksFile = path.join(P.magazinesDir, options.magazineId, 'tasks.md')
    lastWrittenFileMap.set(normFilePath(magTasksFile), finalContent)
    writeSingleTaskFile(magTasksFile, finalContent)
  }

  return { ok: true, revision: currentRevision }
}

/** 30 秒定时器：自动回收心跳超时卡死的 doing 任务 */
function sweepDoingTimeouts() {
  try {
    const filesToSweep = []
    if (fs.existsSync(P.tasksFile)) filesToSweep.push(P.tasksFile)
    if (fs.existsSync(P.magazinesDir)) {
      const entries = fs.readdirSync(P.magazinesDir, { withFileTypes: true })
      for (const ent of entries) {
        if (ent.isDirectory()) {
          const mf = path.join(P.magazinesDir, ent.name, 'tasks.md')
          if (fs.existsSync(mf)) filesToSweep.push(mf)
        }
      }
    }

    const now = Date.now()
    let anySweepChanged = false

    for (const fpath of filesToSweep) {
      const content = fs.readFileSync(fpath, 'utf8')
      let changed = false
      const updatedLines = content.split(/\r?\n/).map((line) => {
        const m = line.match(/^(\s*-\s*\[)([~/\-])(\]\s*.+?<!--\s*pm:([A-Za-z0-9_-]+)(.*?)\s*-->.*)$/)
        if (!m) return line
        const id = m[4]
        const metaStr = m[5]
        const hbMatch = metaStr.match(/\bhb:(\d+)/)
        const hb = hbMatch ? Number(hbMatch[1]) : 0

        // 90 秒无心跳视为超时断线，重置回待认领 pending
        if (hb && (now - hb > 90000)) {
          log(`heartbeat timeout for doing task ${id} (${Math.round((now - hb) / 1000)}s) in ${fpath}, resetting to pending`)
          changed = true
          const cleanMeta = metaStr
            .replace(/\bst:doing\b/, 'st:pending')
            .replace(/\bagent:[^\s>]+\b/, '')
            .replace(/\bhb:\d+\b/, '')
          return `${m[1]} ${m[3].replace(metaStr, cleanMeta)}`
        }
        return line
      })

      if (changed) {
        const newContent = updatedLines.join('\n')
        lastWrittenFileMap.set(normFilePath(fpath), newContent)
        writeSingleTaskFile(fpath, newContent)
        anySweepChanged = true
      }
    }

    if (anySweepChanged) {
      broadcastTasksState()
    }
  } catch (err) {
    log('sweepDoingTimeouts error:', err && err.message)
  }
}

/* --------------------------- 收藏夹与图片保护 -------------------------- */
function getFavoritesData() {
  ensureDirs()
  return readJsonSafe(P.favDataFile) || []
}

function saveFavoritesData(favs) {
  ensureDirs()
  writeJsonAtomic(P.favDataFile, favs)
}

/**
 * 判断一张图片是否受到收藏夹保护（被保护的图片绝不能被删除）
 */
function isImageProtected(imagePath) {
  if (!imagePath || typeof imagePath !== 'string') return false
  try {
    const abs = path.resolve(imagePath)
    // 1. 位于 favorites 独立目录中的图片绝对保护
    if (abs.startsWith(path.resolve(P.favImages))) return true

    // 2. 在 favorites.json 中引用的图片受保护
    const favs = getFavoritesData()
    const base = path.basename(abs).toLowerCase()
    for (const f of favs) {
      for (const im of (f.images || [])) {
        if (!im || !im.path) continue
        if (path.resolve(im.path) === abs || path.basename(im.path).toLowerCase() === base) {
          return true
        }
      }
    }

    // 3. 在 data.json 中带有 favorite: true 标记的任务或收藏弹夹中的图片受保护
    const data = readJsonSafe(P.dataFile)
    if (data && Array.isArray(data.queue)) {
      for (const t of data.queue) {
        if (t && t.favorite) {
          for (const im of (t.images || [])) {
            if (!im || !im.path) continue
            if (path.resolve(im.path) === abs || path.basename(im.path).toLowerCase() === base) {
              return true
            }
          }
        }
      }
    }
    if (data && Array.isArray(data.magazines)) {
      for (const m of data.magazines) {
        for (const t of (m.queue || [])) {
          if (m.id === 'favorites' || (t && t.favorite)) {
            for (const im of (t.images || [])) {
              if (!im || !im.path) continue
              if (path.resolve(im.path) === abs || path.basename(im.path).toLowerCase() === base) {
                return true
              }
            }
          }
        }
      }
    }
  } catch { /* ignore */ }
  return false
}

/** 切换收藏状态：收藏时独立复制图片到 favorites/images/ 并独立生成完全解耦的新提示词任务 */
function toggleFavoriteTask(task) {
  if (!task || !task.id) return { ok: false, error: 'invalid task' }
  ensureDirs()
  const favs = getFavoritesData()
  const idx = favs.findIndex((f) => f.id === task.id || f.originTaskId === task.id || (task.favoritedId && f.id === task.favoritedId))
  const isNowFav = idx === -1

  if (isNowFav) {
    const copiedImages = (task.images || []).map((img) => {
      if (!img || !img.path || !fs.existsSync(img.path)) return img
      try {
        const ext = path.extname(img.path) || '.png'
        const base = path.basename(img.path, ext)
        const targetName = `fav_${base}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}${ext}`
        const targetPath = path.join(P.favImages, targetName)
        fs.copyFileSync(img.path, targetPath)
        return {
          ...img,
          path: targetPath,
          originalPath: img.path,
          name: targetName
        }
      } catch (err) {
        log('failed to copy favorite image:', err && err.message)
        return img
      }
    })

    const newFavId = `fav_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    let newText = task.text || ''
    copiedImages.forEach(img => {
      if (img.originalPath && img.path) {
        newText = newText.split(img.originalPath).join(img.path)
      }
    })

    const favTask = {
      ...task,
      id: newFavId,
      originTaskId: task.id,
      text: newText,
      favorite: true,
      favoritedAt: Date.now(),
      images: copiedImages
    }

    favs.unshift(favTask)
    saveFavoritesData(favs)
    log('favorited task cloned independently:', favTask.id, 'origin:', task.id, 'copied images:', copiedImages.length)
    return { ok: true, isFavorite: true, favorite: favTask }
  } else {
    favs.splice(idx, 1)
    saveFavoritesData(favs)
    log('unfavorited task:', task.id)
    return { ok: true, isFavorite: false }
  }
}

/**
 * 清理未收藏的提示词及其对应图片（保护被收藏的图片不被删除）
 * 规则：
 *  - 收藏弹夹（id: 'favorites'）绝对不进行自动或批量清理
 *  - 默认清理：清理未收藏且已使用的提示词（criteria: 'used' / 'done_only'）
 *  - 支持按每个弹夹独立配置规则
 */
function cleanupUnfavoritedPrompts(criteria = 'used', targetMagId = null) {
  ensureDirs()
  const data = readJsonSafe(P.dataFile)
  if (!data) {
    return { ok: true, deletedPrompts: 0, deletedImages: 0, protectedImages: 0 }
  }

  const now = Date.now()
  const removedTasks = []

  const shouldDeleteTask = (t, crit) => {
    if (!t || t.favorite) return false
    if (crit === 'unused' || crit === 'unfavorite_and_unused') {
      return !t.done
    }
    if (crit === 'all') {
      return true
    }
    if (crit === 'done_only' || crit === 'done' || crit === 'used' || crit === 'unfavorite_and_used') {
      return !!t.done
    }
    if (crit === '1d') {
      return (now - (t.createdAt || 0)) > 24 * 3600 * 1000
    }
    if (crit === '3d') {
      return (now - (t.createdAt || 0)) > 3 * 24 * 3600 * 1000
    }
    if (crit === '7d') {
      return (now - (t.createdAt || 0)) > 7 * 24 * 3600 * 1000
    }
    if (crit === '30d') {
      return (now - (t.createdAt || 0)) > 30 * 24 * 3600 * 1000
    }
    return false
  }

  // 1. 如果指定了具体弹夹清理
  if (targetMagId) {
    // 收藏弹夹受保护，绝不清理
    if (targetMagId === 'favorites') {
      return { ok: true, deletedPrompts: 0, deletedImages: 0, protectedImages: 0, isFavoritesProtected: true }
    }
    const mag = Array.isArray(data.magazines) ? data.magazines.find(m => m.id === targetMagId) : null
    if (mag && Array.isArray(mag.queue)) {
      const kept = []
      for (const t of mag.queue) {
        if (shouldDeleteTask(t, criteria)) {
          removedTasks.push(t)
        } else {
          kept.push(t)
        }
      }
      mag.queue = kept
      if (data.activeMagazineId === targetMagId) {
        data.queue = kept
      }
    } else if (Array.isArray(data.queue)) {
      const kept = []
      for (const t of data.queue) {
        if (shouldDeleteTask(t, criteria)) {
          removedTasks.push(t)
        } else {
          kept.push(t)
        }
      }
      data.queue = kept
    }
  } else {
    // 2. 未指定具体弹夹（计划定时自动清理或全量触发）
    if (Array.isArray(data.magazines)) {
      for (const mag of data.magazines) {
        // 收藏弹夹永不自动清理
        if (mag.id === 'favorites') continue

        // 若外部传了 criteria（如手动点击），则使用该 criteria；否则读取该弹夹自己的规则
        const crit = criteria || mag.autoCleanup || (data.settings && data.settings.magazineAutoCleanup && data.settings.magazineAutoCleanup[mag.id]) || 'off'
        if (!crit || crit === 'off') continue

        const kept = []
        for (const t of (mag.queue || [])) {
          if (shouldDeleteTask(t, crit)) {
            removedTasks.push(t)
          } else {
            kept.push(t)
          }
        }
        mag.queue = kept
        if (data.activeMagazineId === mag.id) {
          data.queue = kept
        }
      }
    } else if (Array.isArray(data.queue)) {
      const kept = []
      for (const t of data.queue) {
        if (shouldDeleteTask(t, criteria || 'unused')) {
          removedTasks.push(t)
        } else {
          kept.push(t)
        }
      }
      data.queue = kept
    }
  }

  if (!removedTasks.length) {
    return { ok: true, deletedPrompts: 0, deletedImages: 0, protectedImages: 0 }
  }

  let deletedImages = 0
  let protectedImages = 0

  for (const t of removedTasks) {
    for (const im of (t.images || [])) {
      if (!im || !im.path) continue
      if (isImageProtected(im.path)) {
        protectedImages += 1
      } else {
        try {
          if (fs.existsSync(im.path)) {
            fs.unlinkSync(im.path)
            deletedImages += 1
          }
        } catch (e) {
          log('failed to delete unreferenced image:', im.path, e && e.message)
        }
      }
    }
  }

  writeJsonAtomic(P.dataFile, data)
  log(`cleaned up ${removedTasks.length} prompts, deleted ${deletedImages} images, protected ${protectedImages} images`)

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('pm:queue-updated', { queue: data.queue, magazines: data.magazines })
  }

  return {
    ok: true,
    deletedPrompts: removedTasks.length,
    deletedImages,
    protectedImages
  }
}

function startAutoCleanupSchedule() {
  if (autoCleanupTimer) clearInterval(autoCleanupTimer)
  autoCleanupTimer = setInterval(() => {
    try {
      cleanupUnfavoritedPrompts(null) // null 表示遍历各弹夹按各自配置的 autoCleanup 规则执行
    } catch { /* ignore */ }
  }, 3600000)
}

/* ------------------------------------------------------------------ */
/* 托盘图标（运行时生成 PNG，无需外部资源）                              */
/* ------------------------------------------------------------------ */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = (CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)) >>> 0
  return (c ^ 0xffffffff) >>> 0
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body), 0)
  return Buffer.concat([len, body, crc])
}

function buildPng(width, height, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8  // bit depth
  ihdr[9] = 6  // RGBA
  const stride = width * 4
  const raw = Buffer.alloc((stride + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
  }
  return Buffer.concat([sig, pngChunk('IHDR', ihdr), pngChunk('IDAT', zlib.deflateSync(raw)), pngChunk('IEND', Buffer.alloc(0))])
}

function makeTrayIcon() {
  const S = 32
  const buf = Buffer.alloc(S * S * 4)
  const px = (x, y, r, g, b, a) => {
    if (x < 0 || y < 0 || x >= S || y >= S) return
    const o = (y * S + x) * 4
    buf[o] = r; buf[o + 1] = g; buf[o + 2] = b; buf[o + 3] = a
  }
  const roundRect = (x0, y0, x1, y1, r, col) => {
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const cx = Math.min(Math.max(x, x0 + r, x1 - r), Math.max(x, x0 + r))
        const cy = Math.min(Math.max(y, y0 + r, y1 - r), Math.max(y, y0 + r))
        if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) px(x, y, col[0], col[1], col[2], col[3])
      }
    }
  }
  roundRect(1, 1, 30, 30, 7, [11, 13, 19, 255])
  roundRect(1, 1, 30, 2, 1, [61, 220, 151, 255])   // 顶部霓虹绿高光
  roundRect(1, 29, 30, 30, 1, [34, 211, 238, 255]) // 底部青色高光
  // 字母 P
  const font = [
    '11110',
    '10001',
    '10001',
    '11110',
    '10000',
    '10000',
    '10000'
  ]
  font.forEach((row, ry) => {
    row.split('').forEach((c, rx) => {
      if (c === '1') for (let dy = 0; dy < 3; dy++) for (let dx = 0; dx < 3; dx++) px(9 + rx * 3 + dx, 6 + ry * 3 + dy, 61, 220, 151, 255)
    })
  })
  return nativeImage.createFromBuffer(buildPng(S, S, buf))
}

/* ------------------------------------------------------------------ */
/* 窗口                                                                */
/* ------------------------------------------------------------------ */
/**
 * 开发服务地址：
 *  - 默认加载 dist 构建产物（不起端口）
 *  - 仅当 PM_USE_DEV_SERVER=1（dev:all 脚本）或显式 VITE_DEV_SERVER_URL 时才连 5199
 */
function resolveRendererURL() {
  if (process.env.VITE_DEV_SERVER_URL) return process.env.VITE_DEV_SERVER_URL
  if (isDev && process.env.PM_USE_DEV_SERVER === '1') {
    return `http://127.0.0.1:${DEV_PORT}`
  }
  return null
}

/* ---------------- 窗口位置记忆 + 胶囊模式 ---------------- */
let wsTimer = null
function saveWindowState() {
  if (!mainWindow || mainWindow.isDestroyed()) return
  const b = mainWindow.getBounds()
  const payload = {
    x: tuckHome ? tuckHome.x : b.x,
    y: tuckHome ? tuckHome.y : b.y,
    width: mode === 'full' ? (tuckHome ? tuckHome.width : b.width) : fullSize.width,
    height: mode === 'full' ? (tuckHome ? tuckHome.height : b.height) : fullSize.height,
    mode
  }
  try { fs.writeFileSync(P.windowState, JSON.stringify(payload), 'utf8') } catch { /* ignore */ }
}
function scheduleSaveWindowState() {
  clearTimeout(wsTimer)
  wsTimer = setTimeout(saveWindowState, 400)
}

/** 将目标 bounds 钳制在所在显示器工作区内 */
function clampToWorkArea(b) {
  const wa = screen.getDisplayNearestPoint({ x: b.x, y: b.y }).workArea
  const width = Math.min(b.width, wa.width)
  const height = Math.min(b.height, wa.height)
  return {
    x: Math.min(Math.max(b.x, wa.x), wa.x + wa.width - width),
    y: Math.min(Math.max(b.y, wa.y), wa.y + wa.height - height),
    width,
    height
  }
}

/** 平滑缩放窗口（easeOutCubic，~90ms） */
function animateTo(target, done) {
  if (!mainWindow || mainWindow.isDestroyed()) return
  const from = mainWindow.getBounds()
  const STEPS = 6
  let i = 0
  animating = true
  const timer = setInterval(() => {
    i += 1
    const k = Math.min(1, i / STEPS)
    const e = 1 - Math.pow(1 - k, 3)
    try {
      mainWindow.setBounds({
        x: Math.round(from.x + (target.x - from.x) * e),
        y: Math.round(from.y + (target.y - from.y) * e),
        width: Math.round(from.width + (target.width - from.width) * e),
        height: Math.round(from.height + (target.height - from.height) * e)
      })
    } catch { /* ignore */ }
    if (k >= 1) {
      clearInterval(timer)
      animating = false
      if (done) done()
    }
  }, 15)
}

/* ---------------- 边缘吸附（0 侵入） ---------------- */
/** 找出离窗口最近的屏幕边，以及距离 */
function nearestEdge(b) {
  const wa = screen.getDisplayNearestPoint({ x: b.x, y: b.y }).workArea
  const d = {
    left: b.x - wa.x,
    right: (wa.x + wa.width) - (b.x + b.width),
    top: b.y - wa.y,
    bottom: (wa.y + wa.height) - (b.y + b.height)
  }
  let edge = 'left'
  let min = d.left
  for (const k of ['right', 'top', 'bottom']) {
    if (d[k] < min) { min = d[k]; edge = k }
  }
  return { edge, dist: min, wa }
}

/** 缩进到最近的边缘，只露出一半（胶囊形态同样生效） */
function tuck() {
  if (!mainWindow || tucked) return
  if (mainWindow.isDestroyed()) return
  if (mainWindow.isFocused()) return
  // 不依赖渲染进程的 hover 事件（会卡死），直接读真实光标位置
  const b = mainWindow.getBounds()
  const pt = screen.getCursorScreenPoint()
  const over = pt.x >= b.x - 6 && pt.x <= b.x + b.width + 6 && pt.y >= b.y - 6 && pt.y <= b.y + b.height + 6
  if (over) return
  const { edge, dist, wa } = nearestEdge(b)
  if (dist > EDGE_THRESHOLD) return

  const saved = readJsonSafe(P.dataFile) || {}
  const s = saved.settings || {}
  const defaultScaleMode = s.windowScaleMode === 'full' ? 'full' : 'quick'

  // 如果配置了「默认缩放为悬浮窗」，当完整工作台靠边缩放时，自动缩放为悬浮窗（capsule 胶囊形态）
  // 杜绝 520px 巨大原窗口直接缩进边缘造成黑长条遮挡！
  if (mode === 'full' && defaultScaleMode !== 'full') {
    log('tuck: converting full mode to capsule per windowScaleMode setting')
    setMode('capsule')
    return
  }

  tuckHome = { ...b }
  // 只露出一条边（圆球约 20px，大窗口最多 26px），尽量 0 侵入
  const visible = Math.min(26, Math.round(Math.min(b.width, b.height) * 0.36))
  const target = { ...b }
  if (edge === 'left') target.x = wa.x - (b.width - visible)
  else if (edge === 'right') target.x = wa.x + wa.width - visible
  else if (edge === 'top') target.y = wa.y - (b.height - visible)
  else target.y = wa.y + wa.height - visible
  tucked = true
  log('tuck ->', edge, JSON.stringify(target))
  animateTo(target, saveWindowState)
}

function untuck() {
  clearTimeout(tuckTimer)
  applyAlwaysOnTop()
  if (!tucked) return
  tucked = false
  const home = tuckHome
  tuckHome = null
  if (home) {
    log('untuck ->', JSON.stringify(home))
    animateTo(clampToWorkArea(home), saveWindowState)
  }
}
function scheduleTuck() {
  clearTimeout(tuckTimer)
  tuckTimer = setTimeout(() => {
    if (!mainWindow || mainWindow.isDestroyed()) return
    tuck()
  }, TUCK_DELAY)
}

/** 重新断言置顶（Windows 上所有 level 最终都是 HWND_TOPMOST，screen-saver 最高） */
/** 圆球形态真正裁成圆形：Windows 的 setShape 只支持矩形列表，用 1px 横向细条逼近圆。
 *  透明窗口仅靠 CSS border-radius 时，合成器常在四角残留方形虚框，这里从窗口层面切掉。 */
function applyShape() {
  if (!mainWindow || mainWindow.isDestroyed()) return
  if (mode !== 'capsule') {
    try { mainWindow.setShape([]) } catch (e) { log('clear shape failed:', e && e.message) }
    return
  }
  const b = mainWindow.getBounds()
  const r = Math.min(b.width, b.height) / 2
  const cx = b.width / 2
  const cy = b.height / 2
  const rects = []
  for (let y = 0; y < b.height; y += 1) {
    const dy = y + 0.5 - cy
    const h2 = r * r - dy * dy
    if (h2 <= 0) continue
    const hw = Math.sqrt(h2)
    rects.push({
      x: Math.max(0, Math.round(cx - hw)),
      y: Math.round(y),
      width: Math.max(1, Math.round(hw * 2)),
      height: 1
    })
  }
  try {
    mainWindow.setShape(rects)
    log('shape -> circle', 'rects:', rects.length, 'size:', b.width + 'x' + b.height)
  } catch (e) {
    log('setShape failed:', e && e.message)
  }
}

function applyAlwaysOnTop() {
  if (!mainWindow || mainWindow.isDestroyed()) return
  try {
    mainWindow.setAlwaysOnTop(alwaysOnTop, 'screen-saver')
  } catch (e) {
    log('setAlwaysOnTop failed:', e && e.message)
  }
}

/** 统一修改置顶：应用到窗口 + 落盘 data.json + 同步渲染进程 + 刷新托盘菜单 */
function setAlwaysOnTopState(flag) {
  alwaysOnTop = !!flag
  applyAlwaysOnTop()
  try {
    const d = readJsonSafe(P.dataFile) || {}
    d.settings = Object.assign({}, d.settings || {}, { alwaysOnTop })
    writeJsonAtomic(P.dataFile, d)
  } catch (e) {
    log('save alwaysOnTop failed:', e && e.message)
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('pm:always-on-top', alwaysOnTop)
  }
  refreshTrayMenu()
  log('alwaysOnTop ->', alwaysOnTop)
}

/** 切换形态：capsule / quick / full */

function updateTaskbarVisibility() {
  if (!mainWindow || mainWindow.isDestroyed()) return
  const saved = readJsonSafe(P.dataFile) || {}
  const s = saved.settings || {}
  const hideTaskbar = s.hideTaskbar !== undefined ? !!s.hideTaskbar : true
  const shouldSkip = hideTaskbar || mode === 'quick' || mode === 'capsule'
  mainWindow.setSkipTaskbar(shouldSkip)
}

function setMode(next) {
  if (!mainWindow || mainWindow.isDestroyed() || mode === next) return
  const prev = mode
  // 从胶囊形态展开到面板时，记录当前外部前台窗口
  if (prev === 'capsule' && next !== 'capsule') {
    try {
      const helperPath = getPasteHelperPath()
      if (fs.existsSync(helperPath)) {
        const curFg = execFileSync(helperPath, ['get'], { windowsHide: true, timeout: 500 }).toString().trim()
        updateLastExternalHwnd(curFg)
      }
    } catch { /* ignore */ }
  }
  mode = next
  untuck()
  // 离开圆球先撤销裁剪，避免放大动画被圆形裁掉
  if (prev === 'capsule') {
    try { mainWindow.setShape([]) } catch { /* ignore */ }
  }
  const cur = mainWindow.getBounds()

  if (next === 'full') {
    mainWindow.setMinimumSize(FULL_MIN.width, FULL_MIN.height)
    mainWindow.setResizable(true)
    const size = {
      width: Math.max(FULL_MIN.width, fullSize.width),
      height: Math.max(FULL_MIN.height, fullSize.height)
    }
    animateTo(clampToWorkArea({ x: cur.x, y: cur.y, ...size }), saveWindowState)
  } else {
    // 从完整形态收起时记住它的尺寸
    if (prev === 'full') fullSize = { width: cur.width, height: cur.height }
    const size = next === 'quick' ? { ...QUICK } : { ...BALL }
    mainWindow.setResizable(false)
    mainWindow.setMinimumSize(size.width, next === 'quick' ? 120 : size.height)
    // 尽量保持左上角，越界则反向贴边
    const wa = screen.getDisplayNearestPoint({ x: cur.x, y: cur.y }).workArea
    const x = Math.min(Math.max(wa.x, cur.x), wa.x + wa.width - size.width)
    const y = Math.min(Math.max(wa.y, cur.y), wa.y + wa.height - size.height)
    // 收成圆球：动画结束后再裁圆形（动画期间裁圆会闪）
    animateTo({ x, y, ...size }, () => {
      saveWindowState()
      if (next === 'capsule') applyShape()
    })
  }
  mainWindow.webContents.send('pm:mode-changed', mode)
  updateTaskbarVisibility()
  // untuck() 会清掉缩进定时器，收成胶囊后要重新排队（否则胶囊永远贴边不缩进）
  if (next === 'capsule') scheduleTuck()
  log('mode ->', mode)
}

function createWindow() {
  const saved = readJsonSafe(P.dataFile) || {}
  const settings = saved.settings || {}
  const ws = readJsonSafe(P.windowState) || {}
  fullSize = {
    width: Math.max(FULL_MIN.width, Number(ws.width) || FULL_DEFAULT.width),
    height: Math.max(FULL_MIN.height, Number(ws.height) || FULL_DEFAULT.height)
  }
  const defaultScaleMode = settings.windowScaleMode === 'full' ? 'full' : 'quick'
  if (defaultScaleMode === 'full') {
    mode = ['capsule', 'quick', 'full'].includes(ws.mode) ? ws.mode : 'full'
  } else {
    // 默认缩放为悬浮窗：启动形态默认为悬浮窗 (quick) 或悬浮球 (capsule)，杜绝直接启动为原大窗口
    mode = (ws.mode === 'capsule' || ws.mode === 'quick') ? ws.mode : 'quick'
  }
  alwaysOnTop = settings.alwaysOnTop !== false

  const sizeOf = (m) => (m === 'capsule' ? { ...BALL } : m === 'quick' ? { ...QUICK } : { ...fullSize })
  const initBounds = sizeOf(mode)
  const minOf = (m) => (m === 'capsule' ? { ...BALL } : m === 'quick' ? { ...QUICK } : FULL_MIN)
  if (typeof ws.x === 'number' && typeof ws.y === 'number') {
    // 恢复上次位置并钳制到当前显示器工作区
    Object.assign(initBounds, clampToWorkArea({
      x: ws.x, y: ws.y,
      width: initBounds.width, height: initBounds.height
    }))
  } // 无记录则保持默认居中

  mainWindow = new BrowserWindow({
    ...initBounds,
    minWidth: minOf(mode).width,
    minHeight: minOf(mode).height,
    frame: false,
    // in-process-gpu 下合成器可用，透明窗口正常（此前 disable-gpu 软件渲染才不显示）
    transparent: true,
    roundedCorners: false,
    backgroundColor: '#00000000',
    resizable: mode === 'full',
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: (settings.hideTaskbar !== undefined ? !!settings.hideTaskbar : true) || mode === 'quick' || mode === 'capsule',
    alwaysOnTop,
    show: false,
    icon: makeTrayIcon(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false
    }
  })

  if (typeof settings.opacity === 'number') mainWindow.setOpacity(settings.opacity)

  // 置顶在创建后立刻断言一次，并在 show/focus/滑回时反复断言，防止被其他窗口覆盖
  applyAlwaysOnTop()
  mainWindow.on('show', applyAlwaysOnTop)
  mainWindow.on('restore', applyAlwaysOnTop)
  // 圆球形态启动就裁成圆形（避免 CSS 圆角残留的方形四角）
  if (mode === 'capsule') setTimeout(applyShape, 50)

  log('window created', JSON.stringify(initBounds), 'mode:', mode)

  let fellBackToDist = false
  const loadDist = () => {
    if (fellBackToDist) return
    fellBackToDist = true
    log('fallback -> load dist/index.html')
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  }

  const devUrl = resolveRendererURL()
  if (devUrl) {
    mainWindow.loadURL(devUrl).catch(() => loadDist())
  } else {
    loadDist()
  }

  mainWindow.webContents.on('render-process-gone', (_e, details) => {
    log('!! render-process-gone:', JSON.stringify(details))
  })
  mainWindow.webContents.on('did-finish-load', () => log('did-finish-load'))
  mainWindow.webContents.on('did-fail-load', (_e, code, desc, url) => {
    log('!! did-fail-load:', code, desc, url)
    // 开发服务不可用时自动回退到构建产物，保证窗口永远有内容
    if (devUrl) loadDist()
  })

  /* 位置 / 尺寸记忆 */
  mainWindow.on('move', () => { if (tucked) return; scheduleSaveWindowState() })
  mainWindow.on('resize', () => {
    if (mode === 'full' && !animating && !tucked) {
      const b = mainWindow.getBounds()
      fullSize = { width: b.width, height: b.height }
    }
    scheduleSaveWindowState()
  })

  /* 边缘吸附：失焦一段时间后缩进屏幕边缘，重新聚焦/悬停时滑回 */
  mainWindow.on('focus', () => { applyAlwaysOnTop(); untuck() })
  mainWindow.on('blur', () => {
    scheduleTuck()
    const updateFg = () => {
      try {
        const helperPath = getPasteHelperPath()
        if (fs.existsSync(helperPath)) {
          const curFg = execFileSync(helperPath, ['get'], { windowsHide: true, timeout: 500 }).toString().trim()
          updateLastExternalHwnd(curFg)
        }
      } catch { /* ignore */ }
    }
    updateFg()
    setTimeout(updateFg, 100)
  })

  mainWindow.once('ready-to-show', () => {
    log('ready-to-show -> show()')
    mainWindow.show()
  })
  // 兜底：ready-to-show 因渲染异常未触发时，4 秒后强制显示窗口
  setTimeout(() => {
    if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) {
      log('!! ready-to-show timeout, force show')
      mainWindow.show()
    }
  }, 4000)
  mainWindow.on('close', (e) => {
    if (!quitting) {
      e.preventDefault()
      saveWindowState()
      mainWindow.hide()
    }
  })
  mainWindow.on('closed', () => { mainWindow = null })
}

function toggleWindow() {
  if (!mainWindow) return
  const saved = readJsonSafe(P.dataFile) || {}
  const s = saved.settings || {}
  const defaultScaleMode = s.windowScaleMode === 'full' ? 'full' : 'quick'
  // 如果当前是胶囊形态，快捷键按下必须是呼出展开为快捷输入，绝不能误判为隐藏！
  if (mode === 'capsule') {
    try {
      const helperPath = getPasteHelperPath()
      if (fs.existsSync(helperPath)) {
        const curFg = execFileSync(helperPath, ['get'], { windowsHide: true, timeout: 500 }).toString().trim()
        updateLastExternalHwnd(curFg)
      }
    } catch { /* ignore */ }
    setMode('quick')
    mainWindow.show()
    mainWindow.focus()
    mainWindow.webContents.send('pm:focus-composer')
    return
  }

  if (mainWindow.isVisible() && mainWindow.isFocused()) {
    mainWindow.hide()
  } else {
    try {
      const helperPath = getPasteHelperPath()
      if (fs.existsSync(helperPath)) {
        const curFg = execFileSync(helperPath, ['get'], { windowsHide: true, timeout: 500 }).toString().trim()
        updateLastExternalHwnd(curFg)
      }
    } catch { /* ignore */ }
    if (defaultScaleMode === 'quick' && mode === 'full') {
      setMode('quick')
    }
    mainWindow.show()
    mainWindow.focus()
    mainWindow.webContents.send('pm:focus-composer')
  }
}

/* ------------------------------------------------------------------ */
/* 自定义全局快捷键：弹出最旧未用 / 收录选中文字                        */
/* ------------------------------------------------------------------ */
function sendToRenderer(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload)
  }
}

let lastHotkeyPopTime = 0

/** 快捷键 1：弹出提示词（按出弹模式：霰弹枪/左轮/手枪，复制、标记使用并直接粘贴到光标处） */
function onHotkeyPop() {
  const now = Date.now()
  if (now - lastHotkeyPopTime < 600) {
    log('hotkey pop debounced, ignoring duplicate trigger')
    return
  }
  lastHotkeyPopTime = now
  const fgHwnd = getForegroundHwndSync()
  log('hotkey pop ->', customHotkeys.pop, 'fgHwnd:', fgHwnd)
  // 如果当前前台还是 PromptMag 自身（比如刚在快捷面板/主窗口编辑完直接按快捷键弹出），
  // 主动释放自身焦点，促使系统前台自然切换至外部目标窗口！
  if (mainWindow && !mainWindow.isDestroyed() && mainWindow.isFocused()) {
    mainWindow.blur()
  }
  sendToRenderer('pm:hotkey-pop', { fgHwnd })
}

/** 模拟按下 Ctrl+C（对前台窗口生效），让目标应用把选中文本/图片复制到剪贴板 */
function sendCopyKeys(targetHwnd = '0') {
  return new Promise((resolve) => {
    const helperPath = getPasteHelperPath()
    if (fs.existsSync(helperPath)) {
      try {
        let hwndStr = String(targetHwnd || '0').trim()
        if (isPromptMagHwnd(hwndStr)) {
          if (lastExternalHwnd && !isPromptMagHwnd(lastExternalHwnd)) {
            hwndStr = lastExternalHwnd
          } else {
            hwndStr = '0'
          }
        }
        log('executing paste-helper copy with hwnd:', hwndStr)
        const p = spawn(helperPath, ['copy', hwndStr], { windowsHide: true })
        let stdout = ''
        p.stdout.on('data', (d) => { stdout += d.toString() })
        p.on('exit', () => resolve(stdout.trim()))
        p.on('error', () => fallbackVbsCopy().then(resolve))
        setTimeout(() => resolve(stdout.trim() || 'TIMEOUT'), 1500)
        return
      } catch (err) {
        log('paste-helper copy spawn error:', err && err.message)
      }
    }
    fallbackVbsCopy().then(resolve)
  })
}

function fallbackVbsCopy() {
  return new Promise((resolve) => {
    let done = false
    const finish = (res = 'UNCHANGED') => { if (!done) { done = true; resolve(res) } }
    try {
      const vbs = path.join(os.tmpdir(), 'pm-sendcopy.vbs')
      fs.writeFileSync(vbs, 'WScript.Sleep 150\r\nCreateObject("WScript.Shell").SendKeys "^c"', 'utf8')
      const p = spawn('wscript.exe', ['//nologo', '//B', vbs], { windowsHide: true, stdio: 'ignore' })
      p.on('exit', () => finish('COPIED'))
      p.on('error', () => finish('UNCHANGED'))
    } catch { finish('UNCHANGED') }
    setTimeout(() => finish('UNCHANGED'), 900)
  })
}

function fallbackVbsPaste() {
  return new Promise((resolve) => {
    let done = false
    const finish = () => { if (!done) { done = true; resolve() } }
    try {
      const vbs = path.join(os.tmpdir(), 'pm-sendpaste.vbs')
      fs.writeFileSync(vbs, 'CreateObject("WScript.Shell").SendKeys "^v"', 'utf8')
      const p = spawn('wscript.exe', ['//nologo', '//B', vbs], { windowsHide: true, stdio: 'ignore' })
      p.on('exit', finish)
      p.on('error', finish)
    } catch { finish() }
    setTimeout(finish, 800)
  })
}

function getForegroundHwndSync() {
  try {
    const helperPath = getPasteHelperPath()
    if (fs.existsSync(helperPath)) {
      const out = execFileSync(helperPath, ['get'], { windowsHide: true, timeout: 500 }).toString().trim()
      log('getForegroundHwndSync raw out:', out, 'isPromptMag:', isPromptMagHwnd(out))

      // 1. 如果当前前台窗口是有效外部应用（非 PromptMag 自身），立即更新并返回
      if (out && out !== '0' && !isPromptMagHwnd(out)) {
        updateLastExternalHwnd(out)
        return out
      }

      // 2. 如果当前前台是 PromptMag 自身，优先嗅探鼠标光标悬停所在的外部窗口
      try {
        const mouseOut = execFileSync(helperPath, ['get-mouse'], { windowsHide: true, timeout: 500 }).toString().trim()
        if (mouseOut && mouseOut !== '0' && !isPromptMagHwnd(mouseOut)) {
          log('detected external window under mouse:', mouseOut)
          updateLastExternalHwnd(mouseOut)
          return mouseOut
        }
      } catch { /* ignore */ }

      // 3. 鼠标不在有效外部窗口时，回退到此前记录的最近一次外部窗口
      if (lastExternalHwnd && lastExternalHwnd !== '0' && !isPromptMagHwnd(lastExternalHwnd)) {
        log('using lastExternalHwnd fallback:', lastExternalHwnd)
        return lastExternalHwnd
      }

      return '0'
    }
  } catch (e) {
    log('getForegroundHwndSync error:', e && e.message)
  }
  return '0'
}

/** 模拟按下 Ctrl+V（对前台窗口生效），让目标应用把文本粘贴到光标处 */
function sendPasteKeys(targetHwnd = '0') {
  return new Promise((resolve) => {
    let done = false
    const finish = () => { if (!done) { done = true; resolve() } }

    const helperPath = getPasteHelperPath()
    if (fs.existsSync(helperPath)) {
      try {
        let hwndStr = String(targetHwnd || '0').trim()
        // 关键防护：绝不允许把 PromptMag 自身作为粘贴的目标窗口；目标为0时也优先回退至历史外部窗口
        if (isPromptMagHwnd(hwndStr) || hwndStr === '0') {
          if (lastExternalHwnd && !isPromptMagHwnd(lastExternalHwnd) && lastExternalHwnd !== '0') {
            hwndStr = lastExternalHwnd
          } else {
            hwndStr = '0'
          }
        }
        if (mainWindow && !mainWindow.isDestroyed() && mainWindow.isFocused()) {
          mainWindow.blur()
        }
        log('executing paste-helper with hwnd:', hwndStr)
        const p = spawn(helperPath, ['paste', hwndStr], { windowsHide: true, stdio: 'ignore' })
        p.on('exit', finish)
        p.on('error', () => fallbackVbsPaste().then(finish))
        setTimeout(finish, 1400)
        return
      } catch (err) {
        log('paste-helper spawn error:', err && err.message)
      }
    }

    fallbackVbsPaste().then(finish)
  })
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** 快照剪贴板（文本 + 图片 + HTML），捕获后还原，尽量不破坏用户剪贴板 */
function snapshotClipboard() {
  const snap = { text: '', image: null, html: null }
  try { snap.text = clipboard.readText() || '' } catch { /* ignore */ }
  try {
    const img = clipboard.readImage()
    if (img && !img.isEmpty()) snap.image = img
  } catch { /* ignore */ }
  try {
    const html = clipboard.readBuffer('text/html')
    if (html && html.length) snap.html = html
  } catch { /* ignore */ }
  return snap
}

function restoreClipboard(snap) {
  try {
    if (snap.image) clipboard.writeImage(snap.image)
    else if (snap.html) clipboard.writeBuffer('text/html', snap.html)
    else if (snap.text) clipboard.writeText(snap.text)
  } catch { /* ignore */ }
}

/** 快捷键 2：收录当前选中的文字/图片到收藏弹夹 */
async function onHotkeyCollect() {
  const fgHwnd = getForegroundHwndSync()
  log('hotkey collect ->', customHotkeys.collect, 'fgHwnd:', fgHwnd)

  // 1. 调用具有物理修饰键释放与纯净按键提升的 helper 发送 Ctrl+C
  const copyResult = await sendCopyKeys(fgHwnd)
  log('sendCopyKeys returned:', copyResult)

  // 2. 检查是否检测到复制动作（剪贴板内容发生改变）
  if (copyResult === 'UNCHANGED') {
    log('hotkey collect: nothing selected in target window')
    sendToRenderer('pm:hotkey-collected', { ok: false, reason: 'no_selection' })
    return
  }

  // 给予目标应用写入剪贴板的安全缓冲（如浏览器处理富文本/图片）
  await sleep(80)

  // 3. 检查剪贴板中是否包含图片（截图、复制的图片文件、网页选中的图文）
  let images = []
  try {
    const imgRes = saveClipboardImages()
    if (imgRes && imgRes.ok && Array.isArray(imgRes.images) && imgRes.images.length) {
      images = imgRes.images
      log('hotkey collect captured images:', images.length)
    }
  } catch (err) {
    log('hotkey collect saveClipboardImages error:', err && err.message)
  }

  // 4. 读取剪贴板中的文字
  let text = ''
  try {
    text = (clipboard.readText() || '').trim()
  } catch { /* ignore */ }

  log('hotkey collect captured text:', JSON.stringify(text.slice(0, 60)), 'images:', images.length)

  // 5. 校验捕获结果
  const hasContent = !!(text || images.length)
  if (hasContent) {
    sendToRenderer('pm:hotkey-collected', {
      ok: true,
      text: text || (images.length === 1 ? '[图1]' : images.map((_, i) => `[图${i + 1}]`).join(' ')),
      images
    })
  } else {
    sendToRenderer('pm:hotkey-collected', { ok: false, reason: 'empty' })
  }
}

/* ---------------- 专属收藏夹提示词独立弹窗 ---------------- */
let snippetTriggerSource = 'external'

function createSnippetWindow() {
  if (snippetWindow && !snippetWindow.isDestroyed()) return snippetWindow

  snippetWindow = new BrowserWindow({
    width: 440,
    height: 410,
    frame: false,
    transparent: true,
    roundedCorners: false,
    backgroundColor: '#00000000',
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    alwaysOnTop: true,
    show: false,
    skipTaskbar: true,
    icon: makeTrayIcon(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false
    }
  })

  snippetWindow.on('hide', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('pm:snippet-picker-closed')
    }
  })

  snippetWindow.on('blur', () => {
    if (snippetWindow && !snippetWindow.isDestroyed()) {
      snippetWindow.hide()
      if (snippetTriggerSource === 'main' && mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible()) {
        mainWindow.focus()
        mainWindow.webContents.send('pm:focus-composer')
      }
    }
  })

  const devUrl = resolveRendererURL()
  const targetUrl = devUrl ? `${devUrl}#snippet-picker` : `file://${path.join(__dirname, '..', 'dist', 'index.html')}#snippet-picker`
  if (devUrl) {
    snippetWindow.loadURL(targetUrl).catch(() => {
      snippetWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'), { hash: 'snippet-picker' })
    })
  } else {
    snippetWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'), { hash: 'snippet-picker' })
  }

  return snippetWindow
}

function toggleSnippetPicker(source = null, capturedHwnd = '0') {
  if (source) {
    snippetTriggerSource = source
  } else {
    const isMainFocused = mainWindow && !mainWindow.isDestroyed() && mainWindow.isFocused()
    snippetTriggerSource = isMainFocused ? 'main' : 'external'
  }
  if (capturedHwnd && capturedHwnd !== '0' && !isPromptMagHwnd(capturedHwnd)) {
    lastExternalHwnd = capturedHwnd
  }
  log('toggleSnippetPicker source:', snippetTriggerSource, 'lastExternalHwnd:', lastExternalHwnd)

  const win = createSnippetWindow()
  if (win.isVisible()) {
    win.hide()
    return
  }

  // 居中或在当前屏幕光标附近优雅呈现
  const cursor = screen.getCursorScreenPoint()
  const display = screen.getDisplayNearestPoint(cursor)
  const w = 440
  const h = 410
  const x = Math.round(display.workArea.x + (display.workArea.width - w) / 2)
  const y = Math.round(display.workArea.y + Math.max(50, (display.workArea.height - h) / 3))

  win.setBounds({ x, y, width: w, height: h })
  win.show()
  win.focus()
  win.webContents.send('pm:snippet-picker-opened')
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('pm:snippet-picker-opened')
  }
}

/** 快捷键 3：呼出专属收藏夹提示词弹窗 */
function onHotkeySnippets() {
  const fgHwnd = getForegroundHwndSync()
  log('hotkey snippets ->', customHotkeys.snippets, 'fgHwnd:', fgHwnd)
  toggleSnippetPicker(null, fgHwnd)
}

/** 从 data.json 读取自定义快捷键配置 */
function readHotkeysFromData() {
  const d = readJsonSafe(P.dataFile) || {}
  const s = d.settings || {}
  customHotkeys = {
    toggle: s.hotkeyToggle !== undefined ? String(s.hotkeyToggle).trim() : HOTKEY_DEFAULTS.toggle,
    pop: s.hotkeyPop !== undefined ? String(s.hotkeyPop).trim() : HOTKEY_DEFAULTS.pop,
    snippets: s.hotkeySnippets !== undefined ? String(s.hotkeySnippets).trim() : HOTKEY_DEFAULTS.snippets,
    collect: s.hotkeyCollect !== undefined ? String(s.hotkeyCollect).trim() : HOTKEY_DEFAULTS.collect,
    cycleMag: s.hotkeyCycleMag ? String(s.hotkeyCycleMag).trim() : HOTKEY_DEFAULTS.cycleMag
  }
  // 旧版本冲突键平滑迁移（微信冲突排查：Alt+C 会触发微信关闭窗口，Alt+S 会触发微信发消息）
  if (customHotkeys.snippets === 'Alt+C') customHotkeys.snippets = 'Alt+X'
  if (customHotkeys.collect === 'Alt+S') customHotkeys.collect = 'Alt+T'
}

/** 重新注册自定义快捷键（设置变更时调用），返回是否全部成功与失败键列表 */
function registerCustomHotkeys() {
  for (const acc of currentlyRegisteredHotkeys) {
    try { globalShortcut.unregister(acc) } catch { /* ignore */ }
  }
  currentlyRegisteredHotkeys.clear()

  const failedKeys = []
  const tryRegister = (name, accelerator, handler) => {
    const acc = typeof accelerator === 'string' ? accelerator.trim() : ''
    if (!acc) return // 空快捷键为用户主动禁用，不注册亦不报错
    try {
      const ok = globalShortcut.register(acc, handler)
      if (ok) {
        currentlyRegisteredHotkeys.add(acc)
      } else {
        failedKeys.push(acc)
        log(`!! register ${name} failed (returned false):`, acc)
      }
    } catch (e) {
      failedKeys.push(acc)
      log(`!! register ${name} exception:`, acc, e && e.message)
    }
  }

  tryRegister('toggle', customHotkeys.toggle, () => toggleWindow())
  tryRegister('pop', customHotkeys.pop, onHotkeyPop)
  tryRegister('snippets', customHotkeys.snippets, onHotkeySnippets)
  tryRegister('collect', customHotkeys.collect, onHotkeyCollect)
  tryRegister('cycleMag', customHotkeys.cycleMag, () => {
    sendToRenderer('pm:cycle-magazine', { direction: 1 })
  })

  const allOk = failedKeys.length === 0
  log('custom hotkeys ->', JSON.stringify(customHotkeys), 'allOk:', allOk, 'failed:', failedKeys)
  return { ok: allOk, failedKeys }
}

let appLocale = 'zh'

/** 从 data.json 读取应用语言设置 */
function readLocaleFromData() {
  const d = readJsonSafe(P.dataFile) || {}
  const s = d.settings || {}
  appLocale = s.locale === 'en' ? 'en' : 'zh'
}

function updateTrayTooltip() {
  if (!tray || tray.isDestroyed()) return
  const isEn = appLocale === 'en'
  const toggleKey = customHotkeys.toggle ? ` (${customHotkeys.toggle})` : ''
  tray.setToolTip(
    isEn
      ? `PromptMag · CLI Prompt Magazine${toggleKey}`
      : `PromptMag · CLI 提示词弹夹${toggleKey}`
  )
}

function buildTrayMenu() {
  const isEn = appLocale === 'en'
  const toggleKey = customHotkeys.toggle ? ` (${customHotkeys.toggle})` : ''
  const snippetsKey = customHotkeys.snippets ? ` (${customHotkeys.snippets})` : ''
  return Menu.buildFromTemplate([
    { label: isEn ? `Show / Hide${toggleKey}` : `显示 / 隐藏${toggleKey}`, click: () => toggleWindow() },
    { label: isEn ? `Favorites Magazine${snippetsKey}` : `⭐ 收藏弹夹${snippetsKey}`, click: () => toggleSnippetPicker() },
    { type: 'separator' },
    {
      label: isEn ? 'Always on Top' : '窗口置顶（不被其他窗口覆盖）',
      type: 'checkbox',
      checked: alwaysOnTop,
      click: (item) => setAlwaysOnTopState(item.checked)
    },
    { type: 'separator' },
    {
      label: isEn ? 'Open Data Directory' : '打开数据目录',
      click: () => shell.openPath(P.home)
    },
    {
      label: isEn ? 'Open next_tasks.md' : '打开 next_tasks.md',
      click: () => shell.openPath(P.tasksFile)
    },
    { type: 'separator' },
    {
      label: isEn ? 'Quit' : '退出',
      click: () => {
        quitting = true
        app.quit()
      }
    }
  ])
}

function refreshTrayMenu() {
  if (tray && !tray.isDestroyed()) tray.setContextMenu(buildTrayMenu())
}

function createTray() {
  tray = new Tray(makeTrayIcon())
  updateTrayTooltip()
  refreshTrayMenu()
  tray.on('click', () => toggleWindow())
}

/* ------------------------------------------------------------------ */
/* IPC                                                                 */
/* ------------------------------------------------------------------ */
function registerIpc() {
  ipcMain.on('pm:log', (_e, ...args) => {
    log('[Renderer]', ...args)
  })

  ipcMain.on('pm:open-log-file', () => {
    try {
      ensureDirs()
      if (!fs.existsSync(P.logFile)) {
        fs.writeFileSync(P.logFile, `[${getBeijingTimeString()}] === PromptMag Log Created ===\n`, 'utf8')
      }
      log('[System] 用户请求打开运行日志文件:', P.logFile)
      shell.openPath(P.logFile).catch((err) => {
        log('[System] openPath 打开日志失败，尝试定位文件:', err && err.message)
        shell.showItemInFolder(P.logFile)
      })
    } catch (err) {
      log('[System] 打开日志文件异常:', err && err.message)
    }
  })

  ipcMain.handle('pm:get-init-data', () => ({
    data: readJsonSafe(P.dataFile) || {},
    paths: {
      homeDir: P.home,
      imagesDir: P.images,
      tasksFile: P.tasksFile,
      dataFile: P.dataFile,
      magazinesDir: P.magazinesDir,
      logFile: P.logFile
    },
    platform: process.platform,
    version: app.getVersion()
  }))

  /* 选择数据目录：迁移现有数据并重启应用 */
  ipcMain.handle('pm:choose-data-dir', async () => {
    const r = await dialog.showOpenDialog(mainWindow, {
      title: '选择 PromptMag 数据存放目录',
      buttonLabel: '选择此目录',
      properties: ['openDirectory', 'createDirectory']
    })
    if (r.canceled || !r.filePaths[0]) return { ok: false, canceled: true }
    const dir = path.resolve(r.filePaths[0])
    if (dir === path.resolve(P.home)) return { ok: false, canceled: true }
    try {
      fs.mkdirSync(dir, { recursive: true })
      // 迁移既有数据（data.json / next_tasks.md / images/）
      for (const f of ['data.json', 'next_tasks.md']) {
        const src = path.join(P.home, f)
        const dst = path.join(dir, f)
        if (fs.existsSync(src) && !fs.existsSync(dst)) fs.copyFileSync(src, dst)
      }
      if (fs.existsSync(P.images)) {
        fs.cpSync(P.images, path.join(dir, 'images'), { recursive: true, force: false, errorOnExist: false })
      }
      // 写入固定位置的配置，重启后生效
      fs.mkdirSync(CONFIG_DIR, { recursive: true })
      fs.writeFileSync(CONFIG_FILE, JSON.stringify({ dataDir: dir }, null, 2), 'utf8')
      log('dataDir changed ->', dir, '(relaunching)')
      saveWindowState()
      app.relaunch()
      app.exit(0)
      return { ok: true, dir }
    } catch (e) {
      return { ok: false, error: String(e && e.message ? e.message : e) }
    }
  })

  ipcMain.on('pm:set-mode', (_e, m) => setMode(m === 'quick' ? 'quick' : m === 'capsule' ? 'capsule' : 'full'))
  ipcMain.on('pm:set-window-scale-mode', (_e, m) => {
    const scaleMode = m === 'full' ? 'full' : 'quick'
    log('window scale mode changed ->', scaleMode)
    try {
      const d = readJsonSafe(P.dataFile) || {}
      d.settings = Object.assign({}, d.settings || {}, { windowScaleMode: scaleMode })
      writeJsonAtomic(P.dataFile, d)
    } catch (e) {
      log('save windowScaleMode failed:', e && e.message)
    }
  })
  ipcMain.on('pm:set-hide-taskbar', (_e, hide) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      const shouldSkip = !!hide || mode === 'quick' || mode === 'capsule'
      mainWindow.setSkipTaskbar(shouldSkip)
    }
  })
  ipcMain.on('pm:set-quick-height', (_e, h) => {
    if (mode !== 'quick' || !mainWindow || mainWindow.isDestroyed() || animating) return
    const targetH = Math.max(56, Math.min(400, Math.round(Number(h) || 200)))
    const b = mainWindow.getBounds()
    if (Math.abs(b.height - targetH) <= 2) return
    animateTo({ x: b.x, y: b.y, width: b.width, height: targetH })
  })
  /* 鼠标进入窗口（含缩进后露出的半边）时滑回 */
  ipcMain.on('pm:pointer-in', () => untuck())
  ipcMain.on('pm:pointer-out', () => scheduleTuck())

  /* 胶囊自定义拖拽（renderer 区分点击/拖动后调用） */
  ipcMain.handle('pm:get-bounds', () => (mainWindow ? mainWindow.getBounds() : null))
  ipcMain.on('pm:drag-move', (_e, pos) => {
    if (!mainWindow || mainWindow.isDestroyed() || tucked) return
    const x = Math.round(Number(pos && pos.x))
    const y = Math.round(Number(pos && pos.y))
    if (!Number.isFinite(x) || !Number.isFinite(y)) return
    mainWindow.setPosition(x, y)
    scheduleSaveWindowState()
  })

  ipcMain.handle('pm:save-data', (_e, payload) => {
    try {
      writeJsonAtomic(P.dataFile, payload)
      return { ok: true }
    } catch (e) {
      return { ok: false, error: String(e && e.message ? e.message : e) }
    }
  })

  ipcMain.handle('pm:save-clipboard-images', () => saveClipboardImages())

  /* 本地图片文件选择器 */
  ipcMain.handle('pm:choose-image-files', async () => {
    if (!mainWindow || mainWindow.isDestroyed()) return { ok: false, canceled: true }
    const r = await dialog.showOpenDialog(mainWindow, {
      title: '选择图片文件',
      filters: [
        { name: '图片文件', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'] }
      ],
      properties: ['openFile', 'multiSelections']
    })
    if (r.canceled || !r.filePaths || !r.filePaths.length) return { ok: false, canceled: true }
    const results = []
    try {
      ensureDirs()
      for (const f of r.filePaths) {
        if (!fs.existsSync(f)) continue
        const dest = uniqueImagePath(path.extname(f).toLowerCase())
        fs.copyFileSync(f, dest)
        results.push({ path: dest, name: path.basename(dest) })
      }
      return { ok: true, images: results }
    } catch (e) {
      return { ok: false, error: String(e && e.message ? e.message : e) }
    }
  })

  /* 剪贴板纯文本（渲染进程粘贴文本时兜底读取，不受浏览器权限限制） */
  ipcMain.handle('pm:read-clipboard-text', () => {
    try {
      const text = clipboard.readText() || ''
      return { ok: true, text }
    } catch (e) {
      return { ok: false, text: '', error: String(e && e.message ? e.message : e) }
    }
  })

  ipcMain.handle('pm:copy-text', (_e, text) => {
    clipboard.writeText(String(text || ''))
    return { ok: true }
  })

  ipcMain.handle('pm:write-tasks', (_e, content, options) => {
    return writeTasksAtomic(content, options)
  })

  ipcMain.handle('pm:read-tasks', () => {
    if (!fs.existsSync(P.tasksFile)) return { exists: false, content: '', items: [], revision: 1, writeLock: null }
    const content = fs.readFileSync(P.tasksFile, 'utf8')
    const items = parseTasksContent(content)
    const meta = parseTasksMetadata(content)
    const writeLock = getActiveWriteLock(items)
    return { exists: true, content, items, revision: meta.revision, writeLock }
  })

  /* 多Agent接力状态与写锁检测 */
  ipcMain.handle('pm:get-relay-status', () => {
    if (!fs.existsSync(P.tasksFile)) return { isWriteLocked: false, lockedBy: null, taskId: null }
    const content = fs.readFileSync(P.tasksFile, 'utf8')
    const items = parseTasksContent(content)
    const writeLock = getActiveWriteLock(items)
    return {
      isWriteLocked: !!writeLock,
      lockedBy: writeLock ? writeLock.agent : null,
      taskId: writeLock ? writeLock.taskId : null
    }
  })

  /* 收藏夹管理与图片保护 */
  ipcMain.handle('pm:toggle-favorite', (_e, task) => {
    return toggleFavoriteTask(task)
  })

  ipcMain.handle('pm:get-favorites', () => {
    return { ok: true, favorites: getFavoritesData() }
  })

  /* 清理未收藏提示词及其图片（被收藏的图片受到绝对保护） */
  ipcMain.handle('pm:cleanup-unfavorited', (_e, criteria, targetMagId) => {
    return cleanupUnfavoritedPrompts(criteria, targetMagId)
  })

  ipcMain.on('pm:set-opacity', (_e, v) => {
    if (mainWindow) mainWindow.setOpacity(Math.min(1, Math.max(0.4, Number(v) || 1)))
  })
  ipcMain.on('pm:set-always-on-top', (_e, flag) => setAlwaysOnTopState(!!flag))

  /* 自定义快捷键变更（渲染层设置面板录制后调用，主进程立即生效） */
  ipcMain.on('pm:update-hotkeys', (_e, h) => {
    if (h && typeof h === 'object') {
      if (h.toggle !== undefined) customHotkeys.toggle = String(h.toggle).trim()
      if (h.pop !== undefined) customHotkeys.pop = String(h.pop).trim()
      if (h.snippets !== undefined) customHotkeys.snippets = String(h.snippets).trim()
      if (h.collect !== undefined) customHotkeys.collect = String(h.collect).trim()
      if (h.cycleMag !== undefined) customHotkeys.cycleMag = String(h.cycleMag).trim()
    }
    const res = registerCustomHotkeys()
    updateTrayTooltip()
    refreshTrayMenu()
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('pm:hotkeys-registered', {
        ok: res.ok,
        failedKeys: res.failedKeys,
        toggle: customHotkeys.toggle,
        pop: customHotkeys.pop,
        snippets: customHotkeys.snippets,
        collect: customHotkeys.collect,
        cycleMag: customHotkeys.cycleMag
      })
    }
  })

  /* 专属收藏夹提示词弹窗控制与光标粘贴 */
  ipcMain.on('pm:open-snippet-picker', () => toggleSnippetPicker('main'))
  ipcMain.on('pm:close-snippet-picker', () => {
    if (snippetWindow && !snippetWindow.isDestroyed()) snippetWindow.hide()
    if (snippetTriggerSource === 'main' && mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show()
      mainWindow.focus()
      mainWindow.webContents.send('pm:focus-composer')
    }
  })
  ipcMain.handle('pm:paste-snippet-at-cursor', async (_e, text) => {
    try {
      if (!text) return { ok: false }
      log('paste-snippet-at-cursor:', JSON.stringify(text.slice(0, 30)), 'source:', snippetTriggerSource)
      clipboard.writeText(String(text))
      if (snippetWindow && !snippetWindow.isDestroyed()) {
        snippetWindow.hide()
      }

      if (snippetTriggerSource === 'main') {
        // 用户是在 PromptMag 自身输入框中呼出并选择的：直接恢复主窗口焦点并调用精确光标插入
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.show()
          mainWindow.focus()
          mainWindow.webContents.send('pm:snippet-inserted', text)
        }
      } else {
        // 用户是在外部应用（VS Code / 微信 / 记事本 / 浏览器等）中呼出的：激活前台并模拟粘贴
        await sleep(80)
        await sendPasteKeys(lastExternalHwnd)
        if (mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible() && mainWindow.isFocused()) {
          mainWindow.webContents.send('pm:snippet-inserted', text)
        }
      }
      return { ok: true }
    } catch (e) {
      log('paste-snippet-at-cursor error:', e && e.message)
      return { ok: false, error: String(e && e.message ? e.message : e) }
    }
  })

  ipcMain.handle('pm:paste-to-foreground', async (_e, hwnd) => {
    try {
      log('paste-to-foreground to hwnd:', hwnd)
      await sleep(80)
      await sendPasteKeys(hwnd || '0')
      return { ok: true }
    } catch (e) {
      log('paste-to-foreground error:', e && e.message)
      return { ok: false, error: String(e && e.message ? e.message : e) }
    }
  })

  /* 语言切换 (zh / en) 同步托盘菜单与提示 */
  ipcMain.on('pm:set-locale', (_e, lang) => {
    appLocale = lang === 'en' ? 'en' : 'zh'
    log('locale changed ->', appLocale)
    if (tray && !tray.isDestroyed()) {
      tray.setToolTip(appLocale === 'en' ? 'PromptMag · CLI Prompt Magazine (Alt+Q)' : 'PromptMag · CLI 提示词弹夹 (Alt+Q)')
      refreshTrayMenu()
    }
  })

  ipcMain.on('pm:hide-window', () => mainWindow && mainWindow.hide())
  ipcMain.on('pm:toggle-window', () => toggleWindow())
  ipcMain.on('pm:open-path', (_e, p) => {
    if (p) shell.openPath(p)
  })
  ipcMain.on('pm:show-item-in-folder', (_e, p) => {
    if (p) shell.showItemInFolder(p)
  })
  /**
   * 多通道获取最新版本信息（智能降级：GitHub API -> jsDelivr CDN -> GitHub Web 302 重定向）
   */
  async function getLatestReleaseMultiChannel() {
    const fetchFn = (typeof net !== 'undefined' && net.fetch) ? net.fetch : globalThis.fetch
    const errors = []

    // 通道 1: GitHub API (首选官方接口，超时 4.5 秒)
    try {
      log('[AutoUpdate] 尝试更新通道 [1/3: GitHub API]...')
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 4500)
      let res
      try {
        res = await fetchFn('https://api.github.com/repos/HaiLanDuJun/PromptMag/releases/latest', {
          signal: controller.signal,
          headers: {
            'User-Agent': 'PromptMag-Desktop',
            'Accept': 'application/vnd.github.v3+json'
          }
        })
      } finally {
        clearTimeout(timer)
      }

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`)
      }

      const release = await res.json()
      const tagName = release.tag_name || ''
      const version = tagName.replace(/^v/i, '').trim()
      const assets = Array.isArray(release.assets)
        ? release.assets.map((a) => ({
            name: a.name,
            downloadUrl: a.browser_download_url,
            size: a.size
          }))
        : []

      log(`[AutoUpdate] 通道 [GitHub API] 检查成功 -> 最新版本: ${version} (${tagName})`)
      return {
        tagName,
        version,
        name: release.name || tagName,
        body: release.body || '',
        htmlUrl: release.html_url || `https://github.com/HaiLanDuJun/PromptMag/releases/tag/${tagName}`,
        publishedAt: release.published_at || '',
        assets,
        channel: 'GitHub API'
      }
    } catch (err) {
      const errMsg = err && err.message ? err.message : String(err)
      log(`[AutoUpdate] 通道 [GitHub API] 失败 (${errMsg})，准备尝试 CDN 降级通道...`)
      errors.push(`GitHub API: ${errMsg}`)
    }

    // 通道 2: jsDelivr CDN version.json (国内秒开，无速率限制)
    try {
      log('[AutoUpdate] 尝试更新通道 [2/3: jsDelivr CDN version.json]...')
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 5000)
      let res
      try {
        res = await fetchFn(`https://cdn.jsdelivr.net/gh/HaiLanDuJun/PromptMag@main/version.json?t=${Date.now()}`, {
          signal: controller.signal,
          headers: {
            'User-Agent': 'PromptMag-Desktop',
            'Accept': 'application/json'
          }
        })
      } finally {
        clearTimeout(timer)
      }

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`)
      }

      const data = await res.json()
      const tagName = data.tagName || `v${data.version}`
      const version = (data.version || tagName.replace(/^v/i, '')).trim()
      const assets = Array.isArray(data.assets)
        ? data.assets.map((a) => ({
            name: a.name,
            downloadUrl: a.downloadUrl,
            size: a.size || 0
          }))
        : []

      log(`[AutoUpdate] 通道 [jsDelivr CDN] 检查成功 -> 最新版本: ${version} (${tagName})`)
      return {
        tagName,
        version,
        name: data.name || `PromptMag ${tagName}`,
        body: data.body || '',
        htmlUrl: data.htmlUrl || `https://github.com/HaiLanDuJun/PromptMag/releases/tag/${tagName}`,
        publishedAt: data.publishedAt || '',
        assets,
        channel: 'jsDelivr CDN'
      }
    } catch (err) {
      const errMsg = err && err.message ? err.message : String(err)
      log(`[AutoUpdate] 通道 [jsDelivr CDN] 失败 (${errMsg})，准备尝试 Web 重定向通道...`)
      errors.push(`jsDelivr CDN: ${errMsg}`)
    }

    // 通道 3: GitHub 网页 302 重定向解析
    try {
      log('[AutoUpdate] 尝试更新通道 [3/3: GitHub Web 302 重定向]...')
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 5000)
      let res
      try {
        res = await fetchFn('https://github.com/HaiLanDuJun/PromptMag/releases/latest', {
          signal: controller.signal,
          redirect: 'manual',
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          }
        })
      } finally {
        clearTimeout(timer)
      }

      const loc = res.headers.get('location') || ''
      const match = loc.match(/\/tag\/(v?([0-9]+\.[0-9]+\.[0-9]+.*))$/i)
      if (!match) {
        throw new Error(`无法从重定向地址解析版本: status=${res.status}, location=${loc}`)
      }

      const tagName = match[1]
      const version = match[2]
      const assets = [
        {
          name: `PromptMag-Portable-${version}.exe`,
          downloadUrl: `https://github.com/HaiLanDuJun/PromptMag/releases/download/${tagName}/PromptMag-Portable-${version}.exe`
        },
        {
          name: `PromptMag-Setup-${version}.exe`,
          downloadUrl: `https://github.com/HaiLanDuJun/PromptMag/releases/download/${tagName}/PromptMag-Setup-${version}.exe`
        }
      ]

      log(`[AutoUpdate] 通道 [GitHub Web 重定向] 检查成功 -> 最新版本: ${version} (${tagName})`)
      return {
        tagName,
        version,
        name: `PromptMag ${tagName}`,
        body: `最新版本: ${tagName}`,
        htmlUrl: `https://github.com/HaiLanDuJun/PromptMag/releases/tag/${tagName}`,
        publishedAt: '',
        assets,
        channel: 'GitHub Web'
      }
    } catch (err) {
      const errMsg = err && err.message ? err.message : String(err)
      log(`[AutoUpdate] 通道 [GitHub Web 重定向] 失败 (${errMsg})`)
      errors.push(`GitHub Web: ${errMsg}`)
    }

    throw new Error(`所有更新通道均不可用: [${errors.join('; ')}]`)
  }

  /* 检查 GitHub Releases 版本更新 */
  ipcMain.handle('pm:check-update', async () => {
    try {
      log('[AutoUpdate] 收到检查更新请求，当前运行版本:', app.getVersion())
      const data = await getLatestReleaseMultiChannel()
      return { ok: true, data }
    } catch (err) {
      log('[AutoUpdate] 检查更新失败:', err && err.message)
      return { ok: false, error: err && err.message ? err.message : String(err) }
    }
  })

  ipcMain.on('pm:open-external', (_e, url) => {
    if (url && typeof url === 'string') {
      shell.openExternal(url).catch((err) => {
        log('openExternal error:', err && err.message)
      })
    }
  })

  let activeDownloadController = null

  ipcMain.handle('pm:start-download-update', async (_e, payload) => {
    try {
      if (activeDownloadController) {
        activeDownloadController.abort()
        activeDownloadController = null
      }

      let targetUrl = payload && payload.assetUrl
      let targetName = payload && payload.assetName

      if (!targetUrl) {
        log('[AutoUpdate] 未传入 assetUrl，开始自动获取最新版本发布信息...')
        const release = await getLatestReleaseMultiChannel()
        const isPortable = !!process.env.PORTABLE_EXECUTABLE_FILE || process.execPath.toLowerCase().includes('portable')
        const targetPattern = isPortable ? /Portable.*\.exe$/i : /Setup.*\.exe$/i
        const matched = (release.assets || []).find((a) => targetPattern.test(a.name)) || (release.assets || [])[0]
        if (!matched || !matched.downloadUrl) throw new Error('新版本未找到适用的安装文件或下载链接')
        targetUrl = matched.downloadUrl
        targetName = matched.name
      }

      if (!targetName) targetName = 'PromptMag-Update.exe'

      const tempDir = app.getPath('temp')
      const destPath = path.join(tempDir, targetName)

      log(`[AutoUpdate] 准备下载更新: 目标文件=${targetName}, 原始URL=${targetUrl}`)
      activeDownloadController = new AbortController()

      // 构建下载源候选列表（国内高速加速镜像优先，官方源垫底）
      const candidates = []
      if (typeof targetUrl === 'string' && targetUrl.includes('github.com')) {
        candidates.push({
          name: 'ghproxy.net 镜像',
          url: `https://ghproxy.net/${targetUrl}`
        })
        candidates.push({
          name: 'ghfast.top 镜像',
          url: `https://ghfast.top/${targetUrl}`
        })
        candidates.push({
          name: 'gh-proxy.com 镜像',
          url: `https://gh-proxy.com/${targetUrl}`
        })
      }
      candidates.push({
        name: 'GitHub 官方源',
        url: targetUrl
      })

      const fetchFn = (typeof net !== 'undefined' && net.fetch) ? net.fetch : globalThis.fetch
      let connectedResp = null
      let usedCandidateName = ''

      for (const candidate of candidates) {
        if (activeDownloadController.signal.aborted) break
        log(`[AutoUpdate] 尝试建立下载连接 -> [${candidate.name}]: ${candidate.url}`)
        
        const connectController = new AbortController()
        const onAbort = () => connectController.abort()
        activeDownloadController.signal.addEventListener('abort', onAbort)
        const connectTimer = setTimeout(() => connectController.abort(), 6000)

        try {
          const resp = await fetchFn(candidate.url, {
            signal: connectController.signal,
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) PromptMag-Desktop-Updater'
            }
          })
          clearTimeout(connectTimer)
          activeDownloadController.signal.removeEventListener('abort', onAbort)

          if (resp.ok && resp.body) {
            connectedResp = resp
            usedCandidateName = candidate.name
            log(`[AutoUpdate] [${candidate.name}] 连接成功 (HTTP ${resp.status})`)
            break
          } else {
            log(`[AutoUpdate] [${candidate.name}] 响应状态异常: HTTP ${resp.status} ${resp.statusText}`)
          }
        } catch (connErr) {
          clearTimeout(connectTimer)
          activeDownloadController.signal.removeEventListener('abort', onAbort)
          if (activeDownloadController.signal.aborted) throw connErr
          log(`[AutoUpdate] [${candidate.name}] 连接失败: ${connErr && connErr.message}`)
        }
      }

      if (!connectedResp) {
        throw new Error('所有下载加速通道及官方源均无法连通，请检查网络或前往 Releases 网页手动下载')
      }

      const totalBytes = Number(connectedResp.headers.get('content-length')) || 0
      const totalMB = totalBytes > 0 ? (totalBytes / (1024 * 1024)).toFixed(2) : '未知'
      log(`[AutoUpdate] 正在通过 [${usedCandidateName}] 下载更新数据，总大小: ${totalMB} MB`)

      let downloadedBytes = 0
      let lastTime = Date.now()
      let startTime = Date.now()
      let lastBytes = 0
      let speedStr = ''
      let lastLoggedPercent = -10

      const fileStream = fs.createWriteStream(destPath)
      const reader = connectedResp.body.getReader()

      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          fileStream.write(Buffer.from(value))
          downloadedBytes += value.length

          const now = Date.now()
          if (now - lastTime >= 200) {
            const deltaSec = (now - lastTime) / 1000
            const bytesDiff = downloadedBytes - lastBytes
            const speedBps = bytesDiff / deltaSec
            if (speedBps > 1024 * 1024) {
              speedStr = (speedBps / (1024 * 1024)).toFixed(1) + ' MB/s'
            } else {
              speedStr = (speedBps / 1024).toFixed(0) + ' KB/s'
            }
            lastTime = now
            lastBytes = downloadedBytes

            const percent = totalBytes > 0 ? Math.min(100, Math.round((downloadedBytes / totalBytes) * 100)) : 0
            
            // 每跨越 10% 记录一次详细日志
            if (percent >= lastLoggedPercent + 10) {
              lastLoggedPercent = Math.floor(percent / 10) * 10
              const currentMB = (downloadedBytes / (1024 * 1024)).toFixed(2)
              log(`[AutoUpdate] 下载进度: ${percent}% (${currentMB} MB / ${totalMB} MB), 速度: ${speedStr}`)
            }

            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('pm:update-download-progress', {
                percent,
                downloadedBytes,
                totalBytes,
                speed: speedStr
              })
            }
          }
        }
        fileStream.end()
      } catch (readErr) {
        fileStream.destroy()
        try { if (fs.existsSync(destPath)) fs.unlinkSync(destPath) } catch { /* ignore */ }
        throw readErr
      }

      activeDownloadController = null

      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('pm:update-download-progress', {
          percent: 100,
          downloadedBytes,
          totalBytes,
          speed: ''
        })
      }

      const totalDurationSec = ((Date.now() - startTime) / 1000).toFixed(1)
      const avgSpeedMB = totalDurationSec > 0 ? (downloadedBytes / (1024 * 1024) / totalDurationSec).toFixed(1) + ' MB/s' : ''
      log(`[AutoUpdate] 下载成功完成! 文件保存于: ${destPath}, 大小: ${(downloadedBytes / 1024 / 1024).toFixed(2)} MB, 耗时: ${totalDurationSec}s, 平均速度: ${avgSpeedMB}`)
      return { ok: true, filePath: destPath, fileName: targetName }
    } catch (err) {
      activeDownloadController = null
      if (err.name === 'AbortError') {
        log('[AutoUpdate] 用户取消下载任务')
        return { ok: false, cancelled: true }
      }
      log('[AutoUpdate] 下载更新包异常失败:', err && err.message)
      return { ok: false, error: err && err.message ? err.message : String(err) }
    }
  })

  ipcMain.handle('pm:cancel-download-update', () => {
    if (activeDownloadController) {
      activeDownloadController.abort()
      activeDownloadController = null
      return { ok: true }
    }
    return { ok: false }
  })

  ipcMain.handle('pm:install-update', async (_e, filePath) => {
    try {
      if (!filePath || !fs.existsSync(filePath)) {
        throw new Error('更新安装包文件不存在，请重新下载')
      }

      log('[AutoUpdate] 准备启动安装并退出当前程序:', filePath)

      try {
        saveWindowState()
      } catch { /* ignore */ }

      const isSetup = filePath.toLowerCase().includes('setup')
      const isPortableRunning = !!process.env.PORTABLE_EXECUTABLE_FILE
      const currentExe = process.env.PORTABLE_EXECUTABLE_FILE || process.execPath

      if (isSetup) {
        const child = spawn(filePath, [], {
          detached: true,
          stdio: 'ignore'
        })
        child.unref()
        app.quit()
        return { ok: true }
      }

      if (isPortableRunning) {
        const tempBat = path.join(app.getPath('temp'), 'promptmag-portable-update.bat')
        const targetExe = currentExe
        const batContent = `@echo off
chcp 65001 >nul
timeout /t 1 /nobreak >nul
:wait_loop
tasklist | findstr /i "PromptMag" >nul
if not errorlevel 1 (
  timeout /t 1 /nobreak >nul
  goto wait_loop
)
copy /y "${filePath.replace(/\\/g, '\\\\')}" "${targetExe.replace(/\\/g, '\\\\')}"
start "" "${targetExe.replace(/\\/g, '\\\\')}"
del "%~f0"
`
        fs.writeFileSync(tempBat, batContent, 'utf8')
        const child = spawn('cmd.exe', ['/c', tempBat], {
          detached: true,
          windowsHide: true,
          stdio: 'ignore'
        })
        child.unref()
        app.quit()
        return { ok: true }
      }

      const child = spawn(filePath, [], {
        detached: true,
        stdio: 'ignore'
      })
      child.unref()
      app.quit()
      return { ok: true }
    } catch (err) {
      log('[AutoUpdate] 执行安装失败:', err && err.message)
      return { ok: false, error: err && err.message ? err.message : String(err) }
    }
  })
}

/* ------------------------------------------------------------------ */
/* 生命周期                                                            */
/* ------------------------------------------------------------------ */
// PM_ALLOW_MULTI=1 时跳过单实例锁（仅本地调试用，正常启动不受影响）
if (!process.env.PM_ALLOW_MULTI && !app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      mainWindow.show()
      mainWindow.focus()
    }
  })

  app.whenReady().then(() => {
    ensureDirs()
    createWindow()
    createTray()
    registerIpc()
    startTasksWatch()

    // 30 秒定时轮询回收超时的 doing 任务
    sweepTimer = setInterval(sweepDoingTimeouts, 30000)

    // 定时清理未收藏提示词调度器
    startAutoCleanupSchedule()
    try {
      const initData = readJsonSafe(P.dataFile)
      const setting = initData && initData.settings && initData.settings.autoCleanup
      if (setting && setting !== 'off') cleanupUnfavoritedPrompts(setting)
    } catch { /* ignore */ }

    // 本地图片协议：pmimg://local/<encodeURIComponent(绝对路径)>
    // （避免 file:// 跨域问题，仅允许读取本地文件系统路径）
    protocol.handle('pmimg', (request) => {
      try {
        const u = new URL(request.url)
        const p = decodeURIComponent(u.pathname.replace(/^\//, ''))
        if (!path.isAbsolute(p)) return new Response(null, { status: 404 })
        return net.fetch(pathToFileURL(p).href)
      } catch {
        return new Response(null, { status: 404 })
      }
    })

    // 读取应用语言配置与自定义快捷键配置
    readLocaleFromData()
    readHotkeysFromData()
    registerCustomHotkeys()
    updateTrayTooltip()

    // 置顶自愈：某些窗口（全屏、游戏、远控类）会把我们挤出 TOPMOST
    setInterval(() => {
      if (!mainWindow || mainWindow.isDestroyed() || !alwaysOnTop) return
      if (!mainWindow.isVisible() || mainWindow.isMinimized()) return
      try {
        if (!mainWindow.isAlwaysOnTop()) {
          mainWindow.setAlwaysOnTop(true, 'screen-saver')
        }
      } catch { /* ignore */ }
    }, 4000)

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('before-quit', () => { quitting = true })

  app.on('will-quit', () => {
    globalShortcut.unregisterAll()
    if (snippetWindow && !snippetWindow.isDestroyed()) {
      try { snippetWindow.destroy() } catch { /* ignore */ }
    }
    if (tasksWatcher) { tasksWatcher.close(); tasksWatcher = null }
    if (watchTimer) clearTimeout(watchTimer)
    if (sweepTimer) clearInterval(sweepTimer)
    if (autoCleanupTimer) clearInterval(autoCleanupTimer)
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') { /* 保留托盘常驻，不退出 */ }
  })
}