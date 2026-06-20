import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const apiPort = Number(process.env.PORT || 3000)
const vitePort = Number(process.env.VITE_PORT || 5173)

export default defineConfig({
  plugins: [react()],
  server: {
    port: vitePort,
    proxy: {
      // Proxy API + WS through to the Express server.
      // The target port follows the Express PORT env var so the dev
      // loop works the same way in CI, in a different shell, or behind
      // a tunnel.
      '/api': {
        target: `http://localhost:${apiPort}`,
        ws: true,
        changeOrigin: true
      }
    }
  }
})
