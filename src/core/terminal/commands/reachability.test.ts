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

const out = (...lines: string[]) => lines.map(l => l + '\r\n').join('')

/*
  Достижимость выводится из состояния мира, а не задаётся сценарием:
  починка адресации в терминале немедленно меняет поведение ping и
  nslookup, и сценарию об этом знать не нужно.
*/
describe('ping', () => {
  it('ответ и таймаут — в формате Windows', () => {
    expect(ping(['8.8.8.8'], ctx)).toEqual({
      exitCode: 0,
      stdout: out(
        'Pinging 8.8.8.8 with 32 bytes of data:',
        'Reply from 8.8.8.8: bytes=32 time=3ms TTL=118',
        'Reply from 8.8.8.8: bytes=32 time=4ms TTL=118',
        'Reply from 8.8.8.8: bytes=32 time=3ms TTL=118',
        'Reply from 8.8.8.8: bytes=32 time=4ms TTL=118',
        '',
        'Ping statistics for 8.8.8.8:',
        '    Packets: Sent = 4, Received = 4, Lost = 0 (0% loss),',
        'Approximate round trip times in milli-seconds:',
        '    Minimum = 3ms, Maximum = 4ms, Average = 3ms',
      ),
    })
    expect(ping(['203.0.113.7'], ctx)).toEqual({
      exitCode: 1,
      stdout: out(
        'Pinging 203.0.113.7 with 32 bytes of data:',
        'Request timed out.', 'Request timed out.', 'Request timed out.', 'Request timed out.',
        '',
        'Ping statistics for 203.0.113.7:',
        '    Packets: Sent = 4, Received = 0, Lost = 4 (100% loss),',
      ),
    })
    expect(ping([], ctx))
      .toEqual({ exitCode: 1, stdout: out('Usage: ping [-t] [-a] [-n count] [-l size] target_name') })
  })

  it('отвечают шлюз, соседи по подсети и известные публичные адреса — пока есть маршрут', () => {
    const reachable = (target: string) => ping([target], ctx).exitCode === 0
    expect(['8.8.8.8', '10.20.14.1', '10.20.14.91', '203.0.113.7'].map(reachable))
      .toEqual([true, true, true, false])

    breakAddressing()
    expect(['8.8.8.8', '10.20.14.1'].map(reachable)).toEqual([false, false])

    ctx.world = createWorld()
    applyInject(ctx.world, [{ path: 'devices.AL-LPT-0447.adapters[0].linkUp', value: false }])
    expect(reachable('8.8.8.8')).toBe(false)
  })
})

describe('nslookup', () => {
  it('резолвит через первый DNS адаптера, без учёта регистра; без аргументов — сервер по умолчанию', () => {
    expect(nslookup(['Internal-Portal.ARCLINE.corp'], ctx).exitCode).toBe(0)
    expect(nslookup(['internal-portal.arcline.corp'], ctx)).toEqual({
      exitCode: 0,
      stdout: out(
        'Server:  10.20.14.10', 'Address:  10.20.14.10', '',
        'Name:    internal-portal.arcline.corp', 'Address:  10.20.14.50',
      ),
    })
    expect(nslookup([], ctx))
      .toEqual({ exitCode: 0, stdout: out('Default Server:  10.20.14.10', 'Address:  10.20.14.10') })
  })

  it('неизвестное имя, нет DNS у адаптера, недостижимый сервер — разные ошибки', () => {
    expect(nslookup(['nope.arcline.corp'], ctx)).toEqual({
      exitCode: 1,
      stdout: out('Server:  10.20.14.10', 'Address:  10.20.14.10', '',
        "*** 10.20.14.10 can't find nope.arcline.corp: Non-existent domain"),
    })

    applyInject(ctx.world, [{ path: 'network.dnsServers[0].reachable', value: false }])
    expect(nslookup(['internal-portal.arcline.corp'], ctx))
      .toEqual({ exitCode: 1, stdout: out('*** Request to 10.20.14.10 timed-out') })

    breakAddressing()
    expect(nslookup(['internal-portal.arcline.corp'], ctx)).toEqual({
      exitCode: 1,
      stdout: out(
        "*** Can't find server name for address: Timed out",
        '*** Default servers are not available',
        'Server:  UnKnown',
        'Address:  0.0.0.0',
      ),
    })
  })
})
