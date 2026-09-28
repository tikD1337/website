import { describe, it, expect } from 'vitest'
import { parsePath, getPath, setPath } from './path'

describe('адресация путей', () => {
  it('разбирает точки, индексы и выбор по полю', () => {
    expect(parsePath('org')).toEqual(['org'])
    expect(parsePath('devices.AL-LPT-0447.adapters[0].ip'))
      .toEqual(['devices', 'AL-LPT-0447', 'adapters', 0, 'ip'])
    expect(parsePath('a.b[0][12]')).toEqual(['a', 'b', 0, 12])
    expect(() => parsePath('devices..ip')).toThrow('некорректный путь')
  })

  /*
    Пустые и нечисловые скобки обязаны падать. `Number('')` равен нулю и
    целый, поэтому `users[]` молча означало «первого в списке»: опечатка
    в инъекции — потерянное `samAccountName=e.varga` внутри скобок —
    ломала не заявителя, а первого человека в seed.
  */
  it('скобки с мусором вместо индекса отвергаются', () => {
    for (const bad of ['a.b[]', 'a.b[ ]', 'a.b[0x10]', 'a.b[1e3]', 'a.b[ 1 ]', 'a.b[-0]',
      'a.b[-1]', 'a.b[=x]']) {
      expect(() => parsePath(bad), bad).toThrow('некорректный путь')
    }
  })

  it('читает и пишет по вложенному пути, в том числе null', () => {
    const root = { devices: { 'AL-LPT-0447': { adapters: [{ ip: '169.254.23.11' as string | null }] } } }
    expect(getPath(root, 'devices.AL-LPT-0447.adapters[0].ip')).toBe('169.254.23.11')
    expect(getPath(root, 'devices.NOPE.adapters[0].ip')).toBeUndefined()

    setPath(root, 'devices.AL-LPT-0447.adapters[0].ip', '10.20.14.88')
    expect(root.devices['AL-LPT-0447'].adapters[0]!.ip).toBe('10.20.14.88')
    setPath(root, 'devices.AL-LPT-0447.adapters[0].ip', null)
    expect(root.devices['AL-LPT-0447'].adapters[0]!.ip).toBeNull()
  })

  /*
    Запись по несуществующему пути падает: опечатка в сценарии иначе
    создаёт сценарий, где ничего не сломано, без всякого следа.
  */
  it('запись по несуществующему пути бросает исключение', () => {
    expect(() => setPath({ devices: {} }, 'devices.NOPE.adapters[0].ip', 'x'))
      .toThrow('путь не существует')
  })
})

/*
  Выбор элемента по полю. `services.6.status` держится только на
  тесте-стороже и молча попадает в чужой объект после перестановки в
  seed; `users[samAccountName=e.varga]` устойчив к перестановке и
  читается без сверки с seed.
*/
describe('выбор по значению поля', () => {
  const world = () => ({
    org: {
      users: [
        { samAccountName: 'p.raman', lockedOut: false, groups: ['GRP-All-Staff'] },
        { samAccountName: 'e.varga', lockedOut: false, groups: [] as string[] },
      ],
    },
  })

  it('читает и пишет выбранный объект, не задевая соседей', () => {
    const w = world()
    expect(getPath(w, 'org.users[samAccountName=p.raman].groups[0]')).toBe('GRP-All-Staff')
    expect(getPath(w, 'org.users[1].samAccountName')).toBe('e.varga')
    expect(getPath(w, 'org.users[samAccountName=нет].lockedOut')).toBeUndefined()

    setPath(w, 'org.users[samAccountName=e.varga].lockedOut', true)
    expect(w.org.users.map(u => u.lockedOut)).toEqual([false, true])
  })

  it('несовпадение при записи бросает исключение', () => {
    expect(() => setPath(world(), 'org.users[samAccountName=нет].lockedOut', true))
      .toThrow(/не существует|не найден/)
  })

  /*
    Периферия у машины — несколько активов, и «док этой машины» — это два
    условия сразу: подключён сюда и вид «док». Выбор по одному полю
    отдавал бы первый попавшийся актив машины — монитор.
  */
  it('составной выбор — все условия сразу', () => {
    const w = { a: [
      { k: 'dock', h: 'X', c: 'faulty' }, { k: 'mon', h: 'Y', c: 'ok' }, { k: 'dock', h: 'Y', c: 'ok' },
    ] }
    expect(getPath(w, 'a[k=dock&h=Y].c')).toBe('ok')
    expect(getPath(w, 'a[k=dock&h=Z]')).toBeUndefined()
    for (const bad of ['a[k=dock&]', 'a[&k=dock]', 'a[k=dock&h]']) {
      expect(() => parsePath(bad), bad).toThrow('некорректный путь')
    }
  })

  it('значение с дефисами, точками и обратными слешами разбирается целиком', () => {
    const w = { shares: [{ path: '\\\\fileserver.arcline.corp\\Finance-Reports', open: false }] }
    setPath(w, 'shares[path=\\\\fileserver.arcline.corp\\Finance-Reports].open', true)
    expect(w.shares[0]!.open).toBe(true)
  })
})
