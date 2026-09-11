import { describe, it, expect, beforeEach } from 'vitest'
import { createGameStore } from '../../store/useGame'
import { ouRows, objectsIn } from './DirectoryConsole'
import { createWorld } from '../../core/world/world'
import { findUser, findGroup } from '../../core/directory/accounts'

const clock = { now: () => new Date('2026-09-10T11:00:00.000Z') }

const store = () => {
  const g = createGameStore(clock)
  g.getState().start()
  return () => g.getState()
}

/** Сверка личности заявителя — она открывает операции над его учёткой. */
function verified(s: ReturnType<typeof store>) {
  s().verifyRequester('manager', 'Elena Varga')
}

describe('дерево подразделений', () => {
  const rows = ouRows(createWorld())

  it('корень идёт первым и без отступа', () => {
    expect(rows[0]).toEqual({ path: 'OU=Corp', name: 'Corp', depth: 0 })
  })

  it('ребёнок следует сразу за родителем', () => {
    const i = rows.findIndex(r => r.name === 'Employees')
    expect(rows[i + 1]!.name).toBe('Sales')
  })

  it('глубина растёт с вложенностью', () => {
    const sales = rows.find(r => r.name === 'Sales')!
    expect(sales.depth).toBe(2)
  })

  it('перечисляет все подразделения мира', () => {
    expect(rows).toHaveLength(createWorld().org.ous.length)
  })
})

describe('объекты подразделения', () => {
  const world = createWorld()

  it('в продажах лежат двое', () => {
    const objs = objectsIn(world, 'OU=Sales,OU=Employees,OU=Corp')
    expect(objs.map(o => o.name)).toEqual(['Elena Varga', 'Priya Raman'])
  })

  /*
    Вложенные подразделения не разворачиваются: консоль показывает то,
    что лежит именно здесь. Иначе дерево теряет смысл — всё было бы
    видно из корня.
  */
  it('родительское подразделение не показывает содержимое дочерних', () => {
    expect(objectsIn(world, 'OU=Employees,OU=Corp')).toHaveLength(0)
  })

  it('группы лежат вместе с пользователями', () => {
    const objs = objectsIn(world, 'OU=Security-Groups,OU=Groups,OU=Corp')
    expect(objs.every(o => o.kind === 'group')).toBe(true)
    expect(objs.length).toBeGreaterThan(0)
  })

  it('у пользователя подпись — должность, у группы — описание', () => {
    const [user] = objectsIn(world, 'OU=Finance,OU=Employees,OU=Corp')
    expect(user!.subtitle).toBe('финансовый аналитик')

    const group = objectsIn(world, 'OU=Security-Groups,OU=Groups,OU=Corp')
      .find(o => o.name === 'GRP-All-Staff')!
    expect(group.subtitle).toBe('Доступ к общим документам')
  })

  it('пустое подразделение даёт пустой список', () => {
    expect(objectsIn(world, 'OU=Servers,OU=Corp')).toEqual([])
  })
})

