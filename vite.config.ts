/// <reference types="vitest" />
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { llmProxy } from './vite.llm-proxy'

export default defineConfig({
  /*
    Прокси к модели живёт только в dev-сервере: ключ читается из
    config/llm.local.json — файла вне репозитория — и подставляется
    заголовком. В собранную страницу он не попадает.
  */
  plugins: [react(), llmProxy()],
  server: {
    port: 5173,
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
})
