import type { Answer, Check } from './types'

/** Обрезка краёв, нижний регистр, схлопнутые пробелы: `  IPCONFIG   /release ` → `ipconfig /release`. */
export function normalizeText(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ')
}

export interface Verdict {
  correct: boolean
  /** разбор выбранного ответа; `null` — разбирать нечего (нет ответа, незнакомый текст) */
  why: string | null
}

export function checkAnswer(check: Check, answer: Answer | undefined): Verdict {
  if (check.kind === 'choice') {
    const option = typeof answer === 'number' ? check.options[answer] : undefined
    if (!option) return { correct: false, why: null }
    return { correct: option.correct === true, why: option.why }
  }

  if (typeof answer !== 'string') return { correct: false, why: null }
  const given = normalizeText(answer)
  if (check.accept.some(a => normalizeText(a) === given)) return { correct: true, why: check.why }
  const miss = check.misses?.find(m => normalizeText(m.answer) === given)
  return { correct: false, why: miss?.why ?? null }
}

export interface QuizGrade {
  score: number
  total: number
  passed: boolean
  items: Array<{ id: string; correct: boolean; why: string | null }>
}

/** Квиз сдан при 80 % верных: 4 из 5. */
const passes = (score: number, total: number) => score * 5 >= total * 4

/**
 * Оценка квиза секции.
 *
 * Несданный квиз разбирает только неверные ответы: показать верные
 * значило бы превратить пересдачу в переписывание ответов с экрана.
 * У сданного разобрано всё — теперь это уже объяснение, а не подсказка.
 */
export function gradeQuiz(quiz: Check[], answers: Record<string, Answer>): QuizGrade {
  const verdicts = quiz.map(q => ({ id: q.id, ...checkAnswer(q, answers[q.id]) }))
  const score = verdicts.filter(v => v.correct).length
  const passed = passes(score, quiz.length)
  return {
    score,
    total: quiz.length,
    passed,
    items: verdicts.map(v => ({ id: v.id, correct: v.correct, why: passed || !v.correct ? v.why : null })),
  }
}
