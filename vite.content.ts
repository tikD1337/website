/**
 * API контента в dev-сервере — тот же обработчик, что на Pi (срез 8А).
 *
 * `npm run dev` отдаёт `/api/*` сам: отдельный процесс не нужен. Секрет
 * подписи — новый на каждый запуск; тикеты прежнего запуска сервер не
 * узнает, и стор так и скажет. `/api/llm` — прокси модели, не наш.
 */
import type { Plugin } from 'vite'
import { randomBytes } from 'node:crypto'
import { createContentService } from './src/content/server/service'
import { nodeSigner } from './src/content/server/sign'
import { LIBRARY } from './src/content/server/library'
import { createHandler } from './src/content/server/http'
import { serveNode } from './src/content/server/node'

export function contentApi(): Plugin {
  return {
    name: 'helpdesk-content-api',
    apply: 'serve',
    configureServer(server) {
      const now = () => Date.now()
      const service = createContentService({ ...LIBRARY, sign: nodeSigner(randomBytes(32).toString('hex')), now })
      const serve = serveNode(createHandler(service, { now }))
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith('/api/') || req.url.startsWith('/api/llm')) return next()
        void serve(req, res)
      })
    },
  }
}
