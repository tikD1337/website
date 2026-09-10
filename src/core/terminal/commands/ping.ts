import { joinLines } from '../format'
import type { CommandHandler, CommandContext } from '../types'

/**
 * Есть ли у машины путь наружу.
 *
 * Достижимость выводится из состояния мира, а не задаётся сценарием.
 * Поэтому починка адресации в терминале немедленно меняет поведение
 * ping — сценарию не нужно об этом ничего знать.
 */
function hasRoute(ctx: CommandContext): boolean {
  const a = ctx.world.devices[ctx.device]?.adapters[0]
  if (!a) return false
  return a.linkUp && !a.autoconfigured && a.gateway !== '' && a.ip !== '0.0.0.0'
}

/** Адрес в той же подсети, что и машина: пингуется без шлюза. */
function isLocalSubnet(ctx: CommandContext, target: string): boolean {
  const a = ctx.world.devices[ctx.device]?.adapters[0]
  if (!a) return false
  const seg = ctx.world.network.segments.find(s => s.vlan === a.segment)
  if (!seg) return false
  const prefix = seg.subnet.split('/')[0]!.split('.').slice(0, 3).join('.')
  return target.startsWith(`${prefix}.`)
}

export const ping: CommandHandler = (args, ctx) => {
  const target = args[0]

  if (!target) {
    return {
      stdout: joinLines([
        'Usage: ping [-t] [-a] [-n count] [-l size] target_name',
        '',
      ]),
      exitCode: 1,
    }
  }

  const known = isLocalSubnet(ctx, target)
    || ctx.world.network.publicHosts.includes(target)

  const reachable = hasRoute(ctx) && known
  const head = [`Pinging ${target} with 32 bytes of data:`]

  if (!reachable) {
    return {
      stdout: joinLines([
        ...head,
        'Request timed out.',
        'Request timed out.',
        'Request timed out.',
        'Request timed out.',
        '',
        `Ping statistics for ${target}:`,
        '    Packets: Sent = 4, Received = 0, Lost = 4 (100% loss),',
        '',
      ]),
      exitCode: 1,
    }
  }

  // Времена фиксированные: случайность сломала бы воспроизводимость,
  // а тренировочной ценности не несёт.
  const times = [3, 4, 3, 4]

  return {
    stdout: joinLines([
      ...head,
      ...times.map(t => `Reply from ${target}: bytes=32 time=${t}ms TTL=118`),
      '',
      `Ping statistics for ${target}:`,
      '    Packets: Sent = 4, Received = 4, Lost = 0 (0% loss),',
      'Approximate round trip times in milli-seconds:',
      '    Minimum = 3ms, Maximum = 4ms, Average = 3ms',
      '',
    ]),
    exitCode: 0,
  }
}
