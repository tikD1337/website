import type { KbArticle, KbStatus, KbType } from './types'

/** Поиск по заголовку и тексту без учёта регистра; фильтры по типу и статусу. */
export function searchKb(
  kb: KbArticle[], filter: { query?: string; type?: KbType; status?: KbStatus },
): KbArticle[] {
  const q = filter.query?.trim().toLowerCase() ?? ''
  return kb.filter(a =>
    (!filter.type || a.type === filter.type)
    && (!filter.status || a.status === filter.status)
    && (!q || a.title.toLowerCase().includes(q) || a.body.toLowerCase().includes(q)))
}

/**
 * Статьи к тикету: сначала та же проблема, затем та же подкатегория.
 * Архивное не показывается — его убрали из обращения намеренно.
 */
export function relatedTo(kb: KbArticle[], t: { scenarioId: string; subcategory: string }): KbArticle[] {
  const live = kb.filter(a => a.status !== 'retired')
  const same = live.filter(a => a.scenarioId === t.scenarioId)
  const near = live.filter(a => a.scenarioId !== t.scenarioId && a.subcategory === t.subcategory)
  return [...same, ...near]
}
