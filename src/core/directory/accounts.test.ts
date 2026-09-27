import { describe, it, expect, beforeEach } from 'vitest'
import {
  unlockAccount, resetPassword, setEnabled, addToGroup, removeFromGroup,
  findUser, findGroup, hasShareAccess, grantDirectAccess, relogin,
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
const REPORTS = '\\\\fileserver.arcline.corp\\Finance-Reports'
/**
 * Сверка относится к конкретной учётной записи, поэтому в тестах
 * недостаточно поднять флаг — нужно сказать, кого сверяли.
 */
const verifiedFor = (sam = 'p.raman') => {
  setFlag(session, 'identityVerified', true)
  session.verifiedAccount = sam
}

describe('разблокировка', () => {
  it('снимает блокировку, обнуляет счётчик и пишет санкционированное изменение', () => {
    verifiedFor('p.raman')
    user().lockedOut = true
    user().badPwdCount = 5

    // Логин распознаётся независимо от регистра.
    const r = unlockAccount(world, 'P.RAMAN', session, clock)

    expect(r).toEqual({ ok: true, flagged: false })
    expect(user().lockedOut).toBe(false)
    expect(user().badPwdCount).toBe(0)
    expect(session.changes).toEqual([{
      at: '2026-09-10T11:00:00.000Z',
      path: 'org.users.p.raman.lockedOut',
      before: true,
      after: false,
      authorized: true,
    }])
  })

  it('незаблокированная учётка изменением не считается', () => {
    verifiedFor('p.raman')
    const r = unlockAccount(world, 'p.raman', session, clock)
    expect(r.alreadyInState).toBe(true)
    expect(session.changes).toHaveLength(0)
  })
})

/**
 * Главное решение среза: изменение аккаунта без подтверждённой личности
 * не блокируется, а помечается. Инцидент безопасности нужно совершить
 * и увидеть в разборе, иначе техник не поймёт, почему порядок важен.
 */
describe('сброс пароля', () => {
  it('без сверки проходит, но записывается как инцидент безопасности', () => {
    const before = user().pwdLastSet
    const r = resetPassword(world, 'p.raman', session, clock)

    expect(r).toEqual({ ok: true, flagged: true })
    expect(user().pwdLastSet).not.toBe(before)
    expect(session.changes[0]!.authorized).toBe(false)
    expect(session.flags.dangerousActions).toHaveLength(1)
    expect(session.flags.dangerousActions[0]!.reason).toContain('инцидент')
  })

  it('со сверкой санкционирован и снимает истёкший пароль со счётчиком', () => {
    verifiedFor('p.raman')
    user().pwdExpired = true
    user().badPwdCount = 3

    const r = resetPassword(world, 'p.raman', session, clock)

    expect(r).toEqual({ ok: true, flagged: false })
    expect(user().pwdLastSet).toBe('2026-09-10T11:00:00.000Z')
    expect(user().pwdExpired).toBe(false)
    expect(user().badPwdCount).toBe(0)
    expect(session.changes[0]!.authorized).toBe(true)
    expect(session.flags.dangerousActions).toHaveLength(0)
  })

  it('сверка другого человека не даёт права менять этот аккаунт', () => {
    verifiedFor('p.raman')
    const r = resetPassword(world, 's.okafor', session, clock)
    expect(r.flagged).toBe(true)
    expect(session.flags.dangerousActions[0]!.reason).toContain('другого')
  })
})

describe('включение и отключение', () => {
  it('отключает, а повторное отключение изменением не считается', () => {
    verifiedFor('p.raman')
    expect(setEnabled(world, 'p.raman', false, session, clock).ok).toBe(true)
    expect(user().enabled).toBe(false)

    expect(setEnabled(world, 'p.raman', false, session, clock).alreadyInState).toBe(true)
    expect(session.changes).toHaveLength(1)
  })
})

describe('группы', () => {
  it('добавление меняет обе стороны и не дублируется', () => {
    verifiedFor('e.varga')
    addToGroup(world, 'e.varga', 'GRP-Sales-Contracts', session, clock)
    addToGroup(world, 'e.varga', 'GRP-Sales-Contracts', session, clock)

    expect(user('e.varga').groups.filter(g => g === 'GRP-Sales-Contracts')).toHaveLength(1)
    expect(findGroup(world, 'GRP-Sales-Contracts')!.members
      .filter(m => m === 'e.varga')).toHaveLength(1)
    expect(session.changes).toHaveLength(1)
  })

  it('исключение меняет обе стороны; где не состоит — не изменение', () => {
    verifiedFor('p.raman')
    removeFromGroup(world, 'p.raman', 'GRP-Sales-Contracts', session, clock)
    expect(user().groups).not.toContain('GRP-Sales-Contracts')
    expect(findGroup(world, 'GRP-Sales-Contracts')!.members).not.toContain('p.raman')

    const again = removeFromGroup(world, 'p.raman', 'GRP-Sales-Contracts', session, clock)
    expect(again.alreadyInState).toBe(true)
  })

  /*
    Привилегированная группа — именно отказ, а не пометка, и даже со
    сверкой: права администратора первая линия выдать не может
    физически, это отдельный контур доступа.
  */
  it('добавление в привилегированную группу отклоняется и записывается', () => {
    verifiedFor('p.raman')
    const r = addToGroup(world, 'p.raman', 'Domain Admins', session, clock)

    expect(r.ok).toBe(false)
    expect(r.error).toContain('привилегированная')
    expect(user().groups).not.toContain('Domain Admins')
    expect(session.flags.dangerousActions).toHaveLength(1)
    expect(addToGroup(world, 'p.raman', 'GRP-Helpdesk-T1', session, clock).ok).toBe(false)
  })

  /*
    Граница двусторонняя. Добавление отклонялось, а исключение
    проходило: первая линия не могла выдать права администратора
    домена, но могла их **отобрать** — это хуже исходной ошибки.
  */
  it('исключение из привилегированной группы тоже отклоняется', () => {
    verifiedFor('a.tier0')
    const r = removeFromGroup(world, 'a.tier0', 'Domain Admins', session, clock)

    expect(r.ok).toBe(false)
    expect(findGroup(world, 'Domain Admins')!.members).toContain('a.tier0')
    expect(findUser(world, 'a.tier0')!.groups).toContain('Domain Admins')
    expect(session.flags.dangerousActions).toHaveLength(1)
  })
})

/*
  Права выдаются при входе: билет пользователя содержит группы, которые
  были у него на момент входа. Каталог меняется мгновенно, доступ у
  человека — только после повторного входа. Это половина сценария с
  общей папкой: техник добавил в группу, заявитель говорит «всё равно
  не пускает», и техник обязан знать, что сказать дальше.
*/
describe('доступ к общему ресурсу', () => {
  it('доступ по группе есть у члена группы и нет у остальных', () => {
    expect(hasShareAccess(world, 's.okafor', REPORTS)).toBe(true)
    expect(hasShareAccess(world, 'p.raman', REPORTS)).toBe(false)
    expect(hasShareAccess(world, 's.okafor', '\\\\нет\\такого')).toBe(false)
  })

  it('добавление в группу действует только после повторного входа', () => {
    verifiedFor('p.raman')
    addToGroup(world, 'p.raman', 'GRP-Finance-Reports', session, clock)

    expect(user().groups).toContain('GRP-Finance-Reports')
    expect(hasShareAccess(world, 'p.raman', REPORTS)).toBe(false)

    relogin(world, 'p.raman', clock)
    expect(user().tokenGroups).toEqual(user().groups)
    expect(hasShareAccess(world, 'p.raman', REPORTS)).toBe(true)
  })

  it('исключение из группы тоже действует только после входа', () => {
    verifiedFor('s.okafor')
    removeFromGroup(world, 's.okafor', 'GRP-Finance-Reports', session, clock)
    expect(hasShareAccess(world, 's.okafor', REPORTS)).toBe(true)

    relogin(world, 's.okafor', clock)
    expect(hasShareAccess(world, 's.okafor', REPORTS)).toBe(false)
  })

  /*
    Отметка последнего входа обязана обновиться: по ней техник отличает
    «не может войти со вчера» от «не входил с отпуска». Раньше строка
    записывала значение само в себя и не делала ничего.
  */
  it('повторный вход обновляет отметку последнего входа', () => {
    relogin(world, 'p.raman', clock)
    expect(user().lastLogon).toBe('2026-09-10T11:00:00.000Z')
    expect(() => relogin(world, 'нет.такого', clock)).not.toThrow()
  })

  /*
    Прямой доступ мимо группы — ловушка сценария с общей папкой.
    Работает сразу и потому выглядит удачным решением; цена видна
    позже — при разборе прав это аномалия, а следующий сотрудник отдела
    придёт с той же проблемой.
  */
  it('прямой доступ действует сразу и пишется в ресурс, а не в группу', () => {
    verifiedFor('p.raman')
    grantDirectAccess(world, 'p.raman', REPORTS, session, clock)
    grantDirectAccess(world, 'p.raman', REPORTS, session, clock)

    const share = world.org.shares.find(s => s.path === REPORTS)!
    expect(hasShareAccess(world, 'p.raman', REPORTS)).toBe(true)
    expect(share.directAccess.filter(x => x === 'p.raman')).toHaveLength(1)
    expect(findGroup(world, 'GRP-Finance-Reports')!.members).not.toContain('p.raman')
    expect(session.changes.map(c => c.path)).toEqual([
      expect.stringContaining('directAccess'),
    ])
  })
})

describe('несуществующие объекты', () => {
  it('дают внятную ошибку, а не падение', () => {
    verifiedFor('p.raman')
    expect(unlockAccount(world, 'нет.такого', session, clock).error).toContain('не найдена')
    expect(addToGroup(world, 'p.raman', 'GRP-Нет', session, clock).error).toContain('группа')
    expect(grantDirectAccess(world, 'p.raman', '\\\\нет\\такого', session, clock).error)
      .toContain('ресурс')
  })
})
