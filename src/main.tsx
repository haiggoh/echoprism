import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from './App'
import { ThemeProvider } from './hooks/useTheme'
import { Toaster } from './components/ui/Toaster'
import { ConvergenceProvider } from './hooks/useConvergence'
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
