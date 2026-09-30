import { questionById, questionText } from './questions'
import type { InterviewResult, InterviewRun, InterviewTrack, Question, QuestionResult, Verdict } from './types'

/**
 * Оценка интервью по чек-листу.
 *
 * Пункт прозвучал, если в ответе есть любой его маркер — основа слова
 * («разблокир» ловит все формы) или команда. Это разбор по чек-листу из
 * дорожной карты, и он один при любом режиме разъёма: модель оживляет
 * разговор, но не судит — иначе вердикт зависел бы от настроек.
 */

/** Нижний регистр, `ё` → `е`, схлопнутые пробелы. */
export function normalizeAnswer(s: string): string {
  return s.toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim()
}

export interface Coverage {
  covered: string[]
  missing: string[]
  /** доля прозвучавших пунктов, 0..1 */
  score: number
}

/** Засчитываются все ответы на вопрос вместе — первый и ответ на уточнение. */
export function coverage(q: Question, answers: string[]): Coverage {
  const text = normalizeAnswer(answers.join(' '))
  const heard = (markers: string[]) => markers.some(m => {
    const marker = normalizeAnswer(m)
    return marker !== '' && text.includes(marker)
  })
  const covered = q.points.filter(p => heard(p.markers)).map(p => p.id)
  const missing = q.points.filter(p => !covered.includes(p.id)).map(p => p.id)
  return { covered, missing, score: q.points.length ? covered.length / q.points.length : 0 }
}

/**
 * Вердикт. Промолчать на «ваши вопросы» — плохой знак и в жизни: без
 * вопросов кандидата «рекомендован» не бывает, как бы хорошо он ни
 * отвечал.
 */
export function verdictFor(technical: number, experience: number, asked: number): Verdict {
  if (technical >= 0.7 && experience >= 0.5 && asked >= 1) return 'hire'
  if (technical >= 0.45) return 'maybe'
  return 'no'
}

/**
 * Итог интервью: доли по этапам, вопросы кандидата, вердикт и разбор
 * каждого вопроса — что прозвучало, чего не хватило, какого ответа
 * ждали.
 */
export function gradeInterview(t: InterviewTrack, run: InterviewRun): InterviewResult {
  const items: QuestionResult[] = run.plan.map(id => {
    const q = questionById(t, id)
    const answers = run.answers[id] ?? []
    return {
      id, stage: q.stage, prompt: questionText(t, run, id), answers,
      ...coverage(q, answers),
      expected: q.expected,
    }
  })
  const mean = (stage: QuestionResult['stage']) => {
    const xs = items.filter(i => i.stage === stage)
    return xs.length ? xs.reduce((s, i) => s + i.score, 0) / xs.length : 0
  }
  const technical = mean('technical')
  const experience = mean('experience')
  return {
    verdict: verdictFor(technical, experience, run.asked.length),
    intro: mean('intro'),
    technical,
    experience,
    questionsAsked: run.asked.length,
    items,
  }
}
