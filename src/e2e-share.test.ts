import { describe, it, expect } from 'vitest'
import { createGameStore } from './store/useGame'
import { findUser, findGroup, hasShareAccess } from './core/directory/accounts'
import { SCENARIOS } from './scenarios'

const clock = { now: () => new Date('2026-09-11T10:15:00.000Z') }

const SHARE = '\\\\fileserver.arcline.corp\\Finance-Reports'
const GROUP = 'GRP-Finance-Reports'

const store = () => {
  const g = createGameStore(clock, undefined, SCENARIOS.length)
  g.getState().start()
  const s = () => g.getState()
  const ticket = s().queue.tickets.find(t => t.scenarioId === 'identity-share-access')!
  s().claimTicket(ticket.number)
  return s
}

const GOOD_NOTE =
  'Nadia Haruna сообщила, что папка с отчётностью не открывается — пишет, '
  + 'что нет разрешений, при этом у коллег по отделу открывается. '
  + 'net user n.haruna показал, что она состоит только в GRP-All-Staff и '
  + 'GRP-Printer-Floor3. dsquery group -name GRP-Finance* нашёл группу '
  + 'GRP-Finance-Reports, которая и даёт доступ к Finance-Reports — её в '
  + 'списке не было. Добавил n.haruna в GRP-Finance-Reports и попросил выйти '
  + 'и войти заново, потому что членство попадает в билет при входе. '
  + 'Проверено: заявительница подтвердила, что папка открылась. Причина — '
  + 'незавершённое оформление: при приёме в отдел в группу не добавили.'

describe('инцидент с доступом к папке от начала до конца', () => {
  it('образцовое прохождение даёт полный вердикт', () => {
    const s = store()

    s().verifyRequester('manager', 'Dumisani Mbeki')
    s().runCommand('net user n.haruna')
    s().runCommand('dsquery group -name GRP-Finance*')
    s().addUserToGroup('n.haruna', GROUP)
    s().askRequesterTo('relogin')
    s().confirmWithUser()

    s().saveResolutionNotes(GOOD_NOTE)
    s().setResolutionCode('solved')
    s().resolveTicket()

    const card = s().scorecard!
    expect(card.silentFaults).toEqual([])
    expect(card.objectives.filter(o => !o.met).map(o => o.id)).toEqual([])
    expect(card.verdict).toBe('full')
  })

  /*
    Ловушка сценария: доступ выдан лично, минуя группу. Папка
    открывается сразу, заявительница довольна, тикет закрыт — а в правах
    осталась запись на человека.
  */
  it('доступ мимо группы — тихая поломка и провал', () => {
    const s = store()

    s().verifyRequester('manager', 'Dumisani Mbeki')
    s().runCommand('net user n.haruna')
    s().grantShareAccess('n.haruna', SHARE)
    s().confirmWithUser()

    s().saveResolutionNotes(GOOD_NOTE)
    s().setResolutionCode('solved')
    s().resolveTicket()

    const card = s().scorecard!
    expect(card.silentFaults).toHaveLength(1)
    expect(card.silentFaults[0]).toContain('минуя группу')
    expect(card.verdict).toBe('fail')
  })

  it('обход работает немедленно — потому и соблазнителен', () => {
    const s = store()
    s().verifyRequester('manager', 'Dumisani Mbeki')
    expect(hasShareAccess(s().world, 'n.haruna', SHARE)).toBe(false)

    s().grantShareAccess('n.haruna', SHARE)
    expect(hasShareAccess(s().world, 'n.haruna', SHARE)).toBe(true)
  })

  /*
    Вторая половина сценария: членство не действует до повторного
    входа. Техник добавил в группу и позвонил — заявительница скажет,
    что всё по-прежнему.
  */
  it('добавил в группу, но не попросил войти заново — заявительница не подтверждает', () => {
    const s = store()

    s().verifyRequester('manager', 'Dumisani Mbeki')
    s().addUserToGroup('n.haruna', GROUP)
    s().confirmWithUser()

    expect(s().session.flags.userConfirmed).toBe(false)
    expect(findUser(s().world, 'n.haruna')!.groups).toContain(GROUP)
    expect(hasShareAccess(s().world, 'n.haruna', SHARE)).toBe(false)
  })

  it('после повторного входа подтверждает', () => {
    const s = store()

    s().verifyRequester('manager', 'Dumisani Mbeki')
    s().addUserToGroup('n.haruna', GROUP)
    s().askRequesterTo('relogin')
    s().confirmWithUser()

    expect(s().session.flags.userConfirmed).toBe(true)
    expect(hasShareAccess(s().world, 'n.haruna', SHARE)).toBe(true)
  })

  /*
    Повторный вход без добавления в группу перевыпускает тот же билет.
    Это важно: просьба сама по себе ничего не лечит.
  */
  it('повторный вход без группы ничего не меняет', () => {
    const s = store()

    s().verifyRequester('manager', 'Dumisani Mbeki')
    s().askRequesterTo('relogin')
    s().confirmWithUser()

    expect(s().session.flags.userConfirmed).toBe(false)
    expect(hasShareAccess(s().world, 'n.haruna', SHARE)).toBe(false)
  })

  it('изменение без сверки личности помечается', () => {
    const s = store()

    s().addUserToGroup('n.haruna', GROUP)

    expect(s().session.flags.dangerousActions).toHaveLength(1)
    expect(s().session.changes.find(c => c.path.includes('groups'))!.authorized)
      .toBe(false)
  })
})

