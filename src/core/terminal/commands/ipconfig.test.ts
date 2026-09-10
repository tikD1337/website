import { describe, it, expect, beforeEach } from 'vitest'
import { ipconfig } from './ipconfig'
import { createWorld, applyInject } from '../../world/world'
import { createSession } from '../../session/session'
import type { CommandContext } from '../types'

/** Патч, приводящий машину в состояние APIPA — то же, что в сценарии. */
const BROKEN = [
  { path: 'devices.AL-LPT-0447.adapters[0].ip', value: '169.254.23.11' },
  { path: 'devices.AL-LPT-0447.adapters[0].mask', value: '255.255.0.0' },
  { path: 'devices.AL-LPT-0447.adapters[0].gateway', value: '' },
  { path: 'devices.AL-LPT-0447.adapters[0].dns', value: [] },
  { path: 'devices.AL-LPT-0447.adapters[0].autoconfigured', value: true },
  { path: 'devices.AL-LPT-0447.adapters[0].leaseObtained', value: null },
  { path: 'devices.AL-LPT-0447.adapters[0].leaseExpires', value: null },
]

let ctx: CommandContext

beforeEach(() => {
  ctx = {
    world: createWorld(),
    session: createSession(),
    clock: { now: () => new Date('2026-09-09T18:13:39.000Z') },
    device: 'AL-LPT-0447',
  }
})

const adapter = () => ctx.world.devices['AL-LPT-0447']!.adapters[0]!
const broken = () => applyInject(ctx.world, BROKEN)

describe('ipconfig /all в сломанном состоянии', () => {
  beforeEach(broken)

  it('печатает самоназначенный адрес', () => {
    expect(ipconfig(['/all'], ctx).stdout)
      .toContain('   Autoconfiguration IPv4 Address. . : 169.254.23.11(Preferred)')
  })

  it('печатает пустой шлюз с висящим пробелом', () => {
    expect(ipconfig(['/all'], ctx).stdout)
      .toContain('   Default Gateway . . . . . . . . . : \r\n')
  })

  it('не печатает строк аренды, когда аренды нет', () => {
    const out = ipconfig(['/all'], ctx).stdout
    expect(out).not.toContain('Lease Obtained')
    expect(out).not.toContain('Lease Expires')
  })

  it('начинается с шапки и заголовка адаптера', () => {
    const out = ipconfig(['/all'], ctx).stdout
    expect(out.startsWith('Windows IP Configuration')).toBe(true)
    expect(out).toContain('Ethernet adapter Ethernet:')
  })

  it('печатает маску, MAC и признак DHCP', () => {
    const out = ipconfig(['/all'], ctx).stdout
    expect(out).toContain('   Subnet Mask . . . . . . . . . . . : 255.255.0.0')
    expect(out).toContain('   Physical Address. . . . . . . . . : A4-83-E7-2C-91-44')
    expect(out).toContain('   DHCP Enabled. . . . . . . . . . . : Yes')
  })
})

describe('ipconfig /renew без предварительного release', () => {
  beforeEach(broken)

  it('падает с ошибкой обращения к DHCP', () => {
    const res = ipconfig(['/renew'], ctx)
    expect(res.stdout).toContain(
      'An error occurred while renewing interface Ethernet : '
      + 'unable to contact your DHCP server. Request has timed out.')
    expect(res.exitCode).toBe(1)
  })

  it('не меняет адрес', () => {
    ipconfig(['/renew'], ctx)
    expect(adapter().ip).toBe('169.254.23.11')
    expect(adapter().autoconfigured).toBe(true)
  })

  it('не пишет изменение в журнал, раз ничего не изменилось', () => {
    ipconfig(['/renew'], ctx)
    expect(ctx.session.changes).toHaveLength(0)
  })
})

