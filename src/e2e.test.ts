import { describe, it, expect } from 'vitest'
import { createGameStore } from './store/useGame'
import { testContent } from './content/server/test-content'
import { hasShareAccess } from './core/directory/accounts'
import { defaultConfig } from './core/dialogue/types'
import { SCENARIOS } from './scenarios'
import { relatedTo } from './core/kb/search'
import { courseState } from './core/learning/state'
import { firstLine } from './courses/first-line'
import type { Answer, Check } from './core/learning/types'
import type { FetchLike } from './core/dialogue/openai'

/**
 * Сценарии от начала до конца.
 *
 * Здесь только то, что видно лишь целиком: образцовый проход каждого
 * сценария и развилки, ради которых сценарий существует. Форматы,
 * операции и флаги проверены на своих слоях.
 */

/**
 * Стор с окном на всю библиотеку и взятым тикетом сценария.
 *
 * Сценарий ставится первым: сетевые сценарии делят общий ресурс и в
 * окне не встречаются, и без этого нужный мог бы ждать в пуле.
 */
let elapsed = 0
const play = (scenarioId: string, iso: string, fetch?: FetchLike) => {
  elapsed = 0
  const library = [...SCENARIOS].sort((a, b) => Number(b.id === scenarioId) - Number(a.id === scenarioId))
  const g = createGameStore({ now: () => new Date(Date.parse(iso) + elapsed) }, fetch ? { fetch } : undefined,
    SCENARIOS.length, testContent({ scenarios: library }))
  const s = () => g.getState()
  s().claimTicket(s().queue.tickets.find(t => t.scenarioId === scenarioId)!.number)
  if (fetch) s().setDialogueConfig({ ...defaultConfig(), mode: 'local' })
  return s
}
type S = ReturnType<typeof play>

const close = (s: S, note: string, code: 'solved' | 'escalate' = 'solved') => {
  s().saveResolutionNotes(note)
  s().setResolutionCode(code)
  s().resolveTicket()
  return s().scorecard!
}
const unmet = (s: S) => s().scorecard!.objectives.filter(o => !o.met).map(o => o.id)
const dim = (s: S, id: string) => s().scorecard!.dimensions.find(d => d.id === id)!
const printed = (s: S) => s().terminalLines.map(l => l.text).join('\n')
/** Часы уходят вперёд, и стор тикает — как интерфейс раз в секунду. */
const wait = (s: S, seconds: number) => {
  elapsed += seconds * 1000
  s().tick()
}
const asset = (s: S, tag: string) => s().world.cmdb.find(a => a.tag === tag)!
const cli = (s: S, sw: string, ...lines: string[]) => {
  for (const l of lines) s().runSwitchCommand(sw, l)
  return s().consoles[sw]!.lines.map(l => l.text).join('\n')
}

describe('APIPA', () => {
  /*
    Каждое измерение проверяется поимённо, а не только вердикт: full
    переживает недобор в одном измерении. Так однажды осталась
    незамеченной ошибка порядка в resolveTicket — оценка считалась до
    закрытия тикета, и владение недобирало четыре балла.
  */
  it('образцовый проход: renew падает, release + renew чинит — десять во всех измерениях', () => {
    const s = play('net-apipa-no-lease', '2026-09-09T18:00:00.000Z')
    s().verifyRequester('manager', 'Elena Varga')
    s().runCommand('ipconfig /all')
    s().runCommand('ipconfig /renew')      // падает — так и задумано
    s().runCommand('ipconfig /release')
    s().runCommand('ipconfig /renew')
    s().runCommand('ping 8.8.8.8')
    s().runCommand('nslookup internal-portal.arcline.corp')
    s().confirmWithUser()

    const card = close(s, 'Priya Raman сообщила, что не открываются сайты, локальные программы '
      + 'работают. ipconfig /all показал 169.254.23.11 без шлюза и без DNS — это '
      + 'исключило неверные настройки DNS. ipconfig /renew завершился ошибкой '
      + 'обращения к серверу. После ipconfig /release повторный renew выдал '
      + '10.20.14.88 со шлюзом и DNS. Проверено: ping 8.8.8.8 отвечает, '
      + 'заявительница подтвердила по телефону, что сайты открываются. '
      + 'Причина — кратковременная недоступность ретрансляции при загрузке.')

    expect(card.verdict).toBe('full')
    expect(card.silentFaults).toEqual([])
    expect(unmet(s)).toEqual([])
    expect(card.note.score).toBe(10)
    expect(card.dimensions.filter(d => d.score < 10).map(d => `${d.id}=${d.score}`)).toEqual([])
    expect(card.points).toBe(54)
  })
})

