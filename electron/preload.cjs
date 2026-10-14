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
  }
}

contextBridge.exposeInMainWorld('pm', api)