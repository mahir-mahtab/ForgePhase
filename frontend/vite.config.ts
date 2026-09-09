import { fileURLToPath, URL } from 'node:url'

import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      // Statically analyzable alias: every import resolves to one real path,
      // so the bundler can trace exactly what a chunk pulls in.
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    // Surfaces regressions early rather than after the bundle has already grown.
    chunkSizeWarningLimit: 400,
  },
  server: {
    port: 5173,
    proxy: {
      // The Python backend is not wired up yet. When it is, it answers here and
      // the browser keeps a same-origin path, so no CORS layer is needed.
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
})
