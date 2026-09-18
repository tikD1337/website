import { describe, it, expect } from 'vitest'
import { recordOf } from './record'
import { loadScenario } from '../scenario/load'
import { gradeIncident } from '../grading/grade'
import { createSession } from '../session/session'
import { apipaNoLease } from '../../scenarios/net-apipa-no-lease'

const clock = { now: () => new Date('2026-09-13T16:20:00.000Z') }

/** Закрытый тикет с настоящей оценкой — без подделки Scorecard. */
function closed() {
  const { world, ticket } = loadScenario(apipaNoLease)
  const session = createSession()
  ticket.status = 'completed'
  ticket.resolutionCode = 'solved'
  ticket.resolutionNotes = 'Выдал адрес заново, проверено.'

  const card = gradeIncident({ world, ticket, session, scenario: apipaNoLease })
  return { ticket, card }
}

describe('запись прохождения', () => {
  it('идентификатор складывается из смены и номера', () => {
    const { ticket, card } = closed()
    const r = recordOf({ card, ticket, shiftId: 'SH-1', clock })
    expect(r.id).toBe(`SH-1:${ticket.number}`)
  })

  it('время закрытия и неделя берутся из часов', () => {
    const { ticket, card } = closed()
    const r = recordOf({ card, ticket, shiftId: 'SH-1', clock })
    expect(r.at).toBe('2026-09-13T16:20:00.000Z')
    expect(r.weekKey).toBe('2026-W37')
  })

  it('несёт разбор целиком', () => {
    const { ticket, card } = closed()
    const r = recordOf({ card, ticket, shiftId: 'SH-1', clock })
    expect(r.card.verdict).toBe(card.verdict)
    expect(r.card.dimensions).toHaveLength(6)
    expect(r.card.objectives.length).toBeGreaterThan(0)
  })

  it('несёт то, чем рисуется список истории', () => {
    const { ticket, card } = closed()
    const r = recordOf({ card, ticket, shiftId: 'SH-1', clock })
    expect(r.number).toBe(ticket.number)
    expect(r.scenarioId).toBe('net-apipa-no-lease')
    expect(r.summary).toBe(ticket.summary)
    expect(r.device).toBe(ticket.device)
    expect(r.resolutionCode).toBe('solved')
    expect(r.resolutionNotes).toBe('Выдал адрес заново, проверено.')
  })

  /*
    Тот же класс дефекта, что инъекция, делившаяся ссылкой со
    сценарием: запись — снимок прошлого, и следующая смена не должна
    уметь его переписать.
  */
  it('запись не делится ссылкой с живыми объектами', () => {
    const { ticket, card } = closed()
    const r = recordOf({ card, ticket, shiftId: 'SH-1', clock })

    ticket.resolutionNotes = 'переписано позже'
    card.dimensions[0]!.score = 0

    expect(r.resolutionNotes).toBe('Выдал адрес заново, проверено.')
    expect(r.card.dimensions[0]!.score).not.toBe(0)
  })

  /* Тикет без кода закрытия закрыть нельзя — значит, и записать нечего. */
  it('без кода закрытия падает громко', () => {
    const { ticket, card } = closed()
    ticket.resolutionCode = null
    expect(() => recordOf({ card, ticket, shiftId: 'SH-1', clock }))
      .toThrow(/кода закрытия/)
  })
})
