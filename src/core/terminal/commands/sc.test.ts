import { describe, it, expect, beforeEach } from 'vitest'
import { sc } from './sc'
import { stopService, startService, setStartType, findService } from '../../device/services'
import { createWorld } from '../../world/world'
import { createSession } from '../../session/session'
import type { CommandContext } from '../types'
import type { WorldState } from '../../world/types'
import type { SessionLog } from '../../session/types'

const clock = { now: () => new Date('2026-09-10T09:15:00.000Z') }
const HOST = 'AL-LPT-0447'

let ctx: CommandContext

beforeEach(() => {
  ctx = { world: createWorld(), session: createSession(), clock, device: HOST }
})

const svc = (name: string) => findService(ctx.world, HOST, name)!
const out = (...lines: string[]) => lines.map(l => l + '\r\n').join('')

/**
 * Блок состояния службы. Сверено с живой Windows: имя с висящим
 * пробелом, двоеточие на позиции 27, отступ восемь пробелов.
 */
const status = (name: string, state: string, flags: string, waitHint = '0x0') => out(
  '',
  `SERVICE_NAME: ${name} `,
  '        TYPE               : 110  WIN32_OWN_PROCESS  (interactive)',
  `        STATE              : ${state} `,
  `                                (${flags}, NOT_PAUSABLE, IGNORES_SHUTDOWN)`,
  '        WIN32_EXIT_CODE    : 0  (0x0)',
  '        SERVICE_EXIT_CODE  : 0  (0x0)',
  '        CHECKPOINT         : 0x0',
  `        WAIT_HINT          : ${waitHint}`,
)

describe('sc', () => {
  it('query — состояние запущенной и остановленной службы', () => {
    expect(sc(['query', 'SPOOLER'], ctx))
      .toEqual({ exitCode: 0, stdout: status('Spooler', '4  RUNNING', 'STOPPABLE') })
    expect(sc(['query', 'BITS'], ctx).stdout)
      .toBe(status('BITS', '1  STOPPED', 'NOT_STOPPABLE'))
  })

  it('stop и start меняют мир и печатают переходное состояние', () => {
    expect(sc(['stop', 'Spooler'], ctx))
      .toEqual({ exitCode: 0, stdout: status('Spooler', '3  STOP_PENDING', 'NOT_STOPPABLE', '0x7d0') })
    expect(svc('Spooler').status).toBe('stopped')

    expect(sc(['start', 'BITS'], ctx))
      .toEqual({ exitCode: 0, stdout: status('BITS', '2  START_PENDING', 'NOT_STOPPABLE', '0x7d0') })
    expect(svc('BITS').status).toBe('running')
  })

  it('config меняет тип запуска; отключённая служба не стартует', () => {
    expect(sc(['config', 'Spooler', 'start=', 'demand'], ctx))
      .toEqual({ exitCode: 0, stdout: '[SC] ChangeServiceConfig SUCCESS' })
    expect(svc('Spooler').startType).toBe('manual')
    sc(['config', 'Spooler', 'start=', 'auto'], ctx)
    expect(svc('Spooler').startType).toBe('auto')

    sc(['config', 'BITS', 'start=', 'disabled'], ctx)
    expect(svc('BITS').startType).toBe('disabled')
    expect(sc(['start', 'BITS'], ctx).exitCode).toBe(1)
    expect(svc('BITS').status).toBe('stopped')
  })

  it('ошибки отвечают кодами настоящего sc', () => {
    const cases: Array<[string[], string]> = [
      [['query', 'НетТакой'],
        '[SC] OpenService FAILED 1060:\r\n\r\nThe specified service does not exist as an installed service.\r\n'],
      [['stop', 'BITS'], '[SC] ControlService FAILED 1062:\r\n\r\nThe service has not been started.\r\n'],
      [['start', 'Spooler'],
        '[SC] StartService FAILED 1056:\r\n\r\nAn instance of the service is already running.\r\n'],
    ]
    for (const [args, stdout] of cases) {
      expect(sc(args, ctx), args.join(' ')).toEqual({ exitCode: 1, stdout })
    }
    for (const args of [[], ['wat']]) {
      expect(sc(args, ctx).stdout.startsWith('DESCRIPTION:'), args.join(' ')).toBe(true)
    }
  })

  /*
    Защитная служба — отказ доступа по тому же правилу, что фаервол, и
    отказ записывается: попытка отключить защиту — событие, за которое
    оценка снимает балл, а не безобидный тупик.
  */
  it('защитную службу нельзя ни остановить, ни отключить', () => {
    expect(sc(['stop', 'WinDefend'], ctx)).toEqual({ exitCode: 1, stdout: 'Access is denied.' })
    expect(sc(['config', 'WinDefend', 'start=', 'disabled'], ctx).stdout).toBe('Access is denied.')
    sc(['stop', 'MpsSvc'], ctx)

    expect(svc('WinDefend')).toMatchObject({ status: 'running', startType: 'auto' })
    expect(ctx.session.flags.dangerousActions).toHaveLength(3)
  })
})

/**
 * Тест, ради которого операции вынесены в core/device: команда и окно —
 * лишь представления, операция одна. Если пути разойдутся, тренажёр
 * начнёт врать в зависимости от того, чем пользовался техник.
 */
describe('команда и операция неотличимы', () => {
  it('stop, start и config дают одинаковый мир и журнал', () => {
    const cases: Array<[string[], (w: WorldState, s: SessionLog) => void]> = [
      [['stop', 'Spooler'], (w, s) => stopService(w, HOST, 'Spooler', s, clock)],
      [['start', 'BITS'], (w, s) => startService(w, HOST, 'BITS', s, clock)],
      [['config', 'Spooler', 'start=', 'disabled'],
        (w, s) => setStartType(w, HOST, 'Spooler', 'disabled', s, clock)],
    ]
    for (const [args, op] of cases) {
      const viaCommand = { world: createWorld(), session: createSession(), clock, device: HOST }
      sc(args, viaCommand)
      const viaOp = { world: createWorld(), session: createSession() }
      op(viaOp.world, viaOp.session)

      const name = args.join(' ')
      expect(viaCommand.world.devices[HOST], name).toEqual(viaOp.world.devices[HOST])
      expect(viaCommand.session.changes, name).toEqual(viaOp.session.changes)
      expect(viaCommand.session.changes, name).toHaveLength(1)
    }
  })
})
