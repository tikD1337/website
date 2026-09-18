import type { TicketRecord } from './types'
import type { Scorecard } from '../grading/grade'

/**
 * Сравнение с собой.
 *
 * Лидерборда в привычном смысле нет и быть не может: играет один
 * человек, сравнивать его не с кем. Поэтому «лидерборд» здесь — это
 * он же месяц назад, и для тренировки это полезнее чужих мест в
 * таблице: видно, стало лучше или хуже и на каком именно сценарии.
 *
 * Всё выводится из истории, как и счётчики. Ничего не копится
 * отдельно — иначе расхождение с историей вопрос времени.
 */

export type VerdictSpread = Record<Scorecard['verdict'], number>

export function verdictSpread(history: TicketRecord[]): VerdictSpread {
  const spread: VerdictSpread = { full: 0, partial: 0, fail: 0 }
  for (const r of history) spread[r.card.verdict]++
  return spread
}

/** Очки, набранные в одной смене: накопленное за всё время — другое число. */
export function shiftPoints(history: TicketRecord[], shiftId: string): number {
  return history
    .filter(r => r.shiftId === shiftId)
    .reduce((sum, r) => sum + r.card.points, 0)
}

export interface ScenarioBest {
  scenarioId: string
  /** описание тикета — по идентификатору сценария человек его не узнает */
  summary: string
  attempts: number
  /** лучший результат за всё время */
  best: number
  /** последнее прохождение — оно и сравнивается с лучшим */
  last: number
  /** последнее минус лучшее: 0 — повторили лучшее, меньше нуля — просели */
  delta: number
  lastVerdict: Scorecard['verdict']
}

/**
 * Лучший результат по каждому сценарию против последнего.
 *
 * Обе величины нужны сразу. Один «лучший» скрывает просадку: человек
 * видит пятьдесят очков, набранные месяц назад, и не узнаёт, что
 * вчера прошёл тот же сценарий на двадцать.
 *
 * Последнее прохождение берётся по порядку в истории, а не по лучшим
 * очкам: история дописывается в конец, и порядок в ней — временной.
 */
export function bestByScenario(history: TicketRecord[]): ScenarioBest[] {
  const byScenario = new Map<string, TicketRecord[]>()

  for (const r of history) {
    const list = byScenario.get(r.scenarioId)
    if (list) list.push(r)
    else byScenario.set(r.scenarioId, [r])
  }

  const rows: ScenarioBest[] = []
  for (const [scenarioId, records] of byScenario) {
    const last = records[records.length - 1]!
    const best = records.reduce(
      (max, r) => (r.card.points > max ? r.card.points : max),
      records[0]!.card.points,
    )

    rows.push({
      scenarioId,
      summary: last.summary,
      attempts: records.length,
      best,
      last: last.card.points,
      delta: last.card.points - best,
      lastVerdict: last.card.verdict,
    })
  }

  // Сильнее просевшее — первым: это то, к чему стоит вернуться.
  return rows.sort((a, b) => a.delta - b.delta)
}

/**
 * Сколько прохождений закрыто в этой смене.
 *
 * По очереди это не посчитать: она — окно, и завершённый тикет из неё
 * уходит, поэтому «завершённых» там всегда ноль. Число живёт в
 * истории, как и всё прочее в прогрессии.
 */
export function closedInShift(history: TicketRecord[], shiftId: string): number {
  return history.filter(r => r.shiftId === shiftId).length
}
