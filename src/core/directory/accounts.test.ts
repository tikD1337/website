import { describe, it, expect, beforeEach } from 'vitest'
import {
  unlockAccount, resetPassword, setEnabled, addToGroup, removeFromGroup,
  findUser, findGroup, hasShareAccess,
} from './accounts'
import { createWorld } from '../world/world'
import { createSession, setFlag } from '../session/session'
import type { WorldState } from '../world/types'
import type { SessionLog } from '../session/types'

const clock = { now: () => new Date('2026-09-10T11:00:00.000Z') }

let world: WorldState
let session: SessionLog

beforeEach(() => {
  world = createWorld()
  session = createSession()
})

const user = (sam = 'p.raman') => findUser(world, sam)!
/**
 * Сверка относится к конкретной учётной записи, поэтому в тестах
 * недостаточно поднять флаг — нужно сказать, кого сверяли.
 */
const verifiedFor = (sam = 'p.raman') => {
  setFlag(session, 'identityVerified', true)
  session.verifiedAccount = sam
}
const verified = () => verifiedFor('p.raman')

describe('unlockAccount', () => {
  beforeEach(() => {
    user().lockedOut = true
    user().badPwdCount = 5
  })

  it('снимает блокировку и обнуляет счётчик', () => {
    verified()
    const r = unlockAccount(world, 'p.raman', session, clock)
    expect(r.ok).toBe(true)
    expect(user().lockedOut).toBe(false)
    expect(user().badPwdCount).toBe(0)
  })

  it('пишет изменение в журнал сессии', () => {
    verified()
    unlockAccount(world, 'p.raman', session, clock)
    const change = session.changes.find(c => c.path.includes('lockedOut'))
    expect(change).toBeDefined()
    expect(change!.authorized).toBe(true)
  })

  it('незаблокированная учётка не считается изменением', () => {
    verified()
    user().lockedOut = false
    const r = unlockAccount(world, 'p.raman', session, clock)
    expect(r.alreadyInState).toBe(true)
    expect(session.changes).toHaveLength(0)
  })

  it('логин распознаётся независимо от регистра', () => {
    verified()
    expect(unlockAccount(world, 'P.RAMAN', session, clock).ok).toBe(true)
  })

  it('несуществующая учётка даёт внятную ошибку', () => {
    const r = unlockAccount(world, 'нет.такого', session, clock)
    expect(r.ok).toBe(false)
    expect(r.error).toContain('не найдена')
  })
})

/**
 * Главное решение среза: изменение аккаунта без подтверждённой личности
 * не блокируется, а помечается. Инцидент безопасности нужно совершить
 * и увидеть в разборе, иначе техник не поймёт, почему порядок важен.
 */
describe('сброс пароля без подтверждения личности', () => {
  it('проходит, а не отклоняется', () => {
    const r = resetPassword(world, 'p.raman', session, clock)
    expect(r.ok).toBe(true)
    expect(r.flagged).toBe(true)
  })

  it('пароль действительно меняется', () => {
    const before = user().pwdLastSet
    resetPassword(world, 'p.raman', session, clock)
    expect(user().pwdLastSet).not.toBe(before)
  })

  it('изменение помечено несанкционированным', () => {
    resetPassword(world, 'p.raman', session, clock)
    const change = session.changes.find(c => c.path.includes('pwdLastSet'))!
    expect(change.authorized).toBe(false)
  })

  it('записывается как опасное действие с объяснением', () => {
    resetPassword(world, 'p.raman', session, clock)
    expect(session.flags.dangerousActions).toHaveLength(1)
    expect(session.flags.dangerousActions[0]!.reason).toContain('инцидент')
  })
})

describe('сброс пароля с подтверждением личности', () => {
  beforeEach(verified)

  it('проходит без пометки', () => {
    const r = resetPassword(world, 'p.raman', session, clock)
    expect(r.ok).toBe(true)
    expect(r.flagged).toBe(false)
  })

  it('изменение санкционировано', () => {
    resetPassword(world, 'p.raman', session, clock)
    expect(session.changes.find(c => c.path.includes('pwdLastSet'))!.authorized).toBe(true)
  })

  it('опасных действий не появляется', () => {
    resetPassword(world, 'p.raman', session, clock)
    expect(session.flags.dangerousActions).toHaveLength(0)
  })

  it('снимает признак истёкшего пароля и обнуляет счётчик', () => {
    user().pwdExpired = true
    user().badPwdCount = 3
    resetPassword(world, 'p.raman', session, clock)
    expect(user().pwdExpired).toBe(false)
    expect(user().badPwdCount).toBe(0)
  })
})

