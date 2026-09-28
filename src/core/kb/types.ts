import type { ResolutionCode } from '../tickets/types'

/**
 * База знаний.
 *
 * Не пишется автором тренажёра — её зарабатывает игрок: заметка о
 * решении закрытого тикета становится черновиком статьи. Одна статья на
 * проблему (сценарий): повторное закрытие добавляет источник, а не дубль.
 */

export type KbType = 'sop' | 'runbook' | 'network' | 'ad' | 'known-issue' | 'vendor' | 'diagnostics'
export type KbStatus = 'draft' | 'published' | 'retired'

export const TYPE_LABEL: Record<KbType, string> = {
  sop: 'SOP',
  runbook: 'Runbook',
  network: 'Сеть',
  ad: 'Справка по AD',
  'known-issue': 'Известные проблемы',
  vendor: 'Вендоры',
  diagnostics: 'Диагностика',
}

export const STATUS_LABEL: Record<KbStatus, string> = {
  draft: 'Черновик',
  published: 'Опубликована',
  retired: 'В архиве',
}

export interface KbVersion {
  version: number
  at: string
  title: string
  type: KbType
  body: string
}

export interface KbArticle {
  /** 'KB-0001' — по порядку создания */
  id: string
  /** ключ «одна статья на проблему» */
  scenarioId: string
  title: string
  type: KbType
  body: string
  status: KbStatus
  /** 1 при создании, +1 на каждую сохранённую правку */
  version: number
  category: string
  subcategory: string
  /** код первого закрытия */
  resolutionCode: ResolutionCode
  createdAt: string
  updatedAt: string
  /**
   * id прохождений (`смена:номер`), из которых статья выросла. Не номера
   * тикетов: номер выводится из сценария, и у повторов он одинаков.
   */
  sources: string[]
  /** прежние версии, без текущей */
  history: KbVersion[]
}
