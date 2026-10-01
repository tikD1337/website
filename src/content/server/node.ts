import type { IncomingMessage, ServerResponse } from 'node:http'
import { ERRORS, MAX_BODY } from './http'

/**
 * Обработчик API под `node:http` — для Pi и для dev-сервера Vite.
 *
 * Тело читается с обрывом на мегабайте: дальше не копится, клиенту —
 * 413. Адрес — из `CF-Connecting-IP` (Cloudflare), затем `X-Real-IP`
 * (nginx), затем сокет: по нему считаются лимиты.
 */
export function serveNode(
  handler: (req: Request, ip?: string) => Promise<Response>,
): (req: IncomingMessage, res: ServerResponse) => Promise<void> {
  return async (req, res) => {
    const send = async (r: Response) => {
      res.statusCode = r.status
      r.headers.forEach((v, k) => res.setHeader(k, v))
      res.end(Buffer.from(await r.arrayBuffer()))
    }

    const chunks: Buffer[] = []
    let size = 0
    for await (const chunk of req as AsyncIterable<Buffer>) {
      size += chunk.length
      if (size > MAX_BODY) {
        req.resume()
        await send(new Response(JSON.stringify({ error: ERRORS.tooLarge }), {
          status: 413, headers: { 'content-type': 'application/json; charset=utf-8' },
        }))
        return
      }
      chunks.push(chunk)
    }

    const header = (k: string) => {
      const v = req.headers[k]
      return typeof v === 'string' ? v : undefined
    }
    const headers = new Headers()
    for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v)
    const method = req.method ?? 'GET'
    const request = new Request(`http://${header('host') ?? 'localhost'}${req.url ?? '/'}`, {
      method,
      headers,
      ...(method === 'GET' || method === 'HEAD' ? {} : { body: Buffer.concat(chunks) }),
    })
    const ip = header('cf-connecting-ip') ?? header('x-real-ip') ?? req.socket.remoteAddress ?? 'unknown'
    await send(await handler(request, ip))
  }
}
