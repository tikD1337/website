import { describe, it, expect } from 'vitest'
import { searchKb, relatedTo } from './search'
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
})
