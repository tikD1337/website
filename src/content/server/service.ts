import {
  ContentError, EXPIRED,
  type Capsule, type Catalog, type ContentService, type CourseOutline, type PublicCheck, type TrackMeta,
} from '../port'
import { metaOf, type Scenario } from '../../core/scenario/types'
import { validateScenarios } from '../../core/scenario/load'
import { allHold } from '../../core/scenario/check'
import { applyInject } from '../../core/world/world'
import { relogin } from '../../core/directory/accounts'
import { gradeIncident } from '../../core/grading/grade'
import { checkAnswer, gradeQuiz } from '../../core/learning/answer'
import { validateCourses } from '../../core/learning/validate'
import type { Answer, Check, Course } from '../../core/learning/types'
import { startInterview, answer, faqReply, finishQuestions, type Solved } from '../../core/interview/flow'
import { gradeInterview } from '../../core/interview/grade'
import { validateInterviews } from '../../core/interview/validate'
import type { InterviewRun, InterviewTrack } from '../../core/interview/types'

/** Подпись тикета живёт сутки: дольше смена не длится. */
const TOKEN_TTL_MS = 24 * 60 * 60 * 1000

export interface ContentServiceOptions {
  scenarios: Scenario[]
  courses: Course[]
  tracks: InterviewTrack[]
  /** HMAC секретом сервера; сервис о `node:crypto` не знает */
  sign: (data: string) => string
  now: () => number
  /** с чем сверяются ссылки курсов и треков на сценарии; по умолчанию — своя библиотека */
  knownScenarioIds?: string[]
}

const bad = (what: string) => new ContentError('bad', `не найдено: ${what}`)
const malformed = (what: string) => new ContentError('bad', `неверный запрос: ${what}`)

/** Курс без содержания: id, названия, id проверок, практика, размер квиза. */
export function outlineOf(c: Course): CourseOutline {
  return {
    id: c.id, title: c.title, summary: c.summary,
    sections: c.sections.map(s => ({
      id: s.id, title: s.title, quizSize: s.quiz.length,
      lessons: s.lessons.map(l => ({
        id: l.id, title: l.title, checks: l.checks.map(k => ({ id: k.id })),
        ...(l.practice ? { practice: l.practice } : {}),
      })),
    })),
  }
}

/** Проверка без ответа: варианты — только тексты, у ввода — только вопрос. */
function publicCheck(k: Check): PublicCheck {
  return k.kind === 'choice'
    ? { id: k.id, kind: 'choice', prompt: k.prompt, options: k.options.map(o => o.text) }
    : { id: k.id, kind: 'text', prompt: k.prompt }
}

function trackMeta(t: InterviewTrack): TrackMeta {
  return {
    id: t.id, title: t.title, summary: t.summary, interviewer: t.interviewer,
    company: [...t.company], perInterview: t.perInterview,
  }
}

const isObject = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x)
const isStrings = (x: unknown): x is string[] => Array.isArray(x) && x.every(s => typeof s === 'string')

/**
 * Сервис контента — та же оценка, что на сервере, без сети.
 *
 * Им отвечает HTTP-обработчик на Pi и в dev-сервере, и им же — как
 * локальным разъёмом — пользуются тесты: оценка в тестах и на сервере не
 * может разойтись. Всё присланное снаружи (запуск интервью, ответы
 * квиза) проверяется как `unknown`: сервис — граница доверия.
 */
