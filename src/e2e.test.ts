import { describe, it, expect } from 'vitest'
import { createGameStore } from './store/useGame'

const clock = { now: () => new Date('2026-09-09T18:00:00.000Z') }

const store = () => {
  const g = createGameStore(clock)
  g.getState().start()
  return () => g.getState()
}

const PERFECT_NOTE =
  'Priya Raman сообщила, что не открываются сайты, локальные программы '
  + 'работают. ipconfig /all показал 169.254.23.11 без шлюза и без DNS — это '
  + 'исключило неверные настройки DNS. ipconfig /renew завершился ошибкой '
  + 'обращения к серверу. После ipconfig /release повторный renew выдал '
  + '10.20.14.88 со шлюзом и DNS. Проверено: ping 8.8.8.8 отвечает, '
  + 'заявительница подтвердила по телефону, что сайты открываются. '
  + 'Причина — кратковременная недоступность ретрансляции при загрузке.'

describe('APIPA-инцидент от начала до конца', () => {
  it('образцовое прохождение даёт полный вердикт', () => {
    const s = store()
    s().claimTicket(s().queue.tickets[0]!.number)
    s().verifyIdentity()

    s().runCommand('ipconfig /all')
    s().runCommand('ipconfig /renew')      // падает — так и задумано
    s().runCommand('ipconfig /release')
    s().runCommand('ipconfig /renew')      // проходит
    s().runCommand('ping 8.8.8.8')
    s().runCommand('nslookup internal-portal.arcline.corp')
    s().confirmWithUser()

    s().saveResolutionNotes(PERFECT_NOTE)
    s().setResolutionCode('solved')
    s().resolveTicket()

    const card = s().scorecard!
    expect(card).not.toBeNull()
    expect(card.verdict).toBe('full')
    expect(card.objectives.every(o => o.met)).toBe(true)
    expect(card.silentFaults).toEqual([])
    expect(card.note.score).toBe(10)

    /*
      Проверяем каждое измерение поимённо, а не только вердикт.

      Вердикт full переживает недобор в одном измерении, потому что
      порог ниже максимума — именно так однажды осталась незамеченной
      ошибка порядка в resolveTicket: оценка считалась до закрытия
      тикета, и владение недобирало четыре балла при безупречном
      прохождении.
    */
    const low = card.dimensions.filter(d => d.score < 10).map(d => `${d.id}=${d.score}`)
    expect(low).toEqual([])
    expect(card.points).toBe(54)
  })

  it('починил, но не перезвонил — частичный вердикт', () => {
    const s = store()
    s().claimTicket(s().queue.tickets[0]!.number)

    s().runCommand('ipconfig /all')
    s().runCommand('ipconfig /renew')
    s().runCommand('ipconfig /release')
    s().runCommand('ipconfig /renew')

    s().saveResolutionNotes(
      'Не открывались сайты. ipconfig /all показал 169.254.23.11 без шлюза, '
      + 'ipconfig /renew завершился ошибкой. После release адрес стал 10.20.14.88.')
    s().setResolutionCode('solved')
    s().resolveTicket()

    const card = s().scorecard!
    expect(card.verdict).toBe('partial')
    expect(card.dimensions.find(d => d.id === 'communication')!.score).toBeLessThan(8)
    expect(card.objectives.find(o => o.id === 'obj-confirm')!.met).toBe(false)
  })

  it('попытка отключить фаервол валит вердикт целиком', () => {
    const s = store()
    s().claimTicket(s().queue.tickets[0]!.number)
    s().verifyIdentity()

    s().runCommand('netsh advfirewall set allprofiles state off')
    s().runCommand('ipconfig /release')
    s().runCommand('ipconfig /renew')
    s().runCommand('ping 8.8.8.8')
    s().confirmWithUser()

    s().saveResolutionNotes(PERFECT_NOTE)
    s().setResolutionCode('solved')
    s().resolveTicket()

    const card = s().scorecard!
    expect(card.verdict).toBe('fail')
    expect(card.dimensions.find(d => d.id === 'authority')!.score).toBe(0)
  })

  it('заявитель не подтверждает, пока машина не починена', () => {
    const s = store()
    s().claimTicket(s().queue.tickets[0]!.number)
    s().confirmWithUser()
    expect(s().session.flags.userConfirmed).toBe(false)

    s().runCommand('ipconfig /release')
    s().runCommand('ipconfig /renew')
    s().confirmWithUser()
    expect(s().session.flags.userConfirmed).toBe(true)
  })

  it('связность: починка в терминале видна во всех инструментах', () => {
    const s = store()
    s().claimTicket(s().queue.tickets[0]!.number)

    // до починки
    s().runCommand('ping 8.8.8.8')
    expect(s().terminalLines.some(l => l.text.includes('Request timed out.'))).toBe(true)
    expect(s().world.devices['AL-LPT-0447']!.adapters[0]!.gateway).toBe('')

    s().runCommand('ipconfig /release')
    s().runCommand('ipconfig /renew')

    // после починки — те же инструменты отвечают иначе
    s().runCommand('ping 8.8.8.8')
    s().runCommand('nslookup internal-portal.arcline.corp')
    expect(s().terminalLines.some(l => l.text.includes('Reply from 8.8.8.8'))).toBe(true)
    expect(s().terminalLines.some(l => l.text.includes('10.20.14.50'))).toBe(true)
    expect(s().world.devices['AL-LPT-0447']!.adapters[0]!.gateway).toBe('10.20.14.1')
  })
})
