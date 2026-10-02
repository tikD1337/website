import { describe, it, expect, beforeEach } from 'vitest'
import { setDnsDhcp, setDnsStatic, setAddressDhcp, setAddressStatic } from './adapter'
import { ipconfig } from '../terminal/commands/ipconfig'
import { createWorld } from '../world/world'
import { createSession } from '../session/session'
import { findPort } from '../infra/switchops'
import type { CommandContext } from '../terminal/types'

const HOST = 'AL-LPT-0821'
const clock = { now: () => new Date('2026-10-02T09:00:00.000Z') }

let ctx: CommandContext

beforeEach(() => {
  ctx = { world: createWorld(), session: createSession(), clock, device: HOST }
})

const adapter = () => ctx.world.devices[HOST]!.adapters[0]!
const out = (...lines: string[]) => lines.map(l => l + '\r\n').join('')
const changes = () => ctx.session.changes.map(c => [c.path.replace(`devices.${HOST}.adapters[0].`, ''), c.before, c.after])

describe('адаптер', () => {
  /*
    В Windows адрес бывает по DHCP, а DNS — ручным. Продление аренды
    меняет адрес, шлюз и срок, но DNS не трогает: иначе сценарий со
    списанным DNS решался бы `release` + `renew`, а не решается.
  */
  it('release и renew при ручном DNS меняют адрес, но не DNS', () => {
    setDnsStatic(ctx.world, HOST, ['10.20.14.9'], ctx.session, clock)
    ipconfig(['/release'], ctx)
    expect(adapter()).toMatchObject({ ip: '0.0.0.0', dns: ['10.20.14.9'] })
    expect(ipconfig(['/renew'], ctx).exitCode).toBe(0)
    expect(adapter()).toMatchObject({
      ip: '10.20.14.94', gateway: '10.20.14.1', dns: ['10.20.14.9'], dnsSource: 'static',
      leaseObtained: '2026-10-02T09:00:00.000Z',
    })
  })

  it('ipconfig /renew и /release на статическом адаптере — отказ, адаптер не тронут', () => {
    setAddressStatic(ctx.world, HOST, '10.20.14.97', '255.255.255.0', '10.20.14.254', ctx.session, clock)
    const before = structuredClone(adapter())
    for (const flag of ['/renew', '/release']) {
      expect(ipconfig([flag], ctx), flag).toEqual({
        exitCode: 1,
        stdout: out(
          'Windows IP Configuration',
          '',
          'The operation failed as no adapter is in the state permissible for',
          'this operation.',
        ),
      })
    }
    expect(adapter()).toEqual(before)
  })

  it('каждая операция меняет мир и пишет изменение в журнал', () => {
    setDnsStatic(ctx.world, HOST, ['8.8.8.8'], ctx.session, clock)
    expect(adapter()).toMatchObject({ dnsSource: 'static', dns: ['8.8.8.8'] })
    setDnsDhcp(ctx.world, HOST, ctx.session, clock)
    expect(adapter()).toMatchObject({ dnsSource: 'dhcp', dns: ['10.20.14.10', '10.20.14.11'] })

    expect(setAddressStatic(ctx.world, HOST, '10.20.14.97', '255.255.255.0', '10.20.14.254', ctx.session, clock))
      .toEqual({ ok: true })
    expect(adapter()).toMatchObject({
      dhcpEnabled: false, autoconfigured: false, ip: '10.20.14.97', mask: '255.255.255.0',
      gateway: '10.20.14.254', leaseObtained: null, leaseExpires: null,
    })
    expect(setAddressDhcp(ctx.world, HOST, ctx.session, clock)).toEqual({ ok: true })
    expect(adapter()).toMatchObject({ dhcpEnabled: true, ip: '10.20.14.94', gateway: '10.20.14.1' })
    expect(setAddressDhcp(ctx.world, HOST, ctx.session, clock)).toEqual({ ok: true, alreadyInState: true })

    expect(changes()).toEqual([
      ['dns', '10.20.14.10, 10.20.14.11', '8.8.8.8'],
      ['dns', '8.8.8.8', '10.20.14.10, 10.20.14.11'],
      ['dhcpEnabled', true, false],
      ['ip', '10.20.14.94', '10.20.14.97'],
      ['dhcpEnabled', false, true],
      ['ip', '10.20.14.97', '10.20.14.94'],
    ])
  })

  /*
    В VLAN принтеров DHCP нет. Вернуть адаптер на DHCP там — то же, что
    `renew`: машина остаётся на самоназначенном адресе, а не получает
    адрес из ниоткуда. Ручной DNS при этом переживает и самоназначение.
  */
  it('set address dhcp в VLAN без DHCP — самоназначенный адрес, ручной DNS на месте', () => {
    setDnsStatic(ctx.world, HOST, ['10.20.14.10'], ctx.session, clock)
    setAddressStatic(ctx.world, HOST, '10.20.14.97', '255.255.255.0', '10.20.14.1', ctx.session, clock)
    findPort(ctx.world, 'SW-FL3-01', 'Gi1/0/7')!.accessVlan = 40
    setAddressDhcp(ctx.world, HOST, ctx.session, clock)
    expect(adapter()).toMatchObject({
      dhcpEnabled: true, autoconfigured: true, ip: '169.254.106.14', gateway: '', dns: ['10.20.14.10'],
    })
  })
})