describe('диспетчер печати', () => {
  const at = '2026-09-10T10:00:00.000Z'
  const NOTE = 'Sam Okafor сообщил, что документы не печатаются и задания копятся в '
    + 'очереди. sc query spooler показал, что диспетчер печати остановлен, '
    + 'а тип запуска — «отключена». В журнале событий нашёлся сбой: драйвер '
    + 'kiyomi_pcl6.dll трижды ронял spoolsv.exe, после чего службу отключили. '
    + 'Вернул тип запуска «автоматически» и запустил службу. Проверено: '
    + 'заявитель подтвердил, что лист вышел. Передаю второй линии: пока '
    + 'драйвер Kiyomi PCL6 не заменён, падения повторятся.'
  const restart = (s: S) => {
    s().setServiceStartType('Spooler', 'auto')
    s().startServiceOn('Spooler')
  }

  it('образцовый проход: журнал событий, тип запуска, старт, подтверждение', () => {
    const s = play('print-spooler-stopped', at)
    s().runCommand('sc query spooler')
    s().openApp('eventvwr')
    restart(s)
    s().confirmWithUser()
    expect(close(s, NOTE).verdict).toBe('full')
    expect(unmet(s)).toEqual([])
  })

  /* Терминалом этот сценарий честно не закрыть: причина видна только в журнале. */
  it('запустил службу, не прочитав журнал, — цель не закрыта', () => {
    const s = play('print-spooler-stopped', at)
    restart(s)
    s().confirmWithUser()
    expect(close(s, NOTE).verdict).not.toBe('full')
    expect(unmet(s)).toContain('obj-read-log')
  })

  /* Окно «Службы» и команда sc — представления одной операции, и через стор тоже. */
  it('остановка службы мышью и командой пишет в журнал одно и то же', () => {
    const viaWindow = play('print-spooler-stopped', at)
    restart(viaWindow)
    viaWindow().stopServiceOn('Spooler')

    const viaCommand = play('print-spooler-stopped', at)
    viaCommand().runCommand('sc config spooler start= auto')
    viaCommand().runCommand('sc start spooler')
    viaCommand().runCommand('sc stop spooler')

    expect(viaWindow().session.changes).toEqual(viaCommand().session.changes)
    expect(viaWindow().world.devices['AL-DSK-0192']).toEqual(viaCommand().world.devices['AL-DSK-0192'])
  })

  it('вернул тип «отключена» — тихая поломка до первой перезагрузки', () => {
    const s = play('print-spooler-stopped', at)
    s().openApp('eventvwr')
    restart(s)
    s().setServiceStartType('Spooler', 'disabled')
    s().confirmWithUser()
    const card = close(s, NOTE)
    expect(card.silentFaults).toEqual([expect.stringContaining('перезагрузк')])
    expect(card.verdict).toBe('fail')
  })
})

