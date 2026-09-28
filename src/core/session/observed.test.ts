import { describe, it, expect } from 'vitest'
import { createSession, recordCommand } from './session'
import { networkObserved } from './observed'

const clock = { now: () => new Date('2026-09-09T18:00:00.000Z') }

describe('сетевые настройки в карточке тикета', () => {
  it('открываются только после ipconfig на этой машине', () => {
    const s = createSession()
    expect(networkObserved(s, 'AL-LPT-0447')).toBe(false)

    recordCommand(s, clock, 'AL-LPT-0512', 'ipconfig /all', 0)
    recordCommand(s, clock, 'AL-LPT-0447', 'ipconfigx', 1)
    recordCommand(s, clock, 'AL-LPT-0447', 'ping 8.8.8.8', 1)
    expect(networkObserved(s, 'AL-LPT-0447')).toBe(false)

    recordCommand(s, clock, 'AL-LPT-0447', 'IPCONFIG', 0)
    expect(networkObserved(s, 'al-lpt-0447')).toBe(true)
  })
})
