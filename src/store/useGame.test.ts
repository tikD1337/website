import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createGameStore } from './useGame'

let g: ReturnType<typeof createGameStore>
const s = () => g.getState()

beforeEach(() => {
  g = createGameStore({ now: () => new Date('2026-09-09T18:00:00.000Z') })
  s().start()
})

const firstNumber = () => s().queue.tickets[0]!.number

describe('старт', () => {
  it('очередь непустая, тикет не назначен', () => {
    expect(s().queue.tickets.length).toBeGreaterThan(0)
    expect(s().queue.assigned).toBeNull()
  })

  it('терминал показывает шапку с вымышленной ОС', () => {
    expect(s().terminalLines[0]!.text).toContain('Vantage Windows')
    expect(s().terminalLines[1]!.text).toContain('Arcline Logistics')
  })

  it('мир сломан по сценарию', () => {
    expect(s().world.devices['AL-LPT-0447']!.adapters[0]!.ip).toBe('169.254.23.11')
  })
})

describe('доступ к машине', () => {
  it('команда до взятия тикета отклоняется', () => {
    const res = s().runCommand('ipconfig /all')
    expect(res.rejected).toBe(true)
    expect(s().session.commands).toHaveLength(0)
  })

  it('отказ объясняет причину в терминале', () => {
    s().runCommand('ipconfig /all')
    const last = s().terminalLines.at(-1)!.text
    expect(last).toContain('открытым тикетом')
  })

  it('после взятия тикета команда выполняется', () => {
    s().claimTicket(firstNumber())
    s().runCommand('ipconfig /all')
    expect(s().session.commands).toHaveLength(1)
    expect(s().terminalLines.some(l => l.text.includes('169.254.23.11'))).toBe(true)
  })
})

describe('починка через терминал', () => {
  beforeEach(() => s().claimTicket(firstNumber()))

  it('renew в одиночку не помогает', () => {
    s().runCommand('ipconfig /renew')
    expect(s().world.devices['AL-LPT-0447']!.adapters[0]!.ip).toBe('169.254.23.11')
  })

  it('release затем renew чинит машину', () => {
    s().runCommand('ipconfig /release')
    s().runCommand('ipconfig /renew')
    const a = s().world.devices['AL-LPT-0447']!.adapters[0]!
    expect(a.ip).toBe('10.20.14.88')
    expect(a.gateway).toBe('10.20.14.1')
  })

  it('после починки ping начинает отвечать', () => {
    s().runCommand('ipconfig /release')
    s().runCommand('ipconfig /renew')
    s().runCommand('ping 8.8.8.8')
    expect(s().terminalLines.some(l => l.text.includes('Reply from 8.8.8.8'))).toBe(true)
  })
})

describe('подтверждение у заявителя', () => {
  beforeEach(() => s().claimTicket(firstNumber()))

  it('на сломанной машине заявитель не подтверждает', () => {
    s().confirmWithUser()
    expect(s().session.flags.userConfirmed).toBe(false)
    const last = s().queue.tickets[0]!.communications.at(-1)!
    expect(last.text).toContain('так же')
  })

  it('на починенной подтверждает', () => {
    s().runCommand('ipconfig /release')
    s().runCommand('ipconfig /renew')
    s().confirmWithUser()
    expect(s().session.flags.userConfirmed).toBe(true)
    expect(s().queue.tickets[0]!.communications.at(-1)!.text).toContain('открылось')
  })

  it('реплика заявителя попадает и в журнал сессии', () => {
    s().confirmWithUser()
    expect(s().session.dialogue.some(d => d.speaker === 'requester')).toBe(true)
  })
})

describe('закрытие тикета', () => {
  beforeEach(() => s().claimTicket(firstNumber()))

  it('без кода закрытия ничего не происходит', () => {
    s().saveResolutionNotes('что-то')
    s().resolveTicket()
    expect(s().scorecard).toBeNull()
    expect(s().queue.assigned).not.toBeNull()
  })

  it('с кодом выдаёт разбор и освобождает слот', () => {
    s().runCommand('ipconfig /all')
    s().runCommand('ipconfig /release')
    s().runCommand('ipconfig /renew')
    s().confirmWithUser()
    s().saveResolutionNotes('Не открывались сайты. ipconfig /all показал '
      + '169.254.23.11 без шлюза, ipconfig /renew завершился ошибкой. '
      + 'После release адрес стал 10.20.14.88. Заявительница подтвердила. '
      + 'Причина — недоступность ретрансляции при загрузке.')
    s().setResolutionCode('solved')
    s().resolveTicket()

    expect(s().scorecard).not.toBeNull()
    expect(s().queue.assigned).toBeNull()
    expect(s().activeTool).toBe('scorecard')
  })
})

