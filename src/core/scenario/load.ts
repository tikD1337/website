import { createWorld, applyInject } from '../world/world'
import type { WorldState } from '../world/types'
import type { Ticket } from '../tickets/types'
import type { Scenario } from './types'

/**
 * Детерминированный номер инцидента из идентификатора сценария.
 *
 * Случайность здесь недопустима: одно и то же прохождение должно
 * выглядеть одинаково, иначе тесты и сохранения разъедутся.
 */
export function incidentNumber(id: string): string {
  let h = 0
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return 'INC' + String(h % 10_000_000).padStart(7, '0')
}

function makeTicket(s: Scenario): Ticket {
  return buildTicket(s)
}

/**
 * Загружает несколько сценариев в один мир.
 *
 * Сценарии ломают разные машины, поэтому их инъекции складываются без
 * конфликтов. Если два сценария однажды тронут одно поле, победит
 * последний — и это будет видно в тестах сценариев, а не всплывёт
 * загадочным поведением.
 */
export function loadScenarios(list: Scenario[]): { world: WorldState; tickets: Ticket[] } {
  const world = createWorld()
  for (const s of list) applyInject(world, s.inject)
  return { world, tickets: list.map(makeTicket) }
}

export function loadScenario(s: Scenario): { world: WorldState; ticket: Ticket } {
  const world = createWorld()
  applyInject(world, s.inject)

  return { world, ticket: buildTicket(s) }
}

function buildTicket(s: Scenario): Ticket {
  return {
    number: incidentNumber(s.id),
    scenarioId: s.id,
    summary: s.summary,
    description: s.description,
    service: s.service,
    category: s.category,
    subcategory: s.subcategory,
    priority: s.priority,
    assignmentGroup: 'Служба поддержки, первая линия',
    status: 'new',
    resolutionCode: null,
    workNotes: '',
    resolutionNotes: '',
    requester: s.requester,
    device: s.device,
    createdAt: null,
    slaResponseHours: s.slaResponseHours,
    slaResolveHours: s.slaResolveHours,
    communications: [],
  }
}
