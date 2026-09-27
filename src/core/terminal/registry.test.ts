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

/*
  Реестр — единственное место, где команда попадает в журнал сессии, и
  нераспознанные и упавшие команды пишутся наравне с успешными: оценка
  смотрит на весь путь техника, а не только на удачные шаги.
*/
describe('реестр команд', () => {
  it('находит обработчик без учёта регистра, передаёт машину и пишет строку в журнал', () => {
    const c = ctx()
    const r = createRegistry()
    r.register('where', (args, cx) => ({ stdout: `${cx.device} ${args.join(' ')}`, exitCode: 0 }))

    expect(r.run('   WHERE   a b   ', c)).toEqual({ stdout: 'AL-LPT-0447 a b', exitCode: 0 })
    expect(r.has('Where')).toBe(true)
    expect(r.has('nslookup')).toBe(false)
    expect(c.session.commands).toEqual([{
      at: '2026-09-09T18:00:00.000Z', device: 'AL-LPT-0447', cmdline: 'WHERE   a b', exitCode: 0,
    }])
  })

  it('неизвестная команда отвечает как cmd и тоже пишется; пустая строка — нет', () => {
    const c = ctx()
    const r = createRegistry()
    expect(r.run('wat', c)).toEqual({
      stdout: "'wat' is not recognized as an internal or external command,\r\n"
        + 'operable program or batch file.',
      exitCode: 1,
    })
    expect(r.run('   ', c)).toEqual({ stdout: '', exitCode: 0 })
    expect(c.session.commands.map(x => [x.cmdline, x.exitCode])).toEqual([['wat', 1]])
  })
})
