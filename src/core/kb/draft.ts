import type { KbArticle, KbType } from './types'
import type { TicketRecord } from '../progress/types'

export interface DraftResult {
  kb: KbArticle[]
  /** статья, которой коснулось закрытие; null — не коснулось никакой */
  id: string | null
  /** true — черновик создан, false — источник добавлен к готовой статье */
  created: boolean
}

const BY_CATEGORY: Record<string, KbType> = {
  'Сеть': 'network',
  'Личность': 'ad',
  'Оборудование': 'diagnostics',
}

/** Эскалация — известная проблема; остальное — по категории тикета. */
function typeFor(r: TicketRecord): KbType {
  if (r.resolutionCode === 'escalate') return 'known-issue'
  return BY_CATEGORY[r.category] ?? 'sop'
}

/**
 * Черновик статьи из закрытого тикета.
 *
 * Плохая заметка даёт плохой черновик — и это урок, а не повод
 * фильтровать. Не дают черновика только отменённое и закрытое без
 * заметки: знания в них нет. Базу не мутирует — стор кладёт результат
 * в прогресс одним `set`.
 */
export function draftFrom(kb: KbArticle[], record: TicketRecord): DraftResult {
  const body = record.resolutionNotes.trim()
  if (record.resolutionCode === 'cancelled' || !body) return { kb, id: null, created: false }

  const existing = kb.find(a => a.scenarioId === record.scenarioId)
  if (existing) {
    const sources = existing.sources.includes(record.id) ? existing.sources : [...existing.sources, record.id]
    return {
      kb: kb.map(a => (a === existing ? { ...a, sources } : a)),
      id: existing.id,
      created: false,
    }
  }

  const id = `KB-${String(kb.length + 1).padStart(4, '0')}`
  const article: KbArticle = {
    id, scenarioId: record.scenarioId, title: record.summary, type: typeFor(record), body,
    status: 'draft', version: 1, category: record.category, subcategory: record.subcategory,
    resolutionCode: record.resolutionCode, createdAt: record.at, updatedAt: record.at,
    sources: [record.id], history: [],
  }
  return { kb: [...kb, article], id, created: true }
}
