import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// /api, /uploads and /ws/vehicles are proxied to the Express backend in
// dev/preview so the app also works same-origin when it isn't served from
// localhost (hosted demo/preview environments). With the default
// http://localhost:4000 API base (see src/lib/api.ts) the proxy is unused.
const BACKEND = 'http://localhost:4000'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    allowedHosts: true,
    headers: { 'Cross-Origin-Opener-Policy': 'unsafe-none' },
    proxy: {
      '/api': { target: BACKEND, changeOrigin: true },
      '/uploads': { target: BACKEND, changeOrigin: true },
      '/ws/vehicles': { target: BACKEND, changeOrigin: true, ws: true },
    },
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
    allowedHosts: true,
    headers: { 'Cross-Origin-Opener-Policy': 'unsafe-none' },
    proxy: {
      '/api': { target: BACKEND, changeOrigin: true },
      '/uploads': { target: BACKEND, changeOrigin: true },
      '/ws/vehicles': { target: BACKEND, changeOrigin: true, ws: true },
    },
  },
})
