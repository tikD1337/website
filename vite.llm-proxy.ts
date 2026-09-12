/**
 * Прокси dev-сервера для разговора с моделью.
 *
 * Ключ API **не попадает в бандл**. Браузер шлёт запрос на `/api/llm`,
 * Vite читает конфиг из `config/llm.local.json` (вне репозитория) и
 * подставляет ключ заголовком. Файла нет — прокси отвечает 503, и
 * разговор откатывается на реплики сценария, как и при отказе модели.
 *
 * Назначение узла — строго одно: спрятать ключ от пользовательского
 * кода. Никакой валидации, никаких правок: всё это делает сама модель.
 */

import type { Connect, Plugin } from 'vite'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

interface LocalConfig {
  target: string
  apiKey: string
  pathPrefix?: string
}

function readConfig(root: string): LocalConfig | null {
  const file = resolve(root, 'config', 'llm.local.json')
  if (!existsSync(file)) return null

  try {
    const raw = JSON.parse(readFileSync(file, 'utf8'))
    if (typeof raw.target !== 'string' || typeof raw.apiKey !== 'string') {
      return null
    }
    return raw as LocalConfig
  } catch {
    return null
  }
}

export function llmProxy(): Plugin {
  return {
    name: 'helpdesk-llm-proxy',
    apply: 'serve',
    configureServer(server) {
      const handler: Connect.NextHandleFunction = async (req, res, next) => {
        if (!req.url?.startsWith('/api/llm')) return next()

        const cfg = readConfig(server.config.root)
        if (!cfg) {
          res.statusCode = 503
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({
            error: 'config/llm.local.json не найден. Скопируйте llm.local.example.json '
              + 'и впишите адрес и ключ. Содержимое файла в репозиторий не попадает.',
          }))
          return
        }

        const prefix = cfg.pathPrefix?.replace(/\/+$/, '') ?? ''
        const target = `${cfg.target.replace(/\/+$/, '')}${prefix}/chat/completions`

        const chunks: Buffer[] = []
        req.on('data', (c: Buffer) => chunks.push(c))
        req.on('end', async () => {
          try {
            const upstream = await fetch(target, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${cfg.apiKey}`,
              },
              body: Buffer.concat(chunks).toString('utf8'),
            })
            res.statusCode = upstream.status
            res.setHeader('Content-Type', 'application/json')
            const text = await upstream.text()
            res.end(text)
          } catch (e) {
            res.statusCode = 502
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({
              error: `прокси не смог связаться с моделью: ${(e as Error).message}`,
            }))
          }
        })
      }

      server.middlewares.use(handler)
    },
  }
}
