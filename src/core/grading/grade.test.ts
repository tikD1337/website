import { describe, it, expect } from 'vitest'
import { gradeIncident } from './grade'
import {
  createSession, recordCommand, recordChange, recordDialogue,
  setFlag, addDangerousAction,
} from '../session/session'
import { loadScenario } from '../scenario/load'
import { apipaNoLease } from '../../scenarios/net-apipa-no-lease'
import { identityShareAccess } from '../../scenarios/identity-share-access'
import type { GradeArgs } from './grade'

const clock = { now: () => new Date('2026-09-09T18:00:00.000Z') }

const GOOD_NOTE =
  'Priya Raman сообщила, что не открываются сайты, локальные программы работают. '
  + 'ipconfig /all показал 169.254.23.11 без шлюза и DNS — это исключило настройки '
  + 'DNS. ipconfig /renew завершился ошибкой обращения к серверу. После '
  + 'ipconfig /release повторный renew выдал 10.20.14.88. Проверено: ping 8.8.8.8 '
  + 'отвечает, заявительница подтвердила, что сайты открываются. Причина — '
  + 'кратковременная недоступность ретрансляции при загрузке.'

/** Образцовое прохождение: все цели закрыты, мир починен, юзер подтвердил. */
function perfectRun(): GradeArgs {
  const { world, ticket } = loadScenario(apipaNoLease)
  const session = createSession()

  const commands: Array<[string, number]> = [
    ['ipconfig /all', 0],
    ['ipconfig /renew', 1],
    ['ipconfig /release', 0],
    ['ipconfig /renew', 0],
    ['ping 8.8.8.8', 0],
    ['nslookup internal-portal.arcline.corp', 0],
  ]
  for (const [cmd, code] of commands) {
    recordCommand(session, clock, 'AL-LPT-0447', cmd, code)
  }

  recordChange(session, clock, 'devices.AL-LPT-0447.adapters[0].ip',
    '169.254.23.11', '10.20.14.88', true)
  recordDialogue(session, clock, 'call', 'p.raman', 'requester', 'Да, открылось')

  setFlag(session, 'identityVerified', true)
  setFlag(session, 'userConfirmed', true)

  const a = world.devices['AL-LPT-0447']!.adapters[0]!
  a.ip = '10.20.14.88'
  a.gateway = '10.20.14.1'
  a.dns = ['10.20.14.10', '10.20.14.11']
  a.autoconfigured = false

  ticket.createdAt = '2026-09-09T18:00:00.000Z'
  ticket.status = 'completed'
  ticket.resolutionCode = 'solved'
  ticket.resolutionNotes = GOOD_NOTE

  return { world, ticket, session, scenario: apipaNoLease }
}

describe('gradeIncident — образцовое прохождение', () => {
  it('даёт полный вердикт', () => {
    const r = gradeIncident(perfectRun())
    expect(r.verdict).toBe('full')
    expect(r.points).toBeGreaterThan(40)
  })

  it('засчитывает все цели', () => {
    const r = gradeIncident(perfectRun())
    const unmet = r.objectives.filter(o => !o.met).map(o => o.id)
    expect(unmet).toEqual([])
  })

  it('не находит тихих поломок', () => {
    expect(gradeIncident(perfectRun()).silentFaults).toEqual([])
  })

  it('все шесть измерений высоко оценены', () => {
    const r = gradeIncident(perfectRun())
    expect(r.dimensions).toHaveLength(6)
    for (const d of r.dimensions) {
      expect(d.score, `измерение ${d.id}`).toBeGreaterThanOrEqual(8)
      expect(d.explain.length).toBeGreaterThan(15)
    }
  })
})

