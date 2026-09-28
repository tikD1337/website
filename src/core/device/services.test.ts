import { describe, it, expect, beforeEach } from 'vitest'
import { startService, stopService, setStartType, findService } from './services'
import { createWorld } from '../world/world'
import { createSession, setFlag } from '../session/session'
import type { WorldState } from '../world/types'
import type { SessionLog } from '../session/types'

const clock = { now: () => new Date('2026-09-10T09:15:00.000Z') }
const HOST = 'AL-LPT-0447'

let world: WorldState
let session: SessionLog

beforeEach(() => {
  world = createWorld()
  session = createSession()
})

const svc = (name: string) => findService(world, HOST, name)!
const eventLog = () => world.devices[HOST]!.eventLog

describe('операции над службами', () => {
  /* Как настоящая Windows: изменение состояния службы оставляет след в журнале машины. */
  it('останов меняет службу, журнал сессии и журнал событий машины', () => {
    const before = eventLog().length
    expect(stopService(world, HOST, 'Spooler', session, clock)).toEqual({ ok: true })

    expect(svc('Spooler').status).toBe('stopped')
    expect(session.changes.map(c => [c.before, c.after, c.authorized]))
      .toEqual([['running', 'stopped', true]])
    expect(eventLog()).toHaveLength(before + 1)
    expect(eventLog().at(-1)).toMatchObject({
      at: '2026-09-10T09:15:00.000Z',
      source: 'Service Control Manager',
      eventId: 7036,
      message: expect.stringMatching(/Print Spooler.*stopped/),
    })
  })

  it('запуск: работает, пишет событие; отключённая служба и остановленная зависимость мешают', () => {
    expect(startService(world, HOST, 'BITS', session, clock).ok).toBe(true)
    expect(svc('BITS').status).toBe('running')
    expect(eventLog().at(-1)!.message).toContain('running')

    stopService(world, HOST, 'BITS', session, clock)
    setStartType(world, HOST, 'BITS', 'disabled', session, clock)
    const disabled = startService(world, HOST, 'BITS', session, clock)
    expect(disabled.ok).toBe(false)
    expect(disabled.error).toContain('отключен')
    expect(svc('BITS').status).toBe('stopped')

    // RpcSs защищена, остановить её нельзя — ломаем напрямую, как инъекция.
    svc('RpcSs').status = 'stopped'
    stopService(world, HOST, 'Spooler', session, clock)
    expect(startService(world, HOST, 'Spooler', session, clock).error).toContain('зависимост')
  })

  it('тип запуска меняется и пишется в журнал', () => {
    expect(setStartType(world, HOST, 'Spooler', 'manual', session, clock).ok).toBe(true)
    expect(svc('Spooler').startType).toBe('manual')
    expect(session.changes.map(c => [c.path, c.before, c.after])).toEqual([[
      expect.stringContaining('startType'), 'auto', 'manual',
    ]])
  })

  /*
    Защитная служба отклоняется шлюзом — по тому же правилу, что
    фаервол, — и никакая сверка личности этого не меняет: личность
    относится к учётным записям, а не к машине. Отказ записывается
    опасным действием, но ни изменения, ни события не оставляет.
  */
  it('защитную службу нельзя остановить или отключить, даже со сверкой', () => {
    setFlag(session, 'identityVerified', true)
    const before = eventLog().length

    const stop = stopService(world, HOST, 'WinDefend', session, clock)
    expect(stop.ok).toBe(false)
    expect(stop.error).toContain('защит')
    expect(setStartType(world, HOST, 'MpsSvc', 'disabled', session, clock).ok).toBe(false)

    expect(svc('WinDefend')).toMatchObject({ status: 'running', startType: 'auto' })
    expect(session.flags.dangerousActions.map(a => a.action)).toEqual([
      expect.stringContaining('WinDefend'), expect.stringContaining('MpsSvc'),
    ])
    expect(session.changes).toHaveLength(0)
    expect(eventLog()).toHaveLength(before)
  })

  it('служба уже в нужном состоянии — не изменение; нет службы или машины — внятная ошибка', () => {
    expect(stopService(world, HOST, 'BITS', session, clock))
      .toEqual({ ok: true, alreadyInState: true })
    expect(session.changes).toHaveLength(0)

    expect(stopService(world, HOST, 'НетТакой', session, clock).error).toContain('не найдена')
    expect(stopService(world, 'НЕТ-ТАКОЙ', 'Spooler', session, clock).error).toContain('машина')
  })
})
