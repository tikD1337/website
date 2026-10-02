import { portStatus } from '../network/link'
import { longName } from '../infra/switchops'
import type { WorldState, NetSwitch, SwitchPort, VlanInterface } from '../world/types'

/**
 * Вывод `show` — из состояния мира, каждый раз заново.
 *
 * Ширины колонок взяты с настоящей консоли и живут литералами в тесте:
 * формулы для них нет, а сдвиг на один пробел читается как подделка.
 */

export const CRLF = '\r\n'
const join = (lines: string[]) => lines.join(CRLF)

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const TYPE = '10/100/1000BaseTX'

/** `A4-83-E7-2C-91-44` → `a483.e72c.9144`. Любая запись MAC; не MAC — `null`. */
export function dottedMac(input: string): string | null {
  const hex = input.replace(/[.:-]/g, '').toLowerCase()
  if (!/^[0-9a-f]{12}$/.test(hex)) return null
  return `${hex.slice(0, 4)}.${hex.slice(4, 8)}.${hex.slice(8, 12)}`
}

/** MAC того, что воткнуто в порт: машины или принтера. */
function hostMac(world: WorldState, host: string): string | null {
  const mac = world.devices[host]?.adapters[0]?.mac
    ?? world.network.printers.find(p => p.hostname === host)?.mac
  return mac ? dottedMac(mac) : null
}

/** Собственный MAC порта коммутатора — выводится из имени, без случайности. */
function ownMac(sw: NetSwitch, index: number): string {
  const h = [...sw.hostname].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) % 65536, 7)
  const hex = (n: number) => n.toString(16).padStart(2, '0')
  return `f0e1.a7${hex(h >> 8)}.${hex(h & 255)}${hex(index)}`
}

const prefixLength = (mask: string) =>
  mask.split('.').reduce((n, o) => n + Number(o).toString(2).split('1').length - 1, 0)

// ── show interfaces status ──────────────────────────────────────────

function statusRow(port: string, name: string, status: string, vlan: string, duplex: string, speed: string, type: string) {
  return `${port.padEnd(13)}${name.slice(0, 18).padEnd(19)}${status.padEnd(13)}${vlan.padEnd(11)}`
    + `${duplex.padStart(6)} ${speed.padStart(6)} ${type}`
}

export function interfacesStatus(world: WorldState, sw: NetSwitch): string {
  const rows = sw.ports.map(p => {
    const status = portStatus(world, p)
    const up = status === 'connected'
    return statusRow(p.name, p.description, status, p.mode === 'trunk' ? 'trunk' : String(p.accessVlan),
      up ? 'a-full' : 'auto', up ? 'a-1000' : 'auto', TYPE)
  })
  return join(['', statusRow('Port', 'Name', 'Status', 'Vlan', 'Duplex', 'Speed', 'Type'), ...rows])
}

// ── show interfaces <if> ────────────────────────────────────────────

export function interfaceDetail(world: WorldState, sw: NetSwitch, port: SwitchPort): string {
  const status = portStatus(world, port)
  const head = status === 'disabled'
    ? `${longName(port.name)} is administratively down, line protocol is down (disabled)`
    : status === 'connected'
      ? `${longName(port.name)} is up, line protocol is up (connected)`
      : `${longName(port.name)} is down, line protocol is down (${status})`
  const mac = ownMac(sw, sw.ports.indexOf(port) + 1)
  const up = status === 'connected'
  // Счётчики выводятся из номера порта: живой порт не может показывать нули.
  const n = sw.ports.indexOf(port) + 1
  const pin = up ? 120_000 + n * 7919 : 0
  const pout = up ? 310_000 + n * 6007 : 0
  return join([
    head,
    `  Hardware is Gigabit Ethernet, address is ${mac} (bia ${mac})`,
    ...(port.description ? [`  Description: ${port.description}`] : []),
    '  MTU 1500 bytes, BW 1000000 Kbit/sec, DLY 10 usec,',
    '     reliability 255/255, txload 1/255, rxload 1/255',
    '  Encapsulation ARPA, loopback not set',
    '  Keepalive set (10 sec)',
    up
      ? '  Full-duplex, 1000Mb/s, media type is 10/100/1000BaseTX'
      : '  Auto-duplex, Auto-speed, media type is 10/100/1000BaseTX',
    '  input flow-control is off, output flow-control is unsupported',
    '  ARP type: ARPA, ARP Timeout 04:00:00',
    `  Last input ${up ? '00:00:02' : 'never'}, output ${up ? '00:00:01' : 'never'}, output hang never`,
    '  Last clearing of "show interface" counters never',
    '  Input queue: 0/75/0/0 (size/max/drops/flushes); Total output drops: 0',
    '  Queueing strategy: fifo',
    '  Output queue: 0/40 (size/max)',
    `  5 minute input rate ${up ? 4000 + n * 13 : 0} bits/sec, ${up ? 3 : 0} packets/sec`,
    `  5 minute output rate ${up ? 9000 + n * 29 : 0} bits/sec, ${up ? 7 : 0} packets/sec`,
    `     ${pin} packets input, ${pin * 412} bytes, 0 no buffer`,
    '     0 input errors, 0 CRC, 0 frame, 0 overrun, 0 ignored',
    `     ${pout} packets output, ${pout * 655} bytes, 0 underruns`,
    '     0 output errors, 0 collisions, 0 interface resets',
    '',
  ])
}

