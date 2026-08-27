import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// Vitest needs `__dirname` when running through ts-node-style config loading.
import { fileURLToPath } from 'node:url'

const root = path.dirname(fileURLToPath(import.meta.url))

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(root, 'src')
    }
  },
  server: {
    port: 5173,
    proxy: {
      // Proxy API calls to the backend during local dev.
      '/api': 'http://localhost:5099'
    }
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    // Vitest only runs unit/component tests under src. The Playwright E2E specs
    // live in e2e/ and are run separately via `npm run test:e2e`.
    include: ['src/**/*.{test,spec}.?(c|m)[jt]s?(x)'],
    css: false,
    restoreMocks: true,
    clearMocks: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'html'],
      reportsDirectory: './coverage',
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.d.ts',
        'src/test/**',
        'src/**/*.test.{ts,tsx}',
        'src/**/__tests__/**',
        'src/main.tsx',
        'src/**/index.ts'
      ]
    }
  }
})
