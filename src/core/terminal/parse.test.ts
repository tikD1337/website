import { describe, it, expect } from 'vitest'
import { parseCommand } from './parse'

describe('parseCommand', () => {
  it('делит на имя и аргументы', () => {
    expect(parseCommand('ipconfig /all')).toEqual({ name: 'ipconfig', args: ['/all'] })
  })

  it('приводит имя к нижнему регистру, аргументы оставляет как есть', () => {
    expect(parseCommand('NSLOOKUP Internal-Portal.arcline.corp'))
      .toEqual({ name: 'nslookup', args: ['Internal-Portal.arcline.corp'] })
  })

  it('схлопывает лишние пробелы', () => {
    expect(parseCommand('  ping    8.8.8.8  ')).toEqual({ name: 'ping', args: ['8.8.8.8'] })
  })

  it('пустая строка даёт пустое имя', () => {
    expect(parseCommand('   ')).toEqual({ name: '', args: [] })
  })

  it('многословная команда сохраняет все аргументы', () => {
    expect(parseCommand('netsh advfirewall set allprofiles state off'))
      .toEqual({
        name: 'netsh',
        args: ['advfirewall', 'set', 'allprofiles', 'state', 'off'],
      })
  })

  it('команда без аргументов', () => {
    expect(parseCommand('whoami')).toEqual({ name: 'whoami', args: [] })
  })

  it('табуляция считается разделителем', () => {
    expect(parseCommand('ping\t8.8.8.8')).toEqual({ name: 'ping', args: ['8.8.8.8'] })
  })
})

/*
  Кавычки появились вместе с командами каталога.

  До них разбор честно обходился без кавычек — не было аргумента с
  пробелом. `net group "Domain Admins"` сделал их обязательными: без
  кавычек имя привилегированной группы распадается на два аргумента,
  и запрет на неё обходится случайно, а не по решению техника.
*/
describe('parseCommand — кавычки', () => {
  it('кавычки склеивают аргумент с пробелом', () => {
    expect(parseCommand('net group "Domain Admins"'))
      .toEqual({ name: 'net', args: ['group', 'Domain Admins'] })
  })

  it('сами кавычки в аргумент не попадают', () => {
    expect(parseCommand('net user "p.raman"').args).toEqual(['user', 'p.raman'])
  })

  it('пробелы внутри кавычек не схлопываются', () => {
    expect(parseCommand('x "a   b"').args).toEqual(['a   b'])
  })

  it('незакрытая кавычка берёт остаток строки', () => {
    expect(parseCommand('net group "Domain Admins').args)
      .toEqual(['group', 'Domain Admins'])
  })

  it('кавычки соседствуют с обычными аргументами', () => {
    expect(parseCommand('net group "Domain Admins" a.tier0 /add').args)
      .toEqual(['group', 'Domain Admins', 'a.tier0', '/add'])
  })

  it('пустые кавычки дают пустой аргумент', () => {
    expect(parseCommand('x ""').args).toEqual([''])
  })
})
