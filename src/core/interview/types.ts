/**
 * Интервью на первую линию.
 *
 * Трек — контент, как сценарии и курсы: лежит в `src/interviews/` и
 * проверяется загрузчиком. Ход интервью ведёт детерминированный движок:
 * порядок вопросов, уточнение, этапы и вердикт считаются здесь, а
 * модель лишь оживляет разговор. Оценка — по чек-листу пунктов у
 * каждого вопроса, одна и та же при любом режиме разъёма.
 */

export type InterviewStage = 'intro' | 'technical' | 'experience' | 'questions' | 'done'
export type QuestionStage = 'intro' | 'technical' | 'experience'

/**
 * Пункт чек-листа: что должно прозвучать в ответе. Прозвучал, если в
 * ответе есть любой из маркеров — основа слова или команда.
 */
export interface Point {
  id: string
  label: string
  markers: string[]
  /** почему этот пункт важен — разбор пропущенного */
  why: string
}

export interface Question {
  id: string
  stage: QuestionStage
  /** у вопроса об опыте может содержать `{тикет}` */
  prompt: string
  points: Point[]
  /** образцовый ответ — только для разбора, модели не уходит */
  expected: string
  /** уточнение, если в первом ответе недобор */
  followUp?: string
  /** вопрос об опыте: про какой сценарий */
  scenario?: string
}

export interface InterviewTrack {
  id: string
  title: string
  summary: string
  /** имя и роль интервьюера */
  interviewer: string
  /** первая реплика интервьюера */
  greeting: string
  /** переход к вопросам кандидата */
  yourQuestions: string
  /** факты о компании — для ответов на вопросы кандидата */
  company: string[]
  intro: Question
  /** пул технических вопросов */
  technical: Question[]
  perInterview: number
  /** по сценариям и один общий — без `scenario` */
  experience: Question[]
  faq: Array<{ ask: string; reply: string }>
}

export interface Line {
  speaker: 'interviewer' | 'candidate'
  text: string
}

/** Ход интервью. Незаконченный не сохраняется — как незакрытый тикет. */
export interface InterviewRun {
  track: string
  attempt: number
  /** id вопросов по порядку: знакомство, технические, опыт */
  plan: string[]
  /** текущий вопрос в плане; `plan.length` — вопросы плана кончились */
  index: number
  stage: InterviewStage
  /** уточнение к текущему вопросу уже задано */
  followUpAsked: boolean
  /** ответы кандидата по вопросам — первый и, если было, на уточнение */
  answers: Record<string, string[]>
  /** вопросы кандидата интервьюеру */
  asked: string[]
  transcript: Line[]
  /** краткое описание тикета для вопроса об опыте */
  experienceTicket: string | null
}

export type Verdict = 'hire' | 'maybe' | 'no'

export const VERDICT_LABEL: Record<Verdict, string> = {
  hire: 'Рекомендован',
  maybe: 'Под вопросом',
  no: 'Не рекомендован',
}

export interface QuestionResult {
  id: string
  stage: QuestionStage
  /** текст, как его услышал кандидат */
  prompt: string
  answers: string[]
  covered: string[]
  missing: string[]
  score: number
  expected: string
  /**
   * Пункты вопроса с названием и разбором, в порядке вопроса.
   *
   * Разбор читает их из результата, а не из трека: трек с переездом на
   * сервер (срез 8А) браузеру не приходит. Записи прошлого формата
   * пунктов не несут — разбор показывает их id.
   */
  points?: Array<{ id: string; label: string; why: string }>
}

export interface InterviewResult {
  verdict: Verdict
  intro: number
  technical: number
  experience: number
  questionsAsked: number
  items: QuestionResult[]
}

export interface InterviewRecord {
  id: string
  track: string
  at: string
  attempt: number
  result: InterviewResult
}
