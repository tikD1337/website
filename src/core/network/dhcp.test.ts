import { describe, it, expect } from 'vitest'
import { dhcpServes, acquireLease, autoconfigure } from './dhcp'
import { createWorld } from '../world/world'
import type { WorldState } from '../world/types'

const clock = { now: () => new Date('2026-09-10T08:00:00.000Z') }
const svi = (w: WorldState, vlan: number) =>
  w.network.switches.find(s => s.role === 'core')!.vlanInterfaces.find(v => v.vlan === vlan)!
const adapter = (w: WorldState, host: string) => w.devices[host]!.adapters[0]!
const release = (w: WorldState, host: string) => Object.assign(adapter(w, host), {
  ip: '0.0.0.0', mask: '0.0.0.0', gateway: '', dns: [], leaseObtained: null, leaseExpires: null,
})

/*
  DHCP-сервер стоит в серверном VLAN, и клиенту VLAN 20 он отвечает
  только через ретрансляцию на ядре. Сломанная ретрансляция — это
  сервер, который работает, но запросов не получает.
*/
describe('DHCP', () => {
  it('отвечает VLAN, только когда есть ретрансляция, поднятый интерфейс и живая область', () => {
    const w = createWorld()
    expect(dhcpServes(w, 20)).toBe(true)
    expect(dhcpServes(w, 40)).toBe(false)

    svi(w, 20).helpers = []
    expect(dhcpServes(w, 20)).toBe(false)

    const down = createWorld()
    svi(down, 20).adminUp = false
    expect(dhcpServes(down, 20)).toBe(false)

    const scope = createWorld()
    scope.network.segments.find(s => s.vlanId === 20)!.dhcpHealthy = false
    expect(dhcpServes(scope, 20)).toBe(false)
  })

  /*
    Найдено при проектировании среза 6: renew выдавал любой машине
    первый адрес пула — 10.20.14.88, адрес Priya Raman. Сервер помнит,
    кому что выдал; новая машина получает первый свободный адрес.
  */
  it('аренда — прежняя по MAC, у новой машины — первая свободная, а не чужая', () => {
    const w = createWorld()
    release(w, 'AL-LPT-0447')
    release(w, 'AL-LPT-0788')

    expect(acquireLease(w, 'AL-LPT-0447', clock)).toEqual({ ok: true, ip: '10.20.14.88' })
    expect(acquireLease(w, 'AL-LPT-0788', clock)).toEqual({ ok: true, ip: '10.20.14.93' })

    // Машину сервер не помнит, а её прежний адрес уже записан за другим клиентом.
    const leases = w.network.segments.find(s => s.vlanId === 20)!.leases
    delete leases['F4-39-09-5B-7E-22']
    leases['0C-11-22-33-44-55'] = '10.20.14.93'
    release(w, 'AL-LPT-0788')
    expect(acquireLease(w, 'AL-LPT-0788', clock)).toEqual({ ok: true, ip: '10.20.14.97' })
    expect(adapter(w, 'AL-LPT-0788')).toMatchObject({
      ip: '10.20.14.97', mask: '255.255.255.0', gateway: '10.20.14.1',
      dns: ['10.20.14.10', '10.20.14.11'], autoconfigured: false,
      leaseObtained: '2026-09-10T08:00:00.000Z', leaseExpires: '2026-09-11T08:00:00.000Z',
    })
  })

  it('без DHCP аренды нет, и адаптер не трогается', () => {
    const w = createWorld()
    svi(w, 20).helpers = []
    release(w, 'AL-LPT-0447')
    expect(acquireLease(w, 'AL-LPT-0447', clock)).toEqual({ ok: false })
    expect(adapter(w, 'AL-LPT-0447').ip).toBe('0.0.0.0')
  })

  /* Самоназначенный адрес выводится из MAC: одна машина — один адрес, без случайности. */
  it('самоназначенный адрес выводится из MAC', () => {
    const w = createWorld()
    autoconfigure(w, 'AL-LPT-0788')
    expect(adapter(w, 'AL-LPT-0788')).toMatchObject({
      ip: '169.254.126.34', mask: '255.255.0.0', gateway: '', dns: [],
      autoconfigured: true, leaseObtained: null, leaseExpires: null,
    })
  })
})