describe('блокировка учётной записи', () => {
  const at = '2026-09-10T08:30:00.000Z'
  const NOTE = 'Elena Varga сообщила, что не может войти — система пишет, что учётная '
    + 'запись заблокирована. net user e.varga показал блокировку и девять '
    + 'неудачных входов. В журнале событий нашлось событие 4740: источник '
    + 'блокировки — устройство ARC-MOBILE-0512, рабочий телефон, и подряд '
    + 'идущие 4771 с одного адреса. Пароль верный, поэтому не сбрасывал: снял '
    + 'блокировку с e.varga и попросил удалить и заново добавить почту ArcMail '
    + 'на телефоне. Проверено: заявительница подтвердила, что вход прошёл. '
    + 'При повторении смотреть телефон — причина в кэше пароля.'
  const investigate = (s: S) => {
    s().verifyRequester('manager', 'Dumisani Mbeki')
    s().runCommand('net user e.varga')
    s().openApp('eventvwr')
  }

  it('образцовый проход: журнал, разблокировка, просьба про телефон', () => {
    const s = play('identity-account-lockout', at)
    investigate(s)
    s().unlockUser('e.varga')
    s().askRequesterTo('clear-phone')
    s().confirmWithUser()
    expect(close(s, NOTE).verdict).toBe('full')
    expect(unmet(s)).toEqual([])
  })

  /*
    Самая поучительная развилка: блокировку сняли, заявитель доволен, а
    телефон продолжает ломиться, и учётка заблокируется снова до обеда.
  */
  it('разблокировал, но не сказал про телефон, — тихая поломка', () => {
    const s = play('identity-account-lockout', at)
    investigate(s)
    s().unlockUser('e.varga')
    s().confirmWithUser()
    const card = close(s, NOTE)
    expect(card.silentFaults).toEqual([expect.stringContaining('заблокируется снова')])
    expect(card.verdict).toBe('fail')
  })

  /*
    Не открыв журнал, техник не узнаёт про телефон и попросить о нём не
    может: просьба закрыта до выяснения причины.
  */
  it('разблокировал, не открыв журнал, — просьба закрыта, источник остался', () => {
    const s = play('identity-account-lockout', at)
    s().verifyRequester('manager', 'Dumisani Mbeki')
    s().unlockUser('e.varga')
    s().askRequesterTo('clear-phone')
    s().confirmWithUser()
    const card = close(s, 'Снял блокировку с e.varga, пользователь вошёл.')
    expect(unmet(s)).toEqual(expect.arrayContaining(['obj-find-source', 'obj-ask-phone']))
    expect(card.silentFaults).toHaveLength(1)
    expect(card.verdict).toBe('fail')
  })

  /* Ловушка сценария: сбросить пароль вместо разблокировки, да ещё без сверки. */
  it('сброс пароля без сверки личности валит вердикт', () => {
    const s = play('identity-account-lockout', at)
    s().resetUserPassword('e.varga')
    s().unlockUser('e.varga')
    s().openApp('eventvwr')
    s().askRequesterTo('clear-phone')
    s().confirmWithUser()
    expect(close(s, NOTE).verdict).toBe('fail')
    expect(dim(s, 'authority').score).toBe(0)
  })

  const CONSOLE_NOTE = 'Elena Varga сообщила, что не может войти — пишет, что учётная запись '
    + 'заблокирована. Смотрел карточку в консоли каталога: блокировка и девять '
    + 'неудачных входов, последний вход вчера вечером. В журнале событий событие '
    + '4740: источник — ARC-MOBILE-0512, рабочий телефон. Пароль верный, поэтому '
    + 'не сбрасывал: снял блокировку с e.varga и попросил удалить и заново '
    + 'добавить почту на телефоне. Проверено: заявительница подтвердила, что '
    + 'вход прошёл. При повторении смотреть телефон — причина в кэше пароля.'

  const byConversation = async (s: S) => {
    s().callTo('e.varga')
    await s().say('Здравствуйте, это служба поддержки, разбираюсь с вашей заявкой.')
    await s().say('У коллег рядом так же?')
    s().verifyRequester('manager', 'Dumisani Mbeki')
    s().inspectObject('user', 'e.varga')
    s().openApp('eventvwr')
    s().unlockUser('e.varga')
    s().askRequesterTo('clear-phone')
    await s().say('Попробуйте войти сейчас, пожалуйста.')
  }

  /*
    Пройдено в браузере руками: расследование мышью, разговор вместо
    кнопки «Позвонить», подтверждение через «попробуйте войти». Терминал
    не понадобился ни разу.
  */
  it('проход разговором и мышью — без единой команды в терминале', async () => {
    const s = play('identity-account-lockout', at)
    const ticket = s().queue.tickets.find(t => t.number === s().queue.assigned)!
    await byConversation(s)

    expect(s().session.flags).toMatchObject({ announcedBeforeActing: true, userConfirmed: true })
    expect(s().session.dialogue.at(-1)!.text).toContain('пустило')

    const card = close(s, CONSOLE_NOTE)
    expect(s().session.commands).toHaveLength(0)
    expect(card.verdict).toBe('full')
    expect(unmet(s)).toEqual([])
    expect(dim(s, 'investigation')).toMatchObject({
      score: 10, explain: expect.stringContaining('Масштаб выяснен'),
    })
    expect(ticket.communications.length).toBeGreaterThanOrEqual(8)
    expect(ticket.communications.every(c => c.with === 'e.varga')).toBe(true)
  })

  /**
   * Проверка среза 4 дословно: «выдернуть сеть и выключить модель —
   * тренировка должна продолжаться без единой ошибки». Размыкатель не
   * даёт каждой реплике ждать таймаут.
   */
  it('модель выключена — проход тот же, с плашкой и одним обращением к модели', async () => {
    let calls = 0
    const dead: FetchLike = async () => { calls++; throw new TypeError('Failed to fetch') }
    const s = play('identity-account-lockout', at, dead)

    await byConversation(s)
    expect(s().dialogueNotice).toContain('недоступна')
    expect(s().session.dialogue.filter(d => d.speaker === 'requester')
      .every(d => d.text.length > 10)).toBe(true)
    expect(calls).toBe(1)
    expect(close(s, CONSOLE_NOTE).verdict).toBe('full')
  })
})

