import { createApp } from 'vue'
import App from './App.vue'
import './assets/main.css'

/* 全局异常上报：经主进程写入运行日志，便于远程回溯前端崩溃/未处理的 Promise 拒绝 */
function reportGlobalError(tag, detail) {
  try {
    window.pm && window.pm.rendererLog && window.pm.rendererLog(`[GlobalError] ${tag} ${String(detail).slice(0, 500)}`)
  } catch { /* ignore */ }
}
window.addEventListener('error', (ev) => reportGlobalError('error', (ev && ev.message) || 'unknown'))
window.addEventListener('unhandledrejection', (ev) => {
  const r = ev && ev.reason
  reportGlobalError('unhandledrejection', (r && r.message) || r || 'unknown')
})

createApp(App).mount('#app')
