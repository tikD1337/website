import type { QuizGrade } from './answer'
import type { Course, Learning, QuizResult } from './types'

/**
 * Статусы курса и запись прогресса.
 *
 * Хранится только то, что сделал ученик: верные ответы и попытки
 * квизов. Открыт ли урок, сдана ли секция, пройден ли курс — выводится
 * из этого по текущей редакции курса, как счётчики выводятся из
 * истории. Второй экземпляр статуса разошёлся бы с первым при первой же
 * правке курса: адрес проверки, которой больше нет, просто не
 * участвует, а новая проверка честно переоткрывает урок.
 */

export function emptyLearning(): Learning {
  return { checks: [], quizzes: [] }
}

export const checkPath = (course: string, section: string, lesson: string, check: string) =>
  `${course}/${section}/${lesson}/${check}`

export const quizPath = (course: string, section: string) => `${course}/${section}`

export type LessonStatus = 'done' | 'open' | 'locked'
export type QuizStatus = 'passed' | 'open' | 'locked'

export interface CourseState {
  done: boolean
  /** когда сдан последний квиз курса; `null` — курс не пройден */
  doneAt: string | null
  lessonsDone: number
  lessonsTotal: number
  quizzesPassed: number
  quizzesTotal: number
  sections: Array<{
    id: string
    status: 'open' | 'locked'
    quiz: QuizStatus
    lessons: Array<{ id: string; status: LessonStatus }>
  }>
}

/**
 * Первая секция открыта; следующая — после сданного квиза предыдущей.
 * В открытой секции уроки идут по порядку, квиз — после всех уроков.
 */
export function courseState(course: Course, l: Learning): CourseState {
  const answered = new Set(l.checks)
  const passedAt = (id: string) => l.quizzes.find(q => q.id === id)?.passedAt ?? null

  let open = true
  const sections = course.sections.map(section => {
    const sectionOpen = open
    let prevDone = true
    const lessons = section.lessons.map(lesson => {
      const done = lesson.checks.every(c => answered.has(checkPath(course.id, section.id, lesson.id, c.id)))
      const status: LessonStatus = !sectionOpen || !prevDone ? 'locked' : done ? 'done' : 'open'
      prevDone = status === 'done'
      return { id: lesson.id, status }
    })
    const quizPassed = passedAt(quizPath(course.id, section.id)) !== null
    const quiz: QuizStatus = !sectionOpen || !prevDone ? 'locked' : quizPassed ? 'passed' : 'open'
    open = quiz === 'passed'
    return { id: section.id, status: sectionOpen ? 'open' as const : 'locked' as const, quiz, lessons }
  })

  const all = sections.flatMap(s => s.lessons)
  const passed = sections.filter(s => s.quiz === 'passed')
  const done = sections.length > 0 && passed.length === sections.length
  const dates = passed.map(s => passedAt(quizPath(course.id, s.id))!).sort()
  return {
    done,
    doneAt: done ? dates.at(-1)! : null,
    lessonsDone: all.filter(x => x.status === 'done').length,
    lessonsTotal: all.length,
    quizzesPassed: passed.length,
    quizzesTotal: sections.length,
    sections,
  }
}

export function recordCheck(l: Learning, path: string): Learning {
  return l.checks.includes(path) ? l : { ...l, checks: [...l.checks, path] }
}

/** Каждая попытка пишется; дата сдачи — первая, лучший результат — максимум. */
export function recordQuiz(l: Learning, path: string, g: QuizGrade, at: string): Learning {
  const prev = l.quizzes.find(q => q.id === path)
  const next: QuizResult = {
    id: path,
    attempts: (prev?.attempts ?? 0) + 1,
    best: Math.max(prev?.best ?? 0, g.score),
    total: g.total,
    passedAt: prev?.passedAt ?? (g.passed ? at : null),
  }
  return {
    ...l,
    quizzes: prev ? l.quizzes.map(q => (q.id === path ? next : q)) : [...l.quizzes, next],
  }
}

const earliest = (a: string | null, b: string | null) =>
  a === null ? b : b === null ? a : (a < b ? a : b)

/**
 * Гидратация: загруженное первым, накопленное до конца загрузки
 * дописывается. Проверки — объединением, у квиза одного адреса
 * попытки складываются, лучший результат — максимум, дата сдачи —
 * более ранняя.
 */
export function mergeLearning(loaded: Learning, inMemory: Learning): Learning {
  const checks = [...loaded.checks, ...inMemory.checks.filter(c => !loaded.checks.includes(c))]
  const quizzes = loaded.quizzes.map(q => {
    const m = inMemory.quizzes.find(x => x.id === q.id)
    return m
      ? { id: q.id, attempts: q.attempts + m.attempts, best: Math.max(q.best, m.best), total: m.total, passedAt: earliest(q.passedAt, m.passedAt) }
      : { ...q }
  })
  const fresh = inMemory.quizzes.filter(m => !loaded.quizzes.some(q => q.id === m.id)).map(q => ({ ...q }))
  return { checks, quizzes: [...quizzes, ...fresh] }
}
