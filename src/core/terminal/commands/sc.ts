import { joinLines } from '../format'
import {
  findService, startService, stopService, setStartType,
} from '../../device/services'
import type { CommandHandler, CommandContext } from '../types'
import type { Service, ServiceStartType } from '../../world/types'

/**
 * sc — управление службами из терминала.
 *
 * Команда ничего не решает сама: она разбирает аргументы, вызывает
 * операцию из core/device/services и печатает результат. Вся логика
 * запретов и зависимостей живёт там, поэтому `sc stop` и остановка
 * мышью не могут разойтись.
 *
 * Формат вывода снят с живой Windows: двоеточие на позиции 27, отступ
 * восемь пробелов, у SERVICE_NAME и STATE висящий пробел в конце.
 */

const FIELD_WIDTH = 27
const INDENT = '        '

function field(label: string, value: string): string {
  return INDENT + label.padEnd(FIELD_WIDTH - INDENT.length) + ': ' + value
}

/** Вторая строка состояния — признаки, выровненные под значение. */
function stateFlags(text: string): string {
  return ' '.repeat(32) + text
}

function notFound(): string {
  return joinLines([
    `[SC] OpenService FAILED 1060:`,
    '',
    'The specified service does not exist as an installed service.',
    '',
  ])
}

function queryBlock(s: Service): string {
  const running = s.status === 'running'
  return joinLines([
    '',
    `SERVICE_NAME: ${s.name} `,
    field('TYPE', '110  WIN32_OWN_PROCESS  (interactive)'),
    field('STATE', running ? '4  RUNNING ' : '1  STOPPED '),
    stateFlags(running
      ? '(STOPPABLE, NOT_PAUSABLE, IGNORES_SHUTDOWN)'
      : '(NOT_STOPPABLE, NOT_PAUSABLE, IGNORES_SHUTDOWN)'),
    field('WIN32_EXIT_CODE', '0  (0x0)'),
    field('SERVICE_EXIT_CODE', '0  (0x0)'),
    field('CHECKPOINT', '0x0'),
    field('WAIT_HINT', '0x0'),
    '',
  ])
}

/** Переходное состояние, которое печатает sc сразу после команды. */
function pendingBlock(s: Service, pending: 'START_PENDING' | 'STOP_PENDING'): string {
  return joinLines([
    '',
    `SERVICE_NAME: ${s.name} `,
    field('TYPE', '110  WIN32_OWN_PROCESS  (interactive)'),
    field('STATE', `${pending === 'START_PENDING' ? '2' : '3'}  ${pending} `),
    stateFlags('(NOT_STOPPABLE, NOT_PAUSABLE, IGNORES_SHUTDOWN)'),
    field('WIN32_EXIT_CODE', '0  (0x0)'),
    field('SERVICE_EXIT_CODE', '0  (0x0)'),
    field('CHECKPOINT', '0x0'),
    field('WAIT_HINT', '0x7d0'),
    '',
  ])
}

function usage(): string {
  return joinLines([
    'DESCRIPTION:',
    '        SC is a command line program used for communicating with the',
    '        Service Control Manager and services.',
    'USAGE:',
    '        sc [command] [service name] <option1> <option2>...',
    '',
    '        query-----------Queries the status for a service.',
    '        start-----------Starts a service.',
    '        stop------------Sends a STOP request to a service.',
    '        config----------Changes the configuration of a service (persistent).',
    '',
  ])
}

/** sc принимает start= auto | demand | disabled. */
function parseStartType(raw: string | undefined): ServiceStartType | null {
  switch ((raw ?? '').toLowerCase()) {
    case 'auto': return 'auto'
    case 'demand': return 'manual'
    case 'disabled': return 'disabled'
    default: return null
  }
}

function requireService(ctx: CommandContext, name: string | undefined) {
  if (!name) return null
  return findService(ctx.world, ctx.device, name) ?? null
}

export const sc: CommandHandler = (args, ctx) => {
  const verb = (args[0] ?? '').toLowerCase()
  const name = args[1]

  if (verb === '') return { stdout: usage(), exitCode: 1 }

  if (verb === 'query' || verb === 'queryex') {
    const service = requireService(ctx, name)
    if (!service) return { stdout: notFound(), exitCode: 1 }
    return { stdout: queryBlock(service), exitCode: 0 }
  }

  if (verb === 'stop') {
    const service = requireService(ctx, name)
    if (!service) return { stdout: notFound(), exitCode: 1 }

    const r = stopService(ctx.world, ctx.device, service.name, ctx.session, ctx.clock)

    if (!r.ok) return { stdout: 'Access is denied.', exitCode: 1 }
    if (r.alreadyInState) {
      return {
        stdout: joinLines([
          '[SC] ControlService FAILED 1062:', '',
          'The service has not been started.', '',
        ]),
        exitCode: 1,
      }
    }
    return { stdout: pendingBlock(service, 'STOP_PENDING'), exitCode: 0 }
  }

  if (verb === 'start') {
    const service = requireService(ctx, name)
    if (!service) return { stdout: notFound(), exitCode: 1 }

    const r = startService(ctx.world, ctx.device, service.name, ctx.session, ctx.clock)

    if (!r.ok) {
      return {
        stdout: joinLines([
          '[SC] StartService FAILED 1058:', '',
          'The service cannot be started, either because it is disabled or '
          + 'because it has no enabled devices associated with it.', '',
        ]),
        exitCode: 1,
      }
    }
    if (r.alreadyInState) {
      return {
        stdout: joinLines([
          '[SC] StartService FAILED 1056:', '',
          'An instance of the service is already running.', '',
        ]),
        exitCode: 1,
      }
    }
    return { stdout: pendingBlock(service, 'START_PENDING'), exitCode: 0 }
  }

  if (verb === 'config') {
    const service = requireService(ctx, name)
    if (!service) return { stdout: notFound(), exitCode: 1 }

    // sc принимает «start= auto» с пробелом после знака равенства.
    const startIdx = args.findIndex(a => a.toLowerCase().startsWith('start='))
    const raw = startIdx === -1
      ? undefined
      : args[startIdx]!.includes('=') && args[startIdx]!.split('=')[1]
        ? args[startIdx]!.split('=')[1]
        : args[startIdx + 1]

    const type = parseStartType(raw)
    if (!type) {
      return {
        stdout: joinLines([
          '[SC] ChangeServiceConfig FAILED 87:', '',
          'The parameter is incorrect.', '',
        ]),
        exitCode: 1,
      }
    }

    const r = setStartType(ctx.world, ctx.device, service.name, type, ctx.session, ctx.clock)
    if (!r.ok) return { stdout: 'Access is denied.', exitCode: 1 }

    return { stdout: '[SC] ChangeServiceConfig SUCCESS', exitCode: 0 }
  }

  return { stdout: usage(), exitCode: 1 }
}
