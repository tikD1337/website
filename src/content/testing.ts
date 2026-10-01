import type { ContentPort, ContentService } from './port'

interface Pending { resolve(): void; reject(e: unknown): void }

const tick = () => new Promise<void>(r => setTimeout(r, 0))

/**
 * Разъём, который отвечает, когда скажет тест.
 *
 * Каждый вызов считается сразу — как сервер, получивший запрос, — а
 * ответ доходит только по `flush` (все ждущие и те, что они породили)
 * или `fail` (ждущие сейчас падают с этой ошибкой). Так проверяются
 * загрузка, сбой связи и устаревший ответ без настоящей сети.
 */
export function deferred(base: ContentService): {
  port: ContentPort
  pending(): number
  flush(): Promise<void>
  fail(e: unknown): Promise<void>
} {
  let queue: Pending[] = []
  const wrap = <A extends unknown[], R>(fn: (...a: A) => R) => (...a: A): Promise<R> =>
    new Promise<R>((resolve, reject) => {
      let out: { ok: true; v: R } | { ok: false; e: unknown }
      try { out = { ok: true, v: fn(...a) } } catch (e) { out = { ok: false, e } }
      queue.push({
        resolve: () => (out.ok ? resolve(out.v) : reject(out.e)),
        reject,
      })
    })

  const port = Object.fromEntries(
    Object.entries(base).map(([k, fn]) => [k, wrap(fn as (...a: unknown[]) => unknown)]),
  ) as unknown as ContentPort

  return {
    port,
    pending: () => queue.length,
    async flush() {
      await tick()
      while (queue.length > 0) {
        const batch = queue
        queue = []
        for (const p of batch) p.resolve()
        await tick()
      }
    },
    async fail(e) {
      await tick()
      const batch = queue
      queue = []
      for (const p of batch) p.reject(e)
      await tick()
    },
  }
}
