import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
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