describe('сверили не того человека', () => {
  it('изменение чужого аккаунта всё равно помечается', () => {
    verifiedFor('p.raman')
    const r = resetPassword(world, 's.okafor', session, clock)
    expect(r.ok).toBe(true)
    expect(r.flagged).toBe(true)
  })

  it('причина объясняет, что сверяли другого', () => {
    verifiedFor('p.raman')
    resetPassword(world, 's.okafor', session, clock)
    expect(session.flags.dangerousActions[0]!.reason).toContain('другого')
  })
})

describe('setEnabled', () => {
  beforeEach(verified)

  it('отключает учётную запись', () => {
    const r = setEnabled(world, 'p.raman', false, session, clock)
    expect(r.ok).toBe(true)
    expect(user().enabled).toBe(false)
  })

  it('повторное отключение изменением не считается', () => {
    setEnabled(world, 'p.raman', false, session, clock)
    const r = setEnabled(world, 'p.raman', false, session, clock)
    expect(r.alreadyInState).toBe(true)
  })
})

describe('addToGroup', () => {
  beforeEach(() => verifiedFor('e.varga'))

  it('добавляет и согласованно меняет обе стороны', () => {
    const r = addToGroup(world, 'e.varga', 'GRP-Sales-Contracts', session, clock)
    expect(r.ok).toBe(true)
    expect(user('e.varga').groups).toContain('GRP-Sales-Contracts')
    expect(findGroup(world, 'GRP-Sales-Contracts')!.members).toContain('e.varga')
  })

  it('повторное добавление ничего не дублирует', () => {
    addToGroup(world, 'e.varga', 'GRP-Sales-Contracts', session, clock)
    addToGroup(world, 'e.varga', 'GRP-Sales-Contracts', session, clock)
    const g = findGroup(world, 'GRP-Sales-Contracts')!
    expect(g.members.filter(m => m === 'e.varga')).toHaveLength(1)
  })

  /*
    Привилегированная группа — именно отказ, а не пометка.

    Права администратора домена первая линия выдать не может физически:
    это отдельный контур доступа. Здесь запрет честен, в отличие от
    сброса пароля.
  */
  it('добавление в привилегированную группу отклоняется', () => {
    verifiedFor('p.raman')
    const r = addToGroup(world, 'p.raman', 'Domain Admins', session, clock)
    expect(r.ok).toBe(false)
    expect(r.error).toContain('привилегированная')
    expect(user().groups).not.toContain('Domain Admins')
  })

  it('отклонение пишется как опасное действие', () => {
    verifiedFor('p.raman')
    addToGroup(world, 'p.raman', 'Domain Admins', session, clock)
    expect(session.flags.dangerousActions).toHaveLength(1)
  })

  it('отказ действует и с подтверждённой личностью', () => {
    verifiedFor('p.raman')
    expect(addToGroup(world, 'p.raman', 'GRP-Helpdesk-T1', session, clock).ok).toBe(false)
  })

  it('несуществующая группа даёт внятную ошибку', () => {
    verifiedFor('p.raman')
    const r = addToGroup(world, 'p.raman', 'GRP-Нет', session, clock)
    expect(r.error).toContain('группа')
  })
})

describe('removeFromGroup', () => {
  beforeEach(() => verifiedFor('p.raman'))

  it('исключает и согласованно меняет обе стороны', () => {
    removeFromGroup(world, 'p.raman', 'GRP-Sales-Contracts', session, clock)
    expect(user().groups).not.toContain('GRP-Sales-Contracts')
    expect(findGroup(world, 'GRP-Sales-Contracts')!.members).not.toContain('p.raman')
  })

  it('исключение из группы, где не состоит, изменением не считается', () => {
    verifiedFor('e.varga')
    const r = removeFromGroup(world, 'e.varga', 'GRP-Finance-Reports', session, clock)
    expect(r.alreadyInState).toBe(true)
  })
})

describe('hasShareAccess', () => {
  it('доступ есть у члена нужной группы', () => {
    const share = world.org.shares.find(s => s.requiresGroup === 'GRP-Finance-Reports')!
    expect(hasShareAccess(world, 's.okafor', share.path)).toBe(true)
  })

  it('доступа нет у того, кто не в группе', () => {
    const share = world.org.shares.find(s => s.requiresGroup === 'GRP-Finance-Reports')!
    expect(hasShareAccess(world, 'p.raman', share.path)).toBe(false)
  })

  it('добавление в группу открывает доступ', () => {
    verifiedFor('p.raman')
    const share = world.org.shares.find(s => s.requiresGroup === 'GRP-Finance-Reports')!
    addToGroup(world, 'p.raman', 'GRP-Finance-Reports', session, clock)
    expect(hasShareAccess(world, 'p.raman', share.path)).toBe(true)
  })

  it('неизвестный ресурс доступа не даёт', () => {
    expect(hasShareAccess(world, 's.okafor', '\\\\нет\\такого')).toBe(false)
  })
})
