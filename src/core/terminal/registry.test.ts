import { describe, it, expect } from 'vitest'
import { createRegistry } from './registry'
import { createWorld } from '../world/world'
import { createSession } from '../session/session'
import type { CommandContext } from './types'

const ctx = (): CommandContext => ({
  world: createWorld(),
  session: createSession(),
  clock: { now: () => new Date('2026-09-09T18:00:00.000Z') },
  device: 'AL-LPT-0447',
})

describe('реестр команд', () => {
  it('вызывает зарегистрированный обработчик', () => {
    const r = createRegistry()
    r.register('echo', args => ({ stdout: args.join(' '), exitCode: 0 }))
    expect(r.run('echo привет мир', ctx()).stdout).toBe('привет мир')
  })

  it('находит команду независимо от регистра', () => {
    const r = createRegistry()
    r.register('ipconfig', () => ({ stdout: 'ok', exitCode: 0 }))
    expect(r.run('IPCONFIG', ctx()).exitCode).toBe(0)
  })

  it('неизвестная команда отвечает как настоящий cmd', () => {
    const r = createRegistry()
    const res = r.run('wat', ctx())
    expect(res.stdout).toBe(
      "'wat' is not recognized as an internal or external command,\r\n"
      + 'operable program or batch file.')
    expect(res.exitCode).toBe(1)
  })

  it('пустая строка ничего не делает и не пишется в журнал', () => {
    const c = ctx()
    const r = createRegistry()
    expect(r.run('   ', c)).toEqual({ stdout: '', exitCode: 0 })
    expect(c.session.commands).toHaveLength(0)
  })

  it('пишет выполненную команду в журнал сессии', () => {
    const r = createRegistry()
    r.register('echo', () => ({ stdout: 'ok', exitCode: 0 }))
    const c = ctx()
    r.run('echo hi', c)
    expect(c.session.commands).toHaveLength(1)
    expect(c.session.commands[0]).toMatchObject({
      device: 'AL-LPT-0447', cmdline: 'echo hi', exitCode: 0,
    })
  })

  it('нераспознанную команду тоже пишет в журнал — это тоже действие техника', () => {
    const c = ctx()
    const r = createRegistry()
    r.run('wat', c)
    expect(c.session.commands).toHaveLength(1)
    expect(c.session.commands[0]!.exitCode).toBe(1)
  })

  it('нормализует записанную строку, срезая лишние пробелы', () => {
    const c = ctx()
    const r = createRegistry()
    r.register('ping', () => ({ stdout: '', exitCode: 0 }))
    r.run('   ping   8.8.8.8   ', c)
    expect(c.session.commands[0]!.cmdline).toBe('ping   8.8.8.8')
  })

  it('has сообщает о зарегистрированных командах', () => {
    const r = createRegistry()
    r.register('ipconfig', () => ({ stdout: '', exitCode: 0 }))
    expect(r.has('ipconfig')).toBe(true)
    expect(r.has('IPCONFIG')).toBe(true)
    expect(r.has('nslookup')).toBe(false)
  })

  it('передаёт обработчику машину из контекста', () => {
    const r = createRegistry()
    r.register('where', (_a, c) => ({ stdout: c.device, exitCode: 0 }))
    expect(r.run('where', ctx()).stdout).toBe('AL-LPT-0447')
  })
})
