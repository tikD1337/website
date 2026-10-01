import type { InjectPatch } from '../core/world/world'
import type { WorldState } from '../core/world/types'
import type { Persona, ScenarioMeta } from '../core/scenario/types'
import type { Ticket } from '../core/tickets/types'
import type { SessionLog } from '../core/session/types'
import type { Scorecard } from '../core/grading/grade'
import type { Answer, Block } from '../core/learning/types'
import type { QuizGrade, Verdict } from '../core/learning/answer'
import type { InterviewResult, InterviewRun, InterviewTrack } from '../core/interview/types'
import type { Solved } from '../core/interview/flow'

/**
 * Разъём контента — граница между браузером и сервером (срез 8А).
 *
 * Браузер импортирует отсюда только типы и помощники: ни библиотек, ни
 * сервиса, ни `node:*`. Ответ — значение или промис: сервис отвечает
 * сразу (на нём идут тесты), сетевой разъём — промисом.
 */
export type MaybePromise<T> = T | Promise<T>

export type ContentErrorKind = 'unavailable' | 'expired' | 'limited' | 'bad'

export const UNAVAILABLE = 'Сервер недоступен — проверьте связь и повторите.'
export const EXPIRED = 'Сервер не узнал тикет — начните смену заново.'
export const LIMITED = 'Сервер просит подождать: слишком много запросов.'
export const BAD = 'Сервер не понял запрос.'

/** Отказ разъёма: вид — для решения, что делать; текст — для плашки. */
export class ContentError extends Error {
  constructor(readonly kind: ContentErrorKind, message: string) {
    super(message)
    this.name = 'ContentError'
  }
}

const isThenable = <T>(x: MaybePromise<T>): x is Promise<T> =>
  typeof (x as { then?: unknown } | null)?.then === 'function'

/**
 * Синхронное значение — синхронный результат, промис — промис.
 *
 * Исключение и отказ уходят в `fail` одинаково: стору не нужно знать,
 * синхронный у него разъём или сетевой.
 */
export function settle<T, R>(
  run: () => MaybePromise<T>,
  ok: (v: T) => R,
  fail: (e: unknown) => R,
): MaybePromise<R> {
  let x: MaybePromise<T>
  try {
    x = run()
  } catch (e) {
    return fail(e)
  }
  return isThenable(x) ? x.then(ok, fail) : ok(x)
}

/** Все значения разом: хоть одно промисом — промис. */
export function all<T>(xs: Array<MaybePromise<T>>): MaybePromise<T[]> {
  return xs.some(isThenable) ? Promise.all(xs) : (xs as T[])
}

/** Текст плашки: свой у отказа разъёма, «недоступен» у всего остального. */
export function messageOf(e: unknown): string {
  return e instanceof ContentError ? e.message : UNAVAILABLE
}

/**
 * Капсула тикета — то, что нужно браузеру, чтобы тикет игрался.
 *
 * Приходит при входе тикета в окно смены. Поломку браузер видит — мир
 * ломается у него; условий починки, причины, целей и текстов просьб в
 * капсуле нет. `token` — подпись сервера `<сценарий>.<выдано>.<HMAC>`:
 * без неё проверка, просьбы и оценка не проходят.
 */
export interface Capsule {
  scenarioId: string
  token: string
  inject: InjectPatch[]
  persona: Persona
  confirmReplies: [string, string]
  asks: Array<{ id: string; unlockedBy?: string }>
}

/** Курс без содержания: на нём считаются статусы. */
export interface CourseOutline {
  id: string
  title: string
  summary: string
  sections: Array<{
    id: string
    title: string
    quizSize: number
    lessons: Array<{ id: string; title: string; checks: Array<{ id: string }>; practice?: string }>
  }>
}

/** Проверка без ответов и разборов. */
export type PublicCheck =
  | { id: string; kind: 'choice'; prompt: string; options: string[] }
  | { id: string; kind: 'text'; prompt: string }

export interface LessonContent { body: Block[]; checks: PublicCheck[] }
export interface QuizContent { questions: PublicCheck[] }

export type TrackMeta = Pick<InterviewTrack, 'id' | 'title' | 'summary' | 'interviewer' | 'company' | 'perInterview'>

export interface Catalog { scenarios: ScenarioMeta[]; courses: CourseOutline[]; tracks: TrackMeta[] }

export interface AskResult { ask: string; reply: string; effect: InjectPatch[]; relogin?: string }
export interface GradeResult { scorecard: Scorecard; onEscalate: InjectPatch[] }

export interface ContentPort {
  catalog(): MaybePromise<Catalog>
  capsule(scenarioId: string): MaybePromise<Capsule>
  problemGone(c: Capsule, world: WorldState): MaybePromise<boolean>
  askTexts(c: Capsule, flags: Record<string, unknown>): MaybePromise<Record<string, string>>
  ask(c: Capsule, askId: string, world: WorldState, flags: Record<string, unknown>): MaybePromise<AskResult | null>
  grade(c: Capsule, input: { world: WorldState; ticket: Ticket; session: SessionLog }): MaybePromise<GradeResult>
  lesson(course: string, section: string, lesson: string): MaybePromise<LessonContent>
  check(course: string, section: string, lesson: string, check: string, answer: Answer): MaybePromise<Verdict>
  quiz(course: string, section: string): MaybePromise<QuizContent>
  submitQuiz(course: string, section: string, answers: Record<string, Answer>): MaybePromise<QuizGrade>
  interviewStart(track: string, attempt: number, solved: Solved[]): MaybePromise<InterviewRun>
  interviewAnswer(run: InterviewRun, text: string): MaybePromise<{ run: InterviewRun; next: string | null }>
  interviewFaq(track: string, text: string): MaybePromise<string>
  interviewGrade(run: InterviewRun): MaybePromise<InterviewResult>
}

/**
 * Тот же разъём, отвечающий сразу, — сервис контента.
 *
 * Тесты читают ответы без `await`, а стор, получив его, идёт синхронно:
 * поэтому существующие тесты не знают о сети.
 */
export type ContentService = {
  [K in keyof ContentPort]: (...a: Parameters<ContentPort[K]>) => Awaited<ReturnType<ContentPort[K]>>
}
