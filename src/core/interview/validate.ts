import type { InterviewTrack, Question } from './types'

/**
 * Загрузчик-сторож треков интервью: бросает при запуске стора.
 *
 * Правило то же, что у сценариев и курсов: опечатка автора падает сразу
 * и с адресом. Особенно — вопрос без пунктов: оценивать его нечем, и
 * разбор молча ставил бы ноль любому ответу.
 */
export function validateInterviews(tracks: InterviewTrack[], scenarioIds: string[]): void {
  for (const t of tracks) {
    const questions = [t.intro, ...t.technical, ...t.experience]
    const seen = new Set<string>()
    for (const q of questions) {
      if (seen.has(q.id)) fail(`${t.id}/${q.id}`, 'повторяется id')
      seen.add(q.id)
      checkQuestion(q, `${t.id}/${q.id}`, scenarioIds)
    }
    if (!t.experience.some(q => !q.scenario)) fail(t.id, 'нет общего вопроса об опыте')
    if (t.technical.length < t.perInterview) fail(t.id, 'в пуле меньше вопросов, чем в интервью')
  }
}

function fail(at: string, why: string): never {
  throw new Error(`интервью ${at}: ${why}`)
}

const blank = (s: string) => s.trim() === ''

function checkQuestion(q: Question, at: string, scenarioIds: string[]): void {
  if (q.points.length === 0) fail(at, 'у вопроса нет пунктов')
  for (const p of q.points) {
    if (p.markers.filter(m => !blank(m)).length === 0) fail(at, 'у пункта нет маркеров')
    if (blank(p.why)) fail(at, 'у пункта нет разбора')
  }
  if (blank(q.expected)) fail(at, 'нет образцового ответа')
  if (q.scenario !== undefined && !scenarioIds.includes(q.scenario)) fail(at, `неизвестный сценарий ${q.scenario}`)
}
