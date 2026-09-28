import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createGameStore } from './useGame'
import { apipaNoLease } from '../scenarios/net-apipa-no-lease'
import { SCENARIOS } from '../scenarios'
import { HANDOFF_REPLY } from '../core/dialogue/scripted'
import type { Scenario } from '../core/scenario/types'

let g: ReturnType<typeof createGameStore>
const s = () => g.getState()
const clockAt = (iso: string) => ({ now: () => new Date(iso) })

beforeEach(() => {
  // Стор собирает смену сам — интерфейс start() не вызывает, тесты тоже.
  g = createGameStore(clockAt('2026-09-09T18:00:00.000Z'))
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
    g = createGameStore(clockAt('2026-09-09T18:00:00.000Z'), undefined, 1)
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
    const other = createGameStore(clockAt('2026-09-10T08:00:00.000Z'))
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
    g = createGameStore(clockAt('2026-09-09T18:00:00.000Z'), undefined, 1, [relay, apipaNoLease])
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
    g = createGameStore(clock, undefined, 2, [dock, apipaNoLease])
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
    g = createGameStore(clock, undefined, 2, [dock, apipaNoLease])
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
