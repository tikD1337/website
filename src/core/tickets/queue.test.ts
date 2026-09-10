import { describe, it, expect, beforeEach } from 'vitest'
import { createQueue, claim, setStatus, resolve, unassign, findTicket } from './queue'
import type { QueueState } from './queue'
import type { Ticket } from './types'

const clock = { now: () => new Date('2026-09-09T18:00:00.000Z') }

function makeTicket(number: string): Ticket {
  return {
    number,
    scenarioId: 'test',
    summary: 'Тестовый инцидент',
    description: 'описание',
    service: 'Корпоративная сеть',
    category: 'Сеть',
    subcategory: 'Связность',
    priority: 'P3',
    assignmentGroup: 'Служба поддержки, первая линия',
    status: 'new',
    resolutionCode: null,
    workNotes: '',
    resolutionNotes: '',
    requester: 'p.raman',
    device: 'AL-LPT-0447',
    createdAt: null,
    slaResponseHours: 4,
    slaResolveHours: 24,
    communications: [],
  }
}

let q: QueueState
const FIRST = 'INC0000001'
const SECOND = 'INC0000002'

beforeEach(() => {
  q = createQueue([makeTicket(FIRST), makeTicket(SECOND)])
})

describe('claim', () => {
  it('переводит тикет в назначенный и запоминает его', () => {
    claim(q, FIRST, clock)
    expect(q.assigned).toBe(FIRST)
    expect(findTicket(q, FIRST).status).toBe('assigned')
  })

  it('проставляет время первого взятия', () => {
    claim(q, FIRST, clock)
    expect(findTicket(q, FIRST).createdAt).toBe('2026-09-09T18:00:00.000Z')
  })

  it('повторное взятие не перезаписывает время', () => {
    claim(q, FIRST, clock)
    const later = { now: () => new Date('2026-09-09T19:00:00.000Z') }
    claim(q, FIRST, later)
    expect(findTicket(q, FIRST).createdAt).toBe('2026-09-09T18:00:00.000Z')
  })

  it('отказывает, если уже есть тикет в работе', () => {
    claim(q, FIRST, clock)
    expect(() => claim(q, SECOND, clock)).toThrow('сначала завершите текущий тикет')
  })

  it('нельзя взять закрытый тикет', () => {
    claim(q, FIRST, clock)
    resolve(q, FIRST, 'solved')
    expect(() => claim(q, FIRST, clock)).toThrow('тикет уже закрыт')
  })

  it('несуществующий номер отвергается', () => {
    expect(() => claim(q, 'INC9999999', clock)).toThrow('тикет не найден')
  })
})

describe('setStatus', () => {
  it('меняет рабочий статус', () => {
    claim(q, FIRST, clock)
    setStatus(q, FIRST, 'in-progress')
    expect(findTicket(q, FIRST).status).toBe('in-progress')
  })

  it('не позволяет менять статус невзятого тикета', () => {
    expect(() => setStatus(q, FIRST, 'in-progress')).toThrow('тикет не назначен на вас')
  })

  it('рабочий статус не закрывает тикет', () => {
    claim(q, FIRST, clock)
    setStatus(q, FIRST, 'pending-user')
    expect(findTicket(q, FIRST).status).not.toBe('completed')
    expect(q.assigned).toBe(FIRST)
  })
})

describe('resolve', () => {
  it('закрывает тикет с кодом и освобождает слот', () => {
    claim(q, FIRST, clock)
    resolve(q, FIRST, 'solved')
    const t = findTicket(q, FIRST)
    expect(t.status).toBe('completed')
    expect(t.resolutionCode).toBe('solved')
    expect(q.assigned).toBeNull()
  })

  it('после закрытия можно взять следующий', () => {
    claim(q, FIRST, clock)
    resolve(q, FIRST, 'solved')
    claim(q, SECOND, clock)
    expect(q.assigned).toBe(SECOND)
  })

  it('нельзя закрыть невзятый тикет', () => {
    expect(() => resolve(q, FIRST, 'solved')).toThrow('тикет не назначен на вас')
  })

  it('эскалация закрывает так же, как решение', () => {
    claim(q, FIRST, clock)
    resolve(q, FIRST, 'escalate')
    expect(findTicket(q, FIRST).resolutionCode).toBe('escalate')
    expect(q.assigned).toBeNull()
  })
})

describe('unassign', () => {
  it('возвращает тикет в очередь', () => {
    claim(q, FIRST, clock)
    unassign(q, FIRST)
    expect(q.assigned).toBeNull()
    expect(findTicket(q, FIRST).status).toBe('new')
  })

  it('после возврата можно взять другой', () => {
    claim(q, FIRST, clock)
    unassign(q, FIRST)
    claim(q, SECOND, clock)
    expect(q.assigned).toBe(SECOND)
  })
})

describe('счётчики очереди', () => {
  it('различают открытые, назначенные и закрытые', () => {
    claim(q, FIRST, clock)
    resolve(q, FIRST, 'solved')
    expect(q.tickets.filter(t => t.status === 'completed')).toHaveLength(1)
    expect(q.tickets.filter(t => t.status === 'new')).toHaveLength(1)
  })
})
