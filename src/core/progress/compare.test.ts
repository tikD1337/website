import { describe, it, expect } from 'vitest'
import {
  verdictSpread, bestByScenario, shiftPoints, closedInShift,
} from './compare'
import type { TicketRecord } from './types'
import type { Scorecard } from '../grading/grade'

function rec(
  n: number,
  verdict: Scorecard['verdict'],
  opts: {
    points?: number
    scenarioId?: string
    summary?: string
    shiftId?: string
  } = {},
): TicketRecord {
  const {
    points = 40, scenarioId = 's1', summary = 'тикет', shiftId = 'SH-1',
  } = opts
  return {
    id: `${shiftId}:${n}`, shiftId, at: `2026-09-13T1${n}:00:00.000Z`,
    weekKey: '2026-W37',
    number: `INC000000${n}`, scenarioId, summary,
    category: 'Сеть', subcategory: 'Связность', priority: 'P3',
    requester: 'u', device: 'AL-LPT-0447',
    resolutionCode: 'solved', resolutionNotes: '',
    card: {
      verdict, points,
      dimensions: [], objectives: [],
      note: { score: 0, parts: [], penalties: [] },
      silentFaults: [],
    },
  }
}

/**
 * Очередь — окно, и завершённый тикет из неё уходит, поэтому «сколько
 * закрыто за смену» по очереди не посчитать: там всегда ноль. Числа
 * живут в истории, как и всё остальное.
 */
describe('сводки по истории', () => {
  it('вердикты, очки и закрытые — только своей смены; пусто — нули', () => {
    expect(verdictSpread([])).toEqual({ full: 0, partial: 0, fail: 0 })
    expect(verdictSpread([rec(1, 'full'), rec(2, 'full'), rec(3, 'partial'), rec(4, 'fail')]))
      .toEqual({ full: 2, partial: 1, fail: 1 })

    const history = [
      rec(1, 'full', { points: 50, shiftId: 'SH-1' }),
      rec(2, 'fail', { points: 20, shiftId: 'SH-2' }),
      rec(3, 'partial', { points: 30, shiftId: 'SH-2' }),
    ]
    expect(shiftPoints(history, 'SH-2')).toBe(50)
    expect(closedInShift(history, 'SH-2')).toBe(2)
    expect(shiftPoints(history, 'SH-9')).toBe(0)
    expect(closedInShift(history, 'SH-9')).toBe(0)
  })
})

/**
 * Сравнение с собой: «стало лучше или хуже и на каком сценарии». Нужны
 * обе величины — лучший результат и последний: одно «лучшее» не
 * покажет, что последнее прохождение просело. Знак разницы (последнее
 * минус лучшее) и есть ответ; сначала то, что просело сильнее, — к нему
 * и стоит вернуться.
 */
describe('лучшее по сценарию', () => {
  it('строка на сценарий: лучшее, последнее по порядку истории, попытки, просадка', () => {
    expect(bestByScenario([])).toEqual([])
    expect(bestByScenario([
      rec(1, 'fail', { points: 20, scenarioId: 'apipa', summary: 'сеть' }),
      rec(2, 'full', { points: 50, scenarioId: 'apipa', summary: 'сеть' }),
      rec(3, 'partial', { points: 35, scenarioId: 'apipa', summary: 'сеть' }),
    ])).toEqual([expect.objectContaining({
      scenarioId: 'apipa', summary: 'сеть', best: 50, last: 35, attempts: 3, delta: -15,
    })])
    expect(bestByScenario([rec(1, 'fail', { points: 20 }), rec(2, 'full', { points: 50 })])[0]!.delta)
      .toBe(0)
  })

  it('сценарии не смешиваются и идут по убыванию просадки', () => {
    const rows = bestByScenario([
      rec(1, 'full', { points: 50, scenarioId: 'a' }),
      rec(2, 'partial', { points: 45, scenarioId: 'a' }),
      rec(3, 'full', { points: 50, scenarioId: 'b' }),
      rec(4, 'fail', { points: 10, scenarioId: 'b' }),
    ])
    expect(rows.map(r => [r.scenarioId, r.best, r.last])).toEqual([['b', 50, 10], ['a', 50, 45]])
  })
})
