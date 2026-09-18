import { weekKey } from './points'
import type { TicketRecord } from './types'
import type { Clock } from '../world/types'
import type { Ticket } from '../tickets/types'
import type { Scorecard } from '../grading/grade'

/**
 * Превращает закрытый инцидент в запись истории.
 *
 * Запись обязана быть **снимком**, а не видом на живые объекты: смена
 * закончится, мир соберётся заново, тикет будет другим — а история
 * останется и должна показывать то, что было. Тот же урок, что с
 * инъекцией, делившейся ссылкой со сценарием: первая же мутация
 * портила прошлое.
 */

export interface RecordArgs {
  card: Scorecard
  ticket: Ticket
  /** смена, в которую закрыт инцидент */
  shiftId: string
  clock: Clock
}

export function recordOf(args: RecordArgs): TicketRecord {
  const { card, ticket, shiftId, clock } = args

  /*
    Код закрытия обязателен: тикет без него не закрывается вовсе, и
    запись без него означала бы, что где-то закрытие прошло мимо
    правила. Падаем громко — молчаливая подстановка спрятала бы дефект.
  */
  if (!ticket.resolutionCode) {
    throw new Error(`тикет ${ticket.number} записан без кода закрытия`)
  }

  const at = clock.now()

  return {
    id: `${shiftId}:${ticket.number}`,
    shiftId,
    at: at.toISOString(),
    weekKey: weekKey(at),

    number: ticket.number,
    scenarioId: ticket.scenarioId,
    summary: ticket.summary,
    category: ticket.category,
    subcategory: ticket.subcategory,
    priority: ticket.priority,
    requester: ticket.requester,
    device: ticket.device,

    resolutionCode: ticket.resolutionCode,
    resolutionNotes: ticket.resolutionNotes,

    // Снимок: дальше и тикет, и разбор живут своей жизнью.
    card: structuredClone(card),
  }
}
