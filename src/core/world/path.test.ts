import { describe, it, expect } from 'vitest'
import { parsePath, getPath, setPath } from './path'

describe('parsePath', () => {
  it('разбирает точки и индексы массива', () => {
    expect(parsePath('devices.AL-LPT-0447.adapters[0].ip'))
      .toEqual(['devices', 'AL-LPT-0447', 'adapters', 0, 'ip'])
  })

  it('разбирает одиночный сегмент', () => {
    expect(parsePath('org')).toEqual(['org'])
  })

  it('разбирает индекс в середине пути', () => {
    expect(parsePath('network.segments[0].dhcpHealthy'))
      .toEqual(['network', 'segments', 0, 'dhcpHealthy'])
  })

  it('отвергает мусор вместо пути', () => {
    expect(() => parsePath('devices..ip')).toThrow('некорректный путь')
  })
})

describe('getPath', () => {
  const root = { devices: { 'AL-LPT-0447': { adapters: [{ ip: '169.254.23.11' }] } } }

  it('достаёт вложенное значение через индекс массива', () => {
    expect(getPath(root, 'devices.AL-LPT-0447.adapters[0].ip')).toBe('169.254.23.11')
  })

  it('возвращает undefined для несуществующего пути', () => {
    expect(getPath(root, 'devices.NOPE.adapters[0].ip')).toBeUndefined()
  })
})

describe('setPath', () => {
  it('записывает значение по вложенному пути', () => {
    const root = { devices: { 'AL-LPT-0447': { adapters: [{ ip: '169.254.23.11' }] } } }
    setPath(root, 'devices.AL-LPT-0447.adapters[0].ip', '10.20.14.88')
    expect(root.devices['AL-LPT-0447']!.adapters[0]!.ip).toBe('10.20.14.88')
  })

  it('бросает исключение, если промежуточный сегмент отсутствует', () => {
    const root = { devices: {} }
    expect(() => setPath(root, 'devices.NOPE.adapters[0].ip', 'x'))
      .toThrow('путь не существует')
  })

  it('позволяет записать существующее поле в значение null', () => {
    const root = { a: { b: 'x' as string | null } }
    setPath(root, 'a.b', null)
    expect(root.a.b).toBeNull()
  })
})

/*
  Выбор элемента по полю.

  Сценарий печати адресует службу индексом — `services.6.status`, — и
  это держится только на тесте-стороже. С каждым новым сценарием таких
  мест больше, а цена перестановки в seed растёт: патч молча попадёт
  в чужой объект, и поломка окажется не той, что задумана.

  `users[samAccountName=e.varga]` устойчив к перестановке и читается
  без сверки с seed.
*/
describe('выбор по значению поля', () => {
  const world = () => ({
    org: {
      users: [
        { samAccountName: 'p.raman', lockedOut: false, groups: ['GRP-All-Staff'] },
        { samAccountName: 'e.varga', lockedOut: false, groups: [] },
      ],
    },
  })

  it('читает поле выбранного объекта', () => {
    expect(getPath(world(), 'org.users[samAccountName=e.varga].lockedOut')).toBe(false)
  })

  it('пишет в выбранный объект, не задевая соседей', () => {
    const w = world()
    setPath(w, 'org.users[samAccountName=e.varga].lockedOut', true)
    expect(w.org.users[1]!.lockedOut).toBe(true)
    expect(w.org.users[0]!.lockedOut).toBe(false)
  })

  it('работает в середине пути', () => {
    expect(getPath(world(), 'org.users[samAccountName=p.raman].groups[0]'))
      .toBe('GRP-All-Staff')
  })

  it('несовпадение даёт undefined при чтении', () => {
    expect(getPath(world(), 'org.users[samAccountName=нет].lockedOut')).toBeUndefined()
  })

  /*
    Запись по несуществующему выбору обязана падать: опечатка в имени
    учётной записи иначе создаст сценарий, где ничего не сломано.
  */
  it('несовпадение при записи бросает исключение', () => {
    expect(() => setPath(world(), 'org.users[samAccountName=нет].lockedOut', true))
      .toThrow(/не существует|не найден/)
  })

  it('значение с дефисами и точками разбирается целиком', () => {
    const w = {
      shares: [{ path: '\\fileserver.arcline.corp\Finance', open: false }],
    }
    setPath(w, 'shares[path=\\fileserver.arcline.corp\Finance].open', true)
    expect(w.shares[0]!.open).toBe(true)
  })

  it('числовой индекс продолжает работать', () => {
    expect(getPath(world(), 'org.users[1].samAccountName')).toBe('e.varga')
  })
})

/*
  Пустые и нечисловые скобки обязаны падать.

  `Number('')` равен нулю и целый, поэтому `users[]` молча означало
  «первого в списке». Опечатка в инъекции — потерянное
  `samAccountName=e.varga` внутри скобок — ломала не заявителя, а
  первого человека в seed, и `setPath` не возражал: путь существует.
  Это ровно тот отказ, от которого файл защищается.
*/
describe('скобки с мусором вместо индекса', () => {
  for (const bad of ['a.b[]', 'a.b[ ]', 'a.b[0x10]', 'a.b[1e3]', 'a.b[ 1 ]', 'a.b[-0]', 'a.b[-1]', 'a.b[=x]']) {
    it(`отвергает ${bad}`, () => {
      expect(() => parsePath(bad)).toThrow('некорректный путь')
    })
  }

  it('обычный индекс по-прежнему работает', () => {
    expect(parsePath('a.b[0][12]')).toEqual(['a', 'b', 0, 12])
  })
})
