import type { WorldState, Clock } from '../world/types'
import type { SessionLog } from '../session/types'

/**
 * Всё, что нужно команде для работы.
 *
 * Команда не получает ничего сверх этого: ни доступа к интерфейсу,
 * ни к очереди тикетов. Она — чистая функция над состоянием мира.
 */
export interface CommandContext {
  world: WorldState
  session: SessionLog
  clock: Clock
  /** машина, на которой открыт терминал */
  device: string
}

export interface CommandResult {
  stdout: string
  exitCode: number
}

export type CommandHandler = (args: string[], ctx: CommandContext) => CommandResult

export interface Registry {
  register(name: string, handler: CommandHandler): void
  run(line: string, ctx: CommandContext): CommandResult
  has(name: string): boolean
}
