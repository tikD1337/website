import { describe, it, expect } from 'vitest'
import { loadScenario, incidentNumber } from './load'
import { apipaNoLease } from '../../scenarios/net-apipa-no-lease'

describe('loadScenario', () => {
  it('ломает мир согласно инъекции', () => {
    const { world } = loadScenario(apipaNoLease)
    const a = world.devices['AL-LPT-0447']!.adapters[0]!
    expect(a.ip).toBe('169.254.23.11')
    expect(a.gateway).toBe('')
    expect(a.dns).toEqual([])
    expect(a.autoconfigured).toBe(true)
    expect(a.leaseObtained).toBeNull()
  })

  it('оставляет сегмент здоровым — релей уже починился', () => {
    const { world } = loadScenario(apipaNoLease)
    expect(world.network.segments[0]!.dhcpHealthy).toBe(true)
  })

  it('не трогает соседнюю машину', () => {
    const { world } = loadScenario(apipaNoLease)
    expect(world.devices['AL-DSK-0192']!.adapters[0]!.ip).toBe('10.20.14.91')
  })

  it('строит тикет из описания сценария', () => {
    const { ticket } = loadScenario(apipaNoLease)
    expect(ticket.number).toMatch(/^INC\d{7}$/)
    expect(ticket.status).toBe('new')
    expect(ticket.category).toBe('Сеть')
    expect(ticket.subcategory).toBe('Связность')
    expect(ticket.priority).toBe('P3')
    expect(ticket.requester).toBe('p.raman')
    expect(ticket.device).toBe('AL-LPT-0447')
    expect(ticket.resolutionCode).toBeNull()
    expect(ticket.createdAt).toBeNull()
  })

  it('каждая загрузка даёт свежий мир', () => {
    const a = loadScenario(apipaNoLease)
    a.world.devices['AL-LPT-0447']!.adapters[0]!.ip = '1.2.3.4'
    const b = loadScenario(apipaNoLease)
    expect(b.world.devices['AL-LPT-0447']!.adapters[0]!.ip).toBe('169.254.23.11')
  })
})

describe('incidentNumber', () => {
  it('детерминирован', () => {
    expect(incidentNumber('net-apipa-no-lease'))
      .toBe(incidentNumber('net-apipa-no-lease'))
  })

  it('разные сценарии дают разные номера', () => {
    expect(incidentNumber('a')).not.toBe(incidentNumber('b'))
  })
})

describe('сценарий APIPA', () => {
  it('несёт корневую причину', () => {
    expect(apipaNoLease.rootCause).toContain('DHCP')
    expect(apipaNoLease.rootCause.length).toBeGreaterThan(60)
  })

  it('содержит и технические, и процессные цели', () => {
    const technical = apipaNoLease.objectives.filter(o => o.commands.length > 0)
    const process = apipaNoLease.objectives.filter(o => o.requires.length > 0)
    expect(technical.length).toBeGreaterThanOrEqual(4)
    expect(process.length).toBeGreaterThanOrEqual(3)
  })

  it('требует подтверждения заявителя, заметки и кода закрытия', () => {
    const required = apipaNoLease.objectives.flatMap(o => o.requires)
    expect(required).toContain('userConfirmed')
    expect(required).toContain('resolutionNotes')
    expect(required).toContain('resolutionCode')
  })

  it('у каждой цели есть объяснение «зачем»', () => {
    for (const o of apipaNoLease.objectives) {
      expect(o.why.length, `цель ${o.id}`).toBeGreaterThan(40)
      expect(o.steps.length, `цель ${o.id}`).toBeGreaterThan(0)
    }
  })

  it('перечисляет запрещённые действия', () => {
    expect(apipaNoLease.actionsToAvoid.length).toBeGreaterThan(0)
    expect(apipaNoLease.actionsToAvoid.some(a => a.includes('advfirewall'))).toBe(true)
  })

  it('персона не знает разгадку', () => {
    const blob = JSON.stringify(apipaNoLease.persona).toLowerCase()
    expect(blob).not.toContain('dhcp')
    expect(blob).not.toContain('169.254')
    expect(blob).not.toContain('аренд')
    expect(blob).not.toContain('релей')
  })

  it('персона знает только наблюдаемое и умеет отвечать без модели', () => {
    expect(apipaNoLease.persona.knows.length).toBeGreaterThanOrEqual(4)
    expect(apipaNoLease.persona.scripted.length).toBeGreaterThanOrEqual(4)
    for (const ex of apipaNoLease.persona.scripted) {
      expect(ex.reply.length).toBeGreaterThan(10)
    }
  })

  it('команды целей записаны так, как их наберёт техник', () => {
    const all = apipaNoLease.objectives.flatMap(o => o.commands)
    for (const c of all) {
      expect(c, `команда «${c}»`).toBe(c.trim())
      expect(c, `команда «${c}»`).toBe(c.toLowerCase())
    }
  })

  it('ожидаемый исход — решено, а не эскалация', () => {
    expect(apipaNoLease.expectedResolution).toBe('solved')
  })
})