describe('доступ к папке отдела', () => {
  const at = '2026-09-11T10:15:00.000Z'
  const SHARE = '\\\\fileserver.arcline.corp\\Finance-Reports'
  const GROUP = 'GRP-Finance-Reports'
  const NOTE = 'Nadia Haruna сообщила, что папка с отчётностью не открывается — пишет, '
    + 'что нет разрешений, при этом у коллег по отделу открывается. '
    + 'net user n.haruna показал, что она состоит только в GRP-All-Staff и '
    + 'GRP-Printer-Floor3. dsquery group -name GRP-Finance* нашёл группу '
    + 'GRP-Finance-Reports, которая и даёт доступ к Finance-Reports — её в '
    + 'списке не было. Добавил n.haruna в GRP-Finance-Reports и попросил выйти '
    + 'и войти заново, потому что членство попадает в билет при входе. '
    + 'Проверено: заявительница подтвердила, что папка открылась. Причина — '
    + 'незавершённое оформление: при приёме в отдел в группу не добавили.'
  const finish = (s: S) => {
    s().addUserToGroup('n.haruna', GROUP)
    s().askRequesterTo('relogin')
    s().confirmWithUser()
    return close(s, NOTE)
  }

  it('образцовый проход: членство, группа доступа, добавление, повторный вход', () => {
    const s = play('identity-share-access', at)
    s().verifyRequester('manager', 'Dumisani Mbeki')
    s().runCommand('net user n.haruna')
    s().runCommand('dsquery group -name GRP-Finance*')
    expect(finish(s).verdict).toBe('full')
    expect(unmet(s)).toEqual([])
  })

  /*
    Ловушка сценария: доступ выдан лично, минуя группу. Папка
    открывается сразу — потому обход и соблазнителен, — а в правах
    осталась запись на человека.
  */
  it('доступ мимо группы работает сразу — и это тихая поломка', () => {
    const s = play('identity-share-access', at)
    s().verifyRequester('manager', 'Dumisani Mbeki')
    s().runCommand('net user n.haruna')
    s().grantShareAccess('n.haruna', SHARE)
    expect(hasShareAccess(s().world, 'n.haruna', SHARE)).toBe(true)
    s().confirmWithUser()

    const card = close(s, NOTE)
    expect(card.silentFaults).toEqual([expect.stringContaining('минуя группу')])
    expect(card.verdict).toBe('fail')
  })

  /*
    Вторая половина сценария: членство действует только после повторного
    входа. Расхождение каталога и билета — главный диагностический
    признак: `net user` уже показывает группу, `whoami /groups` — ещё нет.
    А повторный вход без группы перевыпускает тот же билет.
  */
  it('без повторного входа заявительница не подтверждает, и каталог расходится с билетом', () => {
    const s = play('identity-share-access', at)
    s().verifyRequester('manager', 'Dumisani Mbeki')
    s().askRequesterTo('relogin')
    s().confirmWithUser()
    expect(s().session.flags.userConfirmed).toBe(false)

    s().addUserToGroup('n.haruna', GROUP)
    s().confirmWithUser()
    s().runCommand('net user n.haruna')
    s().runCommand('whoami /groups')
    expect(s().session.flags.userConfirmed).toBe(false)
    expect(printed(s)).toContain(`*${GROUP}`)
    expect(printed(s)).not.toContain(`ARCLINE\\${GROUP}`)

    s().askRequesterTo('relogin')
    s().runCommand('whoami /groups')
    s().confirmWithUser()
    expect(printed(s)).toContain(`ARCLINE\\${GROUP}`)
    expect(s().session.flags.userConfirmed).toBe(true)
  })

  /*
    Найдено визуальной проверкой: инцидент пройден правильно — членство
    смотрел в консоли, как предлагает сам сценарий, — а разбор выдал
    «закрыто 0 из 2 диагностических целей». Карточка другого человека
    при этом цель не закрывает, а без расследования цели открыты.
  */
  it('расследование мышью закрывает те же цели, что командами', () => {
    const viaConsole = play('identity-share-access', at)
    viaConsole().verifyRequester('manager', 'Dumisani Mbeki')
    viaConsole().inspectObject('user', 'n.haruna')
    viaConsole().inspectObject('user', 'n.haruna')
    viaConsole().inspectObject('group', GROUP)
    expect(viaConsole().session.inspected).toEqual(['user:n.haruna', 'group:grp-finance-reports'])
    expect(finish(viaConsole).verdict).toBe('full')
    expect(dim(viaConsole, 'investigation').score).toBe(10)

    const wrongCard = play('identity-share-access', at)
    wrongCard().verifyRequester('manager', 'Dumisani Mbeki')
    wrongCard().inspectObject('user', 's.okafor')
    finish(wrongCard)
    expect(unmet(wrongCard)).toEqual(expect.arrayContaining(['obj-see-membership', 'obj-find-group']))
  })

  /**
   * «Выйти и войти заново» — обычная просьба первой линии, и попросить
   * о ней до того, как найдена причина, естественно. Заявительница
   * честно скажет, что не помогло; но просьба обязана остаться
   * доступной, иначе единственный путь к решению закрыт первой же
   * разумной попыткой.
   */
  it('ранняя просьба войти заново не закрывает дорогу к полному вердикту', () => {
    const s = play('identity-share-access', at)
    s().verifyRequester('manager', 'Dumisani Mbeki')
    s().askRequesterTo('relogin')
    expect(s().session.dialogue.at(-1)!.text).toContain('всё то же самое')

    s().runCommand('net user n.haruna')
    s().runCommand('dsquery group -name GRP-Finance*')
    const card = finish(s)
    expect(s().session.askedFor).toEqual(['relogin'])
    expect(card.verdict).toBe('full')
  })
})

