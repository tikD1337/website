import {
  BAD, ContentError, EXPIRED, LIMITED, UNAVAILABLE,
  type ContentPort,
} from './port'

export type FetchFn = (url: string, init?: RequestInit) => Promise<Response>

/**
 * Сетевой разъём контента — то, чем пользуется приложение (срез 8А).
 *
 * Каждый ответ — промис. Сеть упала или сервер ответил 5xx — «недоступен»;
 * 403 — подпись не принята; 429 — лимит; 400/404/413 — текст сервера.
 * Тексты — для плашки, вид — для решения стора.
 */
export function remoteContent(base = '/api', doFetch: FetchFn = (u, i) => fetch(u, i)): ContentPort {
  const call = async <T>(path: string, body?: unknown): Promise<T> => {
    let r: Response
    try {
      r = await doFetch(`${base}${path}`, body === undefined
        ? { method: 'GET' }
        : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    } catch {
      throw new ContentError('unavailable', UNAVAILABLE)
    }
    if (r.status >= 500) throw new ContentError('unavailable', UNAVAILABLE)
    if (r.status === 403) throw new ContentError('expired', EXPIRED)
    if (r.status === 429) throw new ContentError('limited', LIMITED)
    let data: unknown
    try {
      data = await r.json()
    } catch {
      if (r.ok) throw new ContentError('unavailable', UNAVAILABLE)
      throw new ContentError('bad', BAD)
    }
    if (!r.ok) {
      const error = (data as { error?: unknown } | null)?.error
      throw new ContentError('bad', typeof error === 'string' && error ? error : BAD)
    }
    return data as T
  }

  return {
    catalog: () => call('/catalog'),
    capsule: id => call('/scenario/capsule', { id }),
    problemGone: async (c, world) => (await call<{ problemGone: boolean }>('/scenario/state', { token: c.token, world })).problemGone,
    askTexts: async (c, flags) => (await call<{ texts: Record<string, string> }>('/scenario/asks', { token: c.token, flags })).texts,
    ask: (c, askId, world, flags) => call('/scenario/ask', { token: c.token, askId, world, flags }),
    grade: (c, input) => call('/scenario/grade', { token: c.token, ...input }),
    lesson: (course, section, lesson) => call('/course/lesson', { course, section, lesson }),
    check: (course, section, lesson, check, answer) => call('/course/check', { course, section, lesson, check, answer }),
    quiz: (course, section) => call('/course/quiz', { course, section }),
    submitQuiz: (course, section, answers) => call('/course/quiz/submit', { course, section, answers }),
    interviewStart: (track, attempt, solved) => call('/interview/start', { track, attempt, solved }),
    interviewAnswer: (run, text) => call('/interview/answer', { run, text }),
    interviewFaq: async (track, text) => (await call<{ reply: string }>('/interview/faq', { track, text })).reply,
    interviewGrade: run => call('/interview/grade', { run }),
  }
}
