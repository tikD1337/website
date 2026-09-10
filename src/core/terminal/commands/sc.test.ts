import { describe, it, expect, beforeEach } from 'vitest'
import { sc } from './sc'
import { stopService, findService } from '../../device/services'
import { createWorld } from '../../world/world'
import { createSession } from '../../session/session'
import type { CommandContext } from '../types'

const clock = { now: () => new Date('2026-09-10T09:15:00.000Z') }
const HOST = 'AL-LPT-0447'

let ctx: CommandContext

beforeEach(() => {
  ctx = { world: createWorld(), session: createSession(), clock, device: HOST }
})

const svc = (name: string) => findService(ctx.world, HOST, name)!

describe('sc query — формат сверен с живой Windows', () => {
  it('печатает имя службы с висящим пробелом', () => {
    expect(sc(['query', 'Spooler'], ctx).stdout)
      .toContain('SERVICE_NAME: Spooler \r\n')
  })

  it('двоеточие в полях стоит на позиции 27', () => {
    const lines = sc(['query', 'Spooler'], ctx).stdout.split('\r\n')
    for (const l of lines.filter(x => x.startsWith('        ') && x.includes(':'))) {
      expect(l.indexOf(':'), `строка [${l}]`).toBe(27)
    }
  })

  it('запущенная служба показывает состояние 4 RUNNING и признаки', () => {
    const out = sc(['query', 'Spooler'], ctx).stdout
    expect(out).toContain('        STATE              : 4  RUNNING ')
    expect(out).toContain('                                (STOPPABLE, NOT_PAUSABLE, IGNORES_SHUTDOWN)')
  })

  it('остановленная служба показывает состояние 1 STOPPED', () => {
    const out = sc(['query', 'BITS'], ctx).stdout
    expect(out).toContain('        STATE              : 1  STOPPED ')
    expect(out).toContain('(NOT_STOPPABLE, NOT_PAUSABLE, IGNORES_SHUTDOWN)')
  })

  it('печатает тип, коды выхода, контрольную точку и подсказку ожидания', () => {
    const out = sc(['query', 'Spooler'], ctx).stdout
    expect(out).toContain('        TYPE               : 110  WIN32_OWN_PROCESS  (interactive)')
    expect(out).toContain('        WIN32_EXIT_CODE    : 0  (0x0)')
    expect(out).toContain('        SERVICE_EXIT_CODE  : 0  (0x0)')
    expect(out).toContain('        CHECKPOINT         : 0x0')
    expect(out).toContain('        WAIT_HINT          : 0x0')
  })

  it('несуществующая служба отвечает как настоящий sc', () => {
    const res = sc(['query', 'НетТакой'], ctx)
    expect(res.exitCode).toBe(1)
    expect(res.stdout).toContain('OpenService FAILED 1060')
    expect(res.stdout).toContain('The specified service does not exist as an installed service.')
  })

  it('имя службы распознаётся независимо от регистра', () => {
    expect(sc(['query', 'SPOOLER'], ctx).exitCode).toBe(0)
  })
})

describe('sc stop', () => {
  it('останавливает службу и печатает переходное состояние', () => {
    const res = sc(['stop', 'Spooler'], ctx)
    expect(res.exitCode).toBe(0)
    expect(res.stdout).toContain('STOP_PENDING')
    expect(svc('Spooler').status).toBe('stopped')
  })

  it('защитная служба отвечает отказом доступа', () => {
    const res = sc(['stop', 'WinDefend'], ctx)
    expect(res.exitCode).toBe(1)
    expect(res.stdout).toContain('Access is denied.')
    expect(svc('WinDefend').status).toBe('running')
  })

  it('отказ пишется как опасное действие', () => {
    sc(['stop', 'MpsSvc'], ctx)
    expect(ctx.session.flags.dangerousActions).toHaveLength(1)
  })

  it('уже остановленная служба отвечает как настоящий sc', () => {
    const res = sc(['stop', 'BITS'], ctx)
    expect(res.exitCode).toBe(1)
    expect(res.stdout).toContain('1062')
    expect(res.stdout).toContain('The service has not been started.')
  })
})

describe('sc start', () => {
  it('запускает остановленную службу', () => {
    const res = sc(['start', 'BITS'], ctx)
    expect(res.exitCode).toBe(0)
    expect(res.stdout).toContain('START_PENDING')
    expect(svc('BITS').status).toBe('running')
  })

  it('уже запущенная служба отвечает 1056', () => {
    const res = sc(['start', 'Spooler'], ctx)
    expect(res.exitCode).toBe(1)
    expect(res.stdout).toContain('1056')
  })

  it('отключённая служба не стартует', () => {
    sc(['config', 'BITS', 'start=', 'disabled'], ctx)
    const res = sc(['start', 'BITS'], ctx)
    expect(res.exitCode).toBe(1)
    expect(svc('BITS').status).toBe('stopped')
  })
})

describe('sc config', () => {
  it('меняет тип запуска', () => {
    const res = sc(['config', 'Spooler', 'start=', 'demand'], ctx)
    expect(res.exitCode).toBe(0)
    expect(res.stdout).toContain('ChangeServiceConfig SUCCESS')
    expect(svc('Spooler').startType).toBe('manual')
  })

  it('понимает auto, demand, disabled', () => {
    sc(['config', 'Spooler', 'start=', 'disabled'], ctx)
    expect(svc('Spooler').startType).toBe('disabled')
    sc(['config', 'Spooler', 'start=', 'auto'], ctx)
    expect(svc('Spooler').startType).toBe('auto')
  })

  it('отключение защитной службы отклоняется', () => {
    const res = sc(['config', 'WinDefend', 'start=', 'disabled'], ctx)
    expect(res.exitCode).toBe(1)
    expect(svc('WinDefend').startType).toBe('auto')
  })
})

/**
 * Тест, ради которого операции вынесены в core/device: команда и окно —
 * оба лишь представления, а операция одна. Если эти пути разойдутся,
 * тренажёр начнёт врать в зависимости от того, чем пользовался техник.
 */
describe('команда и операция неотличимы', () => {
  it('sc stop и stopService дают одинаковое состояние мира', () => {
    const viaCommand = { world: createWorld(), session: createSession(), clock, device: HOST }
    sc(['stop', 'Spooler'], viaCommand)

    const viaOperation = createWorld()
    stopService(viaOperation, HOST, 'Spooler', createSession(), clock)

    expect(viaCommand.world.devices[HOST]!.services)
      .toEqual(viaOperation.devices[HOST]!.services)
    expect(viaCommand.world.devices[HOST]!.eventLog)
      .toEqual(viaOperation.devices[HOST]!.eventLog)
  })

  it('оба пути пишут одинаковое изменение в журнал сессии', () => {
    const s1 = createSession()
    sc(['stop', 'Spooler'], { world: createWorld(), session: s1, clock, device: HOST })

    const s2 = createSession()
    stopService(createWorld(), HOST, 'Spooler', s2, clock)

    expect(s1.changes).toEqual(s2.changes)
  })
})

describe('sc без аргументов', () => {
  it('печатает подсказку', () => {
    const res = sc([], ctx)
    expect(res.exitCode).toBe(1)
    expect(res.stdout).toContain('DESCRIPTION')
  })
})
