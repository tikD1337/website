import { parseCommand } from './parse'
import { recordCommand } from '../session/session'
import { CRLF } from './format'
import type { CommandResult, Registry } from './types'
import type { CommandHandler } from './types'

/**
 * Реестр команд.
 *
 * Единственное место, где команда попадает в журнал сессии — здесь.
 * Это важно: нераспознанные и упавшие команды записываются наравне с
 * успешными, потому что оценка смотрит на весь путь техника, а не
 * только на удачные шаги.
 */
export function createRegistry(): Registry {
  const handlers = new Map<string, CommandHandler>()

  return {
    register(name, handler) {
      handlers.set(name.toLowerCase(), handler)
    },

    has(name) {
      return handlers.has(name.toLowerCase())
    },

    run(line, ctx): CommandResult {
      const { name, args } = parseCommand(line)

      // Пустой ввод — не действие: Enter в пустой строке ничего не значит.
      if (name === '') return { stdout: '', exitCode: 0 }

      const handler = handlers.get(name)

      const result: CommandResult = handler
        ? handler(args, ctx)
        : {
            stdout: `'${name}' is not recognized as an internal or external command,`
              + CRLF + 'operable program or batch file.',
            exitCode: 1,
          }

      recordCommand(ctx.session, ctx.clock, ctx.device, line.trim(), result.exitCode)
      return result
    },
  }
}
