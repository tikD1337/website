import { describe, it, expect } from 'vitest'
import { checkHolds, allHold } from './check'

/**
 * Проверка условия сценария.
 *
 * Одна и та же семантика нужна в двух местах: заявитель судит по
 * `fixedWhen`, оценка ищет тихие поломки по `silentFaultChecks`. Две
 * копии этой логики разошлись бы на первом же новом предикате, поэтому
 * она живёт здесь.
 */
const world = {
  org: {
    users: [
      { samAccountName: 'n.haruna', tokenGroups: ['GRP-All-Staff'], enabled: true },
    ],
    shares: [
      { path: '\\\\fs\\Finance', requiresGroup: 'GRP-Finance', directAccess: [] },
      { path: '\\\\fs\\Sales', requiresGroup: 'GRP-Sales', directAccess: ['n.haruna'] },
    ],
  },
}

const enabled = { path: 'org.users[samAccountName=n.haruna].enabled', message: '' }
const tokens = { path: 'org.users[samAccountName=n.haruna].tokenGroups', message: '' }

describe('условие сценария', () => {
  /*
    `contains` — для массивов: членство в группе и личный доступ. Без
    него условие про группу пришлось бы писать сравнением всего массива,
    то есть ломать сценарий при любом порядке.
  */
  it('предикаты equals, notEquals, contains', () => {
    expect(checkHolds(world, { ...enabled, equals: true })).toBe(true)
    expect(checkHolds(world, { ...enabled, equals: false })).toBe(false)
    expect(checkHolds(world, { ...enabled, notEquals: false })).toBe(true)
    expect(checkHolds(world, { ...enabled, notEquals: true })).toBe(false)
    expect(checkHolds(world, { ...tokens, contains: 'GRP-All-Staff' })).toBe(true)
    expect(checkHolds(world, { ...tokens, contains: 'GRP-Finance' })).toBe(false)
    expect(checkHolds(world, { ...enabled, contains: 'что-то' })).toBe(false)
  })

  /*
    `anyOf` — потому что к одному результату ведут разные пути: заявитель
    откроет папку и через группу, и через личный доступ. Для него это
    одно «заработало», для оценки — нет.
  */
  it('anyOf: хотя бы одно из вложенных, на любой глубине', () => {
    const access = {
      path: '', message: '',
      anyOf: [
        { ...tokens, contains: 'GRP-Finance' },
        { path: 'org.shares[path=\\\\fs\\Finance].directAccess', contains: 'n.haruna', message: '' },
      ],
    }
    expect(checkHolds(world, access)).toBe(false)

    const viaGroup = structuredClone(world)
    viaGroup.org.users[0]!.tokenGroups.push('GRP-Finance')
    expect(checkHolds(viaGroup, access)).toBe(true)

    const direct = structuredClone(world)
    direct.org.shares[0]!.directAccess.push('n.haruna')
    expect(checkHolds(direct, access)).toBe(true)

    expect(checkHolds(world, {
      path: '', message: '', anyOf: [{ path: '', message: '', anyOf: [{ ...enabled, equals: true }] }],
    })).toBe(true)
  })

  it('allHold требует всех; пустой список выполнен', () => {
    const ok = { ...enabled, equals: true }
    const no = { ...enabled, equals: false }
    expect(allHold(world, [])).toBe(true)
    expect(allHold(world, [ok, ok])).toBe(true)
    expect(allHold(world, [ok, no])).toBe(false)
  })

  /*
    Опечатка в условии обязана падать. `undefined !== null` истинно,
    поэтому опечатка в пути проверки на тихую поломку срабатывала на
    **любом** прохождении, включая безупречное; опечатка в `fixedWhen`
    делала сценарий непроходимым. Условие без предиката — тоже опечатка.
  */
  it('нерабочий путь и условие без предиката бросают исключение, в anyOf тоже', () => {
    expect(() => checkHolds(world, {
      path: 'org.users[samAccountName=n.haruna].lockoutSorce', notEquals: null, message: '',
    })).toThrow(/путь/)
    expect(() => checkHolds(world, { path: 'org.нет.такого', equals: true, message: '' })).toThrow(/путь/)
    expect(() => checkHolds(world, { path: 'org.нет', contains: 'x', message: '' })).toThrow(/путь/)
    expect(() => checkHolds(world, {
      path: '', message: '', anyOf: [{ path: 'org.нет.такого', contains: 'x', message: '' }],
    })).toThrow(/путь/)
    expect(() => checkHolds(world, { path: 'org', message: '' })).toThrow(/предикат/)

    // «Или» короткозамыкается: выполненное первое условие закрывает вопрос.
    expect(checkHolds(world, {
      path: '', message: '',
      anyOf: [{ ...enabled, equals: true }, { path: 'org.нет.такого', contains: 'x', message: '' }],
    })).toBe(true)
  })

  /*
    Отправление вендору либо оформлено, либо нет; док у машины либо
    подключён, либо курьер его уже забрал. Для таких вопросов «не нашлось»
    — законный ответ, а не опечатка. Но только для выбора по полю в конце
    пути: всё остальное по-прежнему падает громко.
  */
  it('exists — единственный предикат, которому можно не найти элемент', () => {
    const exists = (path: string, want: boolean) => checkHolds(world, { path, exists: want, message: '' })
    expect(exists('org.users[samAccountName=nobody]', false)).toBe(true)
    expect(exists('org.users[samAccountName=nobody]', true)).toBe(false)
    expect(exists('org.users[samAccountName=n.haruna&enabled=true]', true)).toBe(true)
    expect(() => exists('org.users[samAccountName=n.haruna].enabled', true))
      .toThrow('exists допустим только для выбора по полю')
    expect(() => exists('orgs.users[samAccountName=n.haruna]', true))
      .toThrow('условие ссылается на несуществующий путь')
  })
})
