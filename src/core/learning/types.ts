/**
 * Курсы: уроки с проверками, секции с квизами.
 *
 * Курс — контент, а не состояние: он лежит модулем в `src/courses/`, как
 * сценарии, и проверяется загрузчиком при запуске. Состояние ученика —
 * `Learning` в прогрессе: какие проверки отвечены верно и как сданы
 * квизы. Всё остальное (открыт ли урок, пройден ли курс) выводится.
 */

/** Блок текста урока. В абзаце `код` в обратных кавычках — моноширинно. */
export type Block =
  | { kind: 'p'; text: string }
  | { kind: 'code'; text: string }
  | { kind: 'list'; items: string[] }

/**
 * Вариант ответа. `why` — разбор: у неверного — почему неверен, у
 * верного — почему верен. Показывается после ответа.
 */
export interface Option {
  text: string
  correct?: true
  why: string
}

export type Check =
  | { id: string; kind: 'choice'; prompt: string; options: Option[] }
  | {
      id: string
      kind: 'text'
      prompt: string
      /** допустимые ответы — сравниваются после нормализации */
      accept: string[]
      /** разбор верного ответа */
      why: string
      /** известные неверные ответы с разбором */
      misses?: Array<{ answer: string; why: string }>
    }

/** Ответ ученика: индекс варианта или введённый текст. */
export type Answer = number | string

export interface Lesson {
  id: string
  title: string
  body: Block[]
  checks: Check[]
  /** id сценария, на котором урок тренируется */
  practice?: string
}

export interface Section {
  id: string
  title: string
  lessons: Lesson[]
  quiz: Check[]
}

export interface Course {
  id: string
  title: string
  summary: string
  sections: Section[]
}

/** Результат квиза секции — по адресу `курс/секция`. */
export interface QuizResult {
  id: string
  attempts: number
  best: number
  total: number
  /** первая сдача; `null` — ещё не сдан */
  passedAt: string | null
}

/** Память ученика: верно отвеченные проверки (`курс/секция/урок/проверка`) и квизы. */
export interface Learning {
  checks: string[]
  quizzes: QuizResult[]
  /**
   * Верные ответы проверок с разбором, по адресу проверки.
   *
   * Разбор приходит с сервера один раз — в ответ на ответ (срез 8А), а
   * урок открывают снова: отвеченная проверка показывает сохранённое.
   * Прогресс прошлого формата этого поля не несёт.
   */
  answers?: Record<string, { answer: Answer; why: string | null }>
}
