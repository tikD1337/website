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

describe('stopService', () => {
  it('останавливает обычную службу', () => {
    const r = stopService(world, HOST, 'Spooler', session, clock)
    expect(r.ok).toBe(true)
    expect(svc('Spooler').status).toBe('stopped')
  })

  it('пишет изменение в журнал сессии', () => {
    stopService(world, HOST, 'Spooler', session, clock)
    const change = session.changes.find(c => c.path.includes('Spooler'))
    expect(change).toBeDefined()
    expect(change!.before).toBe('running')
    expect(change!.after).toBe('stopped')
    expect(change!.authorized).toBe(true)
  })

  it('добавляет запись в журнал событий машины, как настоящая Windows', () => {
    const before = world.devices[HOST]!.eventLog.length
    stopService(world, HOST, 'Spooler', session, clock)
    const log = world.devices[HOST]!.eventLog
    expect(log.length).toBe(before + 1)

    const last = log.at(-1)!
    expect(last.source).toBe('Service Control Manager')
    expect(last.eventId).toBe(7036)
    expect(last.message).toContain('Print Spooler')
    expect(last.message).toContain('stopped')
  })

  it('отклоняет останов защитной службы', () => {
    const r = stopService(world, HOST, 'WinDefend', session, clock)
    expect(r.ok).toBe(false)
    expect(r.error).toContain('защит')
    expect(svc('WinDefend').status).toBe('running')
  })

  it('отклонённый останов пишется как опасное действие', () => {
    stopService(world, HOST, 'WinDefend', session, clock)
    expect(session.flags.dangerousActions).toHaveLength(1)
    expect(session.flags.dangerousActions[0]!.action).toContain('WinDefend')
  })

  it('отклонённый останов не пишет изменение и не трогает журнал машины', () => {
    const before = world.devices[HOST]!.eventLog.length
    stopService(world, HOST, 'WinDefend', session, clock)
    expect(session.changes).toHaveLength(0)
    expect(world.devices[HOST]!.eventLog).toHaveLength(before)
  })

  it('останов уже остановленной службы не считается изменением', () => {
    const r = stopService(world, HOST, 'BITS', session, clock)
    expect(r.ok).toBe(true)
    expect(r.alreadyInState).toBe(true)
    expect(session.changes).toHaveLength(0)
  })

  it('несуществующая служба даёт внятную ошибку', () => {
    const r = stopService(world, HOST, 'НетТакой', session, clock)
    expect(r.ok).toBe(false)
    expect(r.error).toContain('не найдена')
  })

  it('несуществующая машина даёт внятную ошибку', () => {
    const r = stopService(world, 'НЕТ-ТАКОЙ', 'Spooler', session, clock)
    expect(r.ok).toBe(false)
    expect(r.error).toContain('машина')
  })
})

describe('startService', () => {
  it('запускает остановленную службу', () => {
    const r = startService(world, HOST, 'BITS', session, clock)
    expect(r.ok).toBe(true)
    expect(svc('BITS').status).toBe('running')
  })

  it('не запускает службу с типом «отключено»', () => {
    setStartType(world, HOST, 'BITS', 'disabled', session, clock)
    const r = startService(world, HOST, 'BITS', session, clock)
    expect(r.ok).toBe(false)
    expect(r.error).toContain('отключен')
    expect(svc('BITS').status).toBe('stopped')
  })

  it('не запускает службу, если её зависимость остановлена', () => {
    // RpcSs защищена и остановить её нельзя, поэтому ломаем состояние напрямую —
    // так же, как это сделает инъекция сценария.
    svc('RpcSs').status = 'stopped'
    const r = startService(world, HOST, 'Spooler', session, clock)
    expect(r.ok).toBe(false)
    expect(r.error).toContain('зависимост')
  })

  it('пишет запись в журнал событий машины', () => {
    startService(world, HOST, 'BITS', session, clock)
    const last = world.devices[HOST]!.eventLog.at(-1)!
    expect(last.message).toContain('running')
  })
})

describe('setStartType', () => {
  it('меняет тип запуска', () => {
    const r = setStartType(world, HOST, 'Spooler', 'disabled', session, clock)
    expect(r.ok).toBe(true)
    expect(svc('Spooler').startType).toBe('disabled')
  })

  it('пишет изменение в журнал сессии', () => {
    setStartType(world, HOST, 'Spooler', 'manual', session, clock)
    const change = session.changes.find(c => c.path.includes('startType'))
    expect(change).toBeDefined()
    expect(change!.before).toBe('auto')
    expect(change!.after).toBe('manual')
  })

  it('отключение защитной службы отклоняется', () => {
    const r = setStartType(world, HOST, 'WinDefend', 'disabled', session, clock)
    expect(r.ok).toBe(false)
    expect(svc('WinDefend').startType).toBe('auto')
  })
})

describe('подтверждение личности не влияет на операции с машиной', () => {
  it('останов службы не требует подтверждения личности', () => {
    expect(session.flags.identityVerified).toBe(false)
    expect(stopService(world, HOST, 'Spooler', session, clock).ok).toBe(true)
  })

  it('но и с подтверждением защитную службу не остановить', () => {
    setFlag(session, 'identityVerified', true)
    expect(stopService(world, HOST, 'MpsSvc', session, clock).ok).toBe(false)
  })
})
