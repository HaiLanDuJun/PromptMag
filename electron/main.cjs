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
  net
} = require('electron')
const path = require('node:path')
const fs = require('node:fs')
const os = require('node:os')
const zlib = require('node:zlib')
const { pathToFileURL } = require('node:url')

// pmimg:// 本地图片协议需在 app ready 前注册特权（standard + fetch 支持）
protocol.registerSchemesAsPrivileged([
  { scheme: 'pmimg', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }
])

/* ------------------------------------------------------------------ */
/* 路径常量                                                            */
/* ------------------------------------------------------------------ */
const HOME_DIR = path.join(os.homedir(), '.prompt-mag')
const IMAGES_DIR = path.join(HOME_DIR, 'images')
const DATA_FILE = path.join(HOME_DIR, 'data.json')
const TASKS_FILE = path.join(HOME_DIR, 'next_tasks.md')
const SHORTCUT = 'Alt+Q'

const isDev = !app.isPackaged

// GPU 进程在本机会 Access Violation，用 in-process-gpu 规避独立 GPU 进程崩溃。
// 注意：不能用 disableHardwareAcceleration / disable-gpu ——
// Windows 上软件渲染会导致 transparent 透明窗口完全不可见（Electron 已知问题）。
app.commandLine.appendSwitch('in-process-gpu')

/* ---------------- 诊断日志 ---------------- */
const LOG_FILE = path.join(HOME_DIR, 'main.log')
function log(...args) {
  try {
    ensureDirs()
    fs.appendFileSync(LOG_FILE, `[${new Date().toISOString()}] ${args.join(' ')}\n`, 'utf8')
  } catch { /* ignore */ }
}
log('=== app start ===', 'version:', app.getVersion(), 'packaged:', app.isPackaged)

let mainWindow = null
let tray = null
let tasksWatcher = null
let watchTimer = null
let lastWrittenTasks = ''
let quitting = false
let imgSeq = 0

/* ------------------------------------------------------------------ */
/* 工具函数                                                            */
/* ------------------------------------------------------------------ */
function ensureDirs() {
  fs.mkdirSync(IMAGES_DIR, { recursive: true })
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
    p = path.join(IMAGES_DIR, `img_${ts}_${String(imgSeq).padStart(2, '0')}${ext}`)
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
  const exists = fs.existsSync(TASKS_FILE)
  const content = exists ? fs.readFileSync(TASKS_FILE, 'utf8') : ''
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
  if (!fs.existsSync(TASKS_FILE)) {
    fs.writeFileSync(TASKS_FILE, '', 'utf8')
    lastWrittenTasks = ''
  }
  try {
    tasksWatcher = fs.watch(TASKS_FILE, { persistent: true }, () => scheduleTasksCheck())
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
function resolveRendererURL() {
  if (isDev) return process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173'
  return null
}

function createWindow() {
  const saved = readJsonSafe(DATA_FILE) || {}
  const settings = saved.settings || {}

  mainWindow = new BrowserWindow({
    width: 396,
    height: 640,
    minWidth: 340,
    minHeight: 480,
    frame: false,
    // 注意：本机 GPU 配置下 transparent:true + 软件渲染会导致窗口完全不可见，
    // 改用不透明窗口 + Win11 DWM 原生圆角（roundedCorners）
    transparent: false,
    roundedCorners: true,
    backgroundColor: '#0b0e15',
    resizable: true,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: false,
    alwaysOnTop: settings.alwaysOnTop !== false,
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

  log('window created', 'transparent: false, roundedCorners: true')

  const devUrl = resolveRendererURL()
  if (devUrl) {
    mainWindow.loadURL(devUrl)
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  }

  mainWindow.webContents.on('render-process-gone', (_e, details) => {
    log('!! render-process-gone:', JSON.stringify(details))
  })
  mainWindow.webContents.on('did-finish-load', () => log('did-finish-load'))
  mainWindow.webContents.on('did-fail-load', (_e, code, desc, url) => {
    log('!! did-fail-load:', code, desc, url)
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
    mainWindow.show()
    mainWindow.focus()
    mainWindow.webContents.send('pm:focus-composer')
  }
}

function createTray() {
  tray = new Tray(makeTrayIcon())
  tray.setToolTip('PromptMag · CLI 提示词弹夹 (Alt+Q)')
  const menu = Menu.buildFromTemplate([
    { label: '显示 / 隐藏 (Alt+Q)', click: () => toggleWindow() },
    { type: 'separator' },
    {
      label: '打开数据目录',
      click: () => shell.openPath(HOME_DIR)
    },
    {
      label: '打开 next_tasks.md',
      click: () => shell.openPath(TASKS_FILE)
    },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        quitting = true
        app.quit()
      }
    }
  ])
  tray.setContextMenu(menu)
  tray.on('click', () => toggleWindow())
}

/* ------------------------------------------------------------------ */
/* IPC                                                                 */
/* ------------------------------------------------------------------ */
function registerIpc() {
  ipcMain.handle('pm:get-init-data', () => ({
    data: readJsonSafe(DATA_FILE) || {},
    paths: {
      homeDir: HOME_DIR,
      imagesDir: IMAGES_DIR,
      tasksFile: TASKS_FILE,
      dataFile: DATA_FILE
    },
    platform: process.platform
  }))

  ipcMain.handle('pm:save-data', (_e, payload) => {
    try {
      writeJsonAtomic(DATA_FILE, payload)
      return { ok: true }
    } catch (e) {
      return { ok: false, error: String(e && e.message ? e.message : e) }
    }
  })

  ipcMain.handle('pm:save-clipboard-images', () => saveClipboardImages())

  ipcMain.handle('pm:copy-text', (_e, text) => {
    clipboard.writeText(String(text || ''))
    return { ok: true }
  })

  ipcMain.handle('pm:write-tasks', (_e, content) => {
    ensureDirs()
    lastWrittenTasks = String(content || '')
    fs.writeFileSync(TASKS_FILE, lastWrittenTasks, 'utf8')
    return { ok: true }
  })

  ipcMain.handle('pm:read-tasks', () => {
    if (!fs.existsSync(TASKS_FILE)) return { exists: false, content: '', items: [] }
    const content = fs.readFileSync(TASKS_FILE, 'utf8')
    return { exists: true, content, items: parseTasksContent(content) }
  })

  ipcMain.on('pm:set-opacity', (_e, v) => {
    if (mainWindow) mainWindow.setOpacity(Math.min(1, Math.max(0.4, Number(v) || 1)))
  })
  ipcMain.on('pm:set-always-on-top', (_e, flag) => {
    if (mainWindow) mainWindow.setAlwaysOnTop(!!flag)
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
if (!app.requestSingleInstanceLock()) {
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

    globalShortcut.register(SHORTCUT, () => toggleWindow())

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('before-quit', () => { quitting = true })

  app.on('will-quit', () => {
    globalShortcut.unregisterAll()
    if (tasksWatcher) { tasksWatcher.close(); tasksWatcher = null }
    if (watchTimer) clearTimeout(watchTimer)
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') { /* 保留托盘常驻，不退出 */ }
  })
}