describe('переезд в чужой VLAN', () => {
  const at = '2026-09-12T09:20:00.000Z'
  const SW = 'SW-FL3-01'
  const port = (s: S) => s().world.network.switches[0]!.ports.find(p => p.name === 'Gi1/0/22')!
  const NOTE = 'Tomas Lindqvist сообщил, что после переезда за стол 3-22 не открываются '
    + 'сайты и почта. ipconfig /all показал самоназначенный адрес 169.254.126.34 без шлюза. '
    + 'ipconfig /release и ipconfig /renew не помогли — DHCP не отвечает, эту версию исключил. '
    + 'show mac address-table address f439.095b.7e22 нашёл машину на порту Gi1/0/22 в VLAN 40 — '
    + 'это бывший порт принтера. Перевёл Gi1/0/22 в VLAN 20, передёрнул порт, машина получила '
    + '10.20.14.93; конфигурацию сохранил write memory. Проверено: заявитель подтвердил, что '
    + 'сайты открываются. При следующем переезде проверять VLAN порта розетки.'
  const diagnose = (s: S) => {
    s().verifyRequester('manager', 'Dumisani Mbeki')
    s().runCommand('ipconfig /all')
    s().runCommand('ipconfig /release')
    s().runCommand('ipconfig /renew')
    cli(s, SW, 'sh mac add add f439.095b.7e22', 'enable', 'sh run int gi1/0/22')
  }

  it('образцовый проход консолью: MAC → порт → VLAN → сохранение', () => {
    const s = play('net-wrong-vlan-port', at)
    diagnose(s)
    cli(s, SW, 'conf t', 'int gi1/0/22', 'switchport access vlan 20', 'shutdown', 'no shutdown', 'end', 'wr')
    s().confirmWithUser()
    const card = close(s, NOTE)

    expect(unmet(s)).toEqual([])
    expect(card.silentFaults).toEqual([])
    expect(card.note.parts.filter(p => !p.earned).map(p => p.id)).toEqual([])
    expect(card.verdict).toBe('full')
    expect(s().world.devices['AL-LPT-0788']!.adapters[0]!.ip).toBe('10.20.14.93')
  })

  /*
    Развилка сценария: выглядит как APIPA, но в VLAN 40 DHCP нет, и
    release + renew не помогают. Ответ на коммутаторе, а не на машине.
  */
  it('renew без смены VLAN не помогает — заявитель не подтверждает', () => {
    const s = play('net-wrong-vlan-port', at)
    diagnose(s)
    expect(printed(s)).toContain('unable to contact your DHCP server')
    s().confirmWithUser()
    expect(s().session.flags.userConfirmed).toBe(false)
  })

  /* Несохранённая смена VLAN переживёт только до перезагрузки коммутатора. */
  it('VLAN сменён без сохранения — тихая поломка', () => {
    const s = play('net-wrong-vlan-port', at)
    diagnose(s)
    cli(s, SW, 'conf t', 'int gi1/0/22', 'sw acc vl 20', 'shut', 'no shut', 'end')
    s().confirmWithUser()
    const card = close(s, NOTE)
    expect(card.silentFaults).toEqual([expect.stringContaining('не сохранена')])
    expect(card.verdict).toBe('fail')
    expect(port(s).saved.accessVlan).toBe(40)
  })

  /* Карточка порта в серверной — доказательство наравне с командой. */
  it('проход мышью закрывает те же цели', () => {
    const s = play('net-wrong-vlan-port', at)
    s().verifyRequester('manager', 'Dumisani Mbeki')
    s().runCommand('ipconfig /all')
    s().inspectObject('port', `${SW}/Gi1/0/22`)
    expect(s().setPortVlan(SW, 'Gi1/0/22', 20)).toEqual({ ok: true })
    s().setPortEnabled(SW, 'Gi1/0/22', false)
    s().setPortEnabled(SW, 'Gi1/0/22', true)
    s().saveSwitchConfig(SW)
    s().confirmWithUser()
    const card = close(s, NOTE)
    expect(unmet(s)).toEqual([])
    expect(card.silentFaults).toEqual([])
  })
})

