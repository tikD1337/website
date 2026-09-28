import { describe, it, expect } from 'vitest'
import { draftFrom } from './draft'
import type { KbArticle } from './types'
import type { TicketRecord } from '../progress/types'

const NOTES = '  Priya Raman сообщила, что не открываются сайты. ipconfig /release и /renew выдали 10.20.14.88.  '

function rec(over: Partial<TicketRecord> = {}): TicketRecord {
  return {
    id: 'SH-1:INC1', shiftId: 'SH-1', at: '2026-09-28T10:00:00.000Z', weekKey: '2026-W40',
    number: 'INC1', scenarioId: 'net-apipa-no-lease', summary: 'Не открываются сайты — нет доступа в сеть',
    category: 'Сеть', subcategory: 'Связность', priority: 'P3', requester: 'p.raman', device: 'AL-LPT-0447',
    resolutionCode: 'solved', resolutionNotes: NOTES,
    card: {} as TicketRecord['card'],
    ...over,
  }
}

/*
  База знаний не пишется автором — её зарабатывает игрок: заметка о
  решении закрытого тикета становится черновиком. Одна статья на
  проблему — иначе каждая смена плодила бы дубли.
*/
describe('черновик статьи', () => {
  it('закрытие с заметкой — черновик: заголовок, текст, тип по таблице', () => {
    const r = draftFrom([], rec())
    expect(r).toMatchObject({ id: 'KB-0001', created: true })
    expect(r.kb).toEqual([{
      id: 'KB-0001', scenarioId: 'net-apipa-no-lease',
      title: 'Не открываются сайты — нет доступа в сеть', type: 'network',
      body: 'Priya Raman сообщила, что не открываются сайты. ipconfig /release и /renew выдали 10.20.14.88.',
      status: 'draft', version: 1, category: 'Сеть', subcategory: 'Связность', resolutionCode: 'solved',
      createdAt: '2026-09-28T10:00:00.000Z', updatedAt: '2026-09-28T10:00:00.000Z',
      sources: ['SH-1:INC1'], history: [],
    }])

    const cases: Array<[string, TicketRecord['resolutionCode'], string]> = [
      ['Сеть', 'solved', 'network'],
      ['Личность', 'solved', 'ad'],
      ['Оборудование', 'solved', 'diagnostics'],
      ['Прочее', 'solved', 'sop'],
      ['Сеть', 'escalate', 'known-issue'],
    ]
    for (const [category, resolutionCode, type] of cases) {
      expect(draftFrom([], rec({ category, resolutionCode })).kb[0]!.type, `${category} ${resolutionCode}`).toBe(type)
    }
  })

  it('повтор проблемы добавляет источник, текст не трогает', () => {
    const first = draftFrom([], rec()).kb
    const before = structuredClone(first)
    const again = draftFrom(first, rec({ id: 'SH-2:INC1', shiftId: 'SH-2', resolutionNotes: 'Другая заметка.' }))
    expect(again).toMatchObject({ id: 'KB-0001', created: false })
    expect(again.kb[0]).toMatchObject({
      sources: ['SH-1:INC1', 'SH-2:INC1'], version: 1, body: before[0]!.body,
    })
    expect(first).toEqual(before)
  })

  it('отменённое и без заметки черновиков не дают и статью не трогают', () => {
    const existing: KbArticle[] = draftFrom([], rec()).kb
    for (const kb of [[], existing]) {
      for (const r of [rec({ id: 'SH-3:INC1', resolutionCode: 'cancelled' }), rec({ id: 'SH-3:INC1', resolutionNotes: '   ' })]) {
        const out = draftFrom(kb, r)
        expect(out).toMatchObject({ id: null, created: false })
        expect(out.kb).toEqual(kb)
      }
    }
  })
})
