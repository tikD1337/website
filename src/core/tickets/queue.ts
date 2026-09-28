import type { Clock } from '../world/types'
import type { Ticket, WorkflowStatus, ResolutionCode } from './types'

export interface QueueState {
  tickets: Ticket[]
  /**
   * Номер тикета в работе.
   *
   * Одновременно можно вести ровно один инцидент — правило снято с
   * оригинала и держится намеренно: оно заставляет доводить дело до
   * конца вместо того, чтобы набрать десяток и бросить на половине.
   */
  assigned: string | null
}

export function createQueue(tickets: Ticket[]): QueueState {
  return { tickets, assigned: null }
}

export function findTicket(q: QueueState, number: string): Ticket {
  const t = q.tickets.find(x => x.number === number)
  if (!t) throw new Error(`тикет не найден: ${number}`)
  return t
}

function requireMine(q: QueueState, number: string): Ticket {
  if (q.assigned !== number) throw new Error('тикет не назначен на вас')
  return findTicket(q, number)
}

export function claim(q: QueueState, number: string, clock: Clock): void {
  if (q.assigned !== null && q.assigned !== number) {
    throw new Error('сначала завершите текущий тикет')
  }

  const t = findTicket(q, number)
  if (t.status === 'completed') throw new Error('тикет уже закрыт')

  // Статус начатого тикета при повторном взятии не теряется: «ждём поставку» остаётся собой.
  if (t.status === 'new') t.status = 'assigned'
  t.createdAt ??= clock.now().toISOString()
  q.assigned = number
}

/**
 * Меняет рабочий статус.
 *
 * `completed` сюда попасть не может по типу: закрытие — отдельное
 * действие, требующее кода. В оригинале это написано прямо в
 * интерфейсе, и не зря — это частая ошибка новичка.
 */
export function setStatus(q: QueueState, number: string, status: WorkflowStatus): void {
  const t = requireMine(q, number)
  t.status = status
}

export function resolve(q: QueueState, number: string, code: ResolutionCode): void {
  const t = requireMine(q, number)
  t.resolutionCode = code
  t.status = 'completed'
  q.assigned = null
}

export function unassign(q: QueueState, number: string): void {
  const t = requireMine(q, number)
  t.status = 'new'
  q.assigned = null
}

/**
 * «Ждём поставку»: тикет отпускает слот.
 *
 * Пока курьер везёт замену, техник берёт следующий тикет. Правило «один
 * в работе» не нарушается — ждущий тикет в работе не числится.
 */
export function park(q: QueueState, number: string): void {
  const t = requireMine(q, number)
  t.status = 'pending-shipment'
  q.assigned = null
}

/** Доставка возвращает ждущий тикет в работу; любой другой статус не трогает. */
export function resume(q: QueueState, number: string): void {
  const t = findTicket(q, number)
  if (t.status === 'pending-shipment') t.status = 'in-progress'
}
