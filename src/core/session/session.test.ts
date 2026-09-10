import { describe, it, expect } from 'vitest'
import {
  createSession, recordCommand, recordChange, recordDialogue,
  setFlag, addDangerousAction,
} from './session'
import type { Clock } from '../world/types'

const clock: Clock = { now: () => new Date('2026-09-09T18:00:00.000Z') }

describe('журнал сессии', () => {
  it('стартует пустым со сброшенными флагами', () => {
    const s = createSession()
    expect(s.commands).toEqual([])
    expect(s.changes).toEqual([])
  expect(s.dialogue).toEqual([])
    expect(s.flags.identityVerified).toBe(false)
    expect(s.flags.scopeChecked).toBe(false)
    expect(s.flags.userConfirmed).toBe(false)
  expect(s.flags.announcedBeforeActing).toBe(false)
    expect(s.flags.dangerousActions).toEqual([])
  })

  it('пишет команду с машиной, строкой и кодом возврата', () => {
    const s = createSession()
    recordCommand(s, clock, 'AL-LPT-0447', 'ipconfig /all', 0)
    expect(s.commands).toHaveLength(1)
    expect(s.commands[0]).toMatchObject({
      device: 'AL-LPT-0447',
      cmdline: 'ipconfig /all',
      exitCode: 0,
   at: '2026-09-09T18:00:00.000Z',
    })
  })

  it('сохраняет порядок команд', () => {
    const s = createSession()
  recordCommand(s, clock, 'AL-LPT-0447', 'ipconfig /all', 0)
    recordCommand(s, clock, 'AL-LPT-0447', 'ipconfig /renew', 1)
    recordCommand(s, clock, 'AL-LPT-0447', 'ipconfig /release', 0)
    expect(s.commands.map(c => c.cmdline))
      .toEqual(['ipconfig /all', 'ipconfig /renew', 'ipconfig /release'])
  })

  it('пишет изменение с прежним и новым значением', () => {
    const s = createSession()
    recordChange(s, clock, 'devices.AL-LPT-0447.adapters[0].ip',
      '169.254.23.11', '10.20.14.88', true)
    expect(s.changes[0]).toMatchObject({
    path: 'devices.AL-LPT-0447.adapters[0].ip',
      before: '169.254.23.11',
      after: '10.20.14.88',
      authorized: true,
    })
  })

  it('помечает несанкционированное изменение', () => {
    const s = createSession()
  recordChange(s, clock, 'devices.AL-LPT-0447.adapters[0].dhcpEnabled',
    true, false, false)
    expect(s.changes[0]!.authorized).toBe(false)
  })

  it('пишет реплику с каналом, собеседником и говорящим', () => {
    const s = createSession()
    recordDialogue(s, clock, 'call', 'p.raman', 'requester', 'Сайты не открываются')
    expect(s.dialogue[0]).toMatchObject({
      channel: 'call',
      with: 'p.raman',
      speaker: 'requester',
      text: 'Сайты не открываются',
    })
  })

  it('различает реплики техника и заявителя', () => {
    const s = createSession()
    recordDialogue(s, clock, 'call', 'p.raman', 'technician', 'Проверьте, пожалуйста')
    recordDialogue(s, clock, 'call', 'p.raman', 'requester', 'Открылось')
expect(s.dialogue.filter(d => d.speaker === 'requester')).toHaveLength(1)
  })

  it('копит опасные действия с причиной', () => {
    const s = createSession()
    addDangerousAction(s, clock, 'netsh advfirewall set allprofiles state off',
      'попытка отключить защиту')
    expect(s.flags.dangerousActions).toHaveLength(1)
    expect(s.flags.dangerousActions[0]).toMatchObject({
      action: 'netsh advfirewall set allprofiles state off',
      reason: 'попытка отключить защиту',
      at: '2026-09-09T18:00:00.000Z',
    })
  })

  it('ставит флаг процесса', () => {
    const s = createSession()
    setFlag(s, 'identityVerified', true)
    expect(s.flags.identityVerified).toBe(true)
  })

  it('журналы независимы между сессиями', () => {
    const a = createSession()
  const b = createSession()
    recordCommand(a, clock, 'AL-LPT-0447', 'ipconfig /all', 0)
  expect(b.commands).toHaveLength(0)
  })
})
