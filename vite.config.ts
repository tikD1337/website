/// <reference types="vitest" />
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'
import { llmProxy } from './vite.llm-proxy'

const NOTICE = '/*! © 2026 sysadmin.fun (github.com/tikD1337). Все права защищены. Копирование и распространение без письменного разрешения запрещены. */\n'

/*
  Уведомление об авторских правах едет внутри бандла: тот, кто скопирует
  /assets/*.js, скопирует и его. Защитой от копирования оно не является —
  это заявление прав, см. LICENSE. Ставится после минификации: `banner`
  Rollup минификатор вырезает. И входит в хеш имени: иначе файл с
  уведомлением получил бы имя прежнего файла без него.
*/
function copyrightNotice(): Plugin {
  return {
    name: 'copyright-notice',
    apply: 'build',
    enforce: 'post',
    augmentChunkHash: () => NOTICE,
    generateBundle(_, bundle) {
      for (const file of Object.values(bundle)) if (file.type === 'chunk') file.code = NOTICE + file.code
    },
  }
}

export default defineConfig({
  /*
    Прокси к модели живёт только в dev-сервере: ключ читается из
    config/llm.local.json — файла вне репозитория — и подставляется
    заголовком. В собранную страницу он не попадает.
  */
  plugins: [react(), llmProxy(), copyrightNotice()],
  server: {
    port: 5173,
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
})
