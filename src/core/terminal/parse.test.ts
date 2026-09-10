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
