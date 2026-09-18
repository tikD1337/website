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

describe('счётчики', () => {
  it('пустая история — всё по нулям', () => {
    const c = countersOf([])
    expect(c.closed).toBe(0)
    expect(c.flawless).toBe(0)
    expect(c.streak).toBe(0)
    expect(c.bestStreak).toBe(0)
    expect(c.totalPoints).toBe(0)
  })

  it('закрытые и безупречные считаются раздельно', () => {
    const c = countersOf([rec(1, 'full'), rec(2, 'partial'), rec(3, 'full')])
    expect(c.closed).toBe(3)
    expect(c.flawless).toBe(2)
  })

  it('очки складываются', () => {
    const c = countersOf([rec(1, 'full', { points: 54 }), rec(2, 'partial', { points: 30 })])
    expect(c.totalPoints).toBe(84)
  })

  /*
    Серия — это то, что прерывается. Проверяем именно обрыв: счётчик,
    который только растёт, выглядел бы правильным на всех записях,
    кроме тех, ради которых он заведён.
  */
  it('неполный вердикт обрывает серию', () => {
    const c = countersOf([rec(1, 'full'), rec(2, 'full'), rec(3, 'partial'), rec(4, 'full')])
    expect(c.streak).toBe(1)
    expect(c.bestStreak).toBe(2)
  })

  it('серия без обрывов равна лучшей', () => {
    const c = countersOf([rec(1, 'full'), rec(2, 'full'), rec(3, 'full')])
    expect(c.streak).toBe(3)
    expect(c.bestStreak).toBe(3)
  })

  it('провал в конце обнуляет текущую серию, но не лучшую', () => {
    const c = countersOf([rec(1, 'full'), rec(2, 'full'), rec(3, 'fail')])
    expect(c.streak).toBe(0)
    expect(c.bestStreak).toBe(2)
  })

  it('тихие поломки считаются и штуками, и тикетами', () => {
    const c = countersOf([rec(1, 'fail', { faults: 2 }), rec(2, 'full'), rec(3, 'fail', { faults: 1 })])
    expect(c.silentFaults).toBe(3)
    expect(c.ticketsWithFaults).toBe(2)
  })
})

describe('очки за неделю', () => {
  it('считаются только записи своей недели', () => {
    const history = [
      rec(1, 'full', { points: 50, week: '2026-W36' }),
      rec(2, 'full', { points: 40, week: '2026-W37' }),
      rec(3, 'partial', { points: 20, week: '2026-W37' }),
    ]
    expect(pointsInWeek(history, '2026-W37')).toBe(60)
    expect(pointsInWeek(history, '2026-W36')).toBe(50)
    expect(pointsInWeek(history, '2026-W35')).toBe(0)
  })
})
