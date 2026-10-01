/**
 * Корзины запросов на IP — против выкачивания контента циклом.
 *
 * Всё, что видит игрок, можно сохранить; лимит превращает «одним циклом
 * за секунду» в часы. Время — инжектируемые часы, как везде.
 */
export type LimitKind = 'capsule' | 'content' | 'interview' | 'any'

/**
 * Запас и скорость пополнения: жетонов в миллисекунду.
 *
 * Против скрипта, а не против человека: каждая перезагрузка — новая
 * смена и три капсулы, и при 12 капсулах и одной в минуту четыре
 * перезагрузки подряд запирали тренажёр на минуты (найдено в браузере).
 */
const LIMITS: Record<LimitKind, { burst: number; perMs: number }> = {
  capsule: { burst: 30, perMs: 1 / 20_000 },
  content: { burst: 40, perMs: 1 / 15_000 },
  interview: { burst: 6, perMs: 1 / 120_000 },
  any: { burst: 120, perMs: 2 / 1_000 },
}

/**
 * Сколько корзин держать. Сверх — вытесняются самые давние, разом до
 * 90 %: поток новых адресов не растит память Pi, а вытеснение стоит
 * в среднем постоянное время на запрос, а не обход всей карты.
 */
const MAX_BUCKETS = 10_000

export function createLimiter(now: () => number): {
  take(ip: string, kind: LimitKind): number
  /** сколько корзин в памяти — для проверки предела */
  size(): number
} {
  // Порядок вставки Map — порядок последнего обращения: давние впереди.
  const buckets = new Map<string, { tokens: number; at: number }>()

  return {
    /** 0 — можно; иначе — через сколько секунд появится жетон. */
    take(ip, kind) {
      const t = now()
      const { burst, perMs } = LIMITS[kind]
      const key = `${ip}|${kind}`
      const b = buckets.get(key) ?? { tokens: burst, at: t }
      buckets.delete(key)
      buckets.set(key, b)
      if (buckets.size > MAX_BUCKETS) {
        const drop = buckets.size - Math.floor(MAX_BUCKETS * 0.9)
        let n = 0
        for (const k of buckets.keys()) {
          if (n++ >= drop) break
          buckets.delete(k)
        }
      }
      b.tokens = Math.min(burst, b.tokens + (t - b.at) * perMs)
      b.at = t
      if (b.tokens >= 1) {
        b.tokens -= 1
        return 0
      }
      return Math.ceil((1 - b.tokens) / perMs / 1000)
    },
    size: () => buckets.size,
  }
}
