import { describe, it, expect, beforeEach } from 'vitest'
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
