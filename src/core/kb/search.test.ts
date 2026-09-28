import { describe, it, expect } from 'vitest'
import { searchKb, relatedTo, mergeKb } from './search'
import type { KbArticle } from './types'

function article(id: string, over: Partial<KbArticle>): KbArticle {
  return {
    id, scenarioId: 's', title: '', type: 'sop', body: '', status: 'draft', version: 1,
    category: 'Сеть', subcategory: 'Связность', resolutionCode: 'solved',
    createdAt: '2026-09-28T10:00:00.000Z', updatedAt: '2026-09-28T10:00:00.000Z',
    sources: [], history: [], ...over,
  }
}

const KB: KbArticle[] = [
  article('KB-0001', { scenarioId: 'net-apipa-no-lease', title: 'Нет сети после встречи', body: 'ipconfig /release', type: 'network', status: 'published' }),
  article('KB-0002', { scenarioId: 'net-wrong-vlan-port', title: 'Переезд: нет сети', body: 'VLAN порта', type: 'network' }),
  article('KB-0003', { scenarioId: 'net-dhcp-relay-missing', title: 'Ретрансляция', body: 'helper-address', type: 'known-issue', status: 'retired' }),
  article('KB-0004', { scenarioId: 'print-spooler-stopped', title: 'Печать встала', body: 'Spooler', type: 'diagnostics', category: 'Оборудование', subcategory: 'Печать' }),
]
const ids = (a: KbArticle[]) => a.map(x => x.id)

describe('поиск по базе', () => {
  it('поиск без регистра по заголовку и тексту, фильтры; похожие — сначала та же проблема, архив не показывается', () => {
    expect(ids(searchKb(KB, { query: 'СЕТИ' }))).toEqual(['KB-0001', 'KB-0002'])
    expect(ids(searchKb(KB, { query: 'spooler' }))).toEqual(['KB-0004'])
    expect(ids(searchKb(KB, { type: 'network', status: 'draft' }))).toEqual(['KB-0002'])
    expect(ids(searchKb(KB, {}))).toEqual(['KB-0001', 'KB-0002', 'KB-0003', 'KB-0004'])

    expect(ids(relatedTo(KB, { scenarioId: 'net-wrong-vlan-port', subcategory: 'Связность' })))
      .toEqual(['KB-0002', 'KB-0001'])
    expect(ids(relatedTo(KB, { scenarioId: 'hw-dock-failed', subcategory: 'Периферия' }))).toEqual([])
  })

  /*
    Черновик может появиться раньше, чем хранилище отдаст загруженное:
    закрытие не ждёт гидратации. Слияние обязано не повторить номер и не
    раздвоить одну проблему.
  */
  it('гидратация: загруженное первым, та же проблема сливает источники, остальные — следующие номера', () => {
    const loaded = [
      article('KB-0001', { scenarioId: 'net-apipa-no-lease', sources: ['SH-1:A'] }),
      article('KB-0002', { scenarioId: 'print-spooler-stopped', sources: ['SH-1:B'] }),
    ]
    const inMemory = [
      article('KB-0001', { scenarioId: 'net-apipa-no-lease', sources: ['SH-9:X'] }),
      article('KB-0002', { scenarioId: 'identity-account-lockout', sources: ['SH-9:Y'] }),
    ]
    const merged = mergeKb(loaded, inMemory)
    expect(merged.map(a => [a.id, a.scenarioId, a.sources])).toEqual([
      ['KB-0001', 'net-apipa-no-lease', ['SH-1:A', 'SH-9:X']],
      ['KB-0002', 'print-spooler-stopped', ['SH-1:B']],
      ['KB-0003', 'identity-account-lockout', ['SH-9:Y']],
    ])
    expect(loaded[0]!.sources).toEqual(['SH-1:A'])
  })
})
