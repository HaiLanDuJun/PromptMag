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

  /* 剪贴板文本（粘贴纯文本兜底） */
  readClipboardText: () => ipcRenderer.invoke('pm:read-clipboard-text'),

  /* 剪贴板文本 */
  copyText: (text) => ipcRenderer.invoke('pm:copy-text', text),

  /* next_tasks.md 读写 */
  writeTasks: (content) => ipcRenderer.invoke('pm:write-tasks', content),
  readTasks: () => ipcRenderer.invoke('pm:read-tasks'),

  /* 窗口控制 */
  setOpacity: (v) => ipcRenderer.send('pm:set-opacity', v),
  setAlwaysOnTop: (flag) => ipcRenderer.send('pm:set-always-on-top', flag),
  hideWindow: () => ipcRenderer.send('pm:hide-window'),
  toggleWindow: () => ipcRenderer.send('pm:toggle-window'),
  /* 形态：capsule(胶囊) / quick(快捷输入) / full(完整) */
  setMode: (m) => ipcRenderer.send('pm:set-mode', m),
  pointerIn: () => ipcRenderer.send('pm:pointer-in'),
  pointerOut: () => ipcRenderer.send('pm:pointer-out'),
  getBounds: () => ipcRenderer.invoke('pm:get-bounds'),
  dragMoveTo: (x, y) => ipcRenderer.send('pm:drag-move', { x, y }),

  /* 数据目录 */
  chooseDataDir: () => ipcRenderer.invoke('pm:choose-data-dir'),

  /* 文件系统辅助 */
  openPath: (p) => ipcRenderer.send('pm:open-path', p),
  showItemInFolder: (p) => ipcRenderer.send('pm:show-item-in-folder', p),

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
  }
}

contextBridge.exposeInMainWorld('pm', api)