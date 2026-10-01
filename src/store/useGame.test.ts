import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createGameStore } from './useGame'
import { testContent } from '../content/server/test-content'
import { deferred } from '../content/testing'
import { ContentError, EXPIRED, UNAVAILABLE } from '../content/port'
import { saveProgress } from '../core/progress/db'
import { validateProgress } from '../core/progress/validate'

// Хранилище настоящее, кроме записи: её нужно видеть, а не выполнять.
vi.mock('../core/progress/db', async (original) => ({
  ...(await original<typeof import('../core/progress/db')>()),
  saveProgress: vi.fn(async () => {}),
}))
import { apipaNoLease } from '../scenarios/net-apipa-no-lease'
import { SCENARIOS } from '../scenarios'
import { HANDOFF_REPLY } from '../core/dialogue/scripted'
import type { Scenario } from '../core/scenario/types'
import type { Answer, Check, Lesson, Section } from '../core/learning/types'
import { firstLine } from '../courses/first-line'
import { defaultConfig } from '../core/dialogue/types'

let g: ReturnType<typeof createGameStore>
const s = () => g.getState()
const clockAt = (iso: string) => ({ now: () => new Date(iso) })

beforeEach(() => {
  // Стор собирает смену сам — интерфейс start() не вызывает, тесты тоже.
  g = createGameStore(clockAt('2026-09-09T18:00:00.000Z'), undefined, undefined, testContent())
})

const firstNumber = () => s().queue.tickets[0]!.number
const nextOpen = () => s().queue.tickets.find(t => t.status !== 'completed' && t.number !== s().queue.assigned)!
const adapter = () => s().world.devices['AL-LPT-0447']!.adapters[0]!
const fixApipa = () => {
  s().runCommand('ipconfig /release')
  s().runCommand('ipconfig /renew')
}
const close = (notes = 'Закрыл по итогам смены.') => {
  s().saveResolutionNotes(notes)
  s().setResolutionCode('solved')
  s().resolveTicket()
}

describe('смена', () => {
  it('стартует с очередью, шапкой терминала и сломанной машиной первого тикета', () => {
    expect(s().queue.tickets.length).toBeGreaterThan(0)
    expect(s().queue.assigned).toBeNull()
    expect(s().terminalLines.slice(0, 2).map(l => l.text)).toEqual([
      'Vantage Windows [Version 10.0.22631.3880]',
      '(c) Arcline Logistics. All rights reserved.',
    ])
    expect(adapter().ip).toBe('169.254.23.11')
  })

  /*
    Поломка входит в мир вместе с тикетом. Раньше мир при старте смены
    ломался по всей библиотеке сразу, и правило «одна поломка на машину»
    держалось только в очереди.
  */
  it('машина сценария из пула исправна, пока его тикет не вошёл в окно', () => {
    g = createGameStore(clockAt('2026-09-09T18:00:00.000Z'), undefined, 1, testContent())
    const spooler = () => s().world.devices['AL-DSK-0192']!.services
      .find(x => x.name === 'Spooler')!
    expect(s().queue.tickets.map(t => t.scenarioId)).toEqual(['net-apipa-no-lease'])
    expect(spooler().status).toBe('running')

    s().claimTicket(firstNumber())
    close()
    expect(s().queue.tickets.map(t => t.scenarioId)).toEqual(['print-spooler-stopped'])
    expect(spooler().status).toBe('stopped')
  })

  /*
    Найдено визуальной проверкой: закрыв все сценарии, техник видел
    пустую таблицу и ничего больше. «Тикетов нет» и «тикетов больше не
    будет» — разные состояния, и второе обязано быть названо.
  */
  it('исчерпание пула объявляется только после последнего тикета; новая смена полна', () => {
    let closed = 0
    while (s().queue.tickets.some(t => t.status !== 'completed')) {
      expect(s().shiftExhausted).toBe(false)
      s().claimTicket(s().queue.tickets[0]!.number)
      close()
      closed++
    }
    expect(closed).toBe(SCENARIOS.length)
    expect(s().shiftExhausted).toBe(true)

    s().reset()
    expect(s().shiftExhausted).toBe(false)
    expect(s().queue.tickets.length).toBeGreaterThan(0)
  })

  /*
    Смена нумеруется временем старта, а не одним счётчиком: счётчик
    после перезагрузки начинается заново, и второе прохождение того же
    сценария сталкивалось бы с первым по идентификатору записи.
  */
  it('смены различаются и между запусками, и внутри запуска', () => {
    const other = createGameStore(clockAt('2026-09-10T08:00:00.000Z'), undefined, undefined, testContent())
    expect(other.getState().shiftId).not.toBe(s().shiftId)

    const first = s().shiftId
    s().reset()
    expect(s().shiftId).not.toBe(first)
  })
})

