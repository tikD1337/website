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

/**
 * Сверка личности — настоящая проверка, а не кнопка «я подтвердил»:
 * техник выбирает контрольное поле, вводит услышанный ответ, ответ
 * сверяется с каталогом. И она относится к конкретной учётке.
 */
describe('сверка личности', () => {
  it('верный ответ по любому полю подтверждает и запоминает, кого сверяли', () => {
    // Не придирается к регистру и лишним пробелам.
    expect(verifyIdentity(world, 'p.raman', 'manager', '  elena   varga ', session, clock).ok).toBe(true)
    expect(session.flags.identityVerified).toBe(true)
    expect(session.verifiedAccount).toBe('p.raman')

    for (const [field, answer] of [['office', '3-14'], ['dept', 'Продажи']] as const) {
      expect(verifyIdentity(world, 'p.raman', field, answer, createSession(), clock).ok, field)
        .toBe(true)
    }
  })

  it('неудача не подтверждает, но объясняет и остаётся в журнале общения', () => {
    const wrong = verifyIdentity(world, 'p.raman', 'office', 'мимо', session, clock)
    expect(wrong).toMatchObject({ ok: false, expected: '3-14' })
    expect(session.flags.identityVerified).toBe(false)
    expect(session.dialogue.map(d => [d.speaker, d.text])).toEqual([
      ['technician', FIELD_QUESTION.office],
      ['requester', 'мимо'],
    ])

    // У операционного директора нет руководителя — пустое поле не проходит.
    expect(verifyIdentity(world, 'd.mbeki', 'manager', '', session, clock).error).toContain('не заполнено')
    expect(verifyIdentity(world, 'нет.такого', 'manager', 'кто-то', session, clock).error)
      .toContain('не найдена')
    expect(session.flags.identityVerified).toBe(false)
  })

  /* Сверив одного обратившегося, техник не получает права менять чужие аккаунты. */
  it('открывает операции только над тем же аккаунтом', () => {
    expect(isVerifiedFor(session, 'p.raman')).toBe(false)
    expect(resetPassword(world, 'p.raman', session, clock).flagged).toBe(true)

    verifyIdentity(world, 'p.raman', 'manager', 'Elena Varga', session, clock)
    expect(isVerifiedFor(session, 'P.Raman')).toBe(true)
    expect(isVerifiedFor(session, 's.okafor')).toBe(false)
    expect(resetPassword(world, 'p.raman', session, clock).flagged).toBe(false)
    expect(resetPassword(world, 's.okafor', session, clock).flagged).toBe(true)
  })
})
