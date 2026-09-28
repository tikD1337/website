import { describe, it, expect } from 'vitest'
import {
  createSession, recordCommand, recordChange, recordDialogue,
  setFlag, addDangerousAction,
} from './session'
import type { Clock } from '../world/types'

const clock: Clock = { now: () => new Date('2026-09-09T18:00:00.000Z') }

describe('журнал сессии', () => {
  it('копит команды, изменения, реплики и опасные действия по порядку, со временем', () => {
    const s = createSession()
    recordCommand(s, clock, 'AL-LPT-0447', 'ipconfig /renew', 1)
    recordCommand(s, clock, 'AL-LPT-0447', 'ipconfig /release', 0)
    recordChange(s, clock, 'devices.AL-LPT-0447.adapters[0].dhcpEnabled', true, false, false)
    recordDialogue(s, clock, 'chat', 'p.raman', 'requester', 'Сайты не открываются')
    addDangerousAction(s, clock, 'netsh advfirewall set allprofiles state off', 'защита')
    setFlag(s, 'identityVerified', true)

    const at = '2026-09-09T18:00:00.000Z'
    expect(s.commands.map(c => c.cmdline)).toEqual(['ipconfig /renew', 'ipconfig /release'])
    expect(s.changes).toEqual([{
      at, path: 'devices.AL-LPT-0447.adapters[0].dhcpEnabled', before: true, after: false, authorized: false,
    }])
    expect(s.dialogue).toEqual([{
      at, channel: 'chat', with: 'p.raman', speaker: 'requester', text: 'Сайты не открываются',
    }])
    expect(s.flags.dangerousActions).toEqual([{
      at, action: 'netsh advfirewall set allprofiles state off', reason: 'защита',
    }])
    expect(s.flags.identityVerified).toBe(true)
    expect(createSession().commands).toEqual([])
  })

  /*
    Правило доктрины — «проговори действие до того, как его сделаешь» —
    проверяется порядком: первая реплика техника прозвучала, пока журнал
    изменений пуст. Реплика заявителя не в счёт.
  */
  it('связь до начала работы — реплика техника при пустом журнале изменений', () => {
    const early = createSession()
    recordDialogue(early, clock, 'call', 'p.raman', 'requester', 'Алло')
    expect(early.flags.announcedBeforeActing).toBe(false)
    recordDialogue(early, clock, 'call', 'p.raman', 'technician', 'Сейчас посмотрю')
    expect(early.flags.announcedBeforeActing).toBe(true)

    const late = createSession()
    recordChange(late, clock, 'x', 1, 2, true)
    recordDialogue(late, clock, 'mail', 'p.raman', 'technician', 'Готово')
    expect(late.flags.announcedBeforeActing).toBe(false)
  })
})
