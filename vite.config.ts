import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 1420,
    strictPort: true,
    proxy: {
      '/agent': {
        target: 'http://127.0.0.1:19329',
        changeOrigin: false,
        rewrite: (path) => path.replace(/^\/agent/, ''),
      },
    },
  },
})