export function sviDetail(sw: NetSwitch, svi: VlanInterface): string {
  const mac = ownMac(sw, 0)
  return join([
    svi.adminUp
      ? `Vlan${svi.vlan} is up, line protocol is up`
      : `Vlan${svi.vlan} is administratively down, line protocol is down`,
    `  Hardware is Ethernet SVI, address is ${mac} (bia ${mac})`,
    `  Internet address is ${svi.ip}/${prefixLength(svi.mask)}`,
    '  MTU 1500 bytes, BW 1000000 Kbit/sec, DLY 10 usec,',
    '     reliability 255/255, txload 1/255, rxload 1/255',
    '  Encapsulation ARPA, loopback not set',
    '  Keepalive not supported',
    '  ARP type: ARPA, ARP Timeout 04:00:00',
    '',
  ])
}

export function allInterfaces(world: WorldState, sw: NetSwitch): string {
  return [
    ...sw.vlanInterfaces.map(v => sviDetail(sw, v)),
    ...sw.ports.map(p => interfaceDetail(world, sw, p)),
  ].join(CRLF)
}

// ── show vlan brief ─────────────────────────────────────────────────

export function vlanBrief(sw: NetSwitch): string {
  const lines = [
    '',
    'VLAN Name                             Status    Ports',
    '---- -------------------------------- --------- -------------------------------',
  ]
  const row = (id: string | number, name: string, status: string, ports: string) =>
    `${String(id).padEnd(5)}${name.padEnd(33)}${status.padEnd(10)}${ports}`
  for (const v of sw.vlans) {
    const ports = sw.ports.filter(p => p.mode === 'access' && p.accessVlan === v.id).map(p => p.name)
    const chunks: string[] = []
    for (let i = 0; i < ports.length; i += 4) chunks.push(ports.slice(i, i + 4).join(', '))
    lines.push(row(v.id, v.name, 'active', chunks[0] ?? ''))
    for (const more of chunks.slice(1)) lines.push(`${' '.repeat(48)}${more}`)
  }
  for (const [id, name] of [[1002, 'fddi-default'], [1003, 'token-ring-default'],
    [1004, 'fddinet-default'], [1005, 'trnet-default']] as const) {
    lines.push(row(id, name, 'act/unsup', ''))
  }
  return join(lines)
}

// ── show mac address-table ──────────────────────────────────────────

export type MacFilter = { mac: string } | { port: string } | { vlan: number } | null

/**
 * MAC, который коммутатор видит на порту доступа, — или `null`.
 *
 * Одно место и для таблицы MAC, и для карточки порта: коммутатор знает
 * адрес за портом, а не имя машины. Найти машину по порту — работа.
 */
export function learnedMac(world: WorldState, port: SwitchPort): string | null {
  if (port.mode !== 'access' || portStatus(world, port) !== 'connected') return null
  return hostMac(world, port.connectedTo)
}

export function macTable(world: WorldState, sw: NetSwitch, filter: MacFilter): string {
  const entries = sw.ports
    .flatMap(p => {
      const mac = learnedMac(world, p)
      return mac ? [{ vlan: p.accessVlan, mac, port: p.name }] : []
    })
    .filter(e => !filter
      || ('mac' in filter && e.mac === filter.mac)
      || ('port' in filter && e.port === filter.port)
      || ('vlan' in filter && e.vlan === filter.vlan))
    .sort((a, b) => a.vlan - b.vlan)
  return join([
    '          Mac Address Table',
    '-------------------------------------------',
    '',
    'Vlan    Mac Address       Type        Ports',
    '----    -----------       --------    -----',
    ...entries.map(e => ` ${String(e.vlan).padStart(3)}    ${e.mac}    ${'DYNAMIC'.padEnd(12)}${e.port}`),
    `Total Mac Addresses for this criterion: ${entries.length}`,
    '',
  ])
}

// ── show running-config ─────────────────────────────────────────────

export function portBlock(port: SwitchPort): string[] {
  return [
    `interface ${longName(port.name)}`,
    ...(port.description ? [` description ${port.description}`] : []),
    ...(port.mode === 'trunk'
      ? [' switchport mode trunk']
      : [
          ...(port.accessVlan !== 1 ? [` switchport access vlan ${port.accessVlan}`] : []),
          ' switchport mode access',
        ]),
    ...(port.adminUp ? [] : [' shutdown']),
    ...(port.mode === 'access' ? [' spanning-tree portfast'] : []),
  ]
}