describe('инцидент', () => {
  /**
   * Граница доступа, вшитая в инструмент: удалённый доступ — только к
   * машине с открытым инцидентом.
   */
  it('команда до взятия тикета отклоняется с объяснением и не пишется в журнал', () => {
    expect(s().runCommand('ipconfig /all')).toEqual({ rejected: true })
    expect(s().session.commands).toHaveLength(0)
    expect(s().terminalLines.at(-1)!.text).toContain('открытым тикетом')

    s().claimTicket(firstNumber())
    expect(s().runCommand('ipconfig /all')).toEqual({ rejected: false })
    expect(s().session.commands).toHaveLength(1)
    expect(s().terminalLines.some(l => l.text.includes('169.254.23.11'))).toBe(true)
  })

  it('починка из терминала меняет опубликованный мир', () => {
    s().claimTicket(firstNumber())
    const before = s().world
    fixApipa()
    s().runCommand('ping 8.8.8.8')
    expect(s().world).not.toBe(before)
    expect(adapter()).toMatchObject({ ip: '10.20.14.88', gateway: '10.20.14.1' })
    expect(s().terminalLines.some(l => l.text.includes('Reply from 8.8.8.8'))).toBe(true)
  })

  /*
    Заявитель сообщает то, что видит со своей стороны, а не состояние
    мира: на непочиненной машине он так и скажет — сколько ни звони.
  */
  it('подтверждение по телефону следует миру и пишется в журнал и переписку', () => {
    s().claimTicket(firstNumber())
    s().confirmWithUser()
    expect(s().session.flags.userConfirmed).toBe(false)
    expect(s().queue.tickets[0]!.communications.at(-1)!.text).toContain('так же')

    fixApipa()
    s().confirmWithUser()
    expect(s().session.flags.userConfirmed).toBe(true)
    expect(s().queue.tickets[0]!.communications.at(-1)!.text).toContain('открылось')
    expect(s().session.dialogue.filter(d => d.speaker === 'requester')).toHaveLength(2)
  })

  /* Рабочий статус сам по себе тикет не закрывает — нужен код. */
  it('закрытие требует кода; с кодом — разбор, запись истории и свободный слот', () => {
    s().claimTicket(firstNumber())
    s().saveResolutionNotes('что-то')
    s().resolveTicket()
    expect(s().scorecard).toBeNull()
    expect(s().queue.assigned).not.toBeNull()

    s().setResolutionCode('solved')
    s().resolveTicket()
    expect(s().scorecard).not.toBeNull()
    expect(s().queue.assigned).toBeNull()
    expect(s().activeTool).toBe('scorecard')
    expect(s().progress.records).toHaveLength(1)
  })

  /*
    Возврат к своему же тикету — не новый инцидент. Раньше клик по своей
    строке в очереди сбрасывал рабочий статус, а стереть журнал значило
    бы уничтожить всю работу по нему.
  */
  it('возврат к своему тикету не стирает журнал и не сбрасывает статус', () => {
    const n = firstNumber()
    s().claimTicket(n)
    s().runCommand('ipconfig /all')
    s().setTicketStatus('pending-user')
    s().setTool('queue')
    s().claimTicket(n)

    expect(s().session.commands).toHaveLength(1)
    expect(s().queue.tickets.find(t => t.number === n)!.status).toBe('pending-user')
  })

  /*
    Журнал сессии — вход для всей оценки, и он относится к инциденту, а
    не к смене. Пока смена была из одного тикета, утечка не была видна;
    потом подтверждение, полученное у одного заявителя, засчитывалось
    второму. Вместе с журналом заканчивается всё открытое по прошлому
    инциденту: разговор, окна, вывод терминала. Мир остаётся общим
    намеренно — последствия работы переживают инцидент.
  */
  it('следующий инцидент начинается с чистого журнала, разговора и терминала', () => {
    s().claimTicket(firstNumber())
    s().verifyRequester('manager', 'Elena Varga')
    s().runCommand('ipconfig /all')
    fixApipa()
    s().confirmWithUser()
    s().callTo('p.raman')
    s().openApp('cmd')
    close()

    s().claimTicket(nextOpen().number)
    expect(s().session.flags).toMatchObject({ userConfirmed: false, identityVerified: false })
    expect(s().session.verifiedAccount).toBeUndefined()
    expect(s().session.commands).toHaveLength(0)
    expect(s().session.changes).toHaveLength(0)
    expect(s().session.dialogue).toHaveLength(0)
    expect(s().talkingTo).toBeNull()
    expect(s().windows.windows).toHaveLength(0)
    expect(s().terminalLines.some(l => l.text.includes('169.254'))).toBe(false)
    // Мир общий: починка прошлого инцидента на месте.
    expect(adapter().ip).toBe('10.20.14.88')
  })
})

/**
 * `resolveTicket` — единственная точка записи прохождения, и запись
 * обязана быть в памяти сразу: следующее закрытие читает историю из
 * стора, и отложенная запись затёрла бы предыдущую.
 */
