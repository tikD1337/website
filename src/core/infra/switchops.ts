import { authorize } from '../policy/authorize'
import { recordChange, addDangerousAction } from '../session/session'
import { linkOf } from '../network/link'
import { acquireLease, autoconfigure } from '../network/dhcp'
import type { Clock, WorldState, NetSwitch, SwitchPort } from '../world/types'
import type { SessionLog } from '../session/types'

/**
 * Операции над коммутатором.
 *
 * Единственное место, где меняется конфигурация коммутатора. И консоль,
 * и кнопки серверной вызывают отсюда — то же правило, что со службами
 * и учётками: окно и команда лишь представления, операция одна.
 *
 * Каждое изменение проходит шлюз: первая линия меняет только порт
 * машины из взятого тикета. Всё остальное — отказ, записанный опасным
 * действием: граница обозначается, а не прячется.
 */

export interface InfraResult {
  ok: boolean
  error?: string
  /** порт уже был в целевом состоянии — операция ничего не изменила */
  alreadyInState?: boolean
}

const fail = (error: string): InfraResult => ({ ok: false, error })
const LONG = 'gigabitethernet'

/** `Gi1/0/22` → `GigabitEthernet1/0/22`, как печатают конфигурация и журнал. */
export function longName(port: string): string {
  return `GigabitEthernet${port.slice(2)}`
}

/** Короткое имя порта из любой записи: `gi1/0/22`, `GigabitEthernet1/0/22`. */
export function shortPortName(input: string): string | null {
  const m = /^([a-z]+)\s*(\d+\/\d+\/\d+)$/i.exec(input.trim())
  if (!m) return null
  const prefix = m[1]!.toLowerCase()
  return prefix.length >= 2 && LONG.startsWith(prefix) ? `Gi${m[2]}` : null
}

export function findSwitch(world: WorldState, sw: string): NetSwitch | undefined {
  return world.network.switches.find(s => s.hostname.toLowerCase() === sw.toLowerCase())
}

export function findPort(world: WorldState, sw: string, port: string): SwitchPort | undefined {
  const name = shortPortName(port)
  return name ? findSwitch(world, sw)?.ports.find(p => p.name === name) : undefined
}

function locate(
  world: WorldState, swName: string, portName: string,
): { sw: NetSwitch; port: SwitchPort } | { error: string } {
  const sw = findSwitch(world, swName)
  if (!sw) return { error: `коммутатор ${swName} не найден` }
  const port = findPort(world, swName, portName)
  if (!port) return { error: `порт ${portName} на ${sw.hostname} не найден` }
  return { sw, port }
}

/** Шлюз: вне области тикета — отказ с записью опасного действия. */
function gate(
  sw: NetSwitch, port: SwitchPort, description: string,
  world: WorldState, session: SessionLog, clock: Clock,
): InfraResult | null {
  const target = `${sw.hostname}/${port.name}`
  const d = authorize({ kind: 'infra-change', target, description }, world, session)
  if (d.decision === 'allow') return null
  addDangerousAction(session, clock, `${description}: ${target}`, d.reason)
  return fail(`отказано: ${d.reason}`)
}

const portPath = (sw: NetSwitch, port: SwitchPort, field: string) =>
  `network.switches[hostname=${sw.hostname}].ports[name=${port.name}].${field}`

function configured(sw: NetSwitch, clock: Clock): void {
  sw.log.push({ at: clock.now().toISOString(), text: '%SYS-5-CONFIG_I: Configured from console by helpdesk on vty0' })
}

export function setAccessVlan(
  world: WorldState, swName: string, portName: string, vlan: number,
  session: SessionLog, clock: Clock,
): InfraResult {
  const found = locate(world, swName, portName)
  if ('error' in found) return fail(found.error)
  const { sw, port } = found

  const denied = gate(sw, port, `смена VLAN доступа на ${vlan}`, world, session, clock)
  if (denied) return denied
  if (!sw.vlans.some(v => v.id === vlan)) return fail(`VLAN ${vlan} не существует на ${sw.hostname}`)
  if (port.accessVlan === vlan) return { ok: true, alreadyInState: true }

  const before = port.accessVlan
  port.accessVlan = vlan
  recordChange(session, clock, portPath(sw, port, 'accessVlan'), before, vlan, true)
  configured(sw, clock)
  return { ok: true }
}

