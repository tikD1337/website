import { BRAND } from '../../brand'
import type {
  Device, NetworkSegment, NetSwitch, SwitchPort, Router, Server, NetPrinter,
  Service, DeviceHealth,
} from './types'

/**
 * Сеть и серверная.
 *
 * Небольшой офис: один коммутатор доступа на кросс-комнату, ядро с
 * интерфейсами VLAN, пограничный маршрутизатор, горстка серверов и
 * сетевой принтер. Всё исправно — сценарий ломает одно место, и оно
 * заметно только на связном и правдоподобном фоне.
 *
 * DHCP-сервер стоит в серверном VLAN, а не рядом с клиентами: иначе
 * ретрансляция на ядре была бы не нужна, и сценарий про неё стал бы
 * неправдой.
 */

const NET = BRAND.vendors.network[0]
const VLANS = [
  { id: 1, name: 'default' },
  { id: 10, name: 'SERVERS' },
  { id: 20, name: 'STAFF' },
  { id: 40, name: 'PRINTERS' },
]
const DHCP_SERVER = '10.20.10.5'

function health(cpu: number, memory: number, temperature: number, since: string): DeviceHealth {
  return { cpu, memory, temperature, psu: 'ok', since }
}

function port(
  n: number, description: string, connectedTo: string, accessVlan: number,
  mode: SwitchPort['mode'] = 'access',
): SwitchPort {
  return {
    name: `Gi1/0/${n}`,
    description,
    connectedTo,
    mode,
    accessVlan,
    adminUp: true,
    saved: { accessVlan, adminUp: true, description },
  }
}

function service(name: string, displayName: string): Service {
  return { name, displayName, status: 'running', startType: 'auto', protected: false, dependsOn: [] }
}

/**
 * Порты коммутатора доступа: розетки столов подписаны номером стола,
 * а не именем машины. Найти порт по машине — это работа: по MAC в
 * таблице коммутатора или по кабинету из каталога.
 */
function accessPorts(): SwitchPort[] {
  const patched: Record<number, [string, string, number]> = {
    1: ['DESK-3-14', 'AL-LPT-0447', 20],
    2: ['DESK-3-20', 'AL-LPT-0512', 20],
    3: ['DESK-4-01', 'AL-LPT-0601', 20],
    4: ['DESK-2-11', 'AL-LPT-0714', 20],
    5: ['DESK-2-08', 'AL-DSK-0192', 20],
    6: ['DESK-3-06', 'AL-LPT-0788', 20],
    40: ['PRN-FL3-01', 'PRN-FL3-01', 40],
  }
  const ports: SwitchPort[] = []
  for (let n = 1; n <= 47; n++) {
    const [description, host, vlan] = patched[n] ?? [`DESK-3-${String(n).padStart(2, '0')}`, '', 20]
    ports.push(port(n, description, host, vlan))
  }
  ports.push(port(48, 'UPLINK-CR-01', 'CR-01', 1, 'trunk'))
  return ports
}

function corePorts(): SwitchPort[] {
  const patched: Record<number, [string, string, number, SwitchPort['mode']?]> = {
    1: ['DOWNLINK-SW-FL3-01', 'SW-FL3-01', 1, 'trunk'],
    2: ['RT-EDGE-01', 'RT-EDGE-01', 10],
    3: ['DC01', 'DC01', 20],
    4: ['DC02', 'DC02', 20],
    5: ['DHCP01', 'DHCP01', 10],
    6: ['FS01', 'FS01', 20],
    7: ['MAIL01', 'MAIL01', 20],
    8: ['APP01', 'APP01', 20],
  }
  const ports: SwitchPort[] = []
  for (let n = 1; n <= 24; n++) {
    const [description, host, vlan, mode] = patched[n] ?? ['SPARE', '', 10]
    ports.push(port(n, description, host, vlan, mode))
  }
  return ports
}

