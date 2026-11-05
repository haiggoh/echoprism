import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from './App'
import { ThemeProvider } from './hooks/useTheme'
import { Toaster } from './components/ui/Toaster'
import { ConvergenceProvider } from './hooks/useConvergence'
import { invoke } from './tauri-bridge'
import './index.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})

// 4f frontend capture: page errors and unhandled rejections land in the
// same local ring as Rust panics. The listeners must never throw — every
// failure here is swallowed (a broken capture must not break the app).
window.addEventListener('error', (e) => {
  void invoke('log_frontend_error', {
    kind: 'js-error',
    message: `${e.message} at ${e.filename}:${e.lineno}:${e.colno}`,
  }).catch(() => {})
})
window.addEventListener('unhandledrejection', (e) => {
  void invoke('log_frontend_error', {
    kind: 'js-rejection',
    message: `unhandledrejection: ${String(e.reason)}`,
  }).catch(() => {})
})

// Round 5 (2026-11-05): forward console.warn/error to the Rust log too — the
// webview console never reaches the terminal on its own, and media-element
// load errors (the "Stream error" toast) were invisible there. Never throws.
for (const level of ['warn', 'error'] as const) {
  const orig = console[level].bind(console)
  console[level] = (...args: unknown[]) => {
    orig(...args)
    void invoke('log_frontend_error', {
      kind: `console-${level}`,
      message: args.map((a) => (a instanceof Error ? `${a.name}: ${a.message}` : String(a))).join(' '),
    }).catch(() => {})
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <ConvergenceProvider>
          <App />
          <Toaster />
        </ConvergenceProvider>
      </ThemeProvider>
    </QueryClientProvider>
  </React.StrictMode>
)
