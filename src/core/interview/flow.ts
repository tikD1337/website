import { similarity } from '../dialogue/scripted'
import { coverage } from './grade'
import { questionById, questionText } from './questions'
import type { InterviewRun, InterviewStage, InterviewTrack } from './types'

export { questionById, questionText }

/**
 * Ход интервью: чистые функции над `InterviewRun`.
 *
 * Движок решает всё, что потом разбирается: какой вопрос следующий,
 * нужно ли уточнение, когда этап кончился. Вопрос всегда звучит текстом
 * контента — если его формулирует модель, разбору не с чем сверяться.
 * Модель может лишь добавить реакцию перед вопросом (это делает стор).
 */

/** Закрытый сценарий из истории — повод для вопроса об опыте. */
export interface Solved {
  scenarioId: string
  summary: string
}

export const FAQ_FALLBACK = 'Это лучше обсудить на следующем этапе, с командой.'

/** Нейтральная реакция без модели: по кругу, без оценки и подсказок. */
const REACTIONS = ['Понятно.', 'Хорошо, спасибо.', 'Принято.', 'Ясно, спасибо.']
export const reaction = (n: number) => REACTIONS[n % REACTIONS.length]!

/** Доля пунктов, ниже которой звучит уточнение. */
const FOLLOW_UP_BELOW = 0.5

/**
 * Начало интервью. Технические — `perInterview` подряд по кругу от
 * номера попытки: без случайности и без повтора подряд. Опыт — про
 * сценарий из истории, если такой вопрос есть, иначе общий.
 */
export function startInterview(t: InterviewTrack, attempt: number, solved: Solved[]): InterviewRun {
  const n = t.perInterview
  const start = (attempt * n) % t.technical.length
  const technical = Array.from({ length: n }, (_, i) => t.technical[(start + i) % t.technical.length]!.id)

  const matching = t.experience.filter(q => q.scenario && solved.some(s => s.scenarioId === q.scenario))
  const exp = matching.length
    ? matching[attempt % matching.length]!
    : t.experience.find(q => !q.scenario)!
  const ticket = exp.scenario ? solved.find(s => s.scenarioId === exp.scenario)!.summary : null

  const run: InterviewRun = {
    track: t.id, attempt,
    plan: [t.intro.id, ...technical, exp.id],
    index: 0,
    stage: 'intro',
    followUpAsked: false,
    answers: {},
    asked: [],
    transcript: [],
    experienceTicket: ticket,
  }
  return say(say(run, t.greeting), questionText(t, run, t.intro.id))
}

export function say(run: InterviewRun, text: string): InterviewRun {
  return { ...run, transcript: [...run.transcript, { speaker: 'interviewer', text }] }
}

const stageAt = (t: InterviewTrack, run: InterviewRun, index: number): InterviewStage =>
  index < run.plan.length ? questionById(t, run.plan[index]!).stage : 'questions'

/**
 * Ответ кандидата на текущий вопрос. `next` — что интервьюер скажет
 * дальше: уточнение, следующий вопрос или приглашение к вопросам
 * кандидата. Реплику в стенограмму добавляет вызывающий (через `say`),
 * чтобы перед ней могла встать реакция.
 */
export function answer(t: InterviewTrack, run: InterviewRun, text: string): { run: InterviewRun; next: string | null } {
  if (run.index >= run.plan.length) return { run, next: null }
  const id = run.plan[run.index]!
  const q = questionById(t, id)
  const answers = [...(run.answers[id] ?? []), text]
  const heard: InterviewRun = {
    ...run,
    answers: { ...run.answers, [id]: answers },
    transcript: [...run.transcript, { speaker: 'candidate', text }],
  }

  // Уточнение — один раз и только при недоборе: второй шанс, но не бесконечный.
  if (!run.followUpAsked && q.followUp && coverage(q, answers).score < FOLLOW_UP_BELOW) {
    return { run: { ...heard, followUpAsked: true }, next: q.followUp }
  }

  const index = run.index + 1
  const moved: InterviewRun = { ...heard, index, followUpAsked: false, stage: stageAt(t, run, index) }
  return { run: moved, next: index < run.plan.length ? questionText(t, moved, run.plan[index]!) : t.yourQuestions }
}

/** Вопрос кандидата интервьюеру — только на этапе «ваши вопросы». */
export function askInterviewer(run: InterviewRun, text: string): InterviewRun {
  if (run.stage !== 'questions') return run
  return { ...run, asked: [...run.asked, text], transcript: [...run.transcript, { speaker: 'candidate', text }] }
}

/** Ответ без модели: ближайшая заготовка, иначе — нейтральная отсрочка, а не молчание. */
export function faqReply(t: InterviewTrack, said: string): string {
  let best: { reply: string; score: number } | null = null
  for (const f of t.faq) {
    const score = similarity(said, f.ask)
    if (score >= 0.5 && (!best || score > best.score)) best = { reply: f.reply, score }
  }
  return best?.reply ?? FAQ_FALLBACK
}

export function finishQuestions(run: InterviewRun): InterviewRun {
  return { ...run, stage: 'done' }
}