describe('операции консоли', () => {
  let s: ReturnType<typeof store>

  beforeEach(() => {
    s = store()
    s().claimTicket(s().queue.tickets[0]!.number)
  })

  it('разблокировка снимает блокировку', () => {
    findUser(s().world, 'p.raman')!.lockedOut = true
    verified(s)
    const r = s().unlockUser('p.raman')
    expect(r.ok).toBe(true)
    expect(findUser(s().world, 'p.raman')!.lockedOut).toBe(false)
  })

  it('сброс пароля меняет отметку времени', () => {
    verified(s)
    const before = findUser(s().world, 'p.raman')!.pwdLastSet
    s().resetUserPassword('p.raman')
    expect(findUser(s().world, 'p.raman')!.pwdLastSet).not.toBe(before)
  })

  /*
    Кнопка сброса доступна и без сверки — решение среза. Действие
    проходит, помечается инцидентом и всплывает в разборе. Спрятать
    кнопку значило бы учить, что границ нет.
  */
  it('сброс без сверки проходит и попадает в опасные действия', () => {
    const r = s().resetUserPassword('p.raman')
    expect(r.ok).toBe(true)
    expect(r.flagged).toBe(true)
    expect(s().session.flags.dangerousActions).toHaveLength(1)
  })

  it('отключение учётной записи работает', () => {
    verified(s)
    s().setUserEnabled('p.raman', false)
    expect(findUser(s().world, 'p.raman')!.enabled).toBe(false)
  })

  it('добавление в группу меняет обе стороны', () => {
    verified(s)
    s().addUserToGroup('p.raman', 'GRP-Finance-Reports')
    expect(findUser(s().world, 'p.raman')!.groups).toContain('GRP-Finance-Reports')
    expect(findGroup(s().world, 'GRP-Finance-Reports')!.members).toContain('p.raman')
  })

  it('исключение из группы работает', () => {
    verified(s)
    s().removeUserFromGroup('p.raman', 'GRP-Sales-Contracts')
    expect(findUser(s().world, 'p.raman')!.groups).not.toContain('GRP-Sales-Contracts')
  })

  /*
    Отказ по привилегированной группе показывается текстом. Кнопка
    нажимается, ответ приходит — техник видит границу, а не её
    отсутствие.
  */
  it('добавление в привилегированную группу отклоняется с объяснением', () => {
    verified(s)
    const r = s().addUserToGroup('p.raman', 'Domain Admins')
    expect(r.ok).toBe(false)
    expect(r.error).toContain('привилегированная')
    expect(findUser(s().world, 'p.raman')!.groups).not.toContain('Domain Admins')
  })

  it('изменение отражается в сторе немедленно', () => {
    verified(s)
    const before = s().world
    s().resetUserPassword('p.raman')
    expect(s().world).not.toBe(before)
  })
})

/**
 * Обязательный тест: консоль и команда — представления одной операции.
 */
describe('консоль и команда неотличимы', () => {
  it('отключение из консоли совпадает с net user /active:no', () => {
    const viaConsole = store()
    viaConsole().claimTicket(viaConsole().queue.tickets[0]!.number)
    verified(viaConsole)
    viaConsole().setUserEnabled('p.raman', false)

    const viaCommand = store()
    viaCommand().claimTicket(viaCommand().queue.tickets[0]!.number)
    verified(viaCommand)
    viaCommand().runCommand('net user p.raman /active:no')

    expect(viaConsole().world.org).toEqual(viaCommand().world.org)
    expect(viaConsole().session.changes).toEqual(viaCommand().session.changes)
  })

  it('добавление в группу из консоли совпадает с net group /add', () => {
    const viaConsole = store()
    viaConsole().claimTicket(viaConsole().queue.tickets[0]!.number)
    verified(viaConsole)
    viaConsole().addUserToGroup('p.raman', 'GRP-Finance-Reports')

    const viaCommand = store()
    viaCommand().claimTicket(viaCommand().queue.tickets[0]!.number)
    verified(viaCommand)
    viaCommand().runCommand('net group GRP-Finance-Reports p.raman /add')

    expect(viaConsole().world.org).toEqual(viaCommand().world.org)
  })
})

/**
 * Сверка личности — настоящая проверка, а не кнопка «я подтвердил».
 * До среза 3 кнопка поднимала флаг, но не записывала, кого сверяли,
 * поэтому шлюз считал непроверенным любого.
 */
describe('сверка личности заявителя', () => {
  let s: ReturnType<typeof store>

  beforeEach(() => {
    s = store()
    s().claimTicket(s().queue.tickets[0]!.number)
  })

  it('верный ответ подтверждает и запоминает, кого', () => {
    const r = s().verifyRequester('manager', 'Elena Varga')
    expect(r.ok).toBe(true)
    expect(s().session.flags.identityVerified).toBe(true)
    expect(s().session.verifiedAccount).toBe('p.raman')
  })

  it('неверный ответ не подтверждает', () => {
    const r = s().verifyRequester('manager', 'кто-то другой')
    expect(r.ok).toBe(false)
    expect(s().session.flags.identityVerified).toBe(false)
  })

  it('вопрос и ответ попадают в журнал общения', () => {
    s().verifyRequester('office', '3-14')
    expect(s().session.dialogue).toHaveLength(2)
  })

  it('сверка открывает операции над заявителем', () => {
    s().verifyRequester('office', '3-14')
    expect(s().resetUserPassword('p.raman').flagged).toBe(false)
  })

  it('без взятого тикета сверять некого', () => {
    const fresh = store()
    expect(fresh().verifyRequester('manager', 'Elena Varga').ok).toBe(false)
  })
})
