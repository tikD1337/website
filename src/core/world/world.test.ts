import { describe, it, expect } from 'vitest'
import { createWorld, applyInject } from './world'

describe('стартовый мир', () => {
  it('сеть исправна и связна: адреса, сегменты, владельцы, внутренняя зона', () => {
    const w = createWorld()
    expect(w.devices['AL-LPT-0447']!.adapters[0]).toMatchObject({
      ip: '10.20.14.88',
      gateway: '10.20.14.1',
      dns: ['10.20.14.10', '10.20.14.11'],
      autoconfigured: false,
      linkUp: true,
    })
    expect(w.network.segments.find(s => s.vlan === 'vlan20')!.dhcpHealthy).toBe(true)
    expect(w.network.dnsServers[0]!.zones['internal-portal.arcline.corp']).toBe('10.20.14.50')

    const logins = new Set(w.org.users.map(u => u.samAccountName))
    for (const d of Object.values(w.devices)) expect(logins.has(d.assignedTo), d.hostname).toBe(true)
  })

  /*
    Инварианты машин. Сценарий ломает одно поле исправной машины, и
    поломка заметна только на правдоподобном фоне: служба без
    зависимости, журнал вразнобой или диск с отрицательным местом
    сделали бы диагностику враньём ещё до поломки.
  */
  it('машины правдоподобны: службы, журнал, процессы, драйверы, диски', () => {
    for (const d of Object.values(createWorld().devices)) {
      const host = d.hostname
      const services = new Set(d.services.map(s => s.name))

      expect(services.size, host).toBe(d.services.length)
      for (const name of ['Spooler', 'Dnscache', 'Dhcp']) expect(services.has(name), host).toBe(true)
      for (const s of d.services) {
        expect(s.displayName.length, `${host} ${s.name}`).toBeGreaterThan(3)
        for (const dep of s.dependsOn) expect(services.has(dep), `${s.name} → ${dep}`).toBe(true)
      }
      expect(d.services.find(s => s.name === 'WinDefend')?.protected, host).toBe(true)
      expect(d.services.find(s => s.name === 'Spooler')?.protected, host).toBe(false)

      const times = d.eventLog.map(e => e.at)
      expect([...times].sort(), host).toEqual(times)
      expect(new Set(d.eventLog.map(e => e.log)), host).toEqual(new Set(['System', 'Application']))
      for (const e of d.eventLog) {
        expect(e.eventId, host).toBeGreaterThan(0)
        expect(e.message.length, host).toBeGreaterThan(10)
      }

      expect(new Set(d.processes.map(p => p.pid)).size, host).toBe(d.processes.length)
      for (const drv of d.drivers.filter(x => x.status === 'ok')) {
        expect(drv.problemCode, `${host} ${drv.device}`).toBeNull()
      }
      for (const disk of d.disks) {
        expect(disk.freeGb, host).toBeGreaterThanOrEqual(0)
        expect(disk.freeGb, host).toBeLessThanOrEqual(disk.totalGb)
      }
    }
  })
})

/*
  Инварианты сети. Линк и VLAN выводятся из порта, поэтому машина без
  порта или порт в несуществующем VLAN — это машина, которая молча
  выпала из сети ещё до всякой поломки.
*/
describe('стартовая сеть', () => {
  it('каждая машина воткнута ровно в один порт, каждый VLAN порта существует', () => {
    const w = createWorld()
    const ports = w.network.switches.flatMap(sw => sw.ports.map(p => ({ sw, p })))
    for (const host of Object.keys(w.devices)) {
      expect(ports.filter(x => x.p.connectedTo === host).length, host).toBe(1)
    }
    const segments = new Set(w.network.segments.map(s => s.vlanId))
    for (const { sw, p } of ports.filter(x => x.p.mode === 'access')) {
      expect(sw.vlans.map(v => v.id), `${sw.hostname} ${p.name}`).toContain(p.accessVlan)
      expect(segments.has(p.accessVlan), `${sw.hostname} ${p.name}`).toBe(true)
      expect(p.saved, `${sw.hostname} ${p.name}`)
        .toEqual({ accessVlan: p.accessVlan, adminUp: p.adminUp, description: p.description })
    }
  })

  it('адреса машин, серверов и принтера уникальны; ретрансляция ядра ведёт на DHCP01', () => {
    const w = createWorld()
    const ips = [
      ...Object.values(w.devices).map(d => d.adapters[0]!.ip),
      ...w.network.servers.map(s => s.ip),
      ...w.network.printers.map(p => p.ip),
    ]
    expect(new Set(ips).size).toBe(ips.length)

    const core = w.network.switches.find(s => s.role === 'core')!
    const dhcp = w.network.servers.find(s => s.hostname === 'DHCP01')!
    expect(core.vlanInterfaces.find(v => v.vlan === 20)!.helpers).toEqual([dhcp.ip])
    expect(w.network.segments.find(s => s.vlanId === 20)!.dhcpServer).toBe(dhcp.ip)
  })
})

describe('инъекция поломки', () => {
  it('ломает мир по списку путей, не задевая соседей, и падает на опечатке', () => {
    const w = createWorld()
    applyInject(w, [
      { path: 'devices.AL-LPT-0447.adapters[0].ip', value: '169.254.23.11' },
      { path: 'devices.AL-LPT-0447.adapters[0].gateway', value: '' },
      { path: 'network.segments[vlan=vlan20].dhcpHealthy', value: false },
    ])
    expect(w.devices['AL-LPT-0447']!.adapters[0]).toMatchObject({ ip: '169.254.23.11', gateway: '' })
    expect(w.network.segments.find(s => s.vlan === 'vlan20')!.dhcpHealthy).toBe(false)
    expect(w.devices['AL-DSK-0192']!.adapters[0]!.ip).toBe('10.20.14.91')

    expect(() => applyInject(w, [{ path: 'devices.NOPE.adapters[0].ip', value: 'x' }]))
      .toThrow('путь не существует')
  })

  /*
    Инъекция копирует значение, а не присваивает по ссылке. Найдено
    сквозным тестом: сценарий — модульная константа, и массив из его
    `inject` попадал в мир той же ссылкой. Первая же операция,
    добавляющая группу, мутировала литерал внутри сценария — и следующий
    запуск получал мир, загрязнённый предыдущим прохождением.
  */
  it('копирует значения, а не делит ссылку со сценарием', () => {
    const patches = [
      { path: 'org.users[samAccountName=p.raman].groups', value: ['GRP-A'] },
      {
        path: 'devices.AL-LPT-0447.eventLog',
        value: [{ at: 'x', log: 'System', level: 'error', source: 's', eventId: 1, message: 'm' }],
      },
    ]
    const first = createWorld()
    applyInject(first, patches)
    first.org.users.find(u => u.samAccountName === 'p.raman')!.groups.push('GRP-Загрязнение')
    first.devices['AL-LPT-0447']!.eventLog[0]!.message = 'изменено'

    const second = createWorld()
    applyInject(second, patches)
    expect(second.org.users.find(u => u.samAccountName === 'p.raman')!.groups).toEqual(['GRP-A'])
    expect(second.devices['AL-LPT-0447']!.eventLog[0]!.message).toBe('m')
  })
})
