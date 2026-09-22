import vue from '@vitejs/plugin-vue'
import { visualizer } from 'rollup-plugin-visualizer'
import { defineConfig } from 'vite'

export default defineConfig(({ mode }) => ({
  server: {
    // Tauri dev 轮询 http://127.0.0.1:5173，Windows 上 localhost 可能只绑定 IPv6 ::1
    host: '127.0.0.1',
  },
  plugins: [
    vue(),
    ...(mode === 'analyze'
      ? [visualizer({ filename: 'stats.html', gzipSize: true, brotliSize: true })]
      : []),
  ],
}))
