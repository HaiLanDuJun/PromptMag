/**
 * PromptMag - Preload 安全桥接层
 * 仅暴露白名单 API 给渲染进程（contextIsolation: true）
 */
const { contextBridge, ipcRenderer } = require('electron')

const api = {
  /* 初始化 */
  getInitData: () => ipcRenderer.invoke('pm:get-init-data'),

  /* 状态持久化 (~/.prompt-mag/data.json) */
  saveData: (payload) => ipcRenderer.invoke('pm:save-data', payload),

  /* 剪贴板图片落盘 */
  saveClipboardImages: () => ipcRenderer.invoke('pm:save-clipboard-images'),

  /* 本地图片文件选择器 */
  chooseImageFiles: () => ipcRenderer.invoke('pm:choose-image-files'),

  /* 剪贴板文本（粘贴纯文本兜底） */
  readClipboardText: () => ipcRenderer.invoke('pm:read-clipboard-text'),

  /* 剪贴板文本 */
  copyText: (text) => ipcRenderer.invoke('pm:copy-text', text),

  /* next_tasks.md 读写（原子写入与乐观锁修订号） */
  writeTasks: (content, options) => ipcRenderer.invoke('pm:write-tasks', content, options),
  readTasks: () => ipcRenderer.invoke('pm:read-tasks'),

  /* 提示词收藏夹与独立目录保护 */
  toggleFavorite: (task) => ipcRenderer.invoke('pm:toggle-favorite', task),
  getFavorites: () => ipcRenderer.invoke('pm:get-favorites'),
  cleanupUnfavorited: (criteria, targetMagId) => ipcRenderer.invoke('pm:cleanup-unfavorited', criteria, targetMagId),

  /* 多Agent接力状态与互斥写锁检测 */
  getRelayStatus: () => ipcRenderer.invoke('pm:get-relay-status'),

  /* 窗口控制 */
  setOpacity: (v) => ipcRenderer.send('pm:set-opacity', v),
  setAlwaysOnTop: (flag) => ipcRenderer.send('pm:set-always-on-top', flag),
  hideWindow: () => ipcRenderer.send('pm:hide-window'),
  toggleWindow: () => ipcRenderer.send('pm:toggle-window'),
  /* 形态：capsule(胶囊) / quick(快捷输入) / full(完整) */
  setMode: (m) => ipcRenderer.send('pm:set-mode', m),
  setQuickHeight: (h) => ipcRenderer.send('pm:set-quick-height', h),
  setWindowScaleMode: (mode) => ipcRenderer.send('pm:set-window-scale-mode', mode),
  setHideTaskbar: (hide) => ipcRenderer.send('pm:set-hide-taskbar', hide),
  pointerIn: () => ipcRenderer.send('pm:pointer-in'),
  pointerOut: () => ipcRenderer.send('pm:pointer-out'),
  getBounds: () => ipcRenderer.invoke('pm:get-bounds'),
  dragMoveTo: (x, y) => ipcRenderer.send('pm:drag-move', { x, y }),

  /* 数据目录 */
  chooseDataDir: () => ipcRenderer.invoke('pm:choose-data-dir'),

  /* 自定义全局快捷键（弹出最旧未用 / 收录选中文字 / 收藏提示词弹窗） */
  updateHotkeys: (h) => ipcRenderer.send('pm:update-hotkeys', h),

  /* 专属收藏夹提示词弹窗 */
  openSnippetPicker: () => ipcRenderer.send('pm:open-snippet-picker'),
  closeSnippetPicker: () => ipcRenderer.send('pm:close-snippet-picker'),
  pasteSnippetAtCursor: (text) => ipcRenderer.invoke('pm:paste-snippet-at-cursor', text),

  /* 语言切换 (zh / en) */
  setLocale: (lang) => ipcRenderer.send('pm:set-locale', lang),

  /* 文件系统辅助 */
  openPath: (p) => ipcRenderer.send('pm:open-path', p),
  showItemInFolder: (p) => ipcRenderer.send('pm:show-item-in-folder', p),
  openExternal: (url) => ipcRenderer.send('pm:open-external', url),
  checkUpdate: () => ipcRenderer.invoke('pm:check-update'),
  startDownloadUpdate: (payload) => ipcRenderer.invoke('pm:start-download-update', payload || {}),
  cancelDownloadUpdate: () => ipcRenderer.invoke('pm:cancel-download-update'),
  installUpdate: (filePath) => ipcRenderer.invoke('pm:install-update', filePath),
  onUpdateDownloadProgress: (cb) => {
    const h = (_e, data) => cb(data)
    ipcRenderer.on('pm:update-download-progress', h)
    return () => ipcRenderer.removeListener('pm:update-download-progress', h)
  },

  /* 主进程 -> 渲染进程 事件 */
  onFocusComposer: (cb) => {
    const h = () => cb()
    ipcRenderer.on('pm:focus-composer', h)
    return () => ipcRenderer.removeListener('pm:focus-composer', h)
  },
  onTasksExternalChange: (cb) => {
    const h = (_e, payload) => cb(payload)
    ipcRenderer.on('pm:tasks-external', h)
    return () => ipcRenderer.removeListener('pm:tasks-external', h)
  },
  onQueueUpdated: (cb) => {
    const h = (_e, payload) => cb(payload)
    ipcRenderer.on('pm:queue-updated', h)
    return () => ipcRenderer.removeListener('pm:queue-updated', h)
  },
  onModeChanged: (cb) => {
    const h = (_e, m) => cb(m)
    ipcRenderer.on('pm:mode-changed', h)
    return () => ipcRenderer.removeListener('pm:mode-changed', h)
  },
  /* 托盘菜单切换置顶时回传，保持 UI 同步 */
  onAlwaysOnTopChanged: (cb) => {
    const h = (_e, flag) => cb(!!flag)
    ipcRenderer.on('pm:always-on-top', h)
    return () => ipcRenderer.removeListener('pm:always-on-top', h)
  },
  /* 快捷键：切换下一个弹夹 */
  onCycleMagazine: (cb) => {
    const h = (_e, payload) => cb(payload || {})
    ipcRenderer.on('pm:cycle-magazine', h)
    return () => ipcRenderer.removeListener('pm:cycle-magazine', h)
  },
  /* 全局快捷键：弹出最旧未用提示词 */
  onHotkeyPop: (cb) => {
    const h = (_e, payload) => cb(payload || {})
    ipcRenderer.on('pm:hotkey-pop', h)
    return () => ipcRenderer.removeListener('pm:hotkey-pop', h)
  },
  /* 将剪贴板内容直接粘贴到前台窗口光标处 */
  pasteToForeground: (hwnd) => ipcRenderer.invoke('pm:paste-to-foreground', hwnd),
  /* 全局快捷键：收录选中文字到词库 */
  onHotkeyCollected: (cb) => {
    const h = (_e, payload) => cb(payload || {})
    ipcRenderer.on('pm:hotkey-collected', h)
    return () => ipcRenderer.removeListener('pm:hotkey-collected', h)
  },
  /* 快捷键注册结果回执 */
  onHotkeysRegistered: (cb) => {
    const h = (_e, payload) => cb(payload || {})
    ipcRenderer.on('pm:hotkeys-registered', h)
    return () => ipcRenderer.removeListener('pm:hotkeys-registered', h)
  },
  /* 专属收藏夹弹窗事件 */
  onSnippetPickerOpened: (cb) => {
    const h = () => cb()
    ipcRenderer.on('pm:snippet-picker-opened', h)
    return () => ipcRenderer.removeListener('pm:snippet-picker-opened', h)
  },
  onSnippetPickerClosed: (cb) => {
    const h = () => cb()
    ipcRenderer.on('pm:snippet-picker-closed', h)
    return () => ipcRenderer.removeListener('pm:snippet-picker-closed', h)
  },
  onSnippetInserted: (cb) => {
    const h = (_e, text) => cb(text)
    ipcRenderer.on('pm:snippet-inserted', h)
    return () => ipcRenderer.removeListener('pm:snippet-inserted', h)
  }
}

contextBridge.exposeInMainWorld('pm', api)