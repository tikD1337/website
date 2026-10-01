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

/** Сколько корзин держать, прежде чем выбросить полные: память Pi не резиновая. */
const MAX_BUCKETS = 10_000

export function createLimiter(now: () => number): { take(ip: string, kind: LimitKind): number } {
  const buckets = new Map<string, { tokens: number; at: number }>()

  const refill = (kind: LimitKind, b: { tokens: number; at: number }, t: number) => {
    const { burst, perMs } = LIMITS[kind]
    b.tokens = Math.min(burst, b.tokens + (t - b.at) * perMs)
    b.at = t
  }

  return {
    /** 0 — можно; иначе — через сколько секунд появится жетон. */
    take(ip, kind) {
      const t = now()
      if (buckets.size > MAX_BUCKETS) {
        for (const [key, b] of buckets) {
          refill(key.slice(key.lastIndexOf('|') + 1) as LimitKind, b, t)
          if (b.tokens >= LIMITS[key.slice(key.lastIndexOf('|') + 1) as LimitKind].burst) buckets.delete(key)
        }
      }
      const key = `${ip}|${kind}`
      const b = buckets.get(key) ?? { tokens: LIMITS[kind].burst, at: t }
      buckets.set(key, b)
      refill(kind, b, t)
      if (b.tokens >= 1) {
        b.tokens -= 1
        return 0
      }
      return Math.ceil((1 - b.tokens) / LIMITS[kind].perMs / 1000)
    },
  }
}
