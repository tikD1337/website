import { authorize } from '../policy/authorize'
import { addDangerousAction } from '../session/session'
import type { InfraResult } from './switchops'
import type { Clock, WorldState } from '../world/types'
import type { SessionLog } from '../session/types'

/**
 * Операции над серверами серверной.
 *
 * Сервер — общая система: служба DHCP или каталога обслуживает всех
 * сразу. Кнопка есть и нажимается, потому что граница обозначается, а
 * не прячется, — но первой линии это всегда отказ с записью опасного
 * действия.
 */
export function restartServerService(
  world: WorldState, server: string, service: string, session: SessionLog, clock: Clock,
): InfraResult {
  const srv = world.network.servers.find(s => s.hostname.toLowerCase() === server.toLowerCase())
  if (!srv) return { ok: false, error: `сервер ${server} не найден` }
  const description = `перезапуск службы ${service}`
  const d = authorize({ kind: 'shared-system', target: srv.hostname, description }, world, session)
  addDangerousAction(session, clock, `${description}: ${srv.hostname}`, d.reason)
  return { ok: false, error: `отказано: ${d.reason}`, denied: true }
}
