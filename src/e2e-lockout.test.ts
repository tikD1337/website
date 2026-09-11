import { describe, it, expect } from 'vitest'
import { createGameStore } from './store/useGame'
import { findUser } from './core/directory/accounts'

const clock = { now: () => new Date('2026-09-10T08:30:00.000Z') }

const store = () => {
  const g = createGameStore(clock)
  g.getState().start()
  const s = () => g.getState()
  const ticket = s().queue.tickets.find(t => t.scenarioId === 'identity-account-lockout')!
  s().claimTicket(ticket.number)
  return s
}

const GOOD_NOTE =
  'Elena Varga сообщила, что не может войти — система пишет, что учётная '
  + 'запись заблокирована. net user e.varga показал блокировку и девять '
  + 'неудачных входов. В журнале событий нашлось событие 4740: источник '
  + 'блокировки — устройство ARC-MOBILE-0512, рабочий телефон, и подряд '
  + 'идущие 4771 с одного адреса. Пароль верный, поэтому не сбрасывал: снял '
  + 'блокировку с e.varga и попросил удалить и заново добавить почту ArcMail '
  + 'на телефоне. Проверено: заявительница подтвердила, что вход прошёл. '
  + 'При повторении смотреть телефон — причина в кэше пароля.'

describe('инцидент с блокировкой от начала до конца', () => {
  it('образцовое прохождение даёт полный вердикт', () => {
    const s = store()

    s().verifyRequester('manager', 'Dumisani Mbeki')
    s().runCommand('net user e.varga')
    s().openApp('eventvwr')
    s().unlockUser('e.varga')
    s().askRequesterTo('clear-phone')
    s().confirmWithUser()

    s().saveResolutionNotes(GOOD_NOTE)
    s().setResolutionCode('solved')
    s().resolveTicket()

    const card = s().scorecard!
    expect(card.silentFaults).toEqual([])
    expect(card.objectives.filter(o => !o.met).map(o => o.id)).toEqual([])
    expect(card.verdict).toBe('full')
  })

  /*
    Самая поучительная развилка сценария: техник снял блокировку, всё
    работает, заявитель доволен — а телефон продолжает ломиться, и
    учётка заблокируется снова до конца обеда.
  */
  it('разблокировал, но не сказал про телефон — тихая поломка', () => {
    const s = store()

    s().verifyRequester('manager', 'Dumisani Mbeki')
    s().runCommand('net user e.varga')
    s().openApp('eventvwr')
    s().unlockUser('e.varga')
    s().confirmWithUser()

    s().saveResolutionNotes(GOOD_NOTE)
    s().setResolutionCode('solved')
    s().resolveTicket()

    const card = s().scorecard!
    expect(card.silentFaults).toHaveLength(1)
    expect(card.silentFaults[0]).toContain('заблокируется снова')
    expect(card.verdict).toBe('fail')
  })

  /*
    Не открыв журнал, техник не узнаёт про телефон — и попросить о нём
    не может: просьба закрыта до выяснения причины. Поэтому здесь
    остаётся и тихая поломка, и незакрытые цели.
  */
  it('разблокировал, не открыв журнал — источник остался', () => {
    const s = store()

    s().verifyRequester('manager', 'Dumisani Mbeki')
    s().unlockUser('e.varga')
    s().askRequesterTo('clear-phone')   // закрыто: журнал не открывали
    s().confirmWithUser()

    s().saveResolutionNotes('Снял блокировку с e.varga, пользователь вошёл.')
    s().setResolutionCode('solved')
    s().resolveTicket()

    const card = s().scorecard!
    expect(card.objectives.find(o => o.id === 'obj-find-source')!.met).toBe(false)
    expect(card.objectives.find(o => o.id === 'obj-ask-phone')!.met).toBe(false)
    expect(card.silentFaults).toHaveLength(1)
    expect(card.verdict).toBe('fail')
  })

  /*
    Сброс пароля без сверки личности — инцидент безопасности. Учётная
    запись заблокирована именно та, доступ к которой чаще всего и
    пытаются получить чужими руками.
  */
  it('сброс пароля без подтверждения личности валит вердикт', () => {
    const s = store()

    s().resetUserPassword('e.varga')
    s().unlockUser('e.varga')
    s().askRequesterTo('clear-phone')
    s().confirmWithUser()

    s().saveResolutionNotes(GOOD_NOTE)
    s().setResolutionCode('solved')
    s().resolveTicket()

    const card = s().scorecard!
    expect(card.verdict).toBe('fail')
    expect(card.dimensions.find(d => d.id === 'authority')!.score).toBe(0)
  })

  it('заявитель не подтверждает, пока блокировка не снята', () => {
    const s = store()

    s().confirmWithUser()
    expect(s().session.flags.userConfirmed).toBe(false)

    s().verifyRequester('manager', 'Dumisani Mbeki')
    s().unlockUser('e.varga')
    s().confirmWithUser()
    expect(s().session.flags.userConfirmed).toBe(true)
  })
})

describe('связность: каталог, команда и журнал показывают одно', () => {
  it('блокировка видна и в net user, и в каталоге', () => {
    const s = store()
    s().runCommand('net user e.varga')

    expect(s().terminalLines.some(l => l.text.includes('Locked'))).toBe(true)
    expect(findUser(s().world, 'e.varga')!.lockedOut).toBe(true)
  })

  it('после разблокировки команда отвечает иначе', () => {
    const s = store()
    s().verifyRequester('manager', 'Dumisani Mbeki')
    s().unlockUser('e.varga')
    s().runCommand('net user e.varga')

    const card = s().terminalLines.filter(l => l.text.startsWith('Account active'))
    expect(card.at(-1)!.text).toContain('Yes')
  })

  it('счётчик неудачных входов обнуляется', () => {
    const s = store()
    expect(findUser(s().world, 'e.varga')!.badPwdCount).toBe(9)

    s().verifyRequester('manager', 'Dumisani Mbeki')
    s().unlockUser('e.varga')
    expect(findUser(s().world, 'e.varga')!.badPwdCount).toBe(0)
  })

  it('источник блокировки виден в журнале событий машины', () => {
    const s = store()
    const log = s().world.devices['AL-LPT-0512']!.eventLog
    const lockout = log.find(e => e.eventId === 4740)!
    expect(lockout.message).toContain('ARC-MOBILE-0512')
  })
})
