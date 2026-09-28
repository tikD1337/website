import { describe, it, expect } from 'vitest'
import { createGameStore } from '../../store/useGame'
import { ouRows, objectsIn } from './DirectoryConsole'
import { createWorld } from '../../core/world/world'
import { findUser } from '../../core/directory/accounts'

const clock = { now: () => new Date('2026-09-10T11:00:00.000Z') }

/** Стор с взятым тикетом APIPA: заявитель — p.raman, руководитель — Elena Varga. */
const store = (claim = true) => {
  const g = createGameStore(clock)
  const s = () => g.getState()
  if (claim) s().claimTicket(s().queue.tickets[0]!.number)
  return s
}

describe('дерево и содержимое подразделений', () => {
  it('ребёнок следует сразу за родителем, глубина растёт с вложенностью', () => {
    const rows = ouRows(createWorld())
    expect(rows.slice(0, 4)).toEqual([
      { path: 'OU=Corp', name: 'Corp', depth: 0 },
      { path: 'OU=Employees,OU=Corp', name: 'Employees', depth: 1 },
      { path: 'OU=Sales,OU=Employees,OU=Corp', name: 'Sales', depth: 2 },
      { path: 'OU=Finance,OU=Employees,OU=Corp', name: 'Finance', depth: 2 },
    ])
    expect(rows).toHaveLength(createWorld().org.ous.length)
  })

  /*
    Вложенные подразделения не разворачиваются: консоль показывает то,
    что лежит именно здесь. Иначе дерево теряет смысл — всё было бы
    видно из корня.
  */
  it('показывает только то, что лежит непосредственно в подразделении', () => {
    const world = createWorld()
    expect(objectsIn(world, 'OU=Sales,OU=Employees,OU=Corp').map(o => [o.kind, o.name]))
      .toEqual([['user', 'Elena Varga'], ['user', 'Priya Raman']])
    expect(objectsIn(world, 'OU=Employees,OU=Corp')).toEqual([])
    expect(objectsIn(world, 'OU=Finance,OU=Employees,OU=Corp')[0]!.subtitle)
      .toBe('финансовый аналитик')
    expect(objectsIn(world, 'OU=Security-Groups,OU=Groups,OU=Corp')
      .find(o => o.name === 'GRP-All-Staff')).toMatchObject({
      kind: 'group', subtitle: 'Доступ к общим документам',
    })
  })
})

describe('операции консоли в сторе', () => {
  /*
    Каталог меняется только по взятому тикету: изменение без инцидента
    некому объяснить. Изменение публикуется новым объектом мира, иначе
    интерфейс его не увидит.
  */
  it('требуют взятого тикета и публикуют изменённый мир', () => {
    const idle = store(false)
    expect(idle().resetUserPassword('p.raman'))
      .toEqual({ ok: false, error: 'нет активного инцидента' })

    const s = store()
    s().verifyRequester('manager', 'Elena Varga')
    findUser(s().world, 'p.raman')!.lockedOut = true
    const before = s().world
    expect(s().unlockUser('p.raman').ok).toBe(true)
    expect(s().world).not.toBe(before)
    expect(findUser(s().world, 'p.raman')!.lockedOut).toBe(false)
  })

  /**
   * Обязательный тест: консоль и команда — представления одной операции,
   * и через стор тоже.
   */
  it('неотличимы от команды net', () => {
    const cases: Array<[string, (s: ReturnType<typeof store>) => void, string]> = [
      ['отключение', s => s().setUserEnabled('p.raman', false), 'net user p.raman /active:no'],
      ['добавление в группу', s => s().addUserToGroup('p.raman', 'GRP-Finance-Reports'),
        'net group GRP-Finance-Reports p.raman /add'],
      ['исключение из группы', s => s().removeUserFromGroup('p.raman', 'GRP-Sales-Contracts'),
        'net group GRP-Sales-Contracts p.raman /delete'],
    ]
    for (const [name, viaConsole, command] of cases) {
      const a = store()
      a().verifyRequester('manager', 'Elena Varga')
      viaConsole(a)

      const b = store()
      b().verifyRequester('manager', 'Elena Varga')
      b().runCommand(command)

      expect(a().world.org, name).toEqual(b().world.org)
      expect(a().session.changes, name).toEqual(b().session.changes)
    }
  })
})

/**
 * Сверка личности — настоящая проверка, а не кнопка «я подтвердил».
 * До среза 3 кнопка поднимала флаг, но не записывала, кого сверяли,
 * поэтому шлюз считал непроверенным любого.
 */
describe('сверка личности заявителя', () => {
  it('верный ответ подтверждает и запоминает, кого, — это открывает операции над ним', () => {
    const s = store()
    expect(s().verifyRequester('office', '3-14').ok).toBe(true)
    expect(s().session.flags.identityVerified).toBe(true)
    expect(s().session.verifiedAccount).toBe('p.raman')
    expect(s().session.dialogue.map(d => d.speaker)).toEqual(['technician', 'requester'])
    expect(s().resetUserPassword('p.raman').flagged).toBe(false)
  })

  it('неверный ответ не подтверждает, а без тикета сверять некого', () => {
    const s = store()
    expect(s().verifyRequester('manager', 'кто-то другой').ok).toBe(false)
    expect(s().session.flags.identityVerified).toBe(false)

    expect(store(false)().verifyRequester('manager', 'Elena Varga').ok).toBe(false)
  })
})
