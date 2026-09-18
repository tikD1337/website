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

describe('распределение вердиктов', () => {
  it('пустая история — все нули', () => {
    expect(verdictSpread([])).toEqual({ full: 0, partial: 0, fail: 0 })
  })

  it('считает каждый вердикт отдельно', () => {
    const history = [
      rec(1, 'full'), rec(2, 'full'), rec(3, 'partial'), rec(4, 'fail'),
    ]
    expect(verdictSpread(history)).toEqual({ full: 2, partial: 1, fail: 1 })
  })
})

describe('очки за смену', () => {
  it('берут только записи этой смены', () => {
    const history = [
      rec(1, 'full', { points: 50, shiftId: 'SH-1' }),
      rec(2, 'fail', { points: 20, shiftId: 'SH-2' }),
      rec(3, 'partial', { points: 30, shiftId: 'SH-2' }),
    ]
    expect(shiftPoints(history, 'SH-2')).toBe(50)
  })

  it('смена без закрытий — ноль, а не ошибка', () => {
    expect(shiftPoints([rec(1, 'full')], 'SH-9')).toBe(0)
  })
})

/**
 * Сравнение с собой — главное в задаче 5.8.
 *
 * Отвечает на вопрос «стало лучше или хуже и на каком сценарии»,
 * поэтому нужны обе величины сразу: лучший результат за всё время и
 * последний. Одного «лучшего» мало: он не покажет, что последнее
 * прохождение просело.
 */
describe('лучшее по сценарию', () => {
  it('пустая история — пустой список', () => {
    expect(bestByScenario([])).toEqual([])
  })

  it('на сценарий одна строка, с лучшим и последним', () => {
    const history = [
      rec(1, 'fail', { points: 20, scenarioId: 'apipa', summary: 'сеть' }),
      rec(2, 'full', { points: 50, scenarioId: 'apipa', summary: 'сеть' }),
      rec(3, 'partial', { points: 35, scenarioId: 'apipa', summary: 'сеть' }),
    ]
    const rows = bestByScenario(history)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      scenarioId: 'apipa', summary: 'сеть',
      best: 50, last: 35, attempts: 3,
    })
  })

  /*
    Знак разницы — это и есть ответ «стало лучше или хуже». Считаем
    последнее минус лучшее: ноль означает, что последний раз и был
    лучшим, отрицательное — просели.
  */
  it('разница показывает, просели или повторили лучшее', () => {
    const worse = bestByScenario([
      rec(1, 'full', { points: 50 }),
      rec(2, 'fail', { points: 20 }),
    ])
    expect(worse[0]!.delta).toBe(-30)

    const repeated = bestByScenario([
      rec(1, 'fail', { points: 20 }),
      rec(2, 'full', { points: 50 }),
    ])
    expect(repeated[0]!.delta).toBe(0)
  })

  it('разные сценарии не смешиваются', () => {
    const rows = bestByScenario([
      rec(1, 'full', { points: 50, scenarioId: 'apipa' }),
      rec(2, 'fail', { points: 10, scenarioId: 'spooler' }),
    ])
    expect(rows.map(r => r.scenarioId).sort()).toEqual(['apipa', 'spooler'])
    expect(rows.find(r => r.scenarioId === 'spooler')!.best).toBe(10)
  })

  /*
    Порядок — по просадке: то, что просело сильнее всего, читается
    первым. Это ровно тот сценарий, к которому стоит вернуться.
  */
  it('сначала то, что просело сильнее', () => {
    const rows = bestByScenario([
      rec(1, 'full', { points: 50, scenarioId: 'a' }),
      rec(2, 'partial', { points: 45, scenarioId: 'a' }),
      rec(3, 'full', { points: 50, scenarioId: 'b' }),
      rec(4, 'fail', { points: 10, scenarioId: 'b' }),
    ])
    expect(rows.map(r => r.scenarioId)).toEqual(['b', 'a'])
  })

  it('последняя запись определяется порядком в истории, а не очками', () => {
    const rows = bestByScenario([
      rec(1, 'full', { points: 50 }),
      rec(2, 'partial', { points: 30 }),
    ])
    expect(rows[0]!.last).toBe(30)
  })
})

/**
 * Закрытые за смену.
 *
 * Очередь — окно, и завершённый тикет из неё уходит. Значит «сколько
 * закрыто за смену» по очереди не посчитать: там всегда ноль. Число
 * живёт в истории, как и всё остальное.
 */
describe('закрыто за смену', () => {
  it('считает записи только этой смены', () => {
    const history = [
      rec(1, 'full', { shiftId: 'SH-1' }),
      rec(2, 'fail', { shiftId: 'SH-2' }),
      rec(3, 'partial', { shiftId: 'SH-2' }),
    ]
    expect(closedInShift(history, 'SH-2')).toBe(2)
  })

  it('смена без закрытий — ноль', () => {
    expect(closedInShift([rec(1, 'full')], 'SH-9')).toBe(0)
  })
})