/**
 * Выключить или включить порт.
 *
 * Windows при подключении кабеля сама идёт за адресом, поэтому подъём
 * линка запускает получение аренды на машине: есть DHCP в её VLAN —
 * аренда, нет — самоназначенный адрес. Передёрнуть порт после смены
 * VLAN — штатный приём, и он должен работать.
 */
export function setPortAdmin(
  world: WorldState, swName: string, portName: string, up: boolean,
  session: SessionLog, clock: Clock,
): InfraResult {
  const found = locate(world, swName, portName)
  if ('error' in found) return fail(found.error)
  const { sw, port } = found

  const denied = gate(sw, port, up ? 'включение порта' : 'выключение порта', world, session, clock)
  if (denied) return denied
  if (port.adminUp === up) return { ok: true, alreadyInState: true }

  port.adminUp = up
  recordChange(session, clock, portPath(sw, port, 'adminUp'), !up, up, true)
  configured(sw, clock)
  sw.log.push({
    at: clock.now().toISOString(),
    text: `%LINK-3-UPDOWN: Interface ${longName(port.name)}, changed state to ${up ? 'up' : 'down'}`,
  })

  const host = port.connectedTo
  const adapter = world.devices[host]?.adapters[0]
  if (up && adapter?.dhcpEnabled && linkOf(world, host)) {
    if (!acquireLease(world, host, clock).ok) autoconfigure(world, host)
  }
  return { ok: true }
}

export function setDescription(
  world: WorldState, swName: string, portName: string, text: string,
  session: SessionLog, clock: Clock,
): InfraResult {
  const found = locate(world, swName, portName)
  if ('error' in found) return fail(found.error)
  const { sw, port } = found

  const denied = gate(sw, port, 'смена описания порта', world, session, clock)
  if (denied) return denied
  if (port.description === text) return { ok: true, alreadyInState: true }

  const before = port.description
  port.description = text
  recordChange(session, clock, portPath(sw, port, 'description'), before, text, true)
  configured(sw, clock)
  return { ok: true }
}

/**
 * Сохранить конфигурацию: текущая становится стартовой.
 *
 * Несохранённое изменение переживает только до перезагрузки коммутатора —
 * это тихая поломка, и о ней должен помнить тот, кто менял.
 */
export function saveConfig(
  world: WorldState, swName: string, session: SessionLog, clock: Clock,
): InfraResult {
  const sw = findSwitch(world, swName)
  if (!sw) return fail(`коммутатор ${swName} не найден`)
  if (!session.incident) {
    const reason = 'нет открытого тикета — изменения инфраструктуры делаются только по тикету'
    addDangerousAction(session, clock, `сохранение конфигурации: ${sw.hostname}`, reason)
    return fail(`отказано: ${reason}`)
  }
  for (const p of sw.ports) {
    p.saved = { accessVlan: p.accessVlan, adminUp: p.adminUp, description: p.description }
  }
  return { ok: true }
}

/**
 * Ретрансляция DHCP на интерфейсе VLAN — конфигурация ядра, общая для
 * всех в этом VLAN. Первой линии она не принадлежит: отказ всегда.
 */
export function setHelper(
  world: WorldState, swName: string, vlan: number, ip: string, add: boolean,
  session: SessionLog, clock: Clock,
): InfraResult {
  const sw = findSwitch(world, swName)
  if (!sw) return fail(`коммутатор ${swName} не найден`)
  const description = `${add ? 'добавление' : 'удаление'} ретрансляции DHCP ${ip} на Vlan${vlan}`
  const d = authorize({ kind: 'shared-system', target: `${sw.hostname}/Vlan${vlan}`, description },
    world, session)
  addDangerousAction(session, clock, `${description}: ${sw.hostname}`, d.reason)
  return fail(`отказано: ${d.reason}`)
}
