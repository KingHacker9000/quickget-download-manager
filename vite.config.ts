import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

function stableHash(input: string): string {
  let hash = 0;
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash).toString(16);
}

const buildTime = new Date().toISOString();
const buildCommit = stableHash(`qdm:${buildTime}`);

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    "import.meta.env.VITE_QDM_FRONTEND_BUILD_TIME": JSON.stringify(buildTime),
    "import.meta.env.VITE_QDM_FRONTEND_BUILD_COMMIT": JSON.stringify(buildCommit),
  },
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
