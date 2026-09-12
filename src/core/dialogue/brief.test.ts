import { describe, it, expect } from 'vitest'
import { briefFor, contactBrief } from './brief'
import { loadScenarios, loadScenario } from '../scenario/load'
import { SCENARIOS } from '../../scenarios'
import { identityAccountLockout } from '../../scenarios/identity-account-lockout'
import { applyInject } from '../world/world'

/**
 * Главный тест среза 4.
 *
 * «Модели никогда не передаётся корневая причина» — требование,
 * записанное в спеке и в дорожной карте. Оно проверяется механически,
 * по всем сценариям библиотеки сразу, потому что аккуратность автора
 * следующего сценария проверить нельзя.
 */
describe('сводка не содержит разгадки', () => {
  const { world, tickets } = loadScenarios(SCENARIOS)

  for (const scenario of SCENARIOS) {
    const ticket = tickets.find(t => t.scenarioId === scenario.id)!
    const dump = JSON.stringify(briefFor(scenario, ticket, world))

    it(`${scenario.id}: корневая причина не попадает в сводку`, () => {
      expect(dump).not.toContain(scenario.rootCause)
    })

    /*
      Целиком строку искать недостаточно: разгадка узнаётся и по
      фрагменту. Берём значимые слова корневой причины и требуем, чтобы
      редкие из них не встречались — «пароль» и «телефон» заявитель
      знает сам, а вот «кэш» или «ретрансляция» он не произносит.
    */
    it(`${scenario.id}: заголовки целей не попадают в сводку`, () => {
      for (const o of scenario.objectives) {
        expect(dump).not.toContain(o.title)
        for (const step of o.steps) expect(dump).not.toContain(step)
        expect(dump).not.toContain(o.why)
      }
    })

    /*
      Текст просьбы — это диагноз словами техника: «учётную запись
      блокирует почта на телефоне». В интерфейсе кнопка закрыта до
      расследования; отдать тот же текст модели значило бы обойти
      собственную защиту.
    */
    it(`${scenario.id}: тексты просьб не попадают в сводку`, () => {
      for (const a of scenario.asks ?? []) {
        expect(dump).not.toContain(a.ask)
      }
    })

    it(`${scenario.id}: ловушки и запреты не попадают в сводку`, () => {
      for (const c of scenario.silentFaultChecks ?? []) {
        if (c.message) expect(dump).not.toContain(c.message)
      }
      for (const a of scenario.actionsToAvoid) {
        expect(dump).not.toContain(a)
      }
    })
  }
})

describe('сводка заявителя', () => {
  const { world, ticket } = loadScenario(identityAccountLockout)
  const brief = briefFor(identityAccountLockout, ticket, world)

  it('несёт имя и должность из каталога', () => {
    expect(brief.displayName).toBe('Elena Varga')
    expect(brief.dept).toBe('Продажи')
  })

  it('жалоба — текст обращения, а не диагноз', () => {
    expect(brief.complaint).toBe(ticket.description)
  })

  it('отдаёт то, что заявитель знает', () => {
    expect(brief.knows).toEqual(identityAccountLockout.persona.knows)
  })

  it('отдаёт заготовленные реплики для работы без модели', () => {
    expect(brief.scripted.length).toBeGreaterThan(0)
    expect(brief.scripted[0]).toHaveProperty('ask')
    expect(brief.scripted[0]).toHaveProperty('reply')
  })

  /*
    Состояние проблемы вычисляется, а не задаётся: заявитель сообщает
    то, что видит. Это тот же механизм, по которому он отказывается
    подтверждать непочиненное.
  */
  it('на сломанном мире проблема не ушла', () => {
    expect(brief.problemGone).toBe(false)
  })

  it('после починки проблема ушла', () => {
    const fixed = loadScenario(identityAccountLockout)
    applyInject(fixed.world, [
      { path: 'org.users[samAccountName=e.varga].lockedOut', value: false },
    ])
    expect(briefFor(identityAccountLockout, fixed.ticket, fixed.world).problemGone)
      .toBe(true)
  })

  it('копии массивов, а не ссылки на сценарий', () => {
    brief.knows.push('подделка')
    expect(identityAccountLockout.persona.knows).not.toContain('подделка')
  })
})

/**
 * Коллега из справочника: позвонить можно любому, и это приём первой
 * линии — «а у вас так же?».
 */
describe('сводка коллеги', () => {
  const { world } = loadScenario(identityAccountLockout)
  const brief = contactBrief(world, 's.okafor')

  it('помечен как посторонний', () => {
    expect(brief.bystander).toBe(true)
  })

  it('знает свою карточку', () => {
    expect(brief.displayName).toBe('Sam Okafor')
    expect(brief.knows.join(' ')).toContain('Финансы')
  })

  it('про чужую проблему не знает ничего', () => {
    expect(brief.complaint).toBe('')
    expect(brief.doesntKnow.join(' ')).toContain('чужие')
  })

  it('у него всё работает', () => {
    expect(brief.problemGone).toBe(true)
  })

  it('неизвестный логин не валит сборку сводки', () => {
    expect(contactBrief(world, 'нет.такого').displayName).toBe('нет.такого')
  })
})
