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

const dim = (card: ReturnType<typeof gradeIncident>, id: string) =>
  card.dimensions.find(d => d.id === id)!

describe('оценка инцидента', () => {
  it('образцовое прохождение: полный вердикт, все цели, ни одной тихой поломки', () => {
    const r = gradeIncident(perfectRun())
    expect(r.verdict).toBe('full')
    expect(r.points).toBeGreaterThan(40)
    expect(r.objectives.filter(o => !o.met).map(o => o.id)).toEqual([])
    expect(r.silentFaults).toEqual([])
    expect(r.dimensions.map(d => d.id)).toEqual([
      'ownership', 'investigation', 'documentation', 'communication', 'authority', 'resolution',
    ])
    for (const d of r.dimensions) expect(d.score, d.id).toBeGreaterThanOrEqual(8)
  })

  /*
    Доктрина «подтверждает заявитель, а не техник» реально считается и в
    ориентире: решено верно, заметка подробная — и всё равно PARTIAL.
  */
  it('починил, но не подтвердил у заявителя — частичный вердикт из-за коммуникации', () => {
    const a = perfectRun()
    setFlag(a.session, 'userConfirmed', false)
    a.session.dialogue = []
    a.ticket.resolutionNotes = 'Сделал release и renew, адрес стал 10.20.14.88.'
    const r = gradeIncident(a)

    expect(r.verdict).toBe('partial')
    expect(dim(r, 'communication').score).toBeLessThan(8)
    expect(dim(r, 'communication').explain).toContain('экран')
    expect(r.objectives.find(o => o.id === 'obj-confirm')!.met).toBe(false)
  })

  it('опасное действие обнуляет полномочия и валит вердикт при верном решении', () => {
    const a = perfectRun()
    addDangerousAction(a.session, clock,
      'netsh advfirewall set allprofiles state off', 'отключение защиты')
    const r = gradeIncident(a)
    expect(dim(r, 'authority').score).toBe(0)
    expect(r.verdict).toBe('fail')
  })

  /* Самая недобрая часть оценки: всё работает, заявитель доволен — а мина заложена. */
  it('тихая поломка валит вердикт: DHCP выключен вручную, адрес всё ещё самоназначен', () => {
    const manual = perfectRun()
    manual.world.devices['AL-LPT-0447']!.adapters[0]!.dhcpEnabled = false
    const r = gradeIncident(manual)
    expect(r.silentFaults).toEqual([expect.stringContaining('вручную')])
    expect(r.verdict).toBe('fail')
    expect(dim(r, 'resolution').score).toBe(2)

    const stuck = perfectRun()
    stuck.world.devices['AL-LPT-0447']!.adapters[0]!.autoconfigured = true
    expect(gradeIncident(stuck).silentFaults).toEqual([expect.stringContaining('самоназначенный')])
  })

  it('неверный код снижает полномочия, работа до взятия тикета — владение', () => {
    const wrongCode = perfectRun()
    wrongCode.ticket.resolutionCode = 'escalate'
    expect(dim(gradeIncident(wrongCode), 'authority').score).toBe(5)

    const unclaimed = perfectRun()
    unclaimed.ticket.createdAt = null
    expect(dim(gradeIncident(unclaimed), 'ownership').score).toBe(4)
  })
})

/*
  Консоль коммутатора принимает сокращения, как настоящая: `sh ip int br`.
  Цель сверяется с канонической формой, иначе сокращение наказывалось бы.
*/
describe('каноническая форма команды', () => {
  it('закрывает цель наравне с набранной строкой', () => {
    const a = perfectRun()
    a.scenario = {
      ...apipaNoLease,
      objectives: [{ id: 'obj-svi', title: 't', steps: ['s'], commands: ['show ip interface brief'],
        requires: [], why: 'w' }],
    }
    const met = () => gradeIncident(a).objectives[0]!.met
    expect(met()).toBe(false)
    recordCommand(a.session, clock, 'CR-01', 'sh ip int br', 0, 'show ip interface brief')
    expect(met()).toBe(true)
  })
})

/*
  Найдено разбором кода: надбавка за выясненный масштаб давала десятку
  при незакрытых диагностических целях. Разбор писал «закрыто 1 из 2» и
  тут же ставил 10 из 10 — измерение противоречило собственному
  объяснению, а масштаб маскировал недоделанное расследование.
*/
describe('надбавка за масштаб', () => {
  const run = (opts: { scope: boolean; investigate: boolean }) => {
    const { world, ticket } = loadScenario(identityShareAccess)
    const session = createSession()
    if (opts.scope) setFlag(session, 'scopeChecked', true)
    if (opts.investigate) {
      recordCommand(session, clock, ticket.device, 'net user n.haruna', 0)
      recordCommand(session, clock, ticket.device, 'dsquery group -name GRP-Finance*', 0)
    }
    ticket.status = 'completed'
    return dim(gradeIncident({ world, ticket, session, scenario: identityShareAccess }),
      'investigation')
  }

  it('добавляет балл, но не дотягивает неполное расследование до десятки', () => {
    const withScope = run({ scope: true, investigate: false })
    expect(withScope.score).toBe(2)
    expect(withScope.explain).toContain('Закрыто 0 из 2')
    expect(run({ scope: false, investigate: false }).score).toBe(0)
    expect(run({ scope: false, investigate: true }).score).toBe(10)
  })
})
