import { describe, it, expect, beforeEach } from 'vitest'
import { gradeNote } from './notes'
import {
  createSession, recordCommand, recordChange, recordDialogue, setFlag,
} from '../session/session'
import { loadScenario } from '../scenario/load'
import { apipaNoLease } from '../../scenarios/net-apipa-no-lease'
import type { SessionLog } from '../session/types'
import type { Ticket } from '../tickets/types'

const clock = { now: () => new Date('2026-09-09T18:00:00.000Z') }

let s: SessionLog
let ticket: Ticket

/** Журнал образцового прохождения: диагностика, провал, починка, подтверждение. */
beforeEach(() => {
  s = createSession()
  ticket = loadScenario(apipaNoLease).ticket

  recordCommand(s, clock, 'AL-LPT-0447', 'ipconfig /all', 0)
  recordCommand(s, clock, 'AL-LPT-0447', 'ipconfig /renew', 1)   // проверка без находки
  recordCommand(s, clock, 'AL-LPT-0447', 'ipconfig /release', 0)
  recordCommand(s, clock, 'AL-LPT-0447', 'ipconfig /renew', 0)
  recordCommand(s, clock, 'AL-LPT-0447', 'ping 8.8.8.8', 0)

  recordChange(s, clock, 'devices.AL-LPT-0447.adapters[0].ip',
    '169.254.23.11', '10.20.14.88', true)

  recordDialogue(s, clock, 'call', 'p.raman', 'requester', 'Да, открылось, спасибо')
  setFlag(s, 'userConfirmed', true)
})

const GOOD = `Priya Raman сообщила, что не открывается ни один сайт, при этом
локальные программы работают. ipconfig /all показал самоназначенный адрес
169.254.23.11 без шлюза и без DNS — это исключило неверные настройки DNS и
указало на неполученную аренду. ipconfig /renew сам по себе завершился
ошибкой обращения к серверу. После ipconfig /release повторный renew выдал
адрес 10.20.14.88 со шлюзом и DNS. Проверено: ping 8.8.8.8 отвечает,
заявительница подтвердила по телефону, что сайты открываются. Причина —
кратковременная недоступность ретрансляции при загрузке; при повторении на
том же порту нужна проверка сетевой командой.`

describe('gradeNote — образцовая заметка', () => {
  it('набирает высокий балл', () => {
    const r = gradeNote(GOOD, s, ticket, apipaNoLease)
    expect(r.score).toBeGreaterThanOrEqual(8)
    expect(r.penalties).toHaveLength(0)
  })

  it('засчитывает все пять частей', () => {
    const r = gradeNote(GOOD, s, ticket, apipaNoLease)
    const missing = r.parts.filter(p => !p.earned).map(p => p.id)
    expect(missing).toEqual([])
  })

  it('каждая часть несёт объяснение', () => {
    const r = gradeNote(GOOD, s, ticket, apipaNoLease)
    for (const p of r.parts) expect(p.explain.length).toBeGreaterThan(20)
  })
})

describe('gradeNote — отписка', () => {
  it('«починил» получает ноль и штраф', () => {
    const r = gradeNote('починил', s, ticket, apipaNoLease)
    expect(r.score).toBe(0)
    expect(r.penalties.some(p => p.id === 'no-specifics')).toBe(true)
  })

  it('пустая заметка тоже ноль', () => {
    expect(gradeNote('', s, ticket, apipaNoLease).score).toBe(0)
  })
})

describe('gradeNote — частичная заметка', () => {
  it('без упоминания подтверждения теряет соответствующую часть', () => {
    const note = 'Не открывались сайты. ipconfig /all показал 169.254.23.11 '
      + 'без шлюза, ipconfig /renew завершился ошибкой. '
      + 'ipconfig /release и ipconfig /renew выдали 10.20.14.88.'
    const r = gradeNote(note, s, ticket, apipaNoLease)
    expect(r.parts.find(p => p.id === 'verification')!.earned).toBe(false)
    expect(r.score).toBeLessThan(9)
  })

  it('без единой безрезультатной проверки теряет часть про исключения', () => {
    const note = 'Не открывались сайты. Сделал ipconfig /release и ipconfig /renew, '
      + 'адрес стал 10.20.14.88. Заявительница подтвердила, что открывается.'
    const r = gradeNote(note, s, ticket, apipaNoLease)
    expect(r.parts.find(p => p.id === 'checks')!.earned).toBe(false)
  })

  it('без конкретного значения теряет часть про изменение', () => {
    const note = 'Не открывались сайты. Проверил ipconfig /all и ipconfig /renew, '
      + 'renew не прошёл. Освободил и обновил адрес. Заявительница подтвердила.'
    const r = gradeNote(note, s, ticket, apipaNoLease)
    expect(r.parts.find(p => p.id === 'change')!.earned).toBe(false)
  })
})

describe('gradeNote — сверка с журналом, а не со словарём', () => {
  it('команда, которую не запускали, часть не засчитывает', () => {
    const note = 'Не открывались сайты. Проверил tracert и pathping, ничего. '
      + 'Адрес стал 10.20.14.88. Заявительница подтвердила.'
    const r = gradeNote(note, s, ticket, apipaNoLease)
    expect(r.parts.find(p => p.id === 'checks')!.earned).toBe(false)
  })

  it('значение, которого не было в изменениях, часть не засчитывает', () => {
    const note = 'Не открывались сайты. ipconfig /all и ipconfig /renew показали '
      + 'проблему. Адрес стал 192.168.1.50. Заявительница подтвердила.'
    const r = gradeNote(note, s, ticket, apipaNoLease)
    expect(r.parts.find(p => p.id === 'change')!.earned).toBe(false)
  })

  it('если подтверждения не было, упоминание о нём не спасает', () => {
    const noConfirm = createSession()
    recordCommand(noConfirm, clock, 'AL-LPT-0447', 'ipconfig /all', 0)
    recordCommand(noConfirm, clock, 'AL-LPT-0447', 'ipconfig /renew', 1)
    recordChange(noConfirm, clock, 'devices.AL-LPT-0447.adapters[0].ip',
      '169.254.23.11', '10.20.14.88', true)

    const r = gradeNote(GOOD, noConfirm, ticket, apipaNoLease)
    const part = r.parts.find(p => p.id === 'verification')!
    expect(part.earned).toBe(false)
    expect(part.explain).toContain('не было')
  })
})

describe('gradeNote — штрафы', () => {
  it('пароль открытым текстом штрафуется', () => {
    const r = gradeNote(GOOD + ' Временный пароль: Passw0rd!2026', s, ticket, apipaNoLease)
    expect(r.penalties.some(p => p.id === 'plaintext-secret')).toBe(true)
    expect(r.score).toBeLessThan(8)
  })

  it('штраф не уводит балл ниже нуля', () => {
    const r = gradeNote('пароль: Passw0rd!2026', s, ticket, apipaNoLease)
    expect(r.score).toBe(0)
  })
})
