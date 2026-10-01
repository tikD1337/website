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
  /**
   * `right` — верный ответ словами: только у сданного квиза и только у
   * ошибки. Несданный квиз ответов не выдаёт — иначе пересдача стала бы
   * переписыванием с экрана; с сервером это правило держит он сам.
   */
  items: Array<{ id: string; correct: boolean; why: string | null; right: { text: string; why: string } | null }>
}

/** Верный ответ словами — для пройденной проверки и сданного квиза. */
export function rightAnswer(check: Check): { text: string; why: string } {
  if (check.kind === 'choice') {
    const o = check.options.find(x => x.correct)!
    return { text: o.text, why: o.why }
  }
  return { text: check.accept[0]!, why: check.why }
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
    items: verdicts.map((v, i) => ({
      id: v.id, correct: v.correct, why: passed || !v.correct ? v.why : null,
      right: passed && !v.correct ? rightAnswer(quiz[i]!) : null,
    })),
  }
}
