import { describe, it, expect } from 'vitest'
import { allHold } from '../scenario/check'
import { briefFor, contactBrief } from './brief'
import { loadScenarios, loadScenario } from '../scenario/load'
import { SCENARIOS } from '../../scenarios'
import { identityAccountLockout } from '../../scenarios/identity-account-lockout'
import { applyInject } from '../world/world'

/**
 * Главный тест среза 4.
 *
 * «Модели никогда не передаётся корневая причина» — требование,
 * записанное в спеке и в дорожной карте. Проверяется механически по
 * всей библиотеке, потому что аккуратность автора следующего сценария
 * проверить нельзя. Кроме причины — цели с шагами и «зачем», тексты
 * просьб (это диагноз словами техника: «учётку блокирует почта на
 * телефоне» — кнопка закрыта до расследования, и отдать тот же текст
 * модели значило бы обойти собственную защиту), ловушки и запреты.
 */
describe('сводка не содержит разгадки', () => {
  it('ни у одного сценария библиотеки', () => {
    const { world, tickets } = loadScenarios(SCENARIOS)

    for (const s of SCENARIOS) {
      const dump = JSON.stringify(briefFor(s, tickets.find(t => t.scenarioId === s.id)!, world, false))
      const secrets = [
        s.rootCause,
        ...s.objectives.flatMap(o => [o.title, o.why, ...o.steps]),
        ...(s.asks ?? []).map(a => a.ask),
        ...(s.silentFaultChecks ?? []).map(c => c.message).filter(Boolean),
        ...s.actionsToAvoid,
      ]
      for (const secret of secrets) expect(dump, `${s.id}: ${secret}`).not.toContain(secret)
    }
  })
})

describe('сводка заявителя', () => {
  /*
    Состояние проблемы вычисляется, а не задаётся: заявитель сообщает
    то, что видит. Это тот же механизм, по которому он отказывается
    подтверждать непочиненное.
  */
  it('несёт карточку, жалобу и знания персоны, а состояние — из мира', () => {
    const { world, ticket } = loadScenario(identityAccountLockout)
    const brief = briefFor(identityAccountLockout, ticket, world, allHold(world, identityAccountLockout.fixedWhen))

    expect(brief).toMatchObject({
      displayName: 'Elena Varga',
      dept: 'Продажи',
      complaint: ticket.description,
      knows: identityAccountLockout.persona.knows,
      problemGone: false,
    })
    expect(brief.scripted[0]).toEqual(identityAccountLockout.persona.scripted[0])

    applyInject(world, [{ path: 'org.users[samAccountName=e.varga].lockedOut', value: false }])
    expect(briefFor(identityAccountLockout, ticket, world, allHold(world, identityAccountLockout.fixedWhen)).problemGone).toBe(true)
  })

  it('отдаёт копии массивов, а не ссылки на сценарий', () => {
    const { world, ticket } = loadScenario(identityAccountLockout)
    briefFor(identityAccountLockout, ticket, world, allHold(world, identityAccountLockout.fixedWhen)).knows.push('подделка')
    expect(identityAccountLockout.persona.knows).not.toContain('подделка')
  })
})

/**
 * Коллега из справочника: позвонить можно любому, и это приём первой
 * линии — «а у вас так же?».
 */
describe('сводка коллеги', () => {
  it('посторонний: знает свою карточку, у него всё работает, про чужое не знает', () => {
    const { world } = loadScenario(identityAccountLockout)
    const brief = contactBrief(world, 's.okafor')

    expect(brief).toMatchObject({
      bystander: true,
      displayName: 'Sam Okafor',
      complaint: '',
      problemGone: true,
    })
    expect(brief.knows.join(' ')).toContain('Финансы')
    expect(brief.doesntKnow.join(' ')).toContain('чужие')
    expect(contactBrief(world, 'нет.такого').displayName).toBe('нет.такого')
  })
})
