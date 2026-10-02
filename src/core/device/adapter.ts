import { recordChange } from '../session/session'
import { acquireLease, autoconfigure } from '../network/dhcp'
import { segmentOf } from '../network/link'
import type { OpResult } from './services'
import type { Clock, WorldState, Adapter } from '../world/types'
import type { SessionLog } from '../session/types'

/**
 * Операции над настройками адаптера: откуда адрес и откуда DNS.
 *
 * Единственное место, где они меняются; `netsh interface ip` вызывает
 * отсюда, и окно «Свойства адаптера», если появится, обязано тоже.
 * DNS в журнал пишется строкой через запятую: значение изменения —
 * то, что техник называет в заметке.
 */

const list = (dns: string[]) => dns.join(', ')

function adapterOf(world: WorldState, host: string): Adapter | undefined {
  return world.devices[host]?.adapters[0]
}

function changeDns(host: string, a: Adapter, dns: string[], session: SessionLog, clock: Clock): void {
  const before = list(a.dns)
  a.dns = dns
  recordChange(session, clock, `devices.${host}.adapters[0].dns`, before, list(dns), true)
}

/** DNS из аренды: есть аренда — серверы сегмента, нет — пусто. */
export function setDnsDhcp(world: WorldState, host: string, session: SessionLog, clock: Clock): OpResult {
  const a = adapterOf(world, host)
  if (!a) return { ok: false, error: `машина ${host} не найдена` }
  a.dnsSource = 'dhcp'
  const leased = a.dhcpEnabled && !a.autoconfigured && a.leaseObtained !== null
  changeDns(host, a, leased ? [...(segmentOf(world, host)?.dns ?? [])] : [], session, clock)
  return { ok: true }
}

export function setDnsStatic(
  world: WorldState, host: string, servers: string[], session: SessionLog, clock: Clock,
): OpResult {
  const a = adapterOf(world, host)
  if (!a) return { ok: false, error: `машина ${host} не найдена` }
  a.dnsSource = 'static'
  changeDns(host, a, [...servers], session, clock)
  return { ok: true }
}

/** Адрес по DHCP: аренда, как у `renew`; сервер не ответил — самоназначенный. */
export function setAddressDhcp(world: WorldState, host: string, session: SessionLog, clock: Clock): OpResult {
  const a = adapterOf(world, host)
  if (!a) return { ok: false, error: `машина ${host} не найдена` }
  if (a.dhcpEnabled) return { ok: true, alreadyInState: true }

  const before = a.ip
  a.dhcpEnabled = true
  recordChange(session, clock, `devices.${host}.adapters[0].dhcpEnabled`, false, true, true)
  if (!acquireLease(world, host, clock).ok) autoconfigure(world, host)
  recordChange(session, clock, `devices.${host}.adapters[0].ip`, before, a.ip, true)
  return { ok: true }
}

/** Статический адрес: аренда сброшена, DNS из аренды уходит вместе с ней. */
export function setAddressStatic(
  world: WorldState, host: string, ip: string, mask: string, gateway: string,
  session: SessionLog, clock: Clock,
): OpResult {
  const a = adapterOf(world, host)
  if (!a) return { ok: false, error: `машина ${host} не найдена` }

  const before = a.ip
  if (a.dhcpEnabled) {
    recordChange(session, clock, `devices.${host}.adapters[0].dhcpEnabled`, true, false, true)
  }
  Object.assign(a, {
    dhcpEnabled: false, autoconfigured: false, ip, mask, gateway,
    leaseObtained: null, leaseExpires: null,
    dns: a.dnsSource === 'static' ? a.dns : [],
  })
  recordChange(session, clock, `devices.${host}.adapters[0].ip`, before, ip, true)
  return { ok: true }
}
