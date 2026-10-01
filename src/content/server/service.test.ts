import { describe, it, expect } from 'vitest'
import { testContent } from './test-content'
import { secrets } from './secrets'
import { SCENARIOS } from '../../scenarios'
import { COURSES } from '../../courses'
import { INTERVIEWS } from '../../interviews'
import { createWorld, applyInject } from '../../core/world/world'
import type { Capsule } from '../port'

/**
 * Главный тест среза 8А на слое сервиса.
 *
 * Всё, что сервер отдаёт до закрытия тикета, до ответа на проверку и до
 * конца интервью, проверяется по всей библиотеке, а не аккуратностью
 * автора следующего сценария: и строки решений, и сами поля, в которых
 * решение живёт.
 */
describe('до срока сервер не отдаёт решений', () => {
  it('по всей библиотеке: каталог, капсулы, уроки, квизы, старт интервью', () => {
    const c = testContent()
    const shown = JSON.stringify([
      c.catalog(),
      ...SCENARIOS.map(s => c.capsule(s.id)),
      ...COURSES.flatMap(co => co.sections.flatMap(se => [
        c.quiz(co.id, se.id),
        ...se.lessons.map(l => c.lesson(co.id, se.id, l.id)),
      ])),
      ...INTERVIEWS.map(t => c.interviewStart(t.id, 0, [])),
    ])
    for (const secret of secrets()) expect(shown.includes(secret), secret).toBe(false)
    for (const key of [
      'rootCause', 'objectives', 'fixedWhen', 'onEscalate', 'silentFaultChecks', 'actionsToAvoid',
      'correct', 'accept', 'misses', 'why', 'points', 'markers', 'expected', 'followUp',
    ]) expect(shown.includes(`"${key}"`), key).toBe(false)
  })
})

describe('подпись тикета', () => {
  it('чужая, поддельная и просроченная — отказ', () => {
    const c = testContent()
    const cap = c.capsule('net-apipa-no-lease')
    expect(c.problemGone(cap, createWorld())).toBe(true)  // подпись своя: проверка идёт

    const forged: Array<[string, Capsule]> = [
      ['сценарий подменён внутри подписи', { ...cap, token: cap.token.replace('net-apipa-no-lease', 'print-spooler-stopped') }],
      ['подпись испорчена', { ...cap, token: cap.token.slice(0, -2) + 'AA' }],
      ['не подпись вовсе', { ...cap, token: 'мусор' }],
    ]
    for (const [name, bad] of forged) {
      expect(() => c.problemGone(bad, createWorld()), name).toThrow('Сервер не узнал тикет — начните смену заново.')
    }

    // Выдана 1.10 в 09:00, проверка спустя 24 часа и секунду.
    const later = testContent({}, () => Date.parse('2026-10-02T09:00:01Z'))
    expect(() => later.problemGone(cap, createWorld())).toThrow('Сервер не узнал тикет — начните смену заново.')
  })
})

describe('решения тикета считает сервер', () => {
  /*
    Перенесено из сводки модели (задача 1): «проблема ушла» вычисляется
    по условиям починки сценария, а их знает только сервер.
  */
  it('проблема ушла — по условиям починки на присланном мире', () => {
    const c = testContent()
    const cap = c.capsule('identity-account-lockout')
    const world = createWorld()
    applyInject(world, cap.inject)
    expect(c.problemGone(cap, world)).toBe(false)

    applyInject(world, [{ path: 'org.users[samAccountName=e.varga].lockedOut', value: false }])
    expect(c.problemGone(cap, world)).toBe(true)
  })

  it('просьба открывается флагом и на сервере; эффект и ответ — по копии мира', () => {
    const c = testContent()
    const cap = c.capsule('identity-account-lockout')
    const world = createWorld()
    applyInject(world, cap.inject)

    expect(cap.asks).toEqual([{ id: 'clear-phone', unlockedBy: 'eventLogRead' }])
    expect(c.askTexts(cap, {})).toEqual({})
    expect(c.ask(cap, 'clear-phone', world, {})).toBeNull()

    const ask = 'Учётную запись блокирует почта на вашем рабочем телефоне — там '
      + 'остался пароль, который был до смены. Удалите, пожалуйста, '
      + 'учётную запись в ArcMail на телефоне и добавьте её заново с '
      + 'новым паролем.'
    expect(c.askTexts(cap, { eventLogRead: true })).toEqual({ 'clear-phone': ask })

    const before = structuredClone(world)
    expect(c.ask(cap, 'clear-phone', world, { eventLogRead: true })).toEqual({
      ask,
      reply: 'Сделала — удалила и добавила заново, почта запросила пароль, ввела '
        + 'нынешний. Сейчас загружает письма.',
      effect: [{ path: 'org.users[samAccountName=e.varga].lockoutSource', value: null }],
    })
    expect(world, 'мир клиента сервер не трогает').toEqual(before)
  })
})