describe('пропавшая ретрансляция', () => {
  const at = '2026-09-10T08:40:00.000Z'
  const helpers = (s: S) => s().world.network.switches[1]!.vlanInterfaces.find(v => v.vlan === 20)!.helpers
  const NOTE = 'Dumisani Mbeki сообщил, что с утра нет сети — не открываются ни почта, ни сайты; '
    + 'у соседей по этажу то же самое. ipconfig /all показал самоназначенный адрес 169.254.32.122. '
    + 'ipconfig /release и ipconfig /renew не помогли — DHCP не отвечает. В серверной DHCP01 '
    + 'исправен, но запросов из VLAN 20 нет. На CR-01 show running-config interface vlan20: '
    + 'ip helper-address отсутствует, в журнале CR-01 правка конфигурации в 02:14. Передаю '
    + 'сетевой группе для восстановления ретрансляции на Vlan20, заявитель предупреждён.'
  const investigate = async (s: S) => {
    s().verifyRequester('office', '4-01')
    s().runCommand('ipconfig /all')
    s().runCommand('ipconfig /release')
    s().runCommand('ipconfig /renew')
    s().callTo('d.mbeki')
    await s().say('У коллег рядом так же?')
    s().inspectObject('device', 'DHCP01')
    cli(s, 'CR-01', 'enable', 'sh run int vlan 20', 'sh log')
  }

  /*
    Первая линия находит причину, но починить её не может и не должна:
    это конфигурация ядра. Образцовый исход — эскалация с доказательствами
    и предупреждённым заявителем.
  */
  it('образцовый проход: доказательства, передача, предупреждение — эскалация на full', async () => {
    const s = play('net-dhcp-relay-missing', at)
    await investigate(s)
    expect(s().consoles['CR-01']!.lines.some(l => l.text.includes('Sep 10 02:14:07'))).toBe(true)
    s().informRequester()
    const card = close(s, NOTE, 'escalate')

    expect(unmet(s)).toEqual([])
    expect(card.note.score).toBe(10)
    expect(card.dimensions.filter(d => d.score < 10).map(d => `${d.id}=${d.score}`)).toEqual([])
    expect(card.verdict).toBe('full')
    // Вторая линия починила после передачи.
    expect(helpers(s)).toEqual(['10.20.10.5'])
  })

  it('ретрансляция своими руками — отказ, полномочия 0, вердикт fail', async () => {
    const s = play('net-dhcp-relay-missing', at)
    await investigate(s)
    expect(cli(s, 'CR-01', 'conf t', 'int vlan 20', 'ip helper-address 10.20.10.5'))
      .toMatch(/Command authorization failed\.$/)
    expect(helpers(s)).toEqual([])
    s().informRequester()
    const card = close(s, NOTE, 'escalate')
    expect(dim(s, 'authority').score).toBe(0)
    expect(card.verdict).toBe('fail')
  })
})

describe('док-станция на гарантии', () => {
  const at = '2026-09-28T10:00:00.000Z'
  const NOTE = 'Elena Varga сообщила, что мониторы и мышь через док-станцию не работают, сам '
    + 'ноутбук работает. В диспетчере устройств у Halyard D6000 USB-C Dock ошибка Code 43. '
    + 'Попросил переподключить кабель дока — не помогло, версию с контактом исключил. В карточке '
    + 'актива CMDB у дока AL-P2031 гарантия до 2027-03-10. Оформил замену SHP-1041: док AL-P2040 '
    + 'со склада на стол 3-20, после доставки заявительница подтвердила, что мониторы работают. '
    + 'Старый док AL-P2031 отправлен вендору по гарантии. При повторении проверить кабель USB-C.'
  const investigate = (s: S) => {
    s().verifyRequester('manager', 'Dumisani Mbeki')
    s().openApp('devmgmt')
    s().askRequesterTo('reseat')
    s().inspectObject('asset', 'AL-P2031')
  }

  /*
    Замену везёт курьер: тикет ждёт поставку, отпускает слот и
    возвращается с журналом. Всё выясненное до отправки остаётся в оценке.
  */
  it('образцовый проход: Code 43, гарантия, замена со склада, ожидание, RMA старого — full', () => {
    const s = play('hw-dock-failed', at)
    const number = s().queue.assigned!
    investigate(s)
    expect(s().createShipment({ type: 'dock-monitor-swap', assetTag: 'AL-P2040' }))
      .toEqual({ ok: true, id: 'SHP-1041', flagged: false })
    expect(s().waitForShipment()).toEqual({ ok: true })
    wait(s, 90)
    s().claimTicket(number)
    s().confirmWithUser()
    s().createShipment({ type: 'vendor-rma', assetTag: 'AL-P2031' })
    const card = close(s, NOTE)

    expect(unmet(s)).toEqual([])
    expect(card.silentFaults).toEqual([])
    expect(card.note.parts.filter(p => !p.earned).map(p => p.id)).toEqual([])
    expect(card.dimensions.filter(d => d.score < 10).map(d => `${d.id}=${d.score}`)).toEqual([])
    expect(card.verdict).toBe('full')
  })

  it('утилизация дока на гарантии — флаг шлюза, вердикт fail', () => {
    const s = play('hw-dock-failed', at)
    investigate(s)
    s().createShipment({ type: 'dock-monitor-swap', assetTag: 'AL-P2040' })
    wait(s, 90)
    s().confirmWithUser()
    expect(s().createShipment({ type: 'disposal', assetTag: 'AL-P2031' })).toMatchObject({ ok: true, flagged: true })
    const card = close(s, NOTE)
    expect(dim(s, 'authority').score).toBe(0)
    expect(card.verdict).toBe('fail')
  })

  /*
    Закрыть до доставки можно, но заявительница честно скажет, что замены
    нет. И RMA старого дока раньше, чем приехал новый, — дока у машины нет
    вовсе, условие отвечает «нет», а не падает.
  */
  it('до доставки подтверждения нет; ранний RMA старого дока ничего не ломает', () => {
    const s = play('hw-dock-failed', at)
    investigate(s)
    s().createShipment({ type: 'vendor-rma', assetTag: 'AL-P2031' })
    s().createShipment({ type: 'dock-monitor-swap', assetTag: 'AL-P2040' })
    expect(() => s().confirmWithUser()).not.toThrow()
    expect(s().session.flags.userConfirmed).toBe(false)
    const early = close(s, NOTE)
    expect(early.verdict).not.toBe('full')

    wait(s, 90)
    expect(asset(s, 'AL-P2040').attachedTo).toBe('AL-LPT-0512')
  })
})

