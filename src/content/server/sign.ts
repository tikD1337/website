import { createHmac } from 'node:crypto'

/**
 * Подпись тикета HMAC-SHA256 секретом сервера.
 *
 * Только сервер, dev-сервер и тесты: в браузерную сборку `node:crypto`
 * попасть не должен, поэтому сервис получает подпись функцией.
 */
export function nodeSigner(secret: string): (data: string) => string {
  return data => createHmac('sha256', secret).update(data).digest('base64url')
}
