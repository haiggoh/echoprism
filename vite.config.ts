import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import fs from 'node:fs'
import tailwindcss from '@tailwindcss/vite'
import type { Plugin } from 'vite'

// Task 1 (docs/plans/2026-11-16-followups-plan.md): dev-only static server
// for the e2e HLS fixtures (e2e/fixtures/** at /test-media/**). `public/`
// would copy fixture bytes into the production bundle; a plugin with
// `apply: 'serve'` only exists in the dev server, so `vite build` cannot
// ship them. Range support is required: WebKit's media stack probes
// progressive files with `bytes=0-1` requests.
function e2eTestFixtures(): Plugin {
  const root = path.resolve(__dirname, 'e2e/fixtures')
  const mime: Record<string, string> = {
    '.m3u8': 'application/vnd.apple.mpegurl',
    '.ts': 'video/mp2t',
    '.mp4': 'video/mp4',
  }
  return {
    name: 'e2e-test-fixtures',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/test-media', (req, res) => {
        try {
          const rel = decodeURIComponent((req.url ?? '').split('?')[0]).replace(/^\/+/, '')
          const file = path.resolve(root, rel)
          // Traversal check BEFORE statSync: a 404 must mean "fixture absent",
          // never a masked filesystem error (a layout typo would otherwise
          // read as a legitimately broken stream).
          if (!file.startsWith(root + path.sep)) {
            res.statusCode = 404
            res.end()
            return
          }
          let stat: fs.Stats
          try {
            stat = fs.statSync(file)
          } catch {
            res.statusCode = 404 // ENOENT: the fixture path really is absent
            res.end()
            return
          }
          if (!stat.isFile()) {
            res.statusCode = 404
            res.end()
            return
          }
          const headers: Record<string, string | number> = {
            'Content-Type': mime[path.extname(file)] ?? 'application/octet-stream',
            'Accept-Ranges': 'bytes',
          }
          const range = /^bytes=(\d*)-(\d*)$/.exec(String(req.headers.range ?? ''))
          if (range) {
            let start: number
            let end: number
            if (range[1] === '' && range[2] === '') {
              start = 0
              end = stat.size - 1
            } else if (range[1] === '') {
              // suffix range: last N bytes
              start = Math.max(0, stat.size - parseInt(range[2], 10))
              end = stat.size - 1
            } else {
              start = parseInt(range[1], 10)
              end = range[2] === '' ? stat.size - 1 : Math.min(parseInt(range[2], 10), stat.size - 1)
            }
            if (start >= stat.size || end < start) {
              res.setHeader('Content-Range', `bytes */${stat.size}`)
              res.statusCode = 416
              res.end()
              return
            }
            headers['Content-Range'] = `bytes ${start}-${end}/${stat.size}`
            headers['Content-Length'] = end - start + 1
            res.writeHead(206, headers)
            fs.createReadStream(file, { start, end }).pipe(res)
          } else {
            headers['Content-Length'] = stat.size
            res.writeHead(200, headers)
            fs.createReadStream(file).pipe(res)
          }
        } catch (err) {
          res.statusCode = 500 // unexpected (EACCES etc.): do not mask as 404
          res.end(`test-media error: ${String(err)}`)
        }
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), e2eTestFixtures()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@components': path.resolve(__dirname, './src/components'),
      '@hooks': path.resolve(__dirname, './src/hooks'),
      '@store': path.resolve(__dirname, './src/store'),
      '@utils': path.resolve(__dirname, './src/utils'),
      '@types': path.resolve(__dirname, './src/types'),
      '@tauri': path.resolve(__dirname, './src/tauri'),
    },
  },
  build: {
    target: 'es2020',
    minify: 'esbuild',
    sourcemap: true,
  },
  test: {
    // Only the app's own tests — the .claude/ skill templates ship .spec.ts
    // examples that are not compiled code.
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
  server: {
    port: 1420,
    strictPort: true,
    // Round 13 (echoprism-dev-mode-vite): only src/ is app code — docs/, e2e/
    // and src-tauri/ changes (every ship's commit) forced full page reloads
    // and raced tauri's cargo rebuilds into HMR 'module script failed' bursts.
    watch: {
      ignored: ['**/docs/**', '**/e2e/**', '**/src-tauri/**', '**/target/**', '**/node_modules/**'],
    },
  },
  clearScreen: false,
  envPrefix: ['VITE_', 'TAURI_'],
})
