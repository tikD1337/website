import { describe, it, expect } from 'vitest'
import { restartServerService } from './serverops'
import { createWorld } from '../world/world'
import { createSession } from '../session/session'

const clock = { now: () => new Date('2026-09-10T09:30:00.000Z') }

/*
  Сервер — общая система: перезапуск службы DHCP задевает всех, кто
  берёт у него адрес. Кнопка в серверной есть и нажимается — граница
  обозначается, а не прячется, — но первой линии это всегда отказ.
*/
describe('операции над сервером', () => {
  it('перезапуск службы — отказ с опасным действием, мир не меняется', () => {
    const world = createWorld()
    const session = createSession({ number: 'INC1', device: 'AL-LPT-0601', requester: 'd.mbeki' })
    const before = structuredClone(world.network)

    expect(restartServerService(world, 'DHCP01', 'DHCPServer', session, clock)).toEqual({
      ok: false, denied: true,
      error: 'отказано: нельзя менять общую систему ради одного пользователя — нужна эскалация',
    })
    expect(session.flags.dangerousActions).toEqual([{
      at: '2026-09-10T09:30:00.000Z',
      action: 'перезапуск службы DHCPServer: DHCP01',
      reason: 'нельзя менять общую систему ради одного пользователя — нужна эскалация',
    }])
    expect(world.network).toEqual(before)
    expect(restartServerService(world, 'NOPE', 'x', session, clock)).toMatchObject({ ok: false })
  })
})
