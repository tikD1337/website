import { createServer } from 'node:http'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { join } from 'node:path'
import { createContentService } from '../src/content/server/service'
import { nodeSigner } from '../src/content/server/sign'
import { LIBRARY } from '../src/content/server/library'
import { createHandler } from '../src/content/server/http'
import { serveNode } from '../src/content/server/node'

/**
 * Сервер контента sysadmin.fun — для Raspberry Pi за nginx (срез 8А).
 *
 * Без своего состояния: контент в сборке, прогресс у игрока. Хранит
 * только секрет подписи — в `DATA_DIR/secret`, чтобы перезапуск не
 * обесценивал выданные тикеты. Собирается в один файл:
 * `npm run build:server` → `server-dist/sysadmin-fun.mjs`.
 */
const PORT = Number(process.env['PORT'] ?? 8787)
const HOST = process.env['HOST'] ?? '127.0.0.1'
const DATA_DIR = process.env['DATA_DIR'] ?? '/var/lib/sysadmin-fun'

function secret(): string {
  const fromEnv = process.env['SYSADMIN_SECRET']
  if (fromEnv) return fromEnv
  const file = join(DATA_DIR, 'secret')
  if (existsSync(file)) return readFileSync(file, 'utf8').trim()
  mkdirSync(DATA_DIR, { recursive: true })
  const fresh = randomBytes(32).toString('hex')
  writeFileSync(file, fresh, { mode: 0o600 })
  return fresh
}

const now = () => Date.now()
const service = createContentService({ ...LIBRARY, sign: nodeSigner(secret()), now })
createServer(serveNode(createHandler(service, { now }))).listen(PORT, HOST, () => {
  console.log(`sysadmin-fun: http://${HOST}:${PORT}, сценариев ${LIBRARY.scenarios.length}`)
})
