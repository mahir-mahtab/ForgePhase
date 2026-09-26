import { cpSync, createReadStream, existsSync, statSync } from 'node:fs'
import { extname, join, resolve, sep } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { type Connect, type Plugin, defineConfig } from 'vite'

/** The repository's single `samples/` folder, shared with the backend. */
const SAMPLES_DIR = fileURLToPath(new URL('../samples', import.meta.url))

/** Only the sample files themselves, not the generator or its README. */
const SAMPLE_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.wav': 'audio/wav',
  '.json': 'application/json',
}

/**
 * Serve `../samples` at `/samples` during development and copy it into the
 * build, so the "Use sample" buttons read the same files the README lists
 * instead of a second copy under `public/`.
 */
function samples(): Plugin {
  const middleware: Connect.NextHandleFunction = (request, response, next) => {
    const path = decodeURIComponent((request.url ?? '').split('?')[0])
    const file = resolve(SAMPLES_DIR, `.${path}`)
    const type = SAMPLE_TYPES[extname(file)]
    // `resolve` collapses `..`, so anything outside the folder is refused here.
    if (!type || !file.startsWith(SAMPLES_DIR + sep) || !existsSync(file) || !statSync(file).isFile()) {
      next()
      return
    }
    response.setHeader('Content-Type', type)
    createReadStream(file).pipe(response)
  }

  let outDir = 'dist'
  return {
    name: 'phaseforge-samples',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir)
    },
    configureServer(server) {
      server.middlewares.use('/samples', middleware)
    },
    configurePreviewServer(server) {
      server.middlewares.use('/samples', middleware)
    },
    closeBundle() {
      cpSync(SAMPLES_DIR, join(outDir, 'samples'), {
        recursive: true,
        filter: (source) => statSync(source).isDirectory() || extname(source) in SAMPLE_TYPES,
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), samples()],
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
      // The Python backend answers here while the browser keeps a same-origin
      // path, so no CORS layer is needed during local development.
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
})