describe('сброс', () => {
  it('возвращает всё в исходное', () => {
    s().claimTicket(firstNumber())
    s().runCommand('ipconfig /release')
    s().reset()
    expect(s().queue.assigned).toBeNull()
    expect(s().session.commands).toHaveLength(0)
    expect(s().world.devices['AL-LPT-0447']!.adapters[0]!.ip).toBe('169.254.23.11')
  })
})

/**
 * Прогрессия.
 *
 * `resolveTicket` — единственная точка записи прохождения, и запись
 * обязана быть в памяти сразу: следующее закрытие читает историю из
 * стора, и отложенная запись затёрла бы предыдущую.
 */
describe('прогресс', () => {
  const close = () => {
    s().claimTicket(firstNumber())
    s().runCommand('ipconfig /release')
    s().runCommand('ipconfig /renew')
    s().confirmWithUser()
    s().saveResolutionNotes('Не открывались сайты. ipconfig /all показал '
      + '169.254.23.11 без шлюза. После release и renew адрес стал '
      + '10.20.14.88. Заявительница подтвердила.')
    s().setResolutionCode('solved')
    s().resolveTicket()
  }

  it('закрытие пишет запись сразу, не дожидаясь хранилища', () => {
    close()
    expect(s().progress.records).toHaveLength(1)
  })

  it('второе закрытие не затирает первое', () => {
    close()
    const second = s().queue.tickets.find(t => t.status !== 'completed')!
    s().claimTicket(second.number)
    s().saveResolutionNotes('Разбирался, причину не нашёл.')
    s().setResolutionCode('solved')
    s().resolveTicket()

    expect(s().progress.records).toHaveLength(2)
    expect(s().progress.records[0]!.id).not.toBe(s().progress.records[1]!.id)
  })

  it('«пройти заново» прогресс не трогает', () => {
    close()
    s().reset()
    expect(s().progress.records).toHaveLength(1)
  })

  /*
    Смена нумеруется от старта стора, а страницу перезагружают. Без
    отметки времени первая смена нового запуска получала бы тот же
    `shiftId`, что и первая смена прошлого, — и запись о втором
    прохождении того же сценария сталкивалась бы с записью о первом
    по идентификатору.
  */
  it('смены разных запусков различаются', () => {
    const other = createGameStore({ now: () => new Date('2026-09-10T08:00:00.000Z') })
    other.getState().start()
    expect(other.getState().shiftId).not.toBe(s().shiftId)
  })

  it('смены одного запуска различаются', () => {
    const first = s().shiftId
    s().reset()
    expect(s().shiftId).not.toBe(first)
  })
})

/**
 * Гидратация не зависит от `start()`.
 *
 * Найдено визуальной проверкой: экраны истории и профиля показывали
 * «Загружается…» навсегда. Интерфейс `start()` не вызывает — стор
 * собирает смену сам при создании, — а гидратация висела именно на
 * нём, и `progressLoaded` не вставал никогда. Все тесты при этом были
 * зелёные, потому что каждый звал `start()` руками.
 */
describe('гидратация', () => {
  it('идёт от создания стора, а не от start()', async () => {
    const g2 = createGameStore({ now: () => new Date('2026-09-09T18:00:00.000Z') })
    // start() намеренно не вызываем — интерфейс его не вызывает тоже.
    await vi.waitFor(() => expect(g2.getState().progressLoaded).toBe(true))
  })
})

/**
 * Исчерпание пула.
 *
 * Найдено визуальной проверкой: закрыв все сценарии, техник видел
 * пустую таблицу и «Открытых: 0» — и ничего больше. План среза
 * требует обратного: молчаливое «очередь пуста и больше не будет»
 * читается как поломка, поэтому смена обязана сказать, что кончилась.
 */
describe('пул исчерпан', () => {
  const closeOne = () => {
    const open = s().queue.tickets.find(t => t.status !== 'completed')
    if (!open) return false
    s().claimTicket(open.number)
    s().saveResolutionNotes('Закрыл по итогам смены.')
    s().setResolutionCode('solved')
    s().resolveTicket()
    return true
  }

  it('пока в пуле есть сценарии, смена не объявлена оконченной', () => {
    expect(s().shiftExhausted).toBe(false)
    closeOne()
    expect(s().shiftExhausted).toBe(false)
  })

  it('после последнего сценария смена объявлена оконченной', () => {
    while (closeOne()) { /* закрываем, пока есть что */ }
    expect(s().queue.tickets).toHaveLength(0)
    expect(s().shiftExhausted).toBe(true)
  })

  it('новая смена снова полна', () => {
    while (closeOne()) { /* до конца пула */ }
    s().reset()
    expect(s().shiftExhausted).toBe(false)
    expect(s().queue.tickets.length).toBeGreaterThan(0)
  })
})