describe('прогресс', () => {
  it('записи копятся синхронно, не затирают друг друга и переживают сброс смены', () => {
    s().claimTicket(firstNumber())
    close()
    s().claimTicket(nextOpen().number)
    close('Разбирался, причину не нашёл.')

    const [a, b] = s().progress.records
    expect(s().progress.records).toHaveLength(2)
    expect(a!.id).not.toBe(b!.id)

    s().reset()
    expect(s().progress.records).toHaveLength(2)
  })

  /*
    Найдено визуальной проверкой: экраны истории и профиля показывали
    «Загружается…» навсегда. Интерфейс `start()` не вызывает, а
    гидратация висела именно на нём; тесты были зелёные, потому что
    каждый звал `start()` руками.
  */
  it('гидратация идёт от создания стора, а не от start()', async () => {
    await vi.waitFor(() => expect(s().progressLoaded).toBe(true))
  })

  /*
    `viewing` живёт, пока техник смотрит прошлое прохождение. Уйти из
    него можно любым инструментом — и закрытый следом тикет показывал
    чужой разбор вместо своего.
  */
  it('свой разбор и взятие тикета снимают просмотр прошлого прохождения', () => {
    s().claimTicket(firstNumber())
    close()

    s().viewRecord(s().progress.records[0]!)
    s().claimTicket(nextOpen().number)
    expect(s().viewing).toBeNull()

    s().viewRecord(s().progress.records[0]!)
    close()
    expect(s().viewing).toBeNull()
    expect(s().activeTool).toBe('scorecard')
  })
})

/**
 * Скрытие — отложенное дело без штрафа. Очередь пересобирается из окна
 * генератора, а `createQueue` отдаёт пустое назначение — назначение
 * терялось, даже когда скрывали совсем другой тикет.
 */
describe('скрытие тикета', () => {
  it('чужой тикет уходит из очереди, а текущий остаётся за вами', () => {
    const mine = firstNumber()
    s().claimTicket(mine)
    const other = s().queue.tickets.find(t => t.number !== mine)!.number

    s().hideTicket(other)
    expect(s().queue.tickets.some(t => t.number === other)).toBe(false)
    expect(s().queue.assigned).toBe(mine)
    expect(s().activeTool).toBe('ticket')
  })

  it('свой тикет освобождает слот и не пишет прохождение в историю', () => {
    s().claimTicket(firstNumber())
    s().hideTicket(firstNumber())
    expect(s().queue.assigned).toBeNull()
    expect(s().activeTool).toBe('queue')
    expect(s().progress.records).toHaveLength(0)
  })
})

