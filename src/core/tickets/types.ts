/**
 * Модель тикета.
 *
 * Снята с разбора работающего оригинала, а не придумана: двухуровневая
 * категория, отдельные сроки на отклик и на решение, две разные заметки
 * и — принципиально — рабочий статус, который сам по себе тикет
 * не закрывает.
 */

export type TicketStatus =
  | 'new'
  | 'assigned'
  | 'in-progress'
  | 'pending-user'
  | 'completed'

/** Статусы, которые техник выставляет руками. `completed` сюда не входит. */
export const WORKFLOW_STATUSES = ['assigned', 'in-progress', 'pending-user'] as const
export type WorkflowStatus = (typeof WORKFLOW_STATUSES)[number]

export type ResolutionCode =
  | 'solved'
  | 'escalate'
  | 'not-reproducible'
  | 'cancelled'

export const RESOLUTION_LABELS: Record<ResolutionCode, string> = {
  solved: 'Решено (окончательно)',
  escalate: 'Эскалация',
  'not-reproducible': 'Не решено (не воспроизводится)',
  cancelled: 'Закрыто (отменено пользователем)',
}

export const STATUS_LABELS: Record<TicketStatus, string> = {
  new: 'Новый',
  assigned: 'Назначен',
  'in-progress': 'В работе',
  'pending-user': 'Ждём пользователя',
  completed: 'Завершён',
}

export interface Communication {
  at: string
  channel: 'call' | 'chat' | 'mail'
  /** samAccountName либо 'technician' */
  from: string
  /**
   * С кем шёл разговор — samAccountName собеседника.
   *
   * Не выводится из `from`: реплику техника иначе некому приписать, и
   * звонок коллеге («а у вас так же?») сливался бы в одну ленту с
   * разговором заявителя. Лента общения обязана различать, кому звонили.
   */
  with: string
  text: string
}

export interface Ticket {
  number: string
  scenarioId: string
  summary: string
  description: string
  service: string
  /** верхний уровень: «Сеть» */
  category: string
  /** нижний уровень: «Связность» */
  subcategory: string
  priority: 'P1' | 'P2' | 'P3' | 'P4'
  assignmentGroup: string
  status: TicketStatus
  resolutionCode: ResolutionCode | null
  /** внутренние заметки о ходе работы */
  workNotes: string
  /** заметка, которую увидит заявитель при закрытии */
  resolutionNotes: string
  /** samAccountName заявителя */
  requester: string
  /** имя хоста машины */
  device: string
  /** проставляется при первом взятии в работу */
  createdAt: string | null
  slaResponseHours: number
  slaResolveHours: number
  communications: Communication[]
}
