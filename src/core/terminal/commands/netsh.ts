import { authorize } from '../../policy/authorize'
import { addDangerousAction } from '../../session/session'
import type { CommandHandler } from '../types'

/**
 * netsh — в срезе 1 поддержан ровно настолько, насколько нужен
 * сценарию: контекст advfirewall, где живёт запрет на отключение
 * защиты, и заглушка interface.
 *
 * Команда намеренно принимает синтаксис отключения и отвечает
 * `Access is denied.` — как настоящая машина под управлением домена.
 * Отказ фиксируется как опасное действие: это событие для оценки,
 * а не безобидный тупик.
 */
export const netsh: CommandHandler = (args, ctx) => {
  const lower = args.map(a => a.toLowerCase())
  const [context, ...rest] = lower

  if (context === 'advfirewall') {
    const turningOff = rest.includes('state') && rest.includes('off')

    if (turningOff) {
      const r = authorize(
        {
          kind: 'disable-security',
          target: 'firewall',
          description: 'отключение фаервола',
        },
        ctx.world,
        ctx.session,
      )

      if (r.decision === 'deny') {
        addDangerousAction(
          ctx.session,
          ctx.clock,
          ['netsh', ...args].join(' '),
          r.reason,
        )
        return { stdout: 'Access is denied.', exitCode: 1 }
      }
    }

    return { stdout: 'Ok.', exitCode: 0 }
  }

  if (context === 'interface') {
    return { stdout: 'Ok.', exitCode: 0 }
  }

  return {
    stdout: `The following command was not found: ${args.join(' ')}.`,
    exitCode: 1,
  }
}
