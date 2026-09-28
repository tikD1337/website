import { describe, it, expect, beforeEach } from 'vitest'
import { createQueue, claim, setStatus, resolve, unassign, findTicket, park, resume } from './queue'
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

/*
  Один тикет в работе за раз — правило снято с ориентира и держится
  намеренно: оно заставляет доводить дело до конца. Рабочий статус
  тикет не закрывает — закрытие отдельное действие с кодом.
*/
describe('очередь', () => {
  it('взятие назначает тикет и запоминает время первого взятия', () => {
    claim(q, FIRST, clock)
    expect(q.assigned).toBe(FIRST)
    expect(findTicket(q, FIRST)).toMatchObject({
      status: 'assigned', createdAt: '2026-09-09T18:00:00.000Z',
    })

    claim(q, FIRST, { now: () => new Date('2026-09-09T19:00:00.000Z') })
    expect(findTicket(q, FIRST).createdAt).toBe('2026-09-09T18:00:00.000Z')
  })

  it('второй тикет, закрытый и несуществующий взять нельзя', () => {
    claim(q, FIRST, clock)
    expect(() => claim(q, SECOND, clock)).toThrow('сначала завершите текущий тикет')
    resolve(q, FIRST, 'solved')
    expect(() => claim(q, FIRST, clock)).toThrow('тикет уже закрыт')
    expect(() => claim(q, 'INC9999999', clock)).toThrow('тикет не найден')
  })

  it('рабочий статус меняется только у своего тикета и его не закрывает', () => {
    expect(() => setStatus(q, FIRST, 'in-progress')).toThrow('тикет не назначен на вас')
    claim(q, FIRST, clock)
    setStatus(q, FIRST, 'pending-user')
    expect(findTicket(q, FIRST).status).toBe('pending-user')
    expect(q.assigned).toBe(FIRST)
  })

  it('закрытие с кодом освобождает слот; возврат в очередь тоже', () => {
    expect(() => resolve(q, FIRST, 'solved')).toThrow('тикет не назначен на вас')
    claim(q, FIRST, clock)
    resolve(q, FIRST, 'escalate')
    expect(findTicket(q, FIRST)).toMatchObject({ status: 'completed', resolutionCode: 'escalate' })
    expect(q.assigned).toBeNull()

    claim(q, SECOND, clock)
    unassign(q, SECOND)
    expect(q.assigned).toBeNull()
    expect(findTicket(q, SECOND).status).toBe('new')
  })

  /*
    Пока курьер везёт замену, техник берёт следующий тикет: «Ждём
    поставку» отпускает слот, но статус тикета не теряется при повторном
    взятии — иначе «ждём» превращалось бы в «назначен» от клика по строке.
  */
  it('ждущий тикет отпускает слот и возвращается со своим статусом', () => {
    expect(() => park(q, FIRST)).toThrow('тикет не назначен на вас')
    claim(q, FIRST, clock)
    park(q, FIRST)
    expect(q.assigned).toBeNull()
    expect(findTicket(q, FIRST).status).toBe('pending-shipment')

    claim(q, SECOND, clock)
    resolve(q, SECOND, 'solved')
    claim(q, FIRST, clock)
    expect(findTicket(q, FIRST).status).toBe('pending-shipment')

    resume(q, FIRST)
    expect(findTicket(q, FIRST).status).toBe('in-progress')
    resume(q, SECOND)
    expect(findTicket(q, SECOND).status).toBe('completed')
  })
})
