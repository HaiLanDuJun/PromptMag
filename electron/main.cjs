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
P.logFile = path.join(P.home, 'main.log')
P.windowState = path.join(P.home, 'window-state.json')

/* 可自定义全局快捷键（设置面板可改，每个功能至多1个，也可置空禁用，存于 data.json settings） */
const HOTKEY_DEFAULTS = {
  toggle: 'Alt+Q',
  pop: 'Alt+V',
  snippets: 'Alt+X',
  collect: 'Alt+T'
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

/* ---------------- 诊断日志 ---------------- */
function log(...args) {
  try {
    ensureDirs()
    fs.appendFileSync(P.logFile, `[${new Date().toISOString()}] ${args.join(' ')}\n`, 'utf8')
  } catch { /* ignore */ }
}
log('=== app start ===', 'version:', app.getVersion(), 'packaged:', app.isPackaged, 'dataDir:', P.home)

let mainWindow = null
let tray = null
let tasksWatcher = null
let watchTimer = null
let lastWrittenTasks = ''
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
  fs.mkdirSync(P.images, { recursive: true })
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

/* --------------------------- next_tasks.md -------------------------- */
function parseTasksContent(content) {
  const items = []
  content.split(/\r?\n/).forEach((line, i) => {
    const m = line.match(/^\s*-\s*\[([ xX])\]\s*(.+)$/)
    if (!m) return
    const done = m[1].toLowerCase() === 'x'
    const body = m[2]
    const idm = body.match(/<!--\s*pm:([A-Za-z0-9_-]+)\s*-->/)
    items.push({
      line: i,
      done,
      id: idm ? idm[1] : null,
      text: body.replace(/<!--\s*pm:[A-Za-z0-9_-]+\s*-->/, '').trim()
    })
  })
  return items
}

function broadcastTasksState() {
  if (!mainWindow || mainWindow.isDestroyed()) return
  const exists = fs.existsSync(P.tasksFile)
  const content = exists ? fs.readFileSync(P.tasksFile, 'utf8') : ''
  if (content === lastWrittenTasks) return // 自身写入触发的变更，忽略
  mainWindow.webContents.send('pm:tasks-external', { exists, items: parseTasksContent(content) })
}

function scheduleTasksCheck() {
  clearTimeout(watchTimer)
  watchTimer = setTimeout(broadcastTasksState, 120)
}

function startTasksWatch() {
  if (tasksWatcher) return
  ensureDirs()
  if (!fs.existsSync(P.tasksFile)) {
    fs.writeFileSync(P.tasksFile, '', 'utf8')
    lastWrittenTasks = ''
  }
  try {
    tasksWatcher = fs.watch(P.tasksFile, { persistent: true }, () => scheduleTasksCheck())
    tasksWatcher.on('error', () => { tasksWatcher = null })
  } catch {
    tasksWatcher = null
    setTimeout(startTasksWatch, 1500)
  }
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
function setMode(next) {
  if (!mainWindow || mainWindow.isDestroyed() || mode === next) return
  const prev = mode
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
  mode = ['capsule', 'quick', 'full'].includes(settings.mode) ? settings.mode : 'full'
  mode = ['capsule', 'quick', 'full'].includes(ws.mode) ? ws.mode : mode
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
    skipTaskbar: false,
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
  mainWindow.on('blur', () => scheduleTuck())

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
  if (mainWindow.isVisible() && mainWindow.isFocused()) {
    mainWindow.hide()
  } else {
    if (mode === 'capsule') setMode('quick') // 呼出时若是胶囊则展开为快捷输入
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

/** 快捷键 1：弹出提示词（按出弹模式：霰弹枪/左轮/手枪，复制、标记使用并直接粘贴到光标处） */
function onHotkeyPop() {
  const fgHwnd = getForegroundHwndSync()
  log('hotkey pop ->', customHotkeys.pop, 'fgHwnd:', fgHwnd)
  sendToRenderer('pm:hotkey-pop', { fgHwnd })
}

/** 模拟按下 Ctrl+C（对前台窗口生效），让目标应用把选中文本复制到剪贴板 */
function sendCopyKeys() {
  return new Promise((resolve) => {
    let done = false
    const finish = () => { if (!done) { done = true; resolve() } }
    try {
      const vbs = path.join(os.tmpdir(), 'pm-sendcopy.vbs')
      fs.writeFileSync(vbs, 'CreateObject("WScript.Shell").SendKeys "^c"', 'utf8')
      const p = spawn('wscript.exe', ['//nologo', '//B', vbs], { windowsHide: true, stdio: 'ignore' })
      p.on('exit', finish)
      p.on('error', finish)
    } catch { finish() }
    setTimeout(finish, 900)
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
    const helperPath = app.isPackaged
      ? path.join(process.resourcesPath, 'app.asar.unpacked', 'electron', 'bin', 'paste-helper.exe')
      : path.join(__dirname, 'bin', 'paste-helper.exe')
    if (fs.existsSync(helperPath)) {
      const out = execFileSync(helperPath, ['get'], { windowsHide: true, timeout: 500 }).toString().trim()
      return out || '0'
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

    const helperPath = app.isPackaged
      ? path.join(process.resourcesPath, 'app.asar.unpacked', 'electron', 'bin', 'paste-helper.exe')
      : path.join(__dirname, 'bin', 'paste-helper.exe')

    if (fs.existsSync(helperPath)) {
      try {
        const hwndStr = String(targetHwnd || '0')
        log('executing paste-helper with hwnd:', hwndStr)
        const p = spawn(helperPath, ['paste', hwndStr], { windowsHide: true, stdio: 'ignore' })
        p.on('exit', finish)
        p.on('error', () => fallbackVbsPaste().then(finish))
        setTimeout(finish, 800)
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

/** 快捷键 2：收录当前选中文字到词库（保存剪贴板 -> 模拟 Ctrl+C -> 读文本 -> 还原） */
async function onHotkeyCollect() {
  log('hotkey collect ->', customHotkeys.collect)
  const snap = snapshotClipboard()
  await sendCopyKeys()
  await sleep(260) // 等目标应用完成复制
  let text = ''
  try { text = clipboard.readText() || '' } catch { /* ignore */ }
  log('hotkey collect captured:', JSON.stringify(text.slice(0, 60)), 'len:', text.length)
  if (text !== snap.text) restoreClipboard(snap)
  sendToRenderer('pm:hotkey-collected', { ok: !!(text && text.trim()), text })
}

/* ---------------- 专属收藏夹提示词独立弹窗 ---------------- */
let snippetWindow = null
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

let lastExternalHwnd = '0'

function toggleSnippetPicker(source = null, capturedHwnd = '0') {
  if (source) {
    snippetTriggerSource = source
  } else {
    const isMainFocused = mainWindow && !mainWindow.isDestroyed() && mainWindow.isFocused()
    snippetTriggerSource = isMainFocused ? 'main' : 'external'
  }
  if (capturedHwnd && capturedHwnd !== '0') {
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
    collect: s.hotkeyCollect !== undefined ? String(s.hotkeyCollect).trim() : HOTKEY_DEFAULTS.collect
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
    { label: isEn ? `Snippets Picker${snippetsKey}` : `常用词库收藏夹${snippetsKey}`, click: () => toggleSnippetPicker() },
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
  ipcMain.handle('pm:get-init-data', () => ({
    data: readJsonSafe(P.dataFile) || {},
    paths: {
      homeDir: P.home,
      imagesDir: P.images,
      tasksFile: P.tasksFile,
      dataFile: P.dataFile
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

  ipcMain.handle('pm:write-tasks', (_e, content) => {
    ensureDirs()
    lastWrittenTasks = String(content || '')
    fs.writeFileSync(P.tasksFile, lastWrittenTasks, 'utf8')
    return { ok: true }
  })

  ipcMain.handle('pm:read-tasks', () => {
    if (!fs.existsSync(P.tasksFile)) return { exists: false, content: '', items: [] }
    const content = fs.readFileSync(P.tasksFile, 'utf8')
    return { exists: true, content, items: parseTasksContent(content) }
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
        collect: customHotkeys.collect
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
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') { /* 保留托盘常驻，不退出 */ }
  })
}