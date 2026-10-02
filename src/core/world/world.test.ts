import { describe, it, expect } from 'vitest'
import { createWorld, applyInject } from './world'
import { linkOf, portOf, segmentOf } from '../network/link'

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

  /*
    Сетевой пакет (8Б): три машины со своими людьми и розетками, чтобы
    сценарии не делили машину с имеющимися. Пул шире машин — иначе
    статический адрес из пула негде было бы взять; списанный контроллер
    есть в мире, но не отвечает.
  */
  it('машины сетевого пакета — в VLAN 20 на своих розетках; пул до .99; списанный DNS молчит', () => {
    const w = createWorld()
    const cases: Array<[string, string, string, string]> = [
      ['AL-LPT-0821', 'k.novak', 'Gi1/0/7', 'DESK-2-14'],
      ['AL-LPT-0833', 'r.alvarez', 'Gi1/0/8', 'DESK-4-07'],
      ['AL-LPT-0846', 'a.osei', 'Gi1/0/9', 'DESK-3-52'],
    ]
    for (const [host, sam, port, desk] of cases) {
      expect(linkOf(w, host), host).toBe(true)
      expect(segmentOf(w, host)?.vlanId, host).toBe(20)
      expect(portOf(w, host)?.port, host).toMatchObject({ name: port, description: desk })
      expect(w.devices[host]!.assignedTo, host).toBe(sam)
      expect(w.org.users.find(u => u.samAccountName === sam)?.office, host).toBe(desk.slice(5))
    }
    expect(w.network.segments.find(s => s.vlanId === 20)!.leasePool.at(-1)).toBe('10.20.14.99')
    expect(w.network.dnsServers.find(d => d.ip === '10.20.14.9')?.reachable).toBe(false)
    for (const d of Object.values(w.devices)) expect(d.adapters[0]!.dnsSource, d.hostname).toBe('dhcp')
    for (const p of w.network.switches.flatMap(sw => sw.ports)) {
      expect([p.errDisabled, p.intruder], p.name).toEqual([null, null])
    }
  })
})

/*
  Учёт оборудования — по нему выбирают замену и решают про гарантию.
  Машина без записи или два актива с одним тегом — это логистика,
  которая отправит не то и не туда.
*/
describe('стартовый учёт', () => {
  it('CMDB: у каждой машины есть актив, теги не повторяются, склад на месте', () => {
    const w = createWorld()
    for (const [host, d] of Object.entries(w.devices)) {
      expect(w.cmdb.find(a => a.hostname === host)?.tag, host).toBe(d.assetTag)
    }
    const tags = w.cmdb.map(a => a.tag)
    expect(new Set(tags).size).toBe(tags.length)
    expect(w.cmdb.filter(a => a.lifecycle === 'in-stock').map(a => a.tag)).toEqual([
      'AL-P2040', 'AL-P2041', 'AL-P2110', 'AL-P3030', 'AL-P3031', 'AL-P3032',
      'AL-P5001', 'AL-L9001', 'AL-L9002', 'AL-L9003',
    ])
    expect(w.cmdb.find(a => a.tag === 'AL-P2031')).toEqual({
      tag: 'AL-P2031', kind: 'dock', vendor: 'Halyard', model: 'D6000 USB-C Dock', serial: 'HA2031K7',
      owner: 'e.varga', lifecycle: 'in-use', location: 'Стол 3-20',
      purchased: '2025-03-10', warrantyUntil: '2027-03-10',
      hostname: '', attachedTo: 'AL-LPT-0512', condition: 'ok', note: '',
    })
    // Журнал логистики не пуст со старта: прошлые утилизация и входящая поставка.
    expect(w.shipments.map(s => [s.id, s.type, s.assetTag, s.history.at(-1)!.stage])).toEqual([
      ['SHP-1039', 'disposal', 'AL-L0301', 'Утилизировано'],
      ['SHP-1040', 'inbound', 'AL-L9003', 'Принято складом'],
    ])
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
