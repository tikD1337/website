import { authorize } from '../policy/authorize'
import { recordChange, addDangerousAction } from '../session/session'
import { appendEvent, serviceStateEvent } from './eventlog'
import type { Clock, WorldState, Service, ServiceStartType } from '../world/types'
import type { SessionLog } from '../session/types'

/**
 * Операции над службами.
 *
 * Единственное место, где меняется состояние службы. И окно «Службы», и
 * команда `sc` вызывают отсюда — иначе остановка мышью и `sc stop` стали
 * бы разными путями в коде и однажды разошлись бы. Тест на неотличимость
 * этих двух путей обязателен.
 */

export interface OpResult {
  ok: boolean
  error?: string
  /** служба уже была в целевом состоянии — операция ничего не изменила */
  alreadyInState?: boolean
}

const fail = (error: string): OpResult => ({ ok: false, error })

export function findService(
  world: WorldState, host: string, name: string,
): Service | undefined {
  return world.devices[host]?.services.find(
    s => s.name.toLowerCase() === name.toLowerCase(),
  )
}

/** Общая проверка: машина есть, служба есть. */
function locate(
  world: WorldState, host: string, name: string,
): { service: Service } | { error: string } {
  if (!world.devices[host]) return { error: `машина ${host} не найдена` }
  const service = findService(world, host, name)
  if (!service) return { error: `служба ${name} не найдена` }
  return { service }
}

/**
 * Защитная служба останавливается тем же шлюзом, что и фаервол.
 *
 * Важно, что операция остаётся вызываемой и отклоняется здесь: кнопку в
 * окне мы не прячем, техник должен столкнуться с отказом и понять его.
 */
function guardProtected(
  service: Service,
  action: string,
  world: WorldState,
  session: SessionLog,
  clock: Clock,
): OpResult | null {
  if (!service.protected) return null

  const decision = authorize(
    {
      kind: 'disable-security',
      target: service.name,
      description: action,
    },
    world,
    session,
  )

  if (decision.decision !== 'deny') return null

  addDangerousAction(session, clock, `${action}: ${service.name}`, decision.reason)
  return fail(`отказано: ${service.displayName} — защитная служба, ${decision.reason}`)
}

export function stopService(
  world: WorldState, host: string, name: string,
  session: SessionLog, clock: Clock,
): OpResult {
  const found = locate(world, host, name)
  if ('error' in found) return fail(found.error)
  const { service } = found

  const guard = guardProtected(service, 'останов службы', world, session, clock)
  if (guard) return guard

  if (service.status === 'stopped') return { ok: true, alreadyInState: true }

  const before = service.status
  service.status = 'stopped'

  recordChange(session, clock,
    `devices.${host}.services.${service.name}.status`, before, 'stopped', true)
  appendEvent(world, host, serviceStateEvent(service.displayName, 'stopped'), clock)

  return { ok: true }
}

export function startService(
  world: WorldState, host: string, name: string,
  session: SessionLog, clock: Clock,
): OpResult {
  const found = locate(world, host, name)
  if ('error' in found) return fail(found.error)
  const { service } = found

  if (service.startType === 'disabled') {
    return fail(
      `служба ${service.displayName} отключена — сначала измените тип запуска`,
    )
  }

  // Зависимости проверяются до запуска, как это делает настоящий диспетчер.
  for (const depName of service.dependsOn) {
    const dep = findService(world, host, depName)
    if (dep && dep.status !== 'running') {
      return fail(
        `не запустить ${service.displayName}: зависимость ${dep.displayName} остановлена`,
      )
    }
  }

  if (service.status === 'running') return { ok: true, alreadyInState: true }

  const before = service.status
  service.status = 'running'

  recordChange(session, clock,
    `devices.${host}.services.${service.name}.status`, before, 'running', true)
  appendEvent(world, host, serviceStateEvent(service.displayName, 'running'), clock)

  return { ok: true }
}

export function setStartType(
  world: WorldState, host: string, name: string, type: ServiceStartType,
  session: SessionLog, clock: Clock,
): OpResult {
  const found = locate(world, host, name)
  if ('error' in found) return fail(found.error)
  const { service } = found

  if (type === 'disabled') {
    const guard = guardProtected(service, 'отключение службы', world, session, clock)
    if (guard) return guard
  }

  if (service.startType === type) return { ok: true, alreadyInState: true }

  const before = service.startType
  service.startType = type

  recordChange(session, clock,
    `devices.${host}.services.${service.name}.startType`, before, type, true)

  return { ok: true }
}
