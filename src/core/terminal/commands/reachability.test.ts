import { describe, it, expect, beforeEach } from 'vitest'
import { ping } from './ping'
import { nslookup } from './nslookup'
import { createWorld, applyInject } from '../../world/world'
import { createSession } from '../../session/session'
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

/** Приводит машину в состояние APIPA: адрес есть, маршрута нет. */
const breakAddressing = () => applyInject(ctx.world, [
  { path: 'devices.AL-LPT-0447.adapters[0].ip', value: '169.254.23.11' },
  { path: 'devices.AL-LPT-0447.adapters[0].gateway', value: '' },
  { path: 'devices.AL-LPT-0447.adapters[0].dns', value: [] },
  { path: 'devices.AL-LPT-0447.adapters[0].autoconfigured', value: true },
])

describe('ping при рабочей адресации', () => {
  it('отвечает четырьмя пакетами и статистикой', () => {
    const res = ping(['8.8.8.8'], ctx)
    expect(res.exitCode).toBe(0)
    expect(res.stdout).toContain('Pinging 8.8.8.8 with 32 bytes of data:')
    expect(res.stdout.match(/Reply from 8\.8\.8\.8/g)).toHaveLength(4)
    expect(res.stdout).toContain('Packets: Sent = 4, Received = 4, Lost = 0 (0% loss),')
  })

  it('печатает сводку по времени отклика', () => {
    expect(ping(['8.8.8.8'], ctx).stdout)
      .toContain('Approximate round trip times in milli-seconds:')
  })

  it('пингует шлюз своего сегмента', () => {
    expect(ping(['10.20.14.1'], ctx).exitCode).toBe(0)
  })

  it('пингует соседнюю машину в своей подсети', () => {
    expect(ping(['10.20.14.91'], ctx).exitCode).toBe(0)
  })

  it('чужой публичный адрес недостижим — отвечают только известные', () => {
    expect(ping(['203.0.113.7'], ctx).exitCode).toBe(1)
  })
})

describe('ping без шлюза', () => {
  beforeEach(breakAddressing)

  it('до публичного адреса — четыре таймаута', () => {
    const res = ping(['8.8.8.8'], ctx)
    expect(res.exitCode).toBe(1)
    expect(res.stdout.match(/Request timed out\./g)).toHaveLength(4)
    expect(res.stdout).toContain('Lost = 4 (100% loss)')
  })

  it('до шлюза тоже не проходит, раз шлюза нет', () => {
    expect(ping(['10.20.14.1'], ctx).exitCode).toBe(1)
  })
})

describe('ping при опущенном линке', () => {
  it('не проходит никуда', () => {
    applyInject(ctx.world, [
      { path: 'devices.AL-LPT-0447.adapters[0].linkUp', value: false },
    ])
    expect(ping(['8.8.8.8'], ctx).exitCode).toBe(1)
  })
})

describe('ping без аргументов', () => {
  it('печатает подсказку по использованию', () => {
    const res = ping([], ctx)
    expect(res.exitCode).toBe(1)
    expect(res.stdout).toContain('Usage: ping')
  })
})

describe('nslookup', () => {
  it('резолвит внутреннее имя через первый DNS адаптера', () => {
    const res = nslookup(['internal-portal.arcline.corp'], ctx)
    expect(res.exitCode).toBe(0)
    expect(res.stdout).toContain('Server:  10.20.14.10')
    expect(res.stdout).toContain('Address:  10.20.14.10')
    expect(res.stdout).toContain('Name:    internal-portal.arcline.corp')
    expect(res.stdout).toContain('Address:  10.20.14.50')
  })

  it('не зависит от регистра запрошенного имени', () => {
    expect(nslookup(['Internal-Portal.ARCLINE.corp'], ctx).exitCode).toBe(0)
  })

  it('без DNS-серверов сообщает, что резолвер недоступен', () => {
    breakAddressing()
    const res = nslookup(['internal-portal.arcline.corp'], ctx)
    expect(res.exitCode).toBe(1)
    expect(res.stdout).toContain("Can't find server name for address")
    expect(res.stdout).toContain('Default servers are not available')
  })

  it('неизвестное имя даёт несуществующий домен', () => {
    const res = nslookup(['nope.arcline.corp'], ctx)
    expect(res.exitCode).toBe(1)
    expect(res.stdout)
      .toContain("*** 10.20.14.10 can't find nope.arcline.corp: Non-existent domain")
  })

  it('недостижимый DNS-сервер тоже не резолвит', () => {
    applyInject(ctx.world, [
      { path: 'network.dnsServers[0].reachable', value: false },
    ])
    expect(nslookup(['internal-portal.arcline.corp'], ctx).exitCode).toBe(1)
  })

  it('без аргументов печатает сервер по умолчанию', () => {
    const res = nslookup([], ctx)
    expect(res.exitCode).toBe(0)
    expect(res.stdout).toContain('Default Server:  10.20.14.10')
  })
})
