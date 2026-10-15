import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// 开发服务端口：默认 5199（避开常见占用），可用 PM_DEV_PORT 覆盖
const PORT = Number(process.env.PM_DEV_PORT) || 5199

// https://vitejs.dev/config/
export default defineConfig({
  base: './',
  plugins: [vue()],
  server: {
    port: PORT,
    strictPort: true,
    host: '127.0.0.1'
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 1500
  }
})
