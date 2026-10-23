import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// El backend corre aparte en el puerto 3000 (npm start en backend/).
const BACKEND = 'http://localhost:3000'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': BACKEND,
      '/health': BACKEND,
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    // e2e/ es de Playwright (npm run test:e2e), no de Vitest.
    include: ['tests/**/*.test.{ts,tsx}'],
  },
})
