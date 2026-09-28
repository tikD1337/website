import { describe, it, expect } from 'vitest'
import { SCENARIOS } from '../../scenarios'
import { loadScenario, loadScenarios, validateScenarios, incidentNumber } from './load'
import { apipaNoLease } from '../../scenarios/net-apipa-no-lease'
import type { Scenario } from './types'

describe('загрузка сценария', () => {
  it('ломает свежий мир по инъекции и строит тикет из описания', () => {
    const { world, ticket } = loadScenario(apipaNoLease)
    expect(world.devices['AL-LPT-0447']!.adapters[0]).toMatchObject({
      ip: '169.254.23.11', gateway: '', dns: [], autoconfigured: true, leaseObtained: null,
    })
    // Релей уже починился — сегмент здоров, соседняя машина не тронута.
    expect(world.network.segments.find(s => s.vlan === 'vlan20')!.dhcpHealthy).toBe(true)
    expect(world.devices['AL-DSK-0192']!.adapters[0]!.ip).toBe('10.20.14.91')

    expect(ticket).toMatchObject({
      number: 'INC4612736', status: 'new', category: 'Сеть', subcategory: 'Связность',
      priority: 'P3', requester: 'p.raman', device: 'AL-LPT-0447',
      resolutionCode: null, createdAt: null,
    })

    world.devices['AL-LPT-0447']!.adapters[0]!.ip = '1.2.3.4'
    expect(loadScenario(apipaNoLease).world.devices['AL-LPT-0447']!.adapters[0]!.ip)
      .toBe('169.254.23.11')
  })

  /* Случайность здесь недопустима: одно прохождение выглядит одинаково всегда. */
  it('номер инцидента детерминирован и различает сценарии', () => {
    expect(incidentNumber('net-apipa-no-lease')).toBe('INC4612736')
    expect(incidentNumber('a')).not.toBe(incidentNumber('b'))
  })
})

/*
  Правила библиотеки, а не одного сценария. Процессные цели —
  подтвердить у заявителя, написать заметку, выбрать код — стоят наравне
  с техническими, и сценарий без них учил бы, что задача решена, когда
  починена машина.
*/
describe('библиотека сценариев', () => {
  it('у каждого сценария процессные цели, объяснения и реплики без модели', () => {
    for (const s of SCENARIOS) {
      const required = s.objectives.flatMap(o => o.requires)
      // У эскалации своё «подтверждение»: заявителю сказали о передаче.
      const closedLoop = s.expectedResolution === 'escalate' ? 'userInformed' : 'userConfirmed'
      for (const flag of [closedLoop, 'resolutionNotes', 'resolutionCode']) {
        expect(required, `${s.id}: ${flag}`).toContain(flag)
      }
      for (const o of s.objectives) {
        expect(o.why.length, `${s.id}/${o.id}`).toBeGreaterThan(40)
        expect(o.steps.length, `${s.id}/${o.id}`).toBeGreaterThan(0)
      }
      expect(s.actionsToAvoid.length, s.id).toBeGreaterThan(0)
      expect(s.persona.scripted.length, s.id).toBeGreaterThanOrEqual(4)
    }
  })

  it('номера инцидентов в библиотеке не совпадают', () => {
    const numbers = SCENARIOS.map(s => incidentNumber(s.id))
    expect(new Set(numbers).size).toBe(numbers.length)
  })
})

/*
  Цель без доказательств не должна существовать.

  `[].every(...)` истинно, поэтому цель с пустыми `commands` и пустыми
  `requires` засчитывалась **всегда**: разбор утверждал «блокировка
  снята», когда учётка заблокирована, — то есть врал ровно в той цели,
  вокруг которой построена ловушка сценария. Сторож в загрузчике: ошибка
  автора сценария падает при загрузке, а не неверным разбором через
  полчаса прохождения.
*/
describe('сторож: у каждой цели есть доказательство', () => {
  const withObjective = (over: Partial<Scenario['objectives'][number]>): Scenario => ({
    ...apipaNoLease,
    objectives: [{
      id: 'obj-пустая', title: 'Цель', steps: [], commands: [], requires: [], why: '', ...over,
    }],
  })

  it('цель без команд, флагов и состояния не проходит загрузку', () => {
    expect(() => loadScenario(withObjective({}))).toThrow(/obj-пустая.*commands, requires или state/)
    expect(() => validateScenarios([withObjective({})])).toThrow(/obj-пустая/)
  })

  it('достаточно одного доказательства любого вида; библиотека проходит', () => {
    const evidence = [
      { commands: ['ipconfig /all'] },
      { requires: ['userConfirmed'] },
      { state: [{ path: 'devices.AL-LPT-0447.adapters[0].linkUp', equals: true, message: '' }] },
    ]
    for (const e of evidence) {
      expect(() => loadScenario(withObjective(e)), JSON.stringify(e)).not.toThrow()
    }
    expect(() => loadScenarios(SCENARIOS)).not.toThrow()
  })
})

/*
  Стор ломает мир лениво — при входе тикета в окно, — а вторая линия
  чинит ещё позже, при эскалации. Опечатка в любом из патчей обязана
  падать при запуске: иначе она всплывёт через три закрытых тикета,
  посреди смены.
*/
it('сторож: пути инъекции и патча второй линии проверяются при запуске', () => {
  const broken = (over: Partial<Scenario>) => validateScenarios([{ ...apipaNoLease, ...over }])
  expect(() => broken({ inject: [{ path: 'devices.NO-SUCH-PC.adapters[0].ip', value: '' }] }))
    .toThrow(/NO-SUCH-PC/)
  expect(() => broken({ onEscalate: [{ path: 'network.switches[hostname=CR-99].log', value: [] }] }))
    .toThrow(/CR-99/)
  expect(() => validateScenarios(SCENARIOS)).not.toThrow()
})