export function sviBlock(svi: VlanInterface): string[] {
  return [
    `interface Vlan${svi.vlan}`,
    ` ip address ${svi.ip} ${svi.mask}`,
    ...svi.helpers.map(h => ` ip helper-address ${h}`),
    ...(svi.adminUp ? [] : [' shutdown']),
  ]
}

/** Заголовок и размер: байты — всё тело от первого `!` до `end` с переводами строк. */
export function configListing(body: string[]): string {
  const bytes = body.reduce((n, l) => n + l.length + 1, 0)
  return join(['Building configuration...', '', `Current configuration : ${bytes} bytes`, ...body, ''])
}

export function runningConfig(sw: NetSwitch): string {
  const version = sw.firmware.replace(/^\D+/, '').split('.').slice(0, 2).join('.')
  const body = [
    '!', `version ${version}`, 'service timestamps log datetime msec', 'no service password-encryption',
    '!', `hostname ${sw.hostname}`, '!',
    ...sw.vlans.filter(v => v.id !== 1).flatMap(v => [`vlan ${v.id}`, ` name ${v.name}`, '!']),
    ...sw.ports.flatMap(p => [...portBlock(p), '!']),
    ...sw.vlanInterfaces.flatMap(v => [...sviBlock(v), '!']),
    'line con 0', 'line vty 0 15', ' login authentication VTY', '!', 'end',
  ]
  return configListing(body)
}

// ── show ip interface brief ─────────────────────────────────────────

export function ipInterfaceBrief(world: WorldState, sw: NetSwitch): string {
  const row = (name: string, ip: string, method: string, status: string, proto: string) =>
    `${name.padEnd(23)}${ip.padEnd(16)}YES ${method.padEnd(7)}${status.padEnd(22)}${proto}`
  return join([
    'Interface              IP-Address      OK? Method Status                Protocol',
    ...sw.vlanInterfaces.map(v => row(`Vlan${v.vlan}`, v.ip, 'NVRAM',
      v.adminUp ? 'up' : 'administratively down', v.adminUp ? 'up' : 'down')),
    ...sw.ports.map(p => {
      const s = portStatus(world, p)
      return row(longName(p.name), 'unassigned', 'unset',
        s === 'disabled' ? 'administratively down' : s === 'connected' ? 'up' : 'down',
        s === 'connected' ? 'up' : 'down')
    }),
  ])
}

// ── show logging ────────────────────────────────────────────────────

/** `*Sep  9 07:58:12.000: ` — время записи в UTC, как у консоли без часового пояса. */
function stamp(iso: string): string {
  const d = new Date(iso)
  const two = (n: number) => String(n).padStart(2, '0')
  return `*${MONTHS[d.getUTCMonth()]} ${String(d.getUTCDate()).padStart(2)} `
    + `${two(d.getUTCHours())}:${two(d.getUTCMinutes())}:${two(d.getUTCSeconds())}`
    + `.${String(d.getUTCMilliseconds()).padStart(3, '0')}: `
}

export function logging(sw: NetSwitch): string {
  const n = sw.log.length
  return join([
    'Syslog logging: enabled (0 messages dropped, 0 messages rate-limited, 0 flushes, 0 overruns, xml disabled, filtering disabled)',
    '',
    `    Console logging: level debugging, ${n} messages logged, xml disabled,`,
    '                     filtering disabled',
    `    Buffer logging:  level debugging, ${n} messages logged, xml disabled,`,
    '                    filtering disabled',
    '',
    'Log Buffer (8192 bytes):',
    '',
    ...sw.log.map(e => `${stamp(e.at)}${e.text}`),
    '',
  ])
}

// ── show version ────────────────────────────────────────────────────

function uptime(since: string, now: Date): string {
  let minutes = Math.max(0, Math.floor((now.getTime() - new Date(since).getTime()) / 60_000))
  const units: Array<[string, number]> = [['week', 7 * 24 * 60], ['day', 24 * 60], ['hour', 60], ['minute', 1]]
  const parts: string[] = []
  for (const [name, size] of units) {
    const v = Math.floor(minutes / size)
    minutes -= v * size
    if (v > 0 || parts.length > 0 || name === 'minute') parts.push(`${v} ${name}${v === 1 ? '' : 's'}`)
  }
  return parts.join(', ')
}

export function version(sw: NetSwitch, now: Date): string {
  const v = sw.firmware.replace(/^\D+/, '')
  const image = `${sw.model.replace(/-/g, '')}-UNIVERSALK9-M`
  return join([
    `${sw.vendor} ${sw.firmware.split(' ')[0]} Software, ${sw.model} Software (${image}), Version ${v}, RELEASE SOFTWARE`,
    `Copyright (c) 2016-2026 by ${sw.vendor} Networks, Inc.`,
    '',
    `${sw.hostname} uptime is ${uptime(sw.health.since, now)}`,
    'System returned to ROM by power-on',
    `System image file is "flash:${sw.model.toLowerCase()}-${v}.bin"`,
    '',
    `Model Number                       : ${sw.model}`,
    `System Serial Number               : ${sw.serial}`,
    '',
  ])
}
