import { segmentOf, linkOf } from './link'
import type { Clock, WorldState, NetSwitch } from '../world/types'

/**
 * DHCP глазами клиента.
 *
 * Сервер стоит в серверном VLAN, и клиенту он отвечает только через
 * ретрансляцию на ядре: `ip helper-address` у интерфейса VLAN. Поэтому
 * «DHCP работает» — это три условия сразу, и каждое ломается отдельно:
 * область на сервере жива, интерфейс VLAN поднят, ретрансляция ведёт на
 * сервер. Функция одна на всех: ipconfig, подъём линка, серверная.
 */

export function coreOf(world: WorldState): NetSwitch | undefined {
  return world.network.switches.find(s => s.role === 'core')
}

export function dhcpServes(world: WorldState, vlanId: number): boolean {
  const seg = world.network.segments.find(s => s.vlanId === vlanId)
  if (!seg || !seg.dhcpServer || !seg.dhcpHealthy) return false
  const svi = coreOf(world)?.vlanInterfaces.find(v => v.vlan === vlanId)
  return Boolean(svi?.adminUp && svi.helpers.includes(seg.dhcpServer))
}

/** Сколько запросов из VLAN дошло до сервера за час — для серверной. */
export function dhcpRequestsLastHour(world: WorldState, vlanId: number): number {
  return dhcpServes(world, vlanId) ? 37 : 0
}

/**
 * Получить аренду: прежний адрес машины по MAC или первый свободный.
 *
 * Сервер помнит, кому что выдал. Без этого любой запрос получал первый
 * адрес пула — чужой, и вторая машина конфликтовала бы с первой.
 */
export function acquireLease(
  world: WorldState, host: string, clock: Clock,
): { ok: true; ip: string } | { ok: false } {
  const a = world.devices[host]?.adapters[0]
  const seg = segmentOf(world, host)
  if (!a || !seg || !linkOf(world, host) || !dhcpServes(world, seg.vlanId)) return { ok: false }

  const heldByOthers = new Set(
    Object.entries(world.devices)
      .filter(([name]) => name !== host)
      .map(([, d]) => d.adapters[0]?.ip),
  )
  const reserved = new Set(Object.entries(seg.leases).filter(([mac]) => mac !== a.mac).map(([, ip]) => ip))
  const ip = seg.leases[a.mac]
    ?? seg.leasePool.find(x => !heldByOthers.has(x) && !reserved.has(x))
  if (!ip) return { ok: false }

  const now = clock.now()
  seg.leases[a.mac] = ip
  Object.assign(a, {
    ip,
    mask: '255.255.255.0',
    gateway: seg.gateway,
    dns: [...seg.dns],
    autoconfigured: false,
    leaseObtained: now.toISOString(),
    leaseExpires: new Date(now.getTime() + 24 * 3600 * 1000).toISOString(),
  })
  return { ok: true, ip }
}

/** Самоназначенный адрес: 169.254 и два последних байта MAC, без 0 и 255. */
export function autoconfigure(world: WorldState, host: string): void {
  const a = world.devices[host]?.adapters[0]
  if (!a) return
  const bytes = a.mac.split(/[-:]/).map(h => parseInt(h, 16))
  const octet = (b: number) => Math.min(254, Math.max(1, b))
  Object.assign(a, {
    ip: `169.254.${octet(bytes[4]!)}.${octet(bytes[5]!)}`,
    mask: '255.255.0.0',
    gateway: '',
    dns: [],
    autoconfigured: true,
    leaseObtained: null,
    leaseExpires: null,
  })
}
