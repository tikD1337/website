import { describe, it, expect } from 'vitest'
import { countersOf, pointsInWeek } from './counters'
import type { TicketRecord } from './types'
import type { Scorecard } from '../grading/grade'

/** Запись истории с тем, что счётчикам действительно нужно. */
function rec(
  n: number,
  verdict: Scorecard['verdict'],
  opts: { points?: number; faults?: number; week?: string } = {},
): TicketRecord {
  const { points = 40, faults = 0, week = '2026-W37' } = opts
  return {
    id: `SH:${n}`, shiftId: 'SH', at: `2026-09-13T1${n}:00:00.000Z`,
    weekKey: week,
    number: `INC000000${n}`, scenarioId: 's', summary: 'тикет',
    category: 'Сеть', subcategory: 'Связность', priority: 'P3',
    requester: 'u', device: `AL-LPT-000${n}`,
    resolutionCode: 'solved', resolutionNotes: '',
    card: {
      verdict, points,
      dimensions: [], objectives: [],
      note: { score: 0, parts: [], penalties: [] },
      silentFaults: Array.from({ length: faults }, (_, i) => `поломка ${i}`),
    },
  }
}

/*
  Счётчики выводятся из истории, а не инкрементируются: счётчик,
  который увеличивают при закрытии, расходится с историей при первом
  же сбое записи.
*/
describe('счётчики', () => {
  it('закрытые, безупречные, очки и тихие поломки — штуками и тикетами', () => {
    expect(countersOf([])).toMatchObject({
      closed: 0, flawless: 0, streak: 0, bestStreak: 0, totalPoints: 0,
    })
    expect(countersOf([
      rec(1, 'fail', { points: 10, faults: 2 }),
      rec(2, 'full', { points: 54 }),
      rec(3, 'partial', { points: 30, faults: 1 }),
      rec(4, 'full', { points: 50 }),
    ])).toMatchObject({
      closed: 4, flawless: 2, totalPoints: 144, silentFaults: 3, ticketsWithFaults: 2,
    })
  })

  /*
    Серия — это то, что прерывается. Проверяется именно обрыв: счётчик,
    который только растёт, выглядел бы правильным на всех записях,
    кроме тех, ради которых он заведён.
  */
  it('серия обрывается неполным вердиктом, лучшая серия помнится', () => {
    const streaks = (...v: Array<'full' | 'partial' | 'fail'>) => {
      const c = countersOf(v.map((x, i) => rec(i + 1, x)))
      return [c.streak, c.bestStreak]
    }
    expect(streaks('full', 'full', 'partial', 'full')).toEqual([1, 2])
    expect(streaks('full', 'full', 'full')).toEqual([3, 3])
    expect(streaks('full', 'full', 'fail')).toEqual([0, 2])
  })

  it('очки за неделю — только записи своей недели', () => {
    const history = [
      rec(1, 'full', { points: 50, week: '2026-W36' }),
      rec(2, 'full', { points: 40, week: '2026-W37' }),
      rec(3, 'partial', { points: 20, week: '2026-W37' }),
    ]
    expect(['2026-W37', '2026-W36', '2026-W35'].map(w => pointsInWeek(history, w)))
      .toEqual([60, 50, 0])
  })
})
