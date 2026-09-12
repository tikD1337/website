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

describe('equals и notEquals', () => {
  it('equals сравнивает значение', () => {
    expect(checkHolds(world, {
      path: 'org.users[samAccountName=n.haruna].enabled',
      equals: true,
      message: '',
    })).toBe(true)
  })

  it('notEquals верно при расхождении', () => {
    expect(checkHolds(world, {
      path: 'org.users[samAccountName=n.haruna].enabled',
      notEquals: false,
      message: '',
    })).toBe(true)
  })
})

/*
  `contains` — для массивов: членство в группе и список личного
  доступа. Без него условие про группу пришлось бы писать сравнением
  всего массива целиком, то есть ломать сценарий при любом порядке.
*/
describe('contains', () => {
  it('верно, когда массив содержит значение', () => {
    expect(checkHolds(world, {
      path: 'org.users[samAccountName=n.haruna].tokenGroups',
      contains: 'GRP-All-Staff',
      message: '',
    })).toBe(true)
  })

  it('неверно, когда не содержит', () => {
    expect(checkHolds(world, {
      path: 'org.users[samAccountName=n.haruna].tokenGroups',
      contains: 'GRP-Finance',
      message: '',
    })).toBe(false)
  })

  it('на не-массиве неверно, а не падает', () => {
    expect(checkHolds(world, {
      path: 'org.users[samAccountName=n.haruna].enabled',
      contains: 'что-то',
      message: '',
    })).toBe(false)
  })
})

/*
  `anyOf` — потому что к одному и тому же результату ведут разные
  пути. Заявитель откроет папку и через группу, и через личный доступ:
  для него это один и тот же «заработало», хотя для оценки — нет.
*/
describe('anyOf', () => {
  const access = {
    path: '',
    message: '',
    anyOf: [
      {
        path: 'org.users[samAccountName=n.haruna].tokenGroups',
        contains: 'GRP-Finance',
        message: '',
      },
      {
        path: 'org.shares[path=\\\\fs\\Finance].directAccess',
        contains: 'n.haruna',
        message: '',
      },
    ],
  }

  it('неверно, когда не выполнено ни одно', () => {
    expect(checkHolds(world, access)).toBe(false)
  })

  it('верно, когда выполнено первое', () => {
    const w = structuredClone(world)
    w.org.users[0]!.tokenGroups.push('GRP-Finance')
    expect(checkHolds(w, access)).toBe(true)
  })

  it('верно, когда выполнено второе', () => {
    const w = structuredClone(world)
    w.org.shares[0]!.directAccess.push('n.haruna')
    expect(checkHolds(w, access)).toBe(true)
  })

  it('вложенность работает на любую глубину', () => {
    expect(checkHolds(world, {
      path: '', message: '',
      anyOf: [{ path: '', message: '', anyOf: [
        { path: 'org.users[samAccountName=n.haruna].enabled', equals: true, message: '' },
      ] }],
    })).toBe(true)
  })
})

describe('allHold', () => {
  it('пустой список условий выполнен', () => {
    expect(allHold(world, [])).toBe(true)
  })

  it('требует выполнения всех', () => {
    const ok = { path: 'org.users[samAccountName=n.haruna].enabled', equals: true, message: '' }
    const no = { path: 'org.users[samAccountName=n.haruna].enabled', equals: false, message: '' }
    expect(allHold(world, [ok, ok])).toBe(true)
    expect(allHold(world, [ok, no])).toBe(false)
  })
})

/*
  Условие без предиката — почти наверняка опечатка в сценарии, и
  «молча не выполнено» спрятало бы её: сценарий стал бы нерешаемым без
  всякого следа.
*/
describe('условие без предиката', () => {
  it('бросает исключение', () => {
    expect(() => checkHolds(world, { path: 'org', message: '' }))
      .toThrow(/предикат/)
  })
})

/*
  Нерабочий путь тоже обязан падать, и это важнее предыдущего.

  `undefined !== null` истинно, поэтому опечатка в пути проверки на
  тихую поломку срабатывала на **любом** прохождении, включая
  безупречное: вердикт fail без всякой вины техника. Зеркально с
  `equals`: опечатка в `fixedWhen` делала сценарий непроходимым —
  заявитель не подтверждал никогда.
*/
describe('нерабочий путь в условии', () => {
  it('notEquals с несуществующим путём бросает исключение', () => {
    expect(() => checkHolds(world, {
      path: 'org.users[samAccountName=n.haruna].lockoutSorce',
      notEquals: null,
      message: '',
    })).toThrow(/путь/)
  })

  it('equals с несуществующим путём тоже бросает', () => {
    expect(() => checkHolds(world, { path: 'org.нет.такого', equals: true, message: '' }))
      .toThrow(/путь/)
  })

  it('contains с несуществующим путём тоже бросает', () => {
    expect(() => checkHolds(world, { path: 'org.нет', contains: 'x', message: '' }))
      .toThrow(/путь/)
  })

  it('внутри anyOf нерабочий путь не проглатывается', () => {
    expect(() => checkHolds(world, {
      path: '', message: '',
      anyOf: [{ path: 'org.нет.такого', contains: 'x', message: '' }],
    })).toThrow(/путь/)
  })

  /*
    `anyOf` короткозамыкается: если первое условие выполнено, до
    второго дело не доходит. Это не дыра, а обычная семантика «или» —
    но проверить стоит, чтобы порядок условий не стал ловушкой.
  */
  it('выполненное первое условие закрывает вопрос', () => {
    expect(checkHolds(world, {
      path: '', message: '',
      anyOf: [
        { path: 'org.users[samAccountName=n.haruna].enabled', equals: true, message: '' },
        { path: 'org.нет.такого', contains: 'x', message: '' },
      ],
    })).toBe(true)
  })
})