describe('изношенная гарнитура', () => {
  const at = '2026-09-28T10:00:00.000Z'
  const NOTE = 'Sam Okafor сообщил, что гарнитура трещит и пропадает микрофон, если пошевелить '
    + 'провод. В диспетчере устройств Halyard H340 USB Headset исправна — драйвер исключил. '
    + 'Попросил подключить в другой порт — не помогло. В карточке актива CMDB гарнитура AL-P3017: '
    + 'гарантия истекла 2025-02-01. Оформил гарнитуру на стол SHP-1041: AL-P3030 со склада, после '
    + 'доставки заявитель подтвердил, что звук чистый. Старую AL-P3017 отправил в утилизацию. '
    + 'При повторении сначала проверять гарантию.'
  const replace = (s: S) => {
    s().verifyRequester('manager', 'Dumisani Mbeki')
    s().openApp('devmgmt')
    s().askRequesterTo('other-port')
    s().inspectObject('asset', 'AL-P3017')
    s().createShipment({ type: 'headset-to-desk', assetTag: 'AL-P3030' })
    wait(s, 90)
    s().confirmWithUser()
  }

  it('образцовый проход: драйвер исправен, гарантия истекла, замена и утилизация — full', () => {
    const s = play('hw-headset-worn', at)
    replace(s)
    expect(s().createShipment({ type: 'disposal', assetTag: 'AL-P3017' })).toMatchObject({ ok: true, flagged: false })
    const card = close(s, NOTE)
    expect(unmet(s)).toEqual([])
    expect(card.silentFaults).toEqual([])
    expect(card.dimensions.filter(d => d.score < 10).map(d => `${d.id}=${d.score}`)).toEqual([])
    expect(card.verdict).toBe('full')
  })

  /*
    Ловушка: RMA без гарантии. Вендор отклоняет, гарнитура возвращается
    на склад неисправной и числится запасом — её отправят кому-нибудь на
    стол.
  */
  it('RMA без гарантии — отказ вендора, неисправное на складе, fail', () => {
    const s = play('hw-headset-worn', at)
    replace(s)
    s().createShipment({ type: 'vendor-rma', assetTag: 'AL-P3017' })
    wait(s, 141)
    expect(asset(s, 'AL-P3017')).toMatchObject({
      lifecycle: 'in-stock', condition: 'faulty', note: 'Отклонено вендором: гарантия истекла',
    })
    const card = close(s, NOTE)
    expect(card.silentFaults).toEqual([expect.stringContaining('запасом')])
    expect(card.verdict).toBe('fail')
  })
})

/*
  База знаний зарабатывается: заметка закрытого тикета становится
  черновиком, и через смену тот же сценарий приходит со своей статьёй.
*/
describe('база знаний', () => {
  it('своя статья возвращается с повтором проблемы и копит источники', () => {
    const s = play('net-apipa-no-lease', '2026-09-28T10:00:00.000Z')
    s().runCommand('ipconfig /release')
    s().runCommand('ipconfig /renew')
    s().confirmWithUser()
    close(s, 'Не открывались сайты: самоназначенный адрес. ipconfig /release и /renew выдали 10.20.14.88.')
    expect(s().progress.kb).toMatchObject([{ id: 'KB-0001', type: 'network', status: 'draft', version: 1 }])

    s().reset()
    const again = s().queue.tickets.find(t => t.scenarioId === 'net-apipa-no-lease')!
    expect(relatedTo(s().progress.kb, again).map(a => a.id)).toEqual(['KB-0001'])
    s().claimTicket(again.number)
    s().runCommand('ipconfig /release')
    s().runCommand('ipconfig /renew')
    close(s, 'Повтор: тот же самоназначенный адрес, release и renew.')
    expect(s().progress.kb).toHaveLength(1)
    expect(s().progress.kb[0]).toMatchObject({ version: 1 })
    expect(s().progress.kb[0]!.sources).toHaveLength(2)
  })
})

