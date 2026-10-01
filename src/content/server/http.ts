import { ContentError, type Capsule, type ContentPort } from '../port'
import { createLimiter, type LimitKind } from './limits'

/** Тело больше мегабайта не читается: мир весит десятки килобайт. */
export const MAX_BODY = 1_048_576

const ERRORS = {
  bad: 'Неверный запрос.',
  expired: 'Подпись тикета не принята.',
  notFound: 'Нет такого адреса.',
  tooLarge: 'Слишком большой запрос.',
  limited: 'Слишком много запросов — подождите.',
} as const

const reply = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  })

type Body = Record<string, unknown>
const isObject = (x: unknown): x is Body => typeof x === 'object' && x !== null && !Array.isArray(x)

/** Поле нужного вида — или отказ «неверный запрос». */
const str = (b: Body, k: string): string => {
  if (typeof b[k] !== 'string') throw new ContentError('bad', ERRORS.bad)
  return b[k] as string
}
const obj = (b: Body, k: string): Body => {
  if (!isObject(b[k])) throw new ContentError('bad', ERRORS.bad)
  return b[k] as Body
}
/** Подписанный тикет: сервису нужна только подпись. */
const ticketOf = (b: Body) => ({ token: str(b, 'token') }) as unknown as Capsule

interface Route {
  kind: LimitKind
  run(s: ContentPort, b: Body): unknown
}

/** Маршруты API — ровно таблица спеки среза 8А. */
const POST: Record<string, Route> = {
  '/api/scenario/capsule': { kind: 'capsule', run: (s, b) => s.capsule(str(b, 'id')) },
  '/api/scenario/state': {
    kind: 'any',
    run: async (s, b) => ({ problemGone: await s.problemGone(ticketOf(b), obj(b, 'world') as never) }),
  },
  '/api/scenario/asks': {
    kind: 'any',
    run: async (s, b) => ({ texts: await s.askTexts(ticketOf(b), obj(b, 'flags')) }),
  },
  '/api/scenario/ask': {
    kind: 'any',
    run: (s, b) => s.ask(ticketOf(b), str(b, 'askId'), obj(b, 'world') as never, obj(b, 'flags')),
  },
  '/api/scenario/grade': {
    kind: 'any',
    run: (s, b) => s.grade(ticketOf(b), {
      world: obj(b, 'world') as never, ticket: obj(b, 'ticket') as never, session: obj(b, 'session') as never,
    }),
  },
  '/api/course/lesson': { kind: 'content', run: (s, b) => s.lesson(str(b, 'course'), str(b, 'section'), str(b, 'lesson')) },
  '/api/course/check': {
    kind: 'any',
    run: (s, b) => {
      const answer = b['answer']
      if (typeof answer !== 'number' && typeof answer !== 'string') throw new ContentError('bad', ERRORS.bad)
      return s.check(str(b, 'course'), str(b, 'section'), str(b, 'lesson'), str(b, 'check'), answer)
    },
  },
  '/api/course/quiz': { kind: 'content', run: (s, b) => s.quiz(str(b, 'course'), str(b, 'section')) },
  '/api/course/quiz/submit': {
    kind: 'any',
    run: (s, b) => s.submitQuiz(str(b, 'course'), str(b, 'section'), obj(b, 'answers') as never),
  },
  '/api/interview/start': {
    kind: 'interview',
    run: (s, b) => s.interviewStart(str(b, 'track'), b['attempt'] as number, b['solved'] as never),
  },
  '/api/interview/answer': { kind: 'any', run: (s, b) => s.interviewAnswer(obj(b, 'run') as never, str(b, 'text')) },
  '/api/interview/faq': { kind: 'any', run: async (s, b) => ({ reply: await s.interviewFaq(str(b, 'track'), str(b, 'text')) }) },
  '/api/interview/grade': { kind: 'any', run: (s, b) => s.interviewGrade(obj(b, 'run') as never) },
}

/**
 * HTTP-обработчик API контента — стандартный `(Request) => Response`.
 *
 * Один и тот же для Node на Pi, для dev-сервера Vite и для тестов.
 * Присланное — чужие данные: любое исключение сервиса на них — 400, а
 * не падение процесса. `ip` подставляет хост (Node знает сокет).
 */
export function createHandler(
  service: ContentPort,
  o: { now: () => number },
): (req: Request, ip?: string) => Promise<Response> {
  const limiter = createLimiter(o.now)

  const limited = (ip: string, kind: LimitKind): Response | null => {
    for (const k of kind === 'any' ? ['any' as const] : ['any' as const, kind]) {
      const wait = limiter.take(ip, k)
      if (wait > 0) return reply({ error: ERRORS.limited }, 429, { 'Retry-After': String(wait) })
    }
    return null
  }

  return async (req, ip = 'unknown') => {
    const path = new URL(req.url).pathname
    try {
      if (path === '/api/catalog' && req.method === 'GET') {
        return limited(ip, 'any') ?? reply(await service.catalog())
      }
      const route = req.method === 'POST' ? POST[path] : undefined
      if (!route) return reply({ error: ERRORS.notFound }, 404)

      const deny = limited(ip, route.kind)
      if (deny) return deny

      const text = await req.text()
      if (new TextEncoder().encode(text).length > MAX_BODY) return reply({ error: ERRORS.tooLarge }, 413)
      let body: unknown
      try {
        body = JSON.parse(text)
      } catch {
        return reply({ error: ERRORS.bad }, 400)
      }
      if (!isObject(body)) return reply({ error: ERRORS.bad }, 400)
      return reply(await route.run(service, body) ?? null)
    } catch (e) {
      if (e instanceof ContentError && e.kind === 'expired') return reply({ error: ERRORS.expired }, 403)
      if (e instanceof ContentError && e.kind === 'bad') return reply({ error: e.message }, 400)
      return reply({ error: ERRORS.bad }, 400)
    }
  }
}
