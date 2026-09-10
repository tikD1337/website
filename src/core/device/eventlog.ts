import type { Clock, WorldState, EventEntry, EventLogName, EventLevel } from '../world/types'

/**
 * Запись в журнал событий машины.
 *
 * Журнал — не украшение: в сценариях среза 2 именно он объясняет, почему
 * служба упала. Техник, который перезапустит её не заглянув сюда, получит
 * повтор через день — и оценка это заметит.
 *
 * Записи копятся в конце, порядок по времени сохраняется.
 */
export function appendEvent(
  world: WorldState,
  host: string,
  entry: Omit<EventEntry, 'at'>,
  clock: Clock,
): void {
  const device = world.devices[host]
  if (!device) return
  device.eventLog.push({ at: clock.now().toISOString(), ...entry })
}

/** Событие диспетчера управления службами — тот же код, что у настоящей Windows. */
export function serviceStateEvent(
  displayName: string,
  state: 'running' | 'stopped',
): { log: EventLogName; level: EventLevel; source: string; eventId: number; message: string } {
  return {
    log: 'System',
    level: 'information',
    source: 'Service Control Manager',
    eventId: 7036,
    message: `The ${displayName} service entered the ${state} state.`,
  }
}