describe('курсы', () => {
  it('секция проходится целиком и открывает следующую; урок ведёт на свой тикет', () => {
    const g = createGameStore({ now: () => new Date('2026-09-30T10:00:00.000Z') }, undefined, undefined, testContent())
    const s = () => g.getState()
    const right = (c: Check): Answer => (c.kind === 'choice' ? c.options.findIndex(o => o.correct) : c.accept[0]!)
    const process = firstLine.sections[0]!

    for (const l of process.lessons) {
      for (const c of l.checks) expect(s().answerCheck('first-line', 'process', l.id, c.id, right(c))).toMatchObject({ correct: true })
    }
    const answers = Object.fromEntries(process.quiz.map(q => [q.id, right(q)]))
    expect(s().submitQuiz('first-line', 'process', answers)).toMatchObject({ ok: true, grade: { score: 5, passed: true } })
    expect(courseState(firstLine, s().progress.learning).sections.map(x => x.status))
      .toEqual(['open', 'open', 'locked', 'locked'])

    // Урок «DHCP и самоназначенный адрес» ведёт на тикет APIPA.
    expect(s().practice(firstLine.sections[1]!.lessons[1]!.practice!)).toEqual({ status: 'opened' })
    s().runCommand('ipconfig /release')
    s().runCommand('ipconfig /renew')
    s().confirmWithUser()
    s().saveResolutionNotes('ipconfig /release и ipconfig /renew выдали адрес, заявитель подтвердил.')
    s().setResolutionCode('solved')
    s().resolveTicket()
    expect(s().progress.records.map(r => r.scenarioId)).toEqual(['net-apipa-no-lease'])
  })
})

describe('интервью', () => {
  it('без модели: от знакомства до вердикта, опыт по закрытому тикету', async () => {
    const s = play('net-apipa-no-lease', '2026-09-30T10:00:00.000Z')
    s().runCommand('ipconfig /all')
    s().runCommand('ipconfig /release')
    s().runCommand('ipconfig /renew')
    s().confirmWithUser()
    close(s, 'ipconfig /all показал 169.254.23.11; ipconfig /release и ipconfig /renew выдали адрес, заявитель подтвердил.')

    expect(s().startInterview('first-line')).toEqual({ ok: true })
    const answers = [
      'Работал в поддержке на учёбе, нравится разбираться и помогать людям.',
      'Это значит, что DHCP не ответил.',
      'Сначала ipconfig /release, потом /renew; если снова — смотрю порт и VLAN.',
      'Сверю личность контрольным вопросом, разблокирую учётку и найду источник в журнале — обычно телефон со старым паролем.',
      'Откажу: пароль меняю только владельцу после сверки личности; если нужны данные — через руководителя выдать доступ.',
      'Добавлю в группу отдела, попрошу выйти и войти заново, проверю whoami /groups и что папка открывается.',
      'Сначала журнал событий — почему упала; если отключена, верну тип запуска через sc config и запущу; причину — драйвер — передам на вторую линию.',
      'Причина — DHCP не ответил, адрес был 169.254. Нашёл через ipconfig /all, сделал release и renew, заявитель подтвердил, что сайты открываются.',
    ]
    for (const a of answers) await s().answerInterview(a)
    expect(s().interview!.stage).toBe('questions')
    await s().askInterviewer('Какой у вас график смен?')
    expect(s().interview!.transcript.at(-1)!.text)
      .toBe('Две смены по будням: с восьми до пяти и с одиннадцати до восьми. В выходные — дежурства по графику, раз в месяц.')

    const { result } = s().finishInterview()!
    expect(result).toMatchObject({ verdict: 'hire', intro: 1, technical: 1, experience: 1, questionsAsked: 1 })
    expect(result.items.map(i => [i.id, i.answers.length, i.missing])).toEqual([
      ['intro', 1, []],
      ['apipa', 2, []],  // первый ответ — только DHCP, прозвучало уточнение
      ['lockout', 1, []],
      ['colleague', 1, []],
      ['share', 1, []],
      ['service', 1, []],
      ['exp-apipa', 1, []],
    ])
    expect(result.items.at(-1)!.prompt).toBe('Вы закрывали тикет «Не открываются сайты — нет доступа в сеть». '
      + 'Расскажите: в чём была причина, как вы её нашли и как убедились, что всё работает?')
  })
})