describe('серверная', () => {
  const console = (sw = 'SW-FL3-01') => s().consoles[sw]!
  const type = (...lines: string[]) => { for (const l of lines) s().runSwitchCommand('SW-FL3-01', l) }
  const port = () => s().world.network.switches[0]!.ports[0]!

  /*
    Консоль пишет в журнал инцидента: цели сверяются с командами на
    коммутаторе так же, как с командами на машине. И сбрасывается вместе
    с инцидентом — вывод чужой консоли в новом инциденте был бы тем же
    дефектом, что журнал, протекавший из тикета в тикет.
  */
  it('консоль пишет в журнал инцидента и сбрасывается со следующим тикетом', () => {
    s().claimTicket(firstNumber())
    expect(s().session.incident).toEqual({
      number: firstNumber(), device: 'AL-LPT-0447', requester: 'p.raman',
    })

    type('sh mac add add a483.e72c.9144')
    expect(s().session.commands.at(-1)).toMatchObject({
      device: 'SW-FL3-01', canonical: 'show mac address-table address a483.e72c.9144',
    })
    expect(console().lines.some(l => l.text.includes('DYNAMIC     Gi1/0/1'))).toBe(true)

    // Подсказка возвращает набранное в строку ввода.
    type('show ?')
    expect(console().draft).toBe('show ')
    expect(console().cli.mode).toBe('user')

    close()
    s().claimTicket(nextOpen().number)
    expect(s().consoles).toEqual({})
  })

  /* Правило машины и каталога: изменение без инцидента некому объяснить. */
  it('изменения серверной — только по взятому тикету', () => {
    const none = { ok: false, error: 'нет активного инцидента' }
    expect(s().setPortVlan('SW-FL3-01', 'Gi1/0/1', 40)).toEqual(none)
    expect(s().setPortEnabled('SW-FL3-01', 'Gi1/0/1', false)).toEqual(none)
    expect(s().setPortDescription('SW-FL3-01', 'Gi1/0/1', 'x')).toEqual(none)
    expect(s().saveSwitchConfig('SW-FL3-01')).toEqual(none)
    expect(s().restartServerService('DHCP01', 'DHCPServer')).toEqual(none)

    // Смотреть в консоли можно и без тикета, менять — нет.
    type('enable', 'conf t', 'int gi1/0/1', 'shutdown')
    expect(console().lines.at(-1)!.text).toBe('Command authorization failed.')
    expect(port().adminUp).toBe(true)

    s().claimTicket(firstNumber())
    const before = s().world
    expect(s().setPortVlan('SW-FL3-01', 'Gi1/0/1', 40)).toEqual({ ok: true })
    expect(s().world).not.toBe(before)
    expect(port().accessVlan).toBe(40)
    expect(s().session.changes).toHaveLength(1)
  })

  /*
    Для эскалации сообщить о передаче — то же, что подтверждение для
    починки. Кнопка и фраза в разговоре поднимают один флаг.
  */
  it('сообщить о передаче — реплика техника, ответ заявителя, флаг', async () => {
    s().claimTicket(firstNumber())
    s().informRequester()
    expect(s().session.flags.userInformed).toBe(true)
    expect(s().queue.tickets[0]!.communications.map(c => c.text)).toEqual([
      'Передаю вашу заявку сетевой группе — это настройка сетевого оборудования, '
        + 'у меня нет к ней доступа. Сообщу, когда починят.',
      HANDOFF_REPLY,
    ])

    close()
    s().claimTicket(nextOpen().number)
    s().callTo(s().queue.tickets.find(t => t.number === s().queue.assigned)!.requester)
    await s().say('Передам заявку второй линии')
    expect(s().session.flags.userInformed).toBe(true)
  })

  /*
    Вторая линия чинит после передачи — и после оценки: разбор видит мир
    таким, каким его оставил техник. Иначе сломанная ретрансляция жила бы
    до конца смены и делала непроходимыми следующие сетевые тикеты.
  */
  it('эскалация применяет починку второй линии после оценки', () => {
    const HELPERS = 'network.switches[hostname=CR-01].vlanInterfaces[vlan=20].helpers'
    const relay: Scenario = {
      ...apipaNoLease, id: 'relay', device: 'AL-LPT-0601', requester: 'd.mbeki',
      inject: [{ path: HELPERS, value: [] }],
      onEscalate: [{ path: HELPERS, value: ['10.20.10.5'] }],
      objectives: [{
        id: 'obj-relay', title: 'Ретрансляция на месте', steps: [], commands: [], requires: [],
        state: [{ path: HELPERS, contains: '10.20.10.5', message: '' }], why: '',
      }],
      expectedResolution: 'escalate',
    }
    g = createGameStore(clockAt('2026-09-09T18:00:00.000Z'), undefined, 1, testContent({ scenarios: [relay, apipaNoLease] }))
    const helpers = () => s().world.network.switches[1]!.vlanInterfaces.find(v => v.vlan === 20)!.helpers
    expect(helpers()).toEqual([])

    s().claimTicket(firstNumber())
    s().setResolutionCode('escalate')
    s().resolveTicket()
    expect(s().scorecard!.objectives[0]!.met).toBe(false)
    expect(helpers()).toEqual(['10.20.10.5'])
    // Общий ресурс освободился вместе с починкой — вошёл следующий сетевой тикет.
    expect(s().queue.tickets.map(t => t.scenarioId)).toEqual(['net-apipa-no-lease'])

    // У APIPA патча второй линии нет: эскалация мир не меняет.
    s().claimTicket(firstNumber())
    const before = structuredClone(s().world)
    s().setResolutionCode('escalate')
    s().resolveTicket()
    expect(s().world).toEqual(before)
  })
})

