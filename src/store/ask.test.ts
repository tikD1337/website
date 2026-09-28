import { describe, it, expect } from 'vitest'
import { createGameStore } from './useGame'
import { findUser } from '../core/directory/accounts'
import { SCENARIOS } from '../scenarios'

const clock = { now: () => new Date('2026-09-10T11:00:00.000Z') }

/** Окно на всю библиотеку: нужны тикеты и блокировки, и папки. */
const store = (scenarioId?: string) => {
  const g = createGameStore(clock, undefined, SCENARIOS.length)
  const s = () => g.getState()
  if (scenarioId) s().claimTicket(s().queue.tickets.find(t => t.scenarioId === scenarioId)!.number)
  return s
}
const lockoutSource = (s: ReturnType<typeof store>) => findUser(s().world, 'e.varga')!.lockoutSource

/**
 * Просьба к заявителю. Часть работы первой линии делается руками
 * пользователя — убрать старый пароль с телефона, выйти и войти заново, —
 * и без этого невыразим целый класс правильных решений: тот, что
 * отличает «снял симптом» от «устранил причину».
 */
describe('просьба к заявителю', () => {
  /*
    Найдено глазами: переписка подписывала просьбу техника именем
    заявителя, и выходило, что человек сам себе велел почистить телефон.
  */
  it('меняет мир, пишется в журнал и переписку за правильными сторонами, запоминается один раз', () => {
    const s = store('identity-account-lockout')
    s().openApp('eventvwr')
    expect(lockoutSource(s)).not.toBeNull()

    s().askRequesterTo('clear-phone')
    s().askRequesterTo('clear-phone')

    expect(lockoutSource(s)).toBeNull()
    expect(s().session.askedFor).toEqual(['clear-phone'])
    expect(s().session.dialogue.slice(0, 2).map(d => d.speaker)).toEqual(['technician', 'requester'])
    expect(s().session.dialogue[1]!.text).toContain('удалила и добавила заново')
    const ticket = s().queue.tickets.find(t => t.number === s().queue.assigned)!
    expect(ticket.communications.slice(0, 2).map(c => c.from)).toEqual(['technician', 'e.varga'])

    s().askRequesterTo('нет-такой')
    expect(s().session.askedFor).toEqual(['clear-phone'])

    const idle = store()
    idle().askRequesterTo('clear-phone')
    expect(idle().session.askedFor).toHaveLength(0)
  })

  /*
    Найдено глазами, а не тестом: текст просьбы — «учётку блокирует
    почта на телефоне» — это ответ на главный вопрос сценария, и кнопка,
    видимая с первой секунды, обесценивала всю развилку. Правило живёт в
    сторе, а не в интерфейсе: спрятанная кнопка защищает только от мыши.
  */
  it('закрыта, пока причина не выяснена расследованием', () => {
    const s = store('identity-account-lockout')
    s().askRequesterTo('clear-phone')
    expect(s().session.askedFor).toHaveLength(0)
    expect(s().session.dialogue).toHaveLength(0)
    expect(lockoutSource(s)).not.toBeNull()

    s().openApp('eventvwr')
    s().askRequesterTo('clear-phone')
    expect(s().session.askedFor).toEqual(['clear-phone'])
  })

  /*
    Заявитель сообщает то, что видит, и после просьбы тоже. Ответ был
    статическим: «вышла и вошла — папка открылась» приходил, даже когда
    в группу не добавили. Просьба при этом зачтена: техник её задал, а не
    сработала она потому, что он не сделал главного, — это видно по
    незакрытой цели.
  */
  it('ответ зависит от состояния мира, а просьба зачтена в любом случае', () => {
    const s = store('identity-share-access')
    s().askRequesterTo('relogin')
    const early = s().session.dialogue.at(-1)!.text
    expect(early).toContain('нет разрешений')
    expect(early).not.toContain('открылась')
    expect(s().session.askedFor).toEqual(['relogin'])

    s().verifyRequester('manager', 'Dumisani Mbeki')
    s().addUserToGroup('n.haruna', 'GRP-Finance-Reports')
    s().askRequesterTo('relogin')
    expect(s().session.dialogue.at(-1)!.text).toContain('открылась')
  })
})
