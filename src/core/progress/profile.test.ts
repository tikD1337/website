import { describe, it, expect } from 'vitest'
import { profileFor } from './profile'
import type { TicketRecord } from './types'
import type { DimensionScore, DimensionId } from '../grading/grade'

const IDS: DimensionId[] = [
  'ownership', 'investigation', 'documentation',
  'communication', 'authority', 'resolution',
]

function dims(scores: Partial<Record<DimensionId, number>>): DimensionScore[] {
  return IDS.map(id => ({
    id, label: id, score: scores[id] ?? 10, explain: '',
  }))
}

function rec(n: number, scores: Partial<Record<DimensionId, number>>): TicketRecord {
  return {
    id: `SH:${n}`, shiftId: 'SH', at: `2026-09-13T${10 + n}:00:00.000Z`,
    weekKey: '2026-W37',
    number: `INC${n}`, scenarioId: 's', summary: '', category: '',
    subcategory: '', priority: 'P3', requester: 'u', device: 'd',
    resolutionCode: 'solved', resolutionNotes: '',
    card: {
      verdict: 'partial', points: 40, dimensions: dims(scores),
      objectives: [], note: { score: 0, parts: [], penalties: [] },
      silentFaults: [],
    },
  }
}

describe('профиль по шести измерениям', () => {
  it('без истории показывать нечего', () => {
    const p = profileFor([])
    expect(p.sample).toBe(0)
    expect(p.weakest).toBeNull()
  })

  it('среднее считается по каждому измерению', () => {
    const p = profileFor([
      rec(1, { communication: 4 }),
      rec(2, { communication: 8 }),
    ])
    const comms = p.dimensions.find(d => d.id === 'communication')!
    expect(comms.average).toBe(6)
    expect(p.sample).toBe(2)
  })

  it('все шесть измерений на месте даже при одной записи', () => {
    const p = profileFor([rec(1, {})])
    expect(p.dimensions.map(d => d.id)).toEqual(IDS)
  })

  it('проседающее измерение — с наименьшим средним', () => {
    const p = profileFor([rec(1, { documentation: 3, authority: 7 })])
    expect(p.weakest!.id).toBe('documentation')
  })

  /*
    Окно важнее полной истории: профиль отвечает на вопрос «что качать
    сейчас», а не «каким я был в первый день». Старые провалы обязаны
    выпадать из счёта, иначе исправленная слабость висит вечно.
  */
  it('считаются только последние N прохождений', () => {
    const old = Array.from({ length: 10 }, (_, i) => rec(i, { resolution: 0 }))
    const recent = Array.from({ length: 10 }, (_, i) => rec(10 + i, { resolution: 10 }))

    const p = profileFor([...old, ...recent], 10)
    expect(p.sample).toBe(10)
    expect(p.dimensions.find(d => d.id === 'resolution')!.average).toBe(10)
  })

  it('дробное среднее округляется до десятых', () => {
    const p = profileFor([
      rec(1, { investigation: 10 }),
      rec(2, { investigation: 9 }),
      rec(3, { investigation: 9 }),
    ])
    expect(p.dimensions.find(d => d.id === 'investigation')!.average).toBe(9.3)
  })
})
