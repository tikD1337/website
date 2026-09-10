import { describe, it, expect, beforeEach } from 'vitest'
import { verifyIdentity, isVerifiedFor, FIELD_QUESTION } from './identity'
import { resetPassword } from './accounts'
import { createWorld } from '../world/world'
import { createSession } from '../session/session'
import type { WorldState } from '../world/types'
import type { SessionLog } from '../session/types'

const clock = { now: () => new Date('2026-09-10T11:00:00.000Z') }

let world: WorldState
let session: SessionLog

beforeEach(() => {
  world = createWorld()
  session = createSession()
})

describe('verifyIdentity', () => {
  it('верный ответ поднимает флаг и запоминает, кого сверяли', () => {
    const r = verifyIdentity(world, 'p.raman', 'manager', 'Elena Varga', session, clock)
    expect(r.ok).toBe(true)
    expect(session.flags.identityVerified).toBe(true)
    expect(session.verifiedAccount).toBe('p.raman')
  })

  it('неверный ответ флаг не поднимает', () => {
    const r = verifyIdentity(world, 'p.raman', 'manager', 'Кто-то другой', session, clock)
    expect(r.ok).toBe(false)
    expect(session.flags.identityVerified).toBe(false)
  })

  it('не придирается к регистру и лишним пробелам', () => {
    const r = verifyIdentity(world, 'p.raman', 'manager', '  elena   varga ', session, clock)
    expect(r.ok).toBe(true)
  })

  it('сверяет по кабинету', () => {
    expect(verifyIdentity(world, 'p.raman', 'office', '3-14', session, clock).ok).toBe(true)
  })

  it('сверяет по отделу', () => {
    expect(verifyIdentity(world, 'p.raman', 'dept', 'Продажи', session, clock).ok).toBe(true)
  })

  it('попытка сверки пишется в журнал общения — и вопрос, и ответ', () => {
    verifyIdentity(world, 'p.raman', 'manager', 'Elena Varga', session, clock)
    expect(session.dialogue).toHaveLength(2)
    expect(session.dialogue[0]!.speaker).toBe('technician')
    expect(session.dialogue[0]!.text).toBe(FIELD_QUESTION.manager)
    expect(session.dialogue[1]!.speaker).toBe('requester')
    expect(session.dialogue[1]!.text).toBe('Elena Varga')
  })

  it('неудачная попытка тоже остаётся в журнале', () => {
    verifyIdentity(world, 'p.raman', 'manager', 'мимо', session, clock)
    expect(session.dialogue).toHaveLength(2)
  })

  it('незаполненное поле сверку не проходит', () => {
    // у операционного директора нет руководителя
    const r = verifyIdentity(world, 'd.mbeki', 'manager', '', session, clock)
    expect(r.ok).toBe(false)
    expect(r.error).toContain('не заполнено')
    expect(session.flags.identityVerified).toBe(false)
  })

  it('несуществующая учётка даёт ошибку', () => {
    const r = verifyIdentity(world, 'нет.такого', 'manager', 'кто-то', session, clock)
    expect(r.ok).toBe(false)
    expect(r.error).toContain('не найдена')
  })

  it('возвращает ожидаемый ответ для разбора', () => {
    const r = verifyIdentity(world, 'p.raman', 'office', 'мимо', session, clock)
    expect(r.expected).toBe('3-14')
  })
})

describe('isVerifiedFor', () => {
  it('верно для сверенного', () => {
    verifyIdentity(world, 'p.raman', 'manager', 'Elena Varga', session, clock)
    expect(isVerifiedFor(session, 'p.raman')).toBe(true)
  })

  it('неверно для другого человека', () => {
    verifyIdentity(world, 'p.raman', 'manager', 'Elena Varga', session, clock)
    expect(isVerifiedFor(session, 's.okafor')).toBe(false)
  })

  it('не зависит от регистра логина', () => {
    verifyIdentity(world, 'p.raman', 'manager', 'Elena Varga', session, clock)
    expect(isVerifiedFor(session, 'P.Raman')).toBe(true)
  })

  it('неверно без сверки вообще', () => {
    expect(isVerifiedFor(session, 'p.raman')).toBe(false)
  })
})

/** Сверка и операции связаны: одно влияет на другое через шлюз. */
describe('сверка открывает операции над тем же аккаунтом', () => {
  it('после верной сверки сброс пароля санкционирован', () => {
    verifyIdentity(world, 'p.raman', 'manager', 'Elena Varga', session, clock)
    const r = resetPassword(world, 'p.raman', session, clock)
    expect(r.flagged).toBe(false)
  })

  it('после неверной сверки сброс остаётся инцидентом', () => {
    verifyIdentity(world, 'p.raman', 'manager', 'мимо', session, clock)
    const r = resetPassword(world, 'p.raman', session, clock)
    expect(r.flagged).toBe(true)
  })

  it('сверка одного не открывает операции над другим', () => {
    verifyIdentity(world, 'p.raman', 'manager', 'Elena Varga', session, clock)
    const r = resetPassword(world, 's.okafor', session, clock)
    expect(r.flagged).toBe(true)
  })
})