describe('логистика', () => {
  const T0 = '2026-09-28T10:00:00.000Z'
  let t = Date.parse(T0)
  const clock = { now: () => new Date(t) }
  const DOCK_OK = { path: 'cmdb[attachedTo=AL-LPT-0512&kind=dock&condition=ok]', exists: true, message: '' }
  /* Заглушка док-сценария: настоящий появится в задаче 7, стору нужна только проводка. */
  const dock: Scenario = {
    ...apipaNoLease, id: 'dock', device: 'AL-LPT-0512', requester: 'e.varga', resources: [],
    inject: [{ path: 'cmdb[tag=AL-P2031].condition', value: 'faulty' }],
    objectives: [{
      id: 'obj-replace', title: 'Док заменён', steps: [], commands: [], requires: [], state: [DOCK_OK], why: '',
    }],
    fixedWhen: [DOCK_OK],
  }
  const ticketOf = (id: string) => s().queue.tickets.find(x => x.scenarioId === id)!
  const swap = () => s().createShipment({ type: 'dock-monitor-swap', assetTag: 'AL-P2040' })

  beforeEach(() => {
    t = Date.parse(T0)
    g = createGameStore(clock, undefined, 2, testContent({ scenarios: [dock, apipaNoLease] }))
  })

  /*
    Пока курьер везёт замену, техник берёт следующий тикет. Журнал,
    вывод терминала и консоли инцидента паркуются и возвращаются при
    повторном взятии: журнал принадлежит инциденту и после перерыва.
  */
  it('ждущий поставку тикет отпускает слот; журнал и консоли возвращаются при повторном взятии', () => {
    s().claimTicket(ticketOf('dock').number)
    s().runCommand('ipconfig /all')
    s().runSwitchCommand('SW-FL3-01', 'enable')
    expect(s().waitForShipment())
      .toEqual({ ok: false, error: 'по тикету нет отправления в пути — ждать нечего' })

    expect(swap()).toMatchObject({ ok: true, id: 'SHP-1041' })
    expect(s().waitForShipment()).toEqual({ ok: true })
    expect(s().queue.assigned).toBeNull()
    expect(ticketOf('dock').status).toBe('pending-shipment')
    expect(s().session.commands).toHaveLength(0)
    expect(s().consoles).toEqual({})

    s().claimTicket(ticketOf('net-apipa-no-lease').number)
    expect(s().session.incident!.device).toBe('AL-LPT-0447')
    close()

    s().claimTicket(ticketOf('dock').number)
    expect(s().session.commands.map(c => c.cmdline)).toEqual(['ipconfig /all', 'enable'])
    expect(s().session.changes).toHaveLength(1)
    expect(s().consoles['SW-FL3-01']!.cli.mode).toBe('enable')
    expect(s().parked).toEqual({})
  })

  it('тик двигает отправления и возобновляет ждущий тикет; закрытый не возобновляется', () => {
    const idle = s().world
    s().tick()
    expect(s().world).toBe(idle)

    s().claimTicket(ticketOf('dock').number)
    swap()
    s().waitForShipment()
    t += 90_000
    s().tick()
    expect(s().now.toISOString()).toBe('2026-09-28T10:01:30.000Z')
    expect(ticketOf('dock')).toMatchObject({
      status: 'in-progress',
      workNotes: '10:01 Отправление SHP-1041 доставлено: Стол 3-20 (Elena Varga).',
    })
    s().claimTicket(ticketOf('dock').number)
    s().confirmWithUser()
    expect(s().session.flags.userConfirmed).toBe(true)

    // Закрыт до доставки: доставка доезжает, но тикет не оживает и ничего не падает.
    g = createGameStore(clock, undefined, 2, testContent({ scenarios: [dock, apipaNoLease] }))
    const number = ticketOf('dock').number
    s().claimTicket(number)
    swap()
    close()
    t += 90_000
    expect(() => s().tick()).not.toThrow()
    expect(s().queue.tickets.some(x => x.number === number)).toBe(false)
  })

  /*
    Номер тикета выводится из сценария: скрытый и вернувшийся тикет —
    тот же номер. Парковка, пережившая скрытие, отдала бы новому
    экземпляру журнал брошенного.
  */
  it('сброс смены и скрытие тикета забывают запаркованное', () => {
    s().claimTicket(ticketOf('dock').number)
    swap()
    s().waitForShipment()
    expect(Object.keys(s().parked)).toEqual([ticketOf('dock').number])
    s().reset()
    expect(s().parked).toEqual({})

    s().claimTicket(ticketOf('dock').number)
    s().createShipment({ type: 'dock-monitor-swap', assetTag: 'AL-P2041' })
    s().waitForShipment()
    s().hideTicket(ticketOf('dock').number)
    expect(s().parked).toEqual({})
  })

  it('отправка и ожидание — только по взятому тикету; открытое окно и карточка — доказательства', () => {
    const none = { ok: false, error: 'нет активного инцидента' }
    expect(swap()).toEqual(none)
    expect(s().waitForShipment()).toEqual(none)

    s().claimTicket(ticketOf('dock').number)
    s().openApp('devmgmt')
    s().inspectObject('asset', 'AL-P2031')
    expect(s().session.inspected).toEqual(['app:devmgmt', 'asset:al-p2031'])
  })
})

describe('база знаний', () => {
  /*
    Состояние правится синхронно, хранилище получает его следом — правило
    среза 5. Черновик обязан быть в прогрессе в тот же миг, что и запись
    прохождения, а правка — уйти в хранилище актуальной версией.
  */
  it('закрытие даёт черновик сразу; правка и публикация сохраняются', () => {
    s().claimTicket(firstNumber())
    close('Не открывались сайты. ipconfig /release и /renew выдали адрес.')
    expect(s().progress.kb.map(a => [a.id, a.status, a.version])).toEqual([['KB-0001', 'draft', 1]])
    expect(s().lastDraft).toEqual({ id: 'KB-0001', created: true })

    expect(s().editArticle('KB-0001', { body: 'Сначала release, потом renew.' })).toMatchObject({ ok: true })
    expect(s().setArticleStatus('KB-0001', 'published')).toMatchObject({ ok: true })
    expect(s().progress.kb[0]).toMatchObject({ version: 2, status: 'published', body: 'Сначала release, потом renew.' })
    const saved = vi.mocked(saveProgress).mock.calls.at(-1)![0]
    expect(saved.kb[0]).toMatchObject({ version: 2, status: 'published' })
    // Запись проверяется перед сохранением и молча не пишется, если проверка
    // не прошла: статья с историей версий обязана её проходить.
    expect(validateProgress(saved)).toEqual([])

    expect(s().editArticle('KB-9999', { body: 'x' })).toEqual({ ok: false, error: 'статья KB-9999 не найдена' })
    s().claimTicket(nextOpen().number)
    expect(s().lastDraft).toBeNull()
  })

  /* Журнал без взятого тикета — журнал закрытого инцидента: писать в него нельзя. */
  it('открытая статья — в осмотренном только при взятом тикете', () => {
    s().claimTicket(firstNumber())
    close('Заметка о решении.')
    s().openArticle('KB-0001')
    expect(s()).toMatchObject({ kbOpen: 'KB-0001', activeTool: 'kb' })
    expect(s().session.inspected).not.toContain('kb:kb-0001')

    s().claimTicket(nextOpen().number)
    s().openArticle('KB-0001')
    expect(s().session.inspected).toContain('kb:kb-0001')
  })
})

