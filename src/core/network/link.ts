import type { WorldState, NetSwitch, SwitchPort, NetworkSegment } from '../world/types'

/**
 * Линк и VLAN машины.
 *
 * Выводятся из порта коммутатора, а не хранятся в адаптере: порт —
 * единственный источник истины. Адаптер знает только физику со своей
 * стороны — вставлен ли кабель. Всё, что спрашивает «есть ли у машины
 * сеть и в каком она сегменте» (ipconfig, ping, трей, DHCP), спрашивает
 * здесь.
 */

/** Порт, в который воткнута машина; нет порта — машина не подключена. */
export function portOf(
  world: WorldState, host: string,
): { sw: NetSwitch; port: SwitchPort } | undefined {
  for (const sw of world.network.switches) {
    const port = sw.ports.find(p => p.connectedTo === host)
    if (port) return { sw, port }
  }
  return undefined
}

/** Итоговый линк: кабель со стороны машины и включённый порт. */
export function linkOf(world: WorldState, host: string): boolean {
  const adapter = world.devices[host]?.adapters[0]
  const p = portOf(world, host)
  return Boolean(adapter?.linkUp && p?.port.adminUp)
}

/** VLAN машины — VLAN доступа её порта. */
export function vlanOf(world: WorldState, host: string): number | null {
  const p = portOf(world, host)
  if (!p || p.port.mode !== 'access') return null
  return p.port.accessVlan
}

export function segmentOf(world: WorldState, host: string): NetworkSegment | undefined {
  const vlan = vlanOf(world, host)
  if (vlan === null) return undefined
  return world.network.segments.find(s => s.vlanId === vlan)
}
