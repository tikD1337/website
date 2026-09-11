import { describe, it, expect, beforeEach } from 'vitest'
import { createGameStore } from './useGame'
import { findUser } from '../core/directory/accounts'

const clock = { now: () => new Date('2026-09-10T11:00:00.000Z') }

const store = () => {
  const g = createGameStore(clock)
  g.getState().start()
  return () => g.getState()
}

/**
 * Просьба к заявителю.
 *
 * Часть работы первой линии делается не техником, а руками
 * пользователя: убрать старый пароль с телефона, выйти и войти заново,
 * переткнуть кабель. Тренажёр обязан это уметь, иначе целый класс
 * правильных решений в нём невыразим — а именно он отличает «снял
 * симптом» от «устранил причину».
 */
describe('askRequesterTo', () => {
  let s: ReturnType<typeof store>

  beforeEach(() => {
    s = store()
    const lockout = s().queue.tickets.find(t => t.scenarioId === 'identity-account-lockout')!
    s().claimTicket(lockout.number)
    // Просьба открывается расследованием — см. тест ниже.
    s().openApp('eventvwr')
  })

  it('просьба меняет мир', () => {
    expect(findUser(s().world, 'e.varga')!.lockoutSource).not.toBeNull()
    s().askRequesterTo('clear-phone')
    expect(findUser(s().world, 'e.varga')!.lockoutSource).toBeNull()
  })

  it('просьба и ответ попадают в журнал общения', () => {
    s().askRequesterTo('clear-phone')
    const d = s().session.dialogue
    expect(d).toHaveLength(2)
    expect(d[0]!.speaker).toBe('technician')
    expect(d[1]!.speaker).toBe('requester')
  })

  it('выполненная просьба запоминается для оценки', () => {
    s().askRequesterTo('clear-phone')
    expect(s().session.askedFor).toContain('clear-phone')
  })

  it('ответ заявителя попадает в переписку тикета', () => {
    s().askRequesterTo('clear-phone')
    const ticket = s().queue.tickets.find(t => t.number === s().queue.assigned)!
    expect(ticket.communications).toHaveLength(2)
  })

  /*
    Найдено глазами: переписка подписывала просьбу техника именем
    заявителя, и выходило, что человек сам себе велел почистить телефон.
  */
  it('просьба записана за техником, ответ — за заявителем', () => {
    s().askRequesterTo('clear-phone')
    const ticket = s().queue.tickets.find(t => t.number === s().queue.assigned)!
    expect(ticket.communications[0]!.from).toBe('technician')
    expect(ticket.communications[1]!.from).toBe('e.varga')
  })

  it('повторная просьба не дублируется в списке выполненных', () => {
    s().askRequesterTo('clear-phone')
    s().askRequesterTo('clear-phone')
    expect(s().session.askedFor.filter(a => a === 'clear-phone')).toHaveLength(1)
  })

  it('неизвестная просьба ничего не делает', () => {
    s().askRequesterTo('нет-такой')
    expect(s().session.askedFor).toHaveLength(0)
    expect(s().session.dialogue).toHaveLength(0)
  })

  it('без взятого тикета просить некого', () => {
    const fresh = store()
    fresh().askRequesterTo('clear-phone')
    expect(fresh().session.askedFor).toHaveLength(0)
  })
})

/*
  Просьба открывается расследованием.

  Найдено глазами, а не тестом: текст просьбы — «учётку блокирует почта
  на телефоне» — это и есть ответ на главный вопрос сценария. Кнопка,
  видимая с первой секунды, печатала диагноз в тикете и обесценивала
  всю развилку.

  Правило живёт в сторе, а не в интерфейсе: спрятанная кнопка защищает
  только от мыши.
*/
describe('просьба закрыта, пока причина не выяснена', () => {
  it('до журнала событий просьба не выполняется', () => {
    const s = store()
    const lockout = s().queue.tickets.find(
      t => t.scenarioId === 'identity-account-lockout')!
    s().claimTicket(lockout.number)

    s().askRequesterTo('clear-phone')

    expect(s().session.askedFor).toHaveLength(0)
    expect(s().session.dialogue).toHaveLength(0)
    expect(findUser(s().world, 'e.varga')!.lockoutSource).not.toBeNull()
  })

  it('после журнала событий выполняется', () => {
    const s = store()
    const lockout = s().queue.tickets.find(
      t => t.scenarioId === 'identity-account-lockout')!
    s().claimTicket(lockout.number)

    s().openApp('eventvwr')
    s().askRequesterTo('clear-phone')

    expect(s().session.askedFor).toContain('clear-phone')
  })
})