describe('курсы', () => {
  const course = firstLine
  const process = course.sections[0]!
  /** Верный ответ проверки — выводится из контента, а не подбирается. */
  const right = (c: Check): Answer => (c.kind === 'choice' ? c.options.findIndex(o => o.correct) : c.accept[0]!)
  const wrong = (c: Check): Answer => (c.kind === 'choice' ? c.options.findIndex(o => !o.correct) : 'не то')
  const passLessons = (sec: Section) => {
    for (const l of sec.lessons) for (const c of l.checks) s().answerCheck(course.id, sec.id, l.id, c.id, right(c))
  }

  it('ответ пишется только в открытом уроке; квиз — в хранилище', () => {
    const [l1, l2] = process.lessons as [Lesson, Lesson]
    const k = l1.checks[0]!

    expect(s().answerCheck(course.id, process.id, l1.id, k.id, wrong(k))).toMatchObject({ ok: true, correct: false })
    expect(s().progress.learning.checks, 'неверный ответ не пишется').toEqual([])
    expect(s().answerCheck(course.id, process.id, l1.id, k.id, right(k))).toMatchObject({ ok: true, correct: true })
    expect(s().progress.learning.checks).toEqual(['first-line/process/ownership/first-step'])

    // Правило живёт в сторе: спрятанная кнопка защищает только от мыши.
    expect(s().answerCheck(course.id, process.id, l2.id, l2.checks[0]!.id, right(l2.checks[0]!)))
      .toEqual({ ok: false, error: 'урок закрыт' })
    expect(s().submitQuiz(course.id, process.id, {})).toEqual({ ok: false, error: 'квиз закрыт' })
    expect(s().answerCheck('nope', process.id, l1.id, k.id, 0)).toEqual({ ok: false, error: 'курс не найден' })
    expect(s().answerCheck(course.id, process.id, 'nope', k.id, 0)).toEqual({ ok: false, error: 'урок не найден' })
    expect(s().progress.learning.checks).toHaveLength(1)

    passLessons(process)
    const answers = Object.fromEntries(process.quiz.map((q, i) => [q.id, i < 3 ? right(q) : wrong(q)]))
    expect(s().submitQuiz(course.id, process.id, answers)).toMatchObject({ ok: true, grade: { score: 3, total: 5, passed: false } })
    const saved = vi.mocked(saveProgress).mock.calls.at(-1)![0]
    expect(saved.learning.quizzes).toEqual([{ id: 'first-line/process', attempts: 1, best: 3, total: 5, passedAt: null }])
    expect(saved.learning.checks).toHaveLength(process.lessons.flatMap(l => l.checks).length)
    // Запись проверяется перед сохранением и молча не пишется, если проверка не прошла.
    expect(validateProgress(saved)).toEqual([])
  })

  /*
    Урок и квиз приходят с сервера по запросу (срез 8А). Закрытый урок
    сервер отдал бы по адресу — прогресса он не знает, — поэтому правило
    держит стор: закрытое не грузится.
  */
  it('урок грузится с сервера, только когда открыт; верный ответ запоминается с разбором', () => {
    const [l1, l2] = process.lessons as [Lesson, Lesson]
    s().loadLesson(course.id, process.id, l2.id)
    s().loadQuiz(course.id, process.id)
    expect(s().lessons, 'закрытый урок').toEqual({})
    expect(s().quizzes, 'закрытый квиз').toEqual({})

    s().loadLesson(course.id, process.id, l1.id)
    const loaded = s().lessons['first-line/process/ownership']!
    expect(loaded.body).toEqual(l1.body)
    expect(loaded.checks.map(c => c.id)).toEqual(l1.checks.map(c => c.id))

    const k = l1.checks[0]!
    const r = s().answerCheck(course.id, process.id, l1.id, k.id, right(k))
    const why = k.kind === 'choice' ? k.options.find(o => o.correct)!.why : k.why
    expect(r).toEqual({ ok: true, correct: true, why })
    expect(s().progress.learning.answers).toEqual({ 'first-line/process/ownership/first-step': { answer: right(k), why } })
  })

  it('практика открывает тикет по правилам очереди', () => {
    // Блокировка в окне смены, ничего не взято — тикет берётся.
    expect(s().practice('identity-account-lockout')).toEqual({ status: 'opened' })
    const taken = s().queue.assigned!
    expect(s().queue.tickets.find(t => t.number === taken)!.scenarioId).toBe('identity-account-lockout')
    expect(s().activeTool).toBe('ticket')

    // Тот же снова — тот же инцидент, журнал не сброшен.
    s().runCommand('whoami')
    s().setTool('courses')
    expect(s().practice('identity-account-lockout')).toEqual({ status: 'opened' })
    expect(s().session.commands.map(c => c.cmdline)).toEqual(['whoami'])

    // В работе чужой — отказ словами очереди, мир и журнал не тронуты.
    expect(s().practice('net-apipa-no-lease')).toEqual({ status: 'blocked', error: 'сначала завершите текущий тикет' })
    expect(s().queue.assigned).toBe(taken)
    expect(s().practice('no-such-scenario')).toEqual({ status: 'blocked', error: 'сценарий не найден' })
  })

  it('сценария нет в окне: новая смена только с подтверждением, отложенный тикет назван', () => {
    const dock = SCENARIOS.find(x => x.id === 'hw-dock-failed')!
    g = createGameStore(clockAt('2026-09-28T09:00:00.000Z'), undefined, 1, testContent({ scenarios: [dock, apipaNoLease] }))
    const dockNumber = firstNumber()
    s().claimTicket(dockNumber)
    s().createShipment({ type: 'dock-monitor-swap', assetTag: 'AL-P2040' })
    expect(s().waitForShipment()).toEqual({ ok: true })
    s().openLearn({ course: course.id, section: 'network', lesson: 'dhcp-apipa' })
    const world = s().world

    expect(s().practice('net-apipa-no-lease')).toEqual({ status: 'needs-new-shift', lost: [dockNumber] })
    expect(s().world, 'без подтверждения смена не меняется').toBe(world)

    expect(s().practice('net-apipa-no-lease', true)).toEqual({ status: 'opened' })
    expect(s().world).not.toBe(world)
    expect(s().queue.tickets.find(t => t.number === s().queue.assigned)!.scenarioId).toBe('net-apipa-no-lease')
    expect(s().parked).toEqual({})
    expect(s().learnAt).toEqual({ course: course.id, section: 'network', lesson: 'dhcp-apipa' })
  })
})

