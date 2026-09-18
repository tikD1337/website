import type { TicketRecord } from './types'
import type { DimensionId } from '../grading/grade'

/**
 * Профиль по шести измерениям.
 *
 * Отвечает на вопрос «что качать»: измерение с наименьшим средним
 * за последние N прохождений (по умолчанию 10). Окно важно — старые
 * провалы не должны висеть вечно после того, как слабость исправлена.
 */

export interface DimensionAverage {
  id: DimensionId
  label: string
  average: number
}

export interface Profile {
  /** сколько записей вошло в расчёт */
  sample: number
  /** среднее по каждому измерению */
  dimensions: DimensionAverage[]
  /** самое проседающее; null при пустой истории */
  weakest: DimensionAverage | null
}

/** Среднее по измерению, округлённое до десятых. */
function average(scores: number[]): number {
  if (scores.length === 0) return 0
  const sum = scores.reduce((a, b) => a + b, 0)
  return Math.round((sum / scores.length) * 10) / 10
}

export function profileFor(records: TicketRecord[], last = 10): Profile {
  if (records.length === 0) {
    return { sample: 0, dimensions: [], weakest: null }
  }

  const recent = records.slice(-last)
  const sample = recent.length

  // Все шесть измерений в фиксированном порядке.
  const ids: DimensionId[] = [
    'ownership', 'investigation', 'documentation',
    'communication', 'authority', 'resolution',
  ]

  const dimensions: DimensionAverage[] = ids.map(id => {
    const scores = recent.map(r => {
      const dim = r.card.dimensions.find(d => d.id === id)
      return dim ? dim.score : 0
    })
    // Берём label из первой записи, где есть измерение.
    const label = recent
      .flatMap(r => r.card.dimensions)
      .find(d => d.id === id)?.label ?? id

    return { id, label, average: average(scores) }
  })

  const weakest = dimensions.reduce((min, d) =>
    d.average < min.average ? d : min
  )

  return { sample, dimensions, weakest }
}
