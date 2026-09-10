import { describe, it, expect } from 'vitest'
import { createWorld, cloneWorld, applyInject } from './world'

describe('createWorld', () => {
  it('создаёт машину заявителя со здоровым адресом', () => {
    const w = createWorld()
    const a = w.devices['AL-LPT-0447']!.adapters[0]!
    expect(a.ip).toBe('10.20.14.88')
expect(a.gateway).toBe('10.20.14.1')
    expect(a.autoconfigured).toBe(false)
    expect(a.dns).toEqual(['10.20.14.10', '10.20.14.11'])
  })

  it('сегмент vlan20 здоров по умолчанию', () => {
    const w = createWorld()
    expect(w.network.segments.find(s => s.vlan === 'vlan20')!.dhcpHealthy).toBe(true)
  })

  it('каждая машина принадлежит существующей учётной записи', () => {
    const w = createWorld()
    const logins = new Set(w.org.users.map(u => u.samAccountName))
    for (const d of Object.values(w.devices)) {
      expect(logins.has(d.assignedTo)).toBe(true)
    }
  })

  it('у каждой учётной записи есть существующая основная машина', () => {
    const w = createWorld()
    for (const u of w.org.users) {
      expect(w.devices[u.primaryDevice]).toBeDefined()
    }
  })

  it('адаптеры ссылаются на существующий сегмент сети', () => {
    const w = createWorld()
  const vlans = new Set(w.network.segments.map(s => s.vlan))
    for (const d of Object.values(w.devices)) {
      for (const a of d.adapters) expect(vlans.has(a.segment)).toBe(true)
    }
  })

  it('внутренняя зона содержит запись портала', () => {
    const w = createWorld()
    const primary = w.network.dnsServers[0]!
    expect(primary.zones['internal-portal.arcline.corp']).toBe('10.20.14.50')
  })
})

describe('cloneWorld', () => {
  it('делает глубокую копию — правка копии не трогает оригинал', () => {
  const a = createWorld()
    const b = cloneWorld(a)
    b.devices['AL-LPT-0447']!.adapters[0]!.ip = '1.2.3.4'
    expect(a.devices['AL-LPT-0447']!.adapters[0]!.ip).toBe('10.20.14.88')
  })

  it('копирует вложенные массивы, а не ссылки на них', () => {
    const a = createWorld()
    const b = cloneWorld(a)
    b.devices['AL-LPT-0447']!.adapters[0]!.dns.push('9.9.9.9')
    expect(a.devices['AL-LPT-0447']!.adapters[0]!.dns).toHaveLength(2)
  })
})

describe('applyInject', () => {
  it('ломает адаптер по списку патчей', () => {
    const w = createWorld()
    applyInject(w, [
      { path: 'devices.AL-LPT-0447.adapters[0].ip', value: '169.254.23.11' },
      { path: 'devices.AL-LPT-0447.adapters[0].gateway', value: '' },
      { path: 'devices.AL-LPT-0447.adapters[0].autoconfigured', value: true },
    ])
    const a = w.devices['AL-LPT-0447']!.adapters[0]!
    expect(a.ip).toBe('169.254.23.11')
    expect(a.gateway).toBe('')
    expect(a.autoconfigured).toBe(true)
  })

  it('умеет ломать сегмент сети', () => {
    const w = createWorld()
    applyInject(w, [{ path: 'network.segments[0].dhcpHealthy', value: false }])
    expect(w.network.segments[0]!.dhcpHealthy).toBe(false)
  })

  it('падает на несуществующем пути, а не проглатывает опечатку', () => {
    const w = createWorld()
    expect(() => applyInject(w, [{ path: 'devices.NOPE.adapters[0].ip', value: 'x' }]))
      .toThrow('путь не существует')
  })

  it('не трогает соседнюю машину', () => {
    const w = createWorld()
    applyInject(w, [{ path: 'devices.AL-LPT-0447.adapters[0].ip', value: '169.254.23.11' }])
    expect(w.devices['AL-DSK-0192']!.adapters[0]!.ip).toBe('10.20.14.91')
  })
})