export function createContentService(o: ContentServiceOptions): ContentService {
  const { scenarios, courses, tracks, sign, now } = o
  // Опечатка в контенте падает при запуске сервера, а не на тикете через полчаса.
  validateScenarios(scenarios)
  const known = o.knownScenarioIds ?? scenarios.map(s => s.id)
  validateCourses(courses, known)
  validateInterviews(tracks, known)

  const scenario = (id: string) => scenarios.find(s => s.id === id) ?? (() => { throw bad(`сценарий ${id}`) })()

  /** Сценарий подписанного тикета; чужая, битая и старая подпись — отказ. */
  const signed = (c: Capsule): Scenario => {
    const token = typeof c?.token === 'string' ? c.token : ''
    const cut = token.lastIndexOf('.')
    const data = token.slice(0, cut)
    const at = data.lastIndexOf('.')
    const id = data.slice(0, at)
    const issued = Number(data.slice(at + 1))
    const fresh = Number.isFinite(issued) && now() - issued <= TOKEN_TTL_MS && issued <= now()
    if (cut < 0 || at < 0 || !fresh || sign(data) !== token.slice(cut + 1)) {
      throw new ContentError('expired', EXPIRED)
    }
    return scenario(id)
  }

  const course = (id: string) => courses.find(c => c.id === id) ?? (() => { throw bad(`курс ${id}`) })()
  const section = (c: string, s: string) =>
    course(c).sections.find(x => x.id === s) ?? (() => { throw bad(`секция ${c}/${s}`) })()
  const lesson = (c: string, s: string, l: string) =>
    section(c, s).lessons.find(x => x.id === l) ?? (() => { throw bad(`урок ${c}/${s}/${l}`) })()
  const track = (id: string) => tracks.find(t => t.id === id) ?? (() => { throw bad(`трек интервью ${id}`) })()

  const unlocked = (unlockedBy: string | undefined, flags: Record<string, unknown>) =>
    !unlockedBy || (isObject(flags) && flags[unlockedBy] === true)

  /** Запуск интервью пришёл от клиента — проверяется до последнего поля, которое читает ход. */
  const run = (raw: unknown): { t: InterviewTrack; r: InterviewRun } => {
    if (!isObject(raw) || typeof raw['track'] !== 'string') throw malformed('запуск интервью')
    const t = track(raw['track'])
    const ids = new Set([t.intro, ...t.technical, ...t.experience].map(q => q.id))
    const ok = typeof raw['attempt'] === 'number'
      && isStrings(raw['plan']) && raw['plan'].every(id => ids.has(id))
      && Number.isInteger(raw['index']) && (raw['index'] as number) >= 0 && (raw['index'] as number) <= raw['plan'].length
      && ['intro', 'technical', 'experience', 'questions', 'done'].includes(raw['stage'] as string)
      && typeof raw['followUpAsked'] === 'boolean'
      && isObject(raw['answers']) && Object.values(raw['answers']).every(isStrings)
      && isStrings(raw['asked'])
      && Array.isArray(raw['transcript']) && raw['transcript'].every(l => isObject(l)
        && (l['speaker'] === 'interviewer' || l['speaker'] === 'candidate') && typeof l['text'] === 'string')
      && (raw['experienceTicket'] === null || typeof raw['experienceTicket'] === 'string')
    if (!ok) throw malformed('запуск интервью')
    return { t, r: raw as unknown as InterviewRun }
  }

  return {
    catalog(): Catalog {
      return {
        scenarios: scenarios.map(metaOf),
        courses: courses.map(outlineOf),
        tracks: tracks.map(trackMeta),
      }
    },

    capsule(id) {
      const s = scenario(id)
      const data = `${s.id}.${now()}`
      return {
        scenarioId: s.id,
        token: `${data}.${sign(data)}`,
        inject: structuredClone(s.inject),
        persona: structuredClone(s.persona),
        confirmReplies: [...s.confirmReplies],
        asks: (s.asks ?? []).map(a => ({ id: a.id, ...(a.unlockedBy ? { unlockedBy: a.unlockedBy } : {}) })),
      }
    },

    problemGone(c, world) {
      return allHold(world, signed(c).fixedWhen)
    },

    askTexts(c, flags) {
      const texts: Record<string, string> = {}
      for (const a of signed(c).asks ?? []) if (unlocked(a.unlockedBy, flags)) texts[a.id] = a.ask
      return texts
    },

    ask(c, askId, world, flags) {
      const s = signed(c)
      const a = s.asks?.find(x => x.id === askId)
      if (!a) throw bad(`просьба ${askId}`)
      if (!unlocked(a.unlockedBy, flags)) return null
      /*
        Заявитель сообщает то, что видит: ответ считается на копии мира
        после просьбы. Мир клиента сервер не трогает — эффект клиент
        применит к своему миру сам.
      */
      const after = structuredClone(world)
      applyInject(after, a.effect)
      if (a.relogin) relogin(after, a.relogin, { now: () => new Date(now()) })
      const helped = a.replyIfBroken === undefined || allHold(after, s.fixedWhen)
      return {
        ask: a.ask,
        reply: helped ? a.reply : a.replyIfBroken!,
        effect: structuredClone(a.effect),
        ...(a.relogin ? { relogin: a.relogin } : {}),
      }
    },

    grade(c, input) {
      const s = signed(c)
      return {
        scorecard: gradeIncident({ ...input, scenario: s }),
        onEscalate: structuredClone(s.onEscalate ?? []),
      }
    },

    lesson(c, s, l) {
      const x = lesson(c, s, l)
      return { body: structuredClone(x.body), checks: x.checks.map(publicCheck) }
    },

    check(c, s, l, k, given) {
      const check = lesson(c, s, l).checks.find(x => x.id === k)
      if (!check) throw bad(`проверка ${c}/${s}/${l}/${k}`)
      return checkAnswer(check, given)
    },

    quiz(c, s) {
      return { questions: section(c, s).quiz.map(publicCheck) }
    },

    submitQuiz(c, s, answers) {
      if (!isObject(answers)) throw malformed('ответы квиза')
      const given: Record<string, Answer> = {}
      for (const [id, v] of Object.entries(answers)) {
        if (typeof v === 'number' || typeof v === 'string') given[id] = v
      }
      return gradeQuiz(section(c, s).quiz, given)
    },

    interviewStart(id, attempt, solved) {
      const t = track(id)
      const fine = Number.isInteger(attempt) && attempt >= 0 && Array.isArray(solved)
        && solved.every(x => isObject(x) && typeof x['scenarioId'] === 'string' && typeof x['summary'] === 'string')
      if (!fine) throw malformed('начало интервью')
      return startInterview(t, attempt, solved as Solved[])
    },

    interviewAnswer(raw, text) {
      const { t, r } = run(raw)
      if (typeof text !== 'string') throw malformed('ответ кандидата')
      return answer(t, r, text)
    },

    interviewFaq(id, text) {
      if (typeof text !== 'string') throw malformed('вопрос кандидата')
      return faqReply(track(id), text)
    },

    interviewGrade(raw) {
      const { t, r } = run(raw)
      return gradeInterview(t, finishQuestions(r))
    },
  }
}