/*
  Найдено разбором кода: надбавка за выясненный масштаб давала десятку
  при незакрытых диагностических целях. Разбор писал «закрыто 1 из 2» и
  тут же ставил 10 из 10 — измерение противоречило собственному
  объяснению, а масштаб маскировал недоделанное расследование.
*/
describe('надбавка за масштаб не маскирует незакрытые цели', () => {
  const scenario = identityShareAccess

  const run = (opts: { scope: boolean; investigate: boolean }) => {
    const { world, ticket } = loadScenario(scenario)
    const session = createSession()
    const clock = { now: () => new Date('2026-09-12T10:00:00.000Z') }

    if (opts.scope) setFlag(session, 'scopeChecked', true)
    if (opts.investigate) {
      recordCommand(session, clock, ticket.device, 'net user n.haruna', 0)
      recordCommand(session, clock, ticket.device,
        'dsquery group -name GRP-Finance*', 0)
    }

    ticket.status = 'completed'
    return gradeIncident({ world, ticket, session, scenario })
  }

  it('неполное расследование не получает максимум даже с масштабом', () => {
    const card = run({ scope: true, investigate: false })
    const inv = card.dimensions.find(d => d.id === 'investigation')!
    expect(inv.score).toBeLessThan(10)
  })

  it('масштаб всё же добавляет балл к неполному расследованию', () => {
    const withScope = run({ scope: true, investigate: false })
    const without = run({ scope: false, investigate: false })

    const score = (c: typeof withScope) =>
      c.dimensions.find(d => d.id === 'investigation')!.score

    expect(score(withScope)).toBeGreaterThan(score(without))
  })

  it('полное расследование даёт максимум и без масштаба', () => {
    const card = run({ scope: false, investigate: true })
    expect(card.dimensions.find(d => d.id === 'investigation')!.score).toBe(10)
  })

  it('объяснение не противоречит баллу', () => {
    const card = run({ scope: true, investigate: false })
    const inv = card.dimensions.find(d => d.id === 'investigation')!
    expect(inv.explain).toContain('Закрыто 0 из 2')
    expect(inv.score).toBeLessThan(10)
  })
})

describe('gradeIncident — починил, но не подтвердил у заявителя', () => {
  function run(): GradeArgs {
    const a = perfectRun()
    setFlag(a.session, 'userConfirmed', false)
    a.session.dialogue = []
    a.ticket.resolutionNotes = 'Сделал release и renew, адрес стал 10.20.14.88.'
    return a
  }

  it('даёт частичный вердикт, а не полный', () => {
    expect(gradeIncident(run()).verdict).toBe('partial')
  })

  it('проседает именно коммуникация', () => {
    const r = gradeIncident(run())
    expect(r.dimensions.find(d => d.id === 'communication')!.score).toBeLessThan(8)
  })

  it('объясняет, что подтверждение со своего экрана не считается', () => {
    const r = gradeIncident(run())
    expect(r.dimensions.find(d => d.id === 'communication')!.explain)
      .toContain('экран')
  })

  it('цель подтверждения не засчитана', () => {
    const r = gradeIncident(run())
    expect(r.objectives.find(o => o.id === 'obj-confirm')!.met).toBe(false)
  })
})

describe('gradeIncident — опасное действие', () => {
  function run(): GradeArgs {
    const a = perfectRun()
    addDangerousAction(a.session, clock,
      'netsh advfirewall set allprofiles state off', 'отключение защиты')
    return a
  }

  it('обнуляет измерение полномочий', () => {
    expect(gradeIncident(run()).dimensions.find(d => d.id === 'authority')!.score).toBe(0)
  })

  it('валит вердикт целиком, несмотря на верное решение', () => {
    expect(gradeIncident(run()).verdict).toBe('fail')
  })
})

describe('gradeIncident — тихая поломка', () => {
  it('отключённый DHCP вместо аренды фиксируется', () => {
    const a = perfectRun()
    a.world.devices['AL-LPT-0447']!.adapters[0]!.dhcpEnabled = false
    const r = gradeIncident(a)
    expect(r.silentFaults.length).toBeGreaterThan(0)
    expect(r.silentFaults[0]).toContain('вручную')
    expect(r.verdict).toBe('fail')
  })

  it('оставленный самоназначенный адрес тоже тихая поломка', () => {
    const a = perfectRun()
    a.world.devices['AL-LPT-0447']!.adapters[0]!.autoconfigured = true
    expect(gradeIncident(a).silentFaults.length).toBeGreaterThan(0)
  })
})

describe('gradeIncident — неверный код закрытия', () => {
  it('снижает измерение полномочий', () => {
    const a = perfectRun()
    a.ticket.resolutionCode = 'escalate'
    const r = gradeIncident(a)
    expect(r.dimensions.find(d => d.id === 'authority')!.score).toBeLessThan(10)
  })
})

describe('gradeIncident — тикет не был взят до начала работы', () => {
  it('снижает владение', () => {
    const a = perfectRun()
    a.ticket.createdAt = null
    const r = gradeIncident(a)
    expect(r.dimensions.find(d => d.id === 'ownership')!.score).toBeLessThan(10)
  })
})
