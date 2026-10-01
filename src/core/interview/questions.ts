import type { InterviewRun, InterviewTrack, Question } from './types'

/** Поиск вопроса трека и его текст — общие для хода и оценки. */

const allQuestions = (t: InterviewTrack) => [t.intro, ...t.technical, ...t.experience]

export function questionById(t: InterviewTrack, id: string): Question {
  const q = allQuestions(t).find(x => x.id === id)
  if (!q) throw new Error(`интервью ${t.id}: нет вопроса ${id}`)
  return q
}

/** Текст вопроса, как его слышит кандидат: `{тикет}` — описание его тикета. */
export function questionText(t: InterviewTrack, run: InterviewRun, id: string): string {
  const q = questionById(t, id)
  return run.experienceTicket ? q.prompt.replace('{тикет}', `тикет «${run.experienceTicket}»`) : q.prompt
}

