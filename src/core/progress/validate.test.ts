import { describe, it, expect } from 'vitest'
import { validateProgress } from './validate'
import type { Progress, TicketRecord } from './types'

function rec(over: Partial<TicketRecord> = {}): TicketRecord {
  return {
    id: 'SH-1:INC-001', shiftId: 'SH-1', at: '2026-09-13T10:00:00.000Z',
    weekKey: '2026-W37', number: 'INC-001', scenarioId: 's', summary: '',
    category: '', subcategory: '', priority: 'P3', requester: 'u', device: 'd',
    resolutionCode: 'solved', resolutionNotes: '',
    card: {
      verdict: 'partial', points: 40, dimensions: [], objectives: [],
      note: { score: 0, parts: [], penalties: [] }, silentFaults: [],
    },
    ...over,
  }
}

function progress(records: TicketRecord[]): Progress {
  return { version: 1, records }
}

describe('разбор прочитанного из хранилища', () => {
  it('валидный прогресс ошибок не даёт', () => {
    expect(validateProgress(progress([rec()]))).toEqual([])
  })

  it('пустой прогресс тоже валиден', () => {
    expect(validateProgress(progress([]))).toEqual([])
  })

  it('чужая версия схемы — одна ошибка и сразу', () => {
    const errors = validateProgress({ version: 2, records: [] } as unknown as Progress)
    expect(errors.map(e => e.code)).toEqual(['bad_version'])
  })

  it('запись без обязательного поля помечается', () => {
    const r = rec()
    delete (r as Partial<TicketRecord>).number
    const errors = validateProgress(progress([r]))
    expect(errors.map(e => e.code)).toContain('missing_number')
  })

  it('id, не совпадающий со shiftId:номер, — это другой id', () => {
    const r = rec({ id: 'SH-1:ROGUE' })
    const errors = validateProgress(progress([r]))
    expect(errors.map(e => e.code)).toContain('bad_id')
  })

  it('карточка без очков не проходит', () => {
    const r = rec()
    ;(r.card as Partial<typeof r.card>).points = undefined as never
    const errors = validateProgress(progress([r]))
    expect(errors.map(e => e.code)).toContain('bad_points')
  })

  it('мусор вместо прогресса ловится без падения', () => {
    const errors = validateProgress({ junk: true } as unknown as Progress)
    expect(errors.length).toBeGreaterThan(0)
  })
})