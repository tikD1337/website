import { BRAND } from '../../brand'
import { DOMAIN, seedOus, seedGroups, seedUsers, seedShares } from './seed-directory'
import type {
  WorldState, Service, EventEntry, DeviceProcess, Driver, Disk, Adapter,
} from './types'

/**
 * Стартовый, ещё не сломанный мир.
 *
 * Сценарий не описывает мир целиком — он патчит этот. Поэтому здесь всё
 * исправно: адреса выданы, службы запущены, диски здоровы. Задача seed —
 * дать связную организацию, в которой поломка выглядит правдоподобно,
 * а исправное окружение не мешает её заметить.
 *
 * Имена служб настоящие, отображаемые — англоязычные, потому что вывод
 * команд у нас английский.
 */

function baseServices(): Service[] {
  return [
    {
      name: 'RpcSs',
      displayName: 'Remote Procedure Call (RPC)',
      status: 'running',
      startType: 'auto',
      protected: true,
      dependsOn: [],
    },
    {
      name: 'EventLog',
      displayName: 'Windows Event Log',
      status: 'running',
      startType: 'auto',
      protected: true,
      dependsOn: [],
    },
    {
      name: 'MpsSvc',
      displayName: 'Windows Defender Firewall',
      status: 'running',
      startType: 'auto',
      protected: true,
      dependsOn: ['RpcSs'],
    },
    {
      name: 'WinDefend',
      displayName: 'Microsoft Defender Antivirus Service',
      status: 'running',
      startType: 'auto',
      protected: true,
      dependsOn: ['RpcSs'],
    },
    {
      name: 'Dhcp',
      displayName: 'DHCP Client',
      status: 'running',
      startType: 'auto',
      protected: false,
      dependsOn: ['RpcSs'],
    },
    {
      name: 'Dnscache',
      displayName: 'DNS Client',
      status: 'running',
      startType: 'auto',
      protected: false,
      dependsOn: [],
    },
    {
      name: 'Spooler',
      displayName: 'Print Spooler',
      status: 'running',
      startType: 'auto',
      protected: false,
      dependsOn: ['RpcSs'],
    },
    {
      name: 'LanmanWorkstation',
      displayName: 'Workstation',
      status: 'running',
      startType: 'auto',
      protected: false,
      dependsOn: [],
    },
    {
      name: 'BITS',
      displayName: 'Background Intelligent Transfer Service',
      status: 'stopped',
      startType: 'manual',
      protected: false,
      dependsOn: ['RpcSs'],
    },
    {
      name: 'wuauserv',
      displayName: 'Windows Update',
      status: 'stopped',
      startType: 'manual',
      protected: false,
      dependsOn: ['RpcSs'],
    },
    {
      name: 'W32Time',
      displayName: 'Windows Time',
      status: 'running',
      startType: 'auto',
      protected: false,
      dependsOn: [],
    },
    {
      name: 'Audiosrv',
      displayName: 'Windows Audio',
      status: 'running',
      startType: 'auto',
      protected: false,
      dependsOn: ['RpcSs'],
    },
  ]
}

function baseEventLog(): EventEntry[] {
  return [
    {
      at: '2026-09-09T05:41:12.000Z',
      log: 'System',
      level: 'information',
      source: 'Kernel-General',
      eventId: 12,
      message: 'The operating system started at system time 2026-09-09T05:41:12Z.',
    },
    {
      at: '2026-09-09T05:41:29.000Z',
      log: 'System',
      level: 'information',
      source: 'Service Control Manager',
      eventId: 7036,
      message: 'The Print Spooler service entered the running state.',
    },
    {
      at: '2026-09-09T05:42:03.000Z',
      log: 'Application',
      level: 'information',
      source: 'WorkGrid',
      eventId: 1000,
      message: 'WorkGrid 365 sign-in completed for the current user.',
    },
    {
      at: '2026-09-09T07:15:44.000Z',
      log: 'System',
      level: 'warning',
      source: 'Time-Service',
      eventId: 134,
      message:
        'NtpClient was unable to set a domain peer to use as a time source '
        + 'because of a discovery error. The service will retry.',
    },
    {
      at: '2026-09-09T09:00:02.000Z',
      log: 'System',
      level: 'information',
      source: 'Dhcp-Client',
      eventId: 50037,
      message: 'The IP address lease was successfully renewed for adapter Ethernet.',
    },
    {
      at: '2026-09-09T11:22:18.000Z',
      log: 'Application',
      level: 'information',
      source: 'Larkspur',
      eventId: 2,
      message: 'Larkspur Browser updated to build 128.4.2 and restarted.',
    },
  ]
}

function baseProcesses(): DeviceProcess[] {
  return [
    { pid: 4, name: 'System', cpu: 0.2, memMb: 24 },
    { pid: 812, name: 'svchost.exe', cpu: 0.4, memMb: 96 },
    { pid: 1204, name: 'explorer.exe', cpu: 1.1, memMb: 148 },
    { pid: 2440, name: 'larkspur.exe', cpu: 6.3, memMb: 812 },
    { pid: 2988, name: 'workgrid.exe', cpu: 2.0, memMb: 430 },
    { pid: 3312, name: 'spoolsv.exe', cpu: 0.1, memMb: 38 },
    { pid: 4108, name: 'arcmail.exe', cpu: 1.4, memMb: 356 },
  ]
}