export function seedNetwork(devices: Record<string, Device>) {
  const leases: Record<string, string> = {}
  for (const d of Object.values(devices)) leases[d.adapters[0]!.mac] = d.adapters[0]!.ip

  const segments: NetworkSegment[] = [
    {
      vlan: 'vlan10', vlanId: 10, name: 'SERVERS',
      subnet: '10.20.10.0/24', gateway: '10.20.10.1',
      dhcpServer: '', dhcpHealthy: true, leasePool: [], leases: {}, dns: ['10.20.14.10'],
    },
    {
      vlan: 'vlan20', vlanId: 20, name: 'STAFF',
      subnet: '10.20.14.0/24',
      gateway: '10.20.14.1',
      dhcpServer: DHCP_SERVER,
      dhcpHealthy: true,
      // Пул шире числа машин: иначе renew на второй машине выдал бы
      // адрес, уже занятый первой, и получился бы конфликт из ничего.
      leasePool: [
        '10.20.14.88', '10.20.14.89', '10.20.14.90', '10.20.14.91',
        '10.20.14.92', '10.20.14.93', '10.20.14.94', '10.20.14.95',
      ],
      leases,
      dns: ['10.20.14.10', '10.20.14.11'],
    },
    {
      // Принтеры на статике: DHCP в этом VLAN нет, и машина, попавшая
      // сюда, останется на самоназначенном адресе.
      vlan: 'vlan40', vlanId: 40, name: 'PRINTERS',
      subnet: '10.20.40.0/24', gateway: '10.20.40.1',
      dhcpServer: '', dhcpHealthy: true, leasePool: [], leases: {}, dns: [],
    },
  ]

  const switches: NetSwitch[] = [
    {
      hostname: 'SW-FL3-01',
      role: 'access',
      vendor: NET, model: 'FX-2448P', serial: 'FXS2231L0KQ', firmware: 'FXOS 16.12.4',
      location: 'Этаж 3, кросс-комната 3.07',
      mgmtIp: '10.20.10.11',
      vlans: VLANS.map(v => ({ ...v })),
      ports: accessPorts(),
      vlanInterfaces: [],
      log: [
        { at: '2026-09-09T07:58:12.000Z', text: '%LINK-3-UPDOWN: Interface GigabitEthernet1/0/5, changed state to up' },
        { at: '2026-09-09T08:31:40.000Z', text: '%LINK-3-UPDOWN: Interface GigabitEthernet1/0/1, changed state to up' },
      ],
      health: health(7, 38, 41, '2026-08-02T04:10:00.000Z'),
    },
    {
      hostname: 'CR-01',
      role: 'core',
      vendor: NET, model: 'FX-9300-24', serial: 'FXS2240C1RA', firmware: 'FXOS 17.3.6',
      location: 'Серверная, стойка A2',
      mgmtIp: '10.20.10.2',
      vlans: VLANS.map(v => ({ ...v })),
      ports: corePorts(),
      vlanInterfaces: [
        { vlan: 10, ip: '10.20.10.1', mask: '255.255.255.0', helpers: [], adminUp: true },
        { vlan: 20, ip: '10.20.14.1', mask: '255.255.255.0', helpers: [DHCP_SERVER], adminUp: true },
        { vlan: 40, ip: '10.20.40.1', mask: '255.255.255.0', helpers: [], adminUp: true },
      ],
      log: [
        { at: '2026-09-08T19:02:55.000Z', text: '%SYS-5-CONFIG_I: Configured from console by netops on vty0 (10.20.10.40)' },
      ],
      health: health(12, 44, 46, '2026-07-19T03:00:00.000Z'),
    },
  ]

  const routers: Router[] = [
    {
      hostname: 'RT-EDGE-01',
      vendor: NET, model: 'FX-R460', serial: 'FXR1934E7TZ',
      location: 'Серверная, стойка A1',
      mgmtIp: '10.20.10.3',
      wan: { isp: 'Veritel Fiber', ip: '203.0.113.18', up: true },
      health: health(9, 31, 44, '2026-07-19T03:05:00.000Z'),
    },
  ]

  const since = '2026-09-01T02:00:00.000Z'
  const servers: Server[] = [
    {
      hostname: 'DC01', roles: ['Контроллер домена', 'DNS'], ip: '10.20.14.10',
      os: `${BRAND.os} Server 2022`, location: 'Серверная, стойка A3',
      health: health(14, 61, 38, since),
      services: [service('NTDS', 'Directory Domain Services'), service('DNS', 'DNS Server'),
        service('Netlogon', 'Netlogon')],
    },
    {
      hostname: 'DC02', roles: ['Контроллер домена', 'DNS'], ip: '10.20.14.11',
      os: `${BRAND.os} Server 2022`, location: 'Серверная, стойка A3',
      health: health(9, 55, 37, since),
      services: [service('NTDS', 'Directory Domain Services'), service('DNS', 'DNS Server'),
        service('Netlogon', 'Netlogon')],
    },
    {
      hostname: 'DHCP01', roles: ['DHCP'], ip: DHCP_SERVER,
      os: `${BRAND.os} Server 2022`, location: 'Серверная, стойка A3',
      health: health(3, 22, 36, since),
      services: [service('DHCPServer', 'DHCP Server')],
    },
    {
      hostname: 'FS01', roles: ['Файловый сервер'], ip: '10.20.14.15',
      os: `${BRAND.os} Server 2022`, location: 'Серверная, стойка A4',
      health: health(11, 48, 40, since),
      services: [service('LanmanServer', 'Server')],
    },
    {
      hostname: 'MAIL01', roles: [`Почта ${BRAND.mail}`], ip: '10.20.14.25',
      os: `${BRAND.os} Server 2022`, location: 'Серверная, стойка A4',
      health: health(21, 67, 42, since),
      services: [service('ArcMailTransport', `${BRAND.mail} Transport`)],
    },
    {
      hostname: 'APP01', roles: ['Внутренний портал'], ip: '10.20.14.50',
      os: `${BRAND.os} Server 2022`, location: 'Серверная, стойка A4',
      health: health(6, 34, 39, since),
      services: [service('W3SVC', 'World Wide Web Publishing Service')],
    },
  ]

  const printers: NetPrinter[] = [
    {
      hostname: 'PRN-FL3-01', vendor: BRAND.vendors.printer[0], model: 'LaserStream M428',
      ip: '10.20.40.21', mac: '00-1E-8F-3A-61-D4', location: 'Этаж 3, у переговорной 3.10',
      status: 'ready', tonerPct: 64, paper: 'ok', queue: 0,
    },
  ]

  return { segments, switches, routers, servers, printers }
}