describe('связность: членство видно всеми инструментами', () => {
  it('до добавления группы нет ни в net user, ни в каталоге', () => {
    const s = store()
    s().runCommand('net user n.haruna')

    const printed = s().terminalLines.map(l => l.text).join('\n')
    expect(printed).not.toContain(GROUP)
    expect(findUser(s().world, 'n.haruna')!.groups).not.toContain(GROUP)
  })

  it('после добавления группа появляется в обеих сторонах членства', () => {
    const s = store()
    s().verifyRequester('manager', 'Dumisani Mbeki')
    s().addUserToGroup('n.haruna', GROUP)

    expect(findUser(s().world, 'n.haruna')!.groups).toContain(GROUP)
    expect(findGroup(s().world, GROUP)!.members).toContain('n.haruna')
  })

  /*
    Расхождение каталога и билета — главный диагностический признак
    этого сценария: в карточке группа уже есть, в сеансе её ещё нет.
    Именно это техник и должен увидеть, прежде чем догадается
    попросить войти заново.
  */
  it('до повторного входа каталог и билет расходятся', () => {
    const s = store()
    s().verifyRequester('manager', 'Dumisani Mbeki')
    s().addUserToGroup('n.haruna', GROUP)

    s().runCommand('net user n.haruna')
    s().runCommand('whoami /groups')
    const printed = s().terminalLines.map(l => l.text).join('\n')

    expect(printed).toContain(`*${GROUP}`)                // карточка каталога
    expect(printed).not.toContain(`ARCLINE\\${GROUP}`)    // билет входа
  })

  it('после повторного входа билет догоняет каталог', () => {
    const s = store()
    s().verifyRequester('manager', 'Dumisani Mbeki')
    s().addUserToGroup('n.haruna', GROUP)
    s().askRequesterTo('relogin')
    s().runCommand('whoami /groups')

    const printed = s().terminalLines.map(l => l.text).join('\n')
    expect(printed).toContain(`ARCLINE\\${GROUP}`)
  })

  it('группа знает, к какому ресурсу даёт доступ', () => {
    const s = store()
    expect(findGroup(s().world, GROUP)!.grantsAccessTo).toContain(SHARE)
  })
})

/*
  Работа мышью засчитывается наравне с командой.

  Найдено визуальной проверкой: инцидент пройден правильно — членство
  смотрел в консоли, как предлагает сам сценарий, — а разбор выдал
  «закрыто 0 из 2 диагностических целей». Консоль каталога, вокруг
  которой построен весь срез, для оценки не существовала.
*/
describe('доказательство цели: команда или открытая карточка', () => {
  const play = (s: ReturnType<typeof store>) => {
    s().addUserToGroup('n.haruna', GROUP)
    s().askRequesterTo('relogin')
    s().confirmWithUser()
    s().saveResolutionNotes(GOOD_NOTE)
    s().setResolutionCode('solved')
    s().resolveTicket()
  }

  it('расследование через консоль закрывает те же цели, что через команды', () => {
    const viaConsole = store()
    viaConsole().verifyRequester('manager', 'Dumisani Mbeki')
    viaConsole().inspectObject('user', 'n.haruna')
    viaConsole().inspectObject('group', GROUP)
    play(viaConsole)

    const viaCommands = store()
    viaCommands().verifyRequester('manager', 'Dumisani Mbeki')
    viaCommands().runCommand('net user n.haruna')
    viaCommands().runCommand('dsquery group -name GRP-Finance*')
    play(viaCommands)

    const ids = (s: ReturnType<typeof store>) =>
      s().scorecard!.objectives.filter(o => o.met).map(o => o.id)

    expect(ids(viaConsole)).toEqual(ids(viaCommands))
    expect(viaConsole().scorecard!.verdict).toBe('full')
  })

  it('расследование засчитано полностью', () => {
    const s = store()
    s().verifyRequester('manager', 'Dumisani Mbeki')
    s().inspectObject('user', 'n.haruna')
    s().inspectObject('group', GROUP)
    play(s)

    expect(s().scorecard!.dimensions.find(d => d.id === 'investigation')!.score).toBe(10)
  })

  it('без расследования цели остаются незакрытыми', () => {
    const s = store()
    s().verifyRequester('manager', 'Dumisani Mbeki')
    play(s)

    const unmet = s().scorecard!.objectives.filter(o => !o.met).map(o => o.id)
    expect(unmet).toContain('obj-see-membership')
    expect(unmet).toContain('obj-find-group')
  })

  it('открытая карточка другого человека не закрывает цель', () => {
    const s = store()
    s().verifyRequester('manager', 'Dumisani Mbeki')
    s().inspectObject('user', 's.okafor')
    play(s)

    expect(s().scorecard!.objectives.find(o => o.id === 'obj-see-membership')!.met)
      .toBe(false)
  })

  it('повторное открытие не дублируется в журнале', () => {
    const s = store()
    s().inspectObject('user', 'n.haruna')
    s().inspectObject('user', 'n.haruna')
    expect(s().session.inspected.filter(x => x === 'user:n.haruna')).toHaveLength(1)
  })
})
