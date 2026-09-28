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
  it('снимок: id из смены и номера, время и неделя из часов, разбор и поля списка', () => {
    const { ticket, card } = closed()
    const r = recordOf({ card, ticket, shiftId: 'SH-1', clock })

    expect(r).toMatchObject({
      id: `SH-1:${ticket.number}`,
      shiftId: 'SH-1',
      at: '2026-09-13T16:20:00.000Z',
      weekKey: '2026-W37',
      number: ticket.number,
      scenarioId: 'net-apipa-no-lease',
      summary: ticket.summary,
      device: 'AL-LPT-0447',
      resolutionCode: 'solved',
      resolutionNotes: 'Выдал адрес заново, проверено.',
    })
    expect(r.card).toEqual(card)
  })

  /*
    Тот же класс дефекта, что инъекция, делившаяся ссылкой со сценарием:
    запись — снимок прошлого, и следующая смена не должна уметь его
    переписать.
  */
  it('не делится ссылкой с живыми объектами', () => {
    const { ticket, card } = closed()
    const r = recordOf({ card, ticket, shiftId: 'SH-1', clock })
    const score = card.dimensions[0]!.score

    ticket.resolutionNotes = 'переписано позже'
    card.dimensions[0]!.score = -1

    expect(r.resolutionNotes).toBe('Выдал адрес заново, проверено.')
    expect(r.card.dimensions[0]!.score).toBe(score)
  })

  /* Тикет без кода закрытия закрыть нельзя — значит, и записать нечего. */
  it('без кода закрытия падает громко', () => {
    const { ticket, card } = closed()
    ticket.resolutionCode = null
    expect(() => recordOf({ card, ticket, shiftId: 'SH-1', clock })).toThrow(/кода закрытия/)
  })
})
