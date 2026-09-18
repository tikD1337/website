import type { TicketRecord } from './types'

/**
 * Счётчики.
 *
 * **Всё выводится из истории, ничто не инкрементируется.** Это главное
 * правило модуля. Счётчик, который увеличивают при закрытии тикета,
 * расходится с историей при первом же сбое записи — и дальше разбор
 * показывает одно, а список прохождений другое, причём узнаёшь об этом
 * нескоро. Пересчёт по записям стоит долей миллисекунды и врать не
 * умеет.
 *
 * Чего здесь нет и почему: «активные неисправности» — состояние
 * текущей смены, они берутся из очереди, а не отсюда. И нет счётчика
 * «тихие поломки, до сих пор не устранённые»: он был в плане, но мир
 * между сменами не сохраняется, поэтому устранять нечего — поломка
 * уходит вместе с миром. Осталось то, что действительно измеримо:
 * сколько их было и в скольких тикетах.
 */

export interface Counters {
  /** всего прохождений */
  closed: number
  /** из них с полным вердиктом */
  flawless: number
  /** полные вердикты подряд прямо сейчас */
  streak: number
  /** лучшая серия за всё время */
  bestStreak: number
  /** тихих поломок всего */
  silentFaults: number
  /** прохождений, после которых осталась хотя бы одна */
  ticketsWithFaults: number
  totalPoints: number
}

export function countersOf(history: TicketRecord[]): Counters {
  let flawless = 0
  let streak = 0
  let bestStreak = 0
  let silentFaults = 0
  let ticketsWithFaults = 0
  let totalPoints = 0

  for (const r of history) {
    totalPoints += r.card.points

    const faults = r.card.silentFaults.length
    silentFaults += faults
    if (faults > 0) ticketsWithFaults++

    if (r.card.verdict === 'full') {
      flawless++
      streak++
      if (streak > bestStreak) bestStreak = streak
    } else {
      // Серия обрывается — но лучшая уже записана.
      streak = 0
    }
  }

  return {
    closed: history.length,
    flawless,
    streak,
    bestStreak,
    silentFaults,
    ticketsWithFaults,
    totalPoints,
  }
}

/** Очки за одну ISO-неделю: накопленное и недельное — разные числа. */
export function pointsInWeek(history: TicketRecord[], week: string): number {
  return history
    .filter(r => r.weekKey === week)
    .reduce((sum, r) => sum + r.card.points, 0)
}
