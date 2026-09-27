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

const note = (text: string, session = s) => gradeNote(text, session, ticket, apipaNoLease)
const earned = (text: string, part: string, session = s) =>
  note(text, session).parts.find(p => p.id === part)!.earned

describe('оценка заметки', () => {
  it('образцовая заметка: все пять частей с объяснениями, без штрафов', () => {
    const r = note(GOOD)
    expect(r.score).toBeGreaterThanOrEqual(8)
    expect(r.penalties).toEqual([])
    expect(r.parts.filter(p => !p.earned).map(p => p.id)).toEqual([])
    for (const p of r.parts) expect(p.explain.length, p.id).toBeGreaterThan(20)
  })

  it('отписка и пустая заметка — ноль, отписка ещё и со штрафом', () => {
    const r = note('починил')
    expect(r.score).toBe(0)
    expect(r.penalties.map(p => p.id)).toContain('no-specifics')
    expect(note('').score).toBe(0)
  })

  it('каждая недостающая часть теряется по отдельности', () => {
    const noVerification = 'Не открывались сайты. ipconfig /all показал 169.254.23.11 '
      + 'без шлюза, ipconfig /renew завершился ошибкой. '
      + 'ipconfig /release и ipconfig /renew выдали 10.20.14.88.'
    expect(earned(noVerification, 'verification')).toBe(false)
    expect(note(noVerification).score).toBeLessThan(9)

    expect(earned('Не открывались сайты. Сделал ipconfig /release и ipconfig /renew, '
      + 'адрес стал 10.20.14.88. Заявительница подтвердила, что открывается.', 'checks')).toBe(false)
    expect(earned('Не открывались сайты. Проверил ipconfig /all и ipconfig /renew, '
      + 'renew не прошёл. Освободил и обновил адрес. Заявительница подтвердила.', 'change')).toBe(false)
  })

  /*
    Заметка сверяется с журналом, а не со словарём: мы знаем, что
    реально произошло. Названная, но не запускавшаяся команда, значение,
    которого не было в изменениях, и подтверждение, которого не было, —
    не засчитываются.
  */
  it('засчитывается только то, что есть в журнале', () => {
    expect(earned('Не открывались сайты. Проверил tracert и pathping, ничего. '
      + 'Адрес стал 10.20.14.88. Заявительница подтвердила.', 'checks')).toBe(false)
    expect(earned('Не открывались сайты. ipconfig /all и ipconfig /renew показали '
      + 'проблему. Адрес стал 192.168.1.50. Заявительница подтвердила.', 'change')).toBe(false)

    const noConfirm = createSession()
    recordCommand(noConfirm, clock, 'AL-LPT-0447', 'ipconfig /all', 0)
    recordCommand(noConfirm, clock, 'AL-LPT-0447', 'ipconfig /renew', 1)
    recordChange(noConfirm, clock, 'devices.AL-LPT-0447.adapters[0].ip',
      '169.254.23.11', '10.20.14.88', true)
    const part = note(GOOD, noConfirm).parts.find(p => p.id === 'verification')!
    expect(part.earned).toBe(false)
    expect(part.explain).toContain('не было')
  })

  /*
    Объект изменения — такое же конкретное значение, как адрес: в пути
    `ports[name=Gi1/0/22]` порт назван, и заметка «перевёл Gi1/0/22 в
    VLAN 20» говорит, что именно менялось.
  */
  it('изменение на коммутаторе засчитывается по имени порта из журнала', () => {
    const sw = createSession()
    recordChange(sw, clock,
      'network.switches[hostname=SW-FL3-01].ports[name=Gi1/0/22].accessVlan', 40, 20, true)
    expect(earned('Перевёл порт Gi1/0/22 в VLAN 20.', 'change', sw)).toBe(true)
    expect(earned('Перевёл порт в другой VLAN.', 'change', sw)).toBe(false)
  })

  /*
    Работа в консоли каталога — такая же проверка, как команда. Список
    инструментов застыл на срезе 2, и заметка, честно описывающая разбор
    через карточки и членство, теряла балл ни за что.
  */
  it('проверки мышью засчитываются, но одного упоминания мало', () => {
    expect(earned('Заявительница сообщила, что не открывается папка с отчётностью. '
      + 'В карточке каталога на вкладке членство в группах у неё были только '
      + 'общие группы. В карточке группы GRP-Finance-Reports видно, что доступ '
      + 'даёт именно она. Права на саму папку оказались в порядке — эту версию '
      + 'исключил. Добавил в группу и попросил войти заново.', 'checks')).toBe(true)
    expect(earned('Смотрел журнал событий и окно служб: служба остановлена, '
      + 'тип запуска отключена. Версию с сетью исключил.', 'checks')).toBe(true)
    expect(earned('Посмотрел карточку каталога и добавил в группу.', 'checks')).toBe(false)
  })

  /*
    В заметке об эскалации нечего назвать внесённым изменением: техник
    и не должен был ничего менять. Вместо этого — что передано, с
    доказательством с сетевого устройства, и предупреждён ли заявитель.
  */
  it('в заметке об эскалации — что передано и кто предупреждён', () => {
    const escalation = { ...apipaNoLease, expectedResolution: 'escalate' as const }
    const log = createSession()
    recordCommand(log, clock, 'AL-LPT-0447', 'ipconfig /all', 0)
    recordCommand(log, clock, 'CR-01', 'sh run int vlan 20', 0, 'show running-config interface vlan20')
    setFlag(log, 'userInformed', true)
    const part = (text: string, id: string, session = log) =>
      gradeNote(text, session, ticket, escalation).parts.find(p => p.id === id)!.earned

    const full = 'Не открываются сайты. ipconfig /all показал самоназначенный адрес. '
      + 'На CR-01 show running-config interface vlan20: ретрансляции DHCP нет. '
      + 'Передаю сетевой группе, заявитель предупреждён.'
    expect(gradeNote(full, log, ticket, escalation).parts.map(p => [p.id, p.earned])).toEqual([
      ['symptom', true], ['checks', true], ['escalation', true], ['informed', true], ['handoff', true],
    ])

    // Передача без доказательства с сетевого устройства и доказательство без передачи.
    expect(part('Передаю сетевой группе. ipconfig /all показал 169.254.', 'escalation')).toBe(false)
    expect(part('На CR-01 sh run int vlan 20: ретрансляции нет.', 'escalation')).toBe(false)
    // Написал, что предупредил, а на деле не предупреждал.
    expect(part(full, 'informed', createSession())).toBe(false)
  })

  /*
    Штраф ловит секрет, а не слово «пароль». Прежнее правило считало
    секретом любое слово из шести букв после «пароль», и фраза «пароль
    верный, поэтому не сбрасывал» — единственно верное решение в
    сценарии с блокировкой — теряла три балла.
  */
  it('штраф за пароль открытым текстом — только за настоящий секрет и не ниже нуля', () => {
    const penalized = (text: string) =>
      note(GOOD + ' ' + text).penalties.map(p => p.id).includes('plaintext-secret')

    for (const phrase of [
      'Пароль верный, поэтому не сбрасывал.',
      'Пароль меняли на прошлой неделе.',
      'Попросил обновить пароль в почте на телефоне.',
      'Сбросил пароль и передал его по отдельному каналу.',
    ]) expect(penalized(phrase), phrase).toBe(false)

    for (const leak of [
      'Временный пароль Qwerty123 передан пользователю.',
      'пароль — Zima2026!',
      'Новый пароль: Arcline#7788',
      'Временный пароль: Passw0rd!2026',
    ]) expect(penalized(leak), leak).toBe(true)

    expect(note(GOOD + ' Временный пароль: Passw0rd!2026').score).toBeLessThan(8)
    expect(note('пароль: Passw0rd!2026').score).toBe(0)
  })
})