function baseDrivers(vendor: string): Driver[] {
  return [
    {
      device: 'Ethernet Adapter',
      provider: vendor,
      version: '12.19.2.30',
      status: 'ok',
      problemCode: null,
      problemText: null,
    },
    {
      device: 'Display Adapter',
      provider: 'Vantage',
      version: '31.0.101.5186',
      status: 'ok',
      problemCode: null,
      problemText: null,
    },
    {
      device: 'Audio Device',
      provider: 'Vantage',
      version: '10.0.22631.1',
      status: 'ok',
      problemCode: null,
      problemText: null,
    },
  ]
}

function baseDisks(totalGb: number, freeGb: number): Disk[] {
  return [
    { letter: 'C', label: 'System', totalGb, freeGb, health: 'healthy' },
  ]
}

function ethernet(mac: string, ip: string): Adapter {
  return {
    name: 'Ethernet',
    description: 'Ethernet Adapter',
    mac,
    dhcpEnabled: true,
    autoconfigEnabled: true,
    autoconfigured: false,
    ip,
    mask: '255.255.255.0',
    gateway: '10.20.14.1',
    dns: ['10.20.14.10', '10.20.14.11'],
    leaseObtained: '2026-09-09T09:00:00.000Z',
    leaseExpires: '2026-09-10T09:00:00.000Z',
    linkUp: true,
    segment: 'vlan20',
  }
}

export function seedWorld(): WorldState {
  return {
    org: {
      domain: DOMAIN,
      ous: seedOus(),
      groups: seedGroups(),
      users: seedUsers(),
      shares: seedShares(),
    },

    devices: {
      'AL-LPT-0447': {
        hostname: 'AL-LPT-0447',
        assetTag: 'AL-L0447',
        vendor: 'Torvald',
        model: 'WorkLine T14 Gen 4',
        assignedTo: 'p.raman',
        adapters: [ethernet('A4-83-E7-2C-91-44', '10.20.14.88')],
        services: baseServices(),
        processes: baseProcesses(),
        eventLog: baseEventLog(),
        drivers: baseDrivers('Torvald'),
        disks: baseDisks(476, 212),
      },

      'AL-LPT-0512': {
        hostname: 'AL-LPT-0512',
        assetTag: 'AL-L0512',
        vendor: 'Torvald',
        model: 'WorkLine X1 Gen 12',
        assignedTo: 'e.varga',
        adapters: [ethernet('C6-2A-9F-11-58-D3', '10.20.14.89')],
        services: baseServices(),
        processes: baseProcesses(),
        eventLog: baseEventLog(),
        drivers: baseDrivers('Torvald'),
        disks: baseDisks(476, 301),
      },

      'AL-LPT-0601': {
        hostname: 'AL-LPT-0601',
        assetTag: 'AL-L0601',
        vendor: 'Kestrel',
        model: 'Meridian 5450',
        assignedTo: 'd.mbeki',
        adapters: [ethernet('D8-4F-1C-63-20-7A', '10.20.14.90')],
        services: baseServices(),
        processes: baseProcesses(),
        eventLog: baseEventLog(),
        drivers: baseDrivers('Kestrel'),
        disks: baseDisks(476, 388),
      },

      'AL-LPT-0714': {
        hostname: 'AL-LPT-0714',
        assetTag: 'AL-L0714',
        vendor: 'Novatek',
        model: 'Corvus 14',
        assignedTo: 'n.haruna',
        adapters: [ethernet('E0-7B-35-4A-1D-62', '10.20.14.92')],
        services: baseServices(),
        processes: baseProcesses(),
        eventLog: baseEventLog(),
        drivers: baseDrivers('Novatek'),
        disks: baseDisks(476, 431),
      },

      'AL-DSK-0192': {
        hostname: 'AL-DSK-0192',
        assetTag: 'AL-D0192',
        vendor: 'Novatek',
        model: 'OptiLine 7010',
        assignedTo: 's.okafor',
        adapters: [ethernet('B2-1E-4C-77-03-A9', '10.20.14.91')],
        services: baseServices(),
        processes: baseProcesses(),
        eventLog: baseEventLog(),
        drivers: baseDrivers('Novatek'),
        disks: baseDisks(952, 640),
      },
    },

    network: {
      segments: [
        {
          vlan: 'vlan20',
          subnet: '10.20.14.0/24',
          gateway: '10.20.14.1',
          dhcpServer: '10.20.14.5',
          dhcpHealthy: true,
          // Пул шире числа машин: иначе renew на второй машине выдал бы
          // адрес, уже занятый первой, и получился бы конфликт из ничего.
          leasePool: [
            '10.20.14.88', '10.20.14.89', '10.20.14.90', '10.20.14.91',
            '10.20.14.92', '10.20.14.93',
          ],
          dns: ['10.20.14.10', '10.20.14.11'],
        },
      ],

      dnsServers: [
        {
          ip: '10.20.14.10',
          reachable: true,
          zones: {
            [`internal-portal.${BRAND.domain}`]: '10.20.14.50',
            [`fileserver.${BRAND.domain}`]: '10.20.14.15',
            [`mail.${BRAND.domain}`]: '10.20.14.25',
          },
        },
        { ip: '10.20.14.11', reachable: true, zones: {} },
      ],

      publicHosts: ['8.8.8.8', '1.1.1.1'],
    },
  }
}