describe('интервью', () => {
  /** Модель, которая отвечает, когда её отпустят. */
  const heldModel = () => {
    let release: (text: string) => void = () => {}
    const fetch = vi.fn(() => new Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>(resolve => {
      release = text => resolve({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content: text } }] }) })
    }))
    return { fetch, release: (text: string) => release(text) }
  }
  const withModel = (fetch: ReturnType<typeof heldModel>['fetch']) => {
    g = createGameStore(clockAt('2026-09-30T10:00:00.000Z'), { fetch }, undefined, testContent())
    s().setDialogueConfig({ ...defaultConfig(), mode: 'local' })
  }
  const candidateLines = () => s().interview!.transcript.filter(l => l.speaker === 'candidate').map(l => l.text)

  it('пустой ответ и ответ во время раздумий не записываются', async () => {
    const model = heldModel()
    withModel(model.fetch)
    s().startInterview('first-line')
    await s().answerInterview('   ')
    expect(candidateLines(), 'пустой').toEqual([])

    const first = s().answerInterview('Работал в поддержке на учёбе.')
    expect(s().interviewBusy).toBe(true)
    await s().answerInterview('Второй ответ поверх первого')
    expect(candidateLines(), 'во время раздумий').toEqual(['Работал в поддержке на учёбе.'])
    model.release('Спасибо, понятно.')
    await first
    expect(s().interviewBusy).toBe(false)
    expect(s().interview!.transcript.at(-2)!.text).toBe('Спасибо, понятно.')
  })

  it('ответ, пришедший в брошенное интервью, отбрасывается', async () => {
    const model = heldModel()
    withModel(model.fetch)
    s().startInterview('first-line')
    const pending = s().answerInterview('Работал в поддержке на учёбе.')
    s().startInterview('first-line')
    const fresh = s().interview
    model.release('Старая реакция')
    await pending
    expect(s().interview, 'новое интервью не тронуто').toBe(fresh)
    expect(s().interview!.transcript.map(l => l.text)).not.toContain('Старая реакция')
    expect(s().interviewBusy, 'флаг «думает» сброшен новым началом, а не залип').toBe(false)
  })

  /*
    Обзор среза 7Б предлагал сбрасывать «думает» и при отброшенном
    ответе. Это открыло бы ввод посреди чужого запроса: вы начали
    заново и ответили, модель думает над новым ответом — и старый
    ответ снимал бы «думает». Флаг принадлежит последнему запросу.
  */
  it('устаревший ответ не снимает «думает» с нового запроса', async () => {
    const releases: Array<(text: string) => void> = []
    const fetch = vi.fn(() => new Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>(resolve => {
      releases.push(text => resolve({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content: text } }] }) }))
    }))
    withModel(fetch)
    s().startInterview('first-line')
    const old = s().answerInterview('Работал в поддержке на учёбе.')
    s().startInterview('first-line')
    const current = s().answerInterview('Учился на курсах, нравится помогать людям.')

    releases[0]!('Старая реакция')
    await old
    expect(s().interviewBusy, 'новый запрос ещё думает').toBe(true)

    releases[1]!('Хорошо, спасибо.')
    await current
    expect(s().interviewBusy).toBe(false)
    expect(s().interview!.transcript.map(l => l.text)).toContain('Хорошо, спасибо.')
  })

  it('законченное интервью записано и открыто', async () => {
    s().startInterview('first-line')
    while (s().interview!.stage !== 'questions') await s().answerInterview('не знаю')
    await s().askInterviewer('Какой у вас график смен?')
    const record = s().finishInterview()!

    expect(s()).toMatchObject({ interview: null, interviewOpen: record.id, activeTool: 'interview' })
    expect(record).toMatchObject({ track: 'first-line', attempt: 0, result: { verdict: 'no', questionsAsked: 1 } })
    const saved = vi.mocked(saveProgress).mock.calls.at(-1)![0]
    expect(saved.interviews).toEqual([record])
    expect(validateProgress(saved)).toEqual([])
  })
})

