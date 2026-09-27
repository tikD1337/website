import { describe, it, expect, beforeEach } from 'vitest'
import { ipconfig } from './ipconfig'
import { createWorld, applyInject } from '../../world/world'
import { createSession } from '../../session/session'
import { apipaNoLease } from '../../../scenarios/net-apipa-no-lease'
import type { CommandContext } from '../types'

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
const apipa = () => applyInject(ctx.world, apipaNoLease.inject)
const out = (...lines: string[]) => lines.map(l => l + '\r\n').join('')
const HEAD = ['Windows IP Configuration', '', 'Ethernet adapter Ethernet:', '']
const IDENTITY = [
  '   Connection-specific DNS Suffix  . : corp.arcline.local',
  '   Description . . . . . . . . . . . : Ethernet Adapter',
  '   Physical Address. . . . . . . . . : A4-83-E7-2C-91-44',
  '   DHCP Enabled. . . . . . . . . . . : Yes',
  '   Autoconfiguration Enabled . . . . : Yes',
]

/*
  Метки полей сверены с живой Windows и лежат таблицей в `format.ts`:
  формулы для точек не существует. Пустой шлюз печатается с висящим
  пробелом, строк аренды без аренды нет.
*/
describe('вывод', () => {
  it('/all на самоназначенном адресе', () => {
    apipa()
    expect(ipconfig(['/ALL'], ctx)).toEqual({
      exitCode: 0,
      stdout: out(...HEAD, ...IDENTITY,
        '   Autoconfiguration IPv4 Address. . : 169.254.23.11(Preferred)',
        '   Subnet Mask . . . . . . . . . . . : 255.255.0.0',
        '   Default Gateway . . . . . . . . . : ',
        '   DNS Servers . . . . . . . . . . . : ',
      ),
    })
  })

  it('без ключа — краткая сводка без MAC', () => {
    apipa()
    expect(ipconfig([], ctx).stdout).toBe(out(...HEAD,
      '   Connection-specific DNS Suffix  . : corp.arcline.local',
      '   Autoconfiguration IPv4 Address. . : 169.254.23.11',
      '   Subnet Mask . . . . . . . . . . . : 255.255.0.0',
      '   Default Gateway . . . . . . . . . : ',
    ))
  })

  it('опущенный линк — Media disconnected вместо адреса', () => {
    applyInject(ctx.world, [{ path: 'devices.AL-LPT-0447.adapters[0].linkUp', value: false }])
    expect(ipconfig(['/all'], ctx).stdout).toBe(out(...HEAD,
      '   Media State . . . . . . . . . . . : Media disconnected',
      ...IDENTITY,
    ))
  })

  it('/flushdns и неизвестный ключ', () => {
    expect(ipconfig(['/flushdns'], ctx)).toEqual({
      exitCode: 0,
      stdout: 'Windows IP Configuration\r\n\r\n        Successfully flushed the DNS Resolver Cache.',
    })
    expect(ipconfig(['/wat'], ctx))
      .toEqual({ exitCode: 1, stdout: 'Error: unrecognized or incomplete command line.' })
  })
})

/*
  Развилка сценария APIPA: очевидная команда не работает. Пока адаптер
  удерживает самоназначенный адрес, Windows не отправляет новый запрос —
  renew возвращает таймаут. Освобождение снимает удержание.
*/
describe('аренда', () => {
  it('renew без release падает и ничего не меняет', () => {
    apipa()
    expect(ipconfig(['/renew'], ctx)).toEqual({
      exitCode: 1,
      stdout: out(...HEAD, '   An error occurred while renewing interface Ethernet : '
        + 'unable to contact your DHCP server. Request has timed out.'),
    })
    expect(adapter()).toMatchObject({ ip: '169.254.23.11', autoconfigured: true })
    expect(ctx.session.changes).toHaveLength(0)
  })

  it('release, затем renew — настоящая аренда от текущего времени, с записью в журнал', () => {
    apipa()
    expect(ipconfig(['/release'], ctx))
      .toEqual({ exitCode: 0, stdout: out(...HEAD, '   IP address released.') })
    expect(adapter()).toMatchObject({ ip: '0.0.0.0', autoconfigured: false })

    expect(ipconfig(['/renew'], ctx)).toEqual({
      exitCode: 0,
      stdout: out(...HEAD, '   Renewing IP address...', '   DHCP lease renewed successfully.'),
    })
    expect(ctx.session.changes.map(c => [c.path, c.before, c.after, c.authorized])).toEqual([
      ['devices.AL-LPT-0447.adapters[0].ip', '169.254.23.11', '0.0.0.0', true],
      ['devices.AL-LPT-0447.adapters[0].ip', '0.0.0.0', '10.20.14.88', true],
    ])

    // Дата аренды — по-английски, как у настоящего ipconfig.
    expect(ipconfig(['/all'], ctx).stdout).toBe(out(...HEAD, ...IDENTITY,
      '   IPv4 Address. . . . . . . . . . . : 10.20.14.88(Preferred)',
      '   Subnet Mask . . . . . . . . . . . : 255.255.255.0',
      '   Lease Obtained. . . . . . . . . . : Wednesday, September 9, 2026 6:13:39 PM',
      '   Lease Expires . . . . . . . . . . : Thursday, September 10, 2026 6:13:39 PM',
      '   Default Gateway . . . . . . . . . : 10.20.14.1',
      '   DNS Servers . . . . . . . . . . . : 10.20.14.10',
      '                                       10.20.14.11',
    ))
  })

  it('renew падает и после release, если DHCP сегмента лежит или линк опущен', () => {
    for (const patch of [
      { path: 'network.segments[0].dhcpHealthy', value: false },
      { path: 'devices.AL-LPT-0447.adapters[0].linkUp', value: false },
    ]) {
      ctx.world = createWorld()
      apipa()
      applyInject(ctx.world, [patch])
      ipconfig(['/release'], ctx)
      expect(ipconfig(['/renew'], ctx).exitCode, patch.path).toBe(1)
      expect(adapter().ip, patch.path).toBe('0.0.0.0')
    }
  })
})
