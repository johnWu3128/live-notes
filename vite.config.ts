import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    exclude: ['e2e/**', 'node_modules/**'],
  },
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:8787',
    },
  },
})