/**
 * Смена и тикет через сервер (срез 8А).
 *
 * Здесь разъём отвечает, когда скажет тест: так видны загрузка, сбой
 * связи и ответ, пришедший в изменившийся мир. Остальные тесты идут на
 * синхронном разъёме и сети не замечают.
 */
describe('смена и тикет через сервер', () => {
  const clock = clockAt('2026-10-01T10:00:00.000Z')

  it('смена с сервера: загрузка, затем три тикета', async () => {
    const d = deferred(testContent())
    g = createGameStore(clock, undefined, 3, d.port)
    expect(s().contentStatus).toBe('loading')
    expect(s().queue.tickets).toEqual([])
    await d.flush()
    expect(s().contentStatus).toBe('ready')
    expect(s().queue.tickets).toHaveLength(3)
  })

  it('сбой сервера при старте — плашка и повтор', async () => {
    const d = deferred(testContent())
    g = createGameStore(clock, undefined, 3, d.port)
    await d.fail(new ContentError('unavailable', UNAVAILABLE))
    expect(s()).toMatchObject({ contentStatus: 'error', contentError: UNAVAILABLE })
    expect(s().queue.tickets).toEqual([])

    const again = s().retryContent()
    await d.flush()
    await again
    expect(s()).toMatchObject({ contentStatus: 'ready', contentError: null })
    expect(s().queue.tickets).toHaveLength(3)
  })

  it('«Пройти заново» во время загрузки: поздний ответ старой смены не затирает новую', async () => {
    const d = deferred(testContent())
    g = createGameStore(clock, undefined, 3, d.port)
    const first = s().shiftId
    s().reset()
    await d.flush()
    expect(s().shiftId).not.toBe(first)
    // одна смена, а не шесть тикетов и не мир, сломанный дважды
    expect(s().queue.tickets).toHaveLength(3)
    expect(new Set(s().queue.tickets.map(t => t.scenarioId)).size).toBe(3)
  })

  /** Тикет APIPA взят и готов к закрытию. */
  const ready = async () => {
    const d = deferred(testContent({ scenarios: [apipaNoLease] }))
    g = createGameStore(clock, undefined, 1, d.port)
    await d.flush()
    s().claimTicket(firstNumber())
    s().setResolutionCode('solved')
    return { d, number: firstNumber() }
  }

  /*
    Закрытие — не повод терять работу: связь пропала или сервер
    перезапущен с другим секретом — тикет открыт, техник видит, что
    делать, повторное нажатие после восстановления закрывает.
  */
  it('сбой оценки оставляет тикет открытым, повторное закрытие проходит', async () => {
    const failures: Array<[string, ContentError]> = [
      ['связь', new ContentError('unavailable', UNAVAILABLE)],
      ['подпись', new ContentError('expired', EXPIRED)],
    ]
    let last = null as Awaited<ReturnType<typeof ready>>['d'] | null
    for (const [name, failure] of failures) {
      const { d, number } = await ready()
      last = d
      const p = s().resolveTicket()
      expect(s().grading, name).toBe(true)
      s().resolveTicket()
      expect(d.pending(), `${name}: второе нажатие во время оценки не уходит`).toBe(1)
      await d.fail(failure)
      await p
      expect(s(), name).toMatchObject({ grading: false, ticketNotice: failure.message })
      expect(s().progress.records, name).toHaveLength(0)
      expect(s().queue.assigned, name).toBe(number)
    }

    const again = s().resolveTicket()
    await last!.flush()
    await again
    expect(s().progress.records).toHaveLength(1)
    expect(s().scorecard!.rootCause).toBe(apipaNoLease.rootCause)
    expect(s().ticketNotice).toBeNull()
  })

  it('оценка, пришедшая после «Пройти заново», отбрасывается', async () => {
    const { d } = await ready()
    const p = s().resolveTicket()
    s().reset()
    await d.flush()
    await p
    expect(s().progress.records).toHaveLength(0)
    expect(s().scorecard).toBeNull()
    expect(s().grading).toBe(false)
  })
})
