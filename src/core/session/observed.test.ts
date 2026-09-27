import { describe, it, expect } from 'vitest'
import { createSession, recordCommand } from './session'
import { networkObserved } from './observed'

const clock = { now: () => new Date('2026-09-09T18:00:00.000Z') }

describe('сетевые настройки в карточке тикета', () => {
  it('до первой команды не показываются', () => {
    expect(networkObserved(createSession(), 'AL-LPT-0447')).toBe(false)
  })

  it('открываются после ipconfig на этой машине', () => {
    const s = createSession()
    recordCommand(s, clock, 'AL-LPT-0447', 'ipconfig /all', 0)
    expect(networkObserved(s, 'AL-LPT-0447')).toBe(true)
  })

  it('короткая форма тоже считается', () => {
    const s = createSession()
    recordCommand(s, clock, 'AL-LPT-0447', 'IPCONFIG', 0)
    expect(networkObserved(s, 'al-lpt-0447')).toBe(true)
  })

  it('ipconfig на другой машине не открывает эту', () => {
    const s = createSession()
    recordCommand(s, clock, 'AL-LPT-0512', 'ipconfig /all', 0)
    expect(networkObserved(s, 'AL-LPT-0447')).toBe(false)
  })

  it('похожая команда не считается', () => {
    const s = createSession()
    recordCommand(s, clock, 'AL-LPT-0447', 'ipconfigx', 1)
    recordCommand(s, clock, 'AL-LPT-0447', 'ping 8.8.8.8', 1)
    expect(networkObserved(s, 'AL-LPT-0447')).toBe(false)
  })
})