describe('release затем renew', () => {
  beforeEach(broken)

  it('release снимает адрес и сообщает об этом', () => {
    const res = ipconfig(['/release'], ctx)
    expect(res.stdout).toContain('   IP address released.')
    expect(res.exitCode).toBe(0)
    expect(adapter().ip).toBe('0.0.0.0')
    expect(adapter().autoconfigured).toBe(false)
  })

  it('renew после release выдаёт настоящую аренду', () => {
    ipconfig(['/release'], ctx)
    const res = ipconfig(['/renew'], ctx)
    expect(res.stdout).toContain('   DHCP lease renewed successfully.')
    expect(res.exitCode).toBe(0)

    const a = adapter()
    expect(a.ip).toBe('10.20.14.88')
    expect(a.mask).toBe('255.255.255.0')
    expect(a.gateway).toBe('10.20.14.1')
    expect(a.dns).toEqual(['10.20.14.10', '10.20.14.11'])
    expect(a.autoconfigured).toBe(false)
  })

  it('выставляет сроки аренды от текущего времени', () => {
    ipconfig(['/release'], ctx)
    ipconfig(['/renew'], ctx)
    expect(adapter().leaseObtained).toBe('2026-09-09T18:13:39.000Z')
    expect(adapter().leaseExpires).toBe('2026-09-10T18:13:39.000Z')
  })

  it('после починки /all печатает обычный IPv4 и аренду', () => {
    ipconfig(['/release'], ctx)
    ipconfig(['/renew'], ctx)
    const out = ipconfig(['/all'], ctx).stdout

    expect(out).toContain('   IPv4 Address. . . . . . . . . . . : 10.20.14.88(Preferred)')
    expect(out).not.toContain('Autoconfiguration IPv4 Address')
    expect(out).toContain('   Lease Obtained. . . . . . . . . . : ')
    expect(out).toContain('   DNS Servers . . . . . . . . . . . : 10.20.14.10')
    expect(out).toContain('                                       10.20.14.11')
  })

  it('печатает дату аренды по-английски, как настоящий ipconfig', () => {
    ipconfig(['/release'], ctx)
    ipconfig(['/renew'], ctx)
    expect(ipconfig(['/all'], ctx).stdout)
      .toContain('Wednesday, September 9, 2026 6:13:39 PM')
  })

  it('пишет изменение адреса в журнал сессии', () => {
    ipconfig(['/release'], ctx)
    ipconfig(['/renew'], ctx)
    const change = ctx.session.changes.find(
      c => c.path.endsWith('adapters[0].ip') && c.after === '10.20.14.88')
    expect(change).toBeDefined()
    expect(change!.authorized).toBe(true)
    expect(change!.before).toBe('0.0.0.0')
  })
})

describe('renew при неисправном сегменте', () => {
  it('падает даже после release, если DHCP на сегменте лежит', () => {
    applyInject(ctx.world, [
      ...BROKEN,
      { path: 'network.segments[0].dhcpHealthy', value: false },
    ])
    ipconfig(['/release'], ctx)
    const res = ipconfig(['/renew'], ctx)
    expect(res.exitCode).toBe(1)
    expect(adapter().ip).toBe('0.0.0.0')
  })

  it('падает при опущенном линке', () => {
    applyInject(ctx.world, [
      ...BROKEN,
      { path: 'devices.AL-LPT-0447.adapters[0].linkUp', value: false },
    ])
    ipconfig(['/release'], ctx)
    expect(ipconfig(['/renew'], ctx).exitCode).toBe(1)
  })
})

describe('прочие ключи', () => {
  it('/flushdns отвечает как Windows', () => {
    const res = ipconfig(['/flushdns'], ctx)
    expect(res.stdout).toContain('Successfully flushed the DNS Resolver Cache.')
    expect(res.exitCode).toBe(0)
  })

  it('без ключа печатает краткую сводку без MAC', () => {
    broken()
    const out = ipconfig([], ctx).stdout
    expect(out).toContain('Autoconfiguration IPv4 Address')
    expect(out).not.toContain('Physical Address')
  })

  it('неизвестный ключ даёт ошибку', () => {
    const res = ipconfig(['/wat'], ctx)
    expect(res.exitCode).toBe(1)
    expect(res.stdout).toContain('unrecognized or incomplete command line')
  })

  it('ключ распознаётся независимо от регистра', () => {
    broken()
    expect(ipconfig(['/ALL'], ctx).stdout).toContain('Ethernet adapter Ethernet:')
  })

  it('опущенный линк показывает Media disconnected вместо адреса', () => {
    applyInject(ctx.world, [
      { path: 'devices.AL-LPT-0447.adapters[0].linkUp', value: false },
    ])
    const out = ipconfig(['/all'], ctx).stdout
    expect(out).toContain('   Media State . . . . . . . . . . . : Media disconnected')
    expect(out).not.toContain('IPv4 Address')
  })
})
