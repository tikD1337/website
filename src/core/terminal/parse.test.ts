import { describe, it, expect } from 'vitest'
import { parseCommand } from './parse'

describe('разбор командной строки', () => {
  it('имя в нижнем регистре, аргументы как есть, пробелы и табуляция — разделители', () => {
    const cases: Array<[string, { name: string; args: string[] }]> = [
      ['ipconfig /all', { name: 'ipconfig', args: ['/all'] }],
      ['NSLOOKUP Internal-Portal.arcline.corp', { name: 'nslookup', args: ['Internal-Portal.arcline.corp'] }],
      ['  ping    8.8.8.8  ', { name: 'ping', args: ['8.8.8.8'] }],
      ['ping\t8.8.8.8', { name: 'ping', args: ['8.8.8.8'] }],
      ['whoami', { name: 'whoami', args: [] }],
      ['   ', { name: '', args: [] }],
    ]
    for (const [line, want] of cases) expect(parseCommand(line), line).toEqual(want)
  })

  /*
    Кавычки появились вместе с командами каталога: без них имя
    привилегированной группы распадается на два аргумента, и запрет на
    неё обходится случайно, а не по решению техника.
  */
  it('кавычки склеивают аргумент с пробелом и сами в него не попадают', () => {
    const cases: Array<[string, string[]]> = [
      ['net group "Domain Admins" a.tier0 /add', ['group', 'Domain Admins', 'a.tier0', '/add']],
      ['net user "p.raman"', ['user', 'p.raman']],
      ['x "a   b"', ['a   b']],
      ['net group "Domain Admins', ['group', 'Domain Admins']],
      ['x ""', ['']],
    ]
    for (const [line, args] of cases) expect(parseCommand(line).args, line).toEqual(args)
  })
})
