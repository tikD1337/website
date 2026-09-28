import { describe, it, expect } from 'vitest'
import { peripheralsOf } from './peripherals'
import { warrantyActive } from '../world/assets'
import { createWorld } from '../world/world'

const asset = (w: ReturnType<typeof createWorld>, tag: string) => w.cmdb.find(a => a.tag === tag)!

/*
  Исправность периферии хранится в учёте, а диспетчер устройств её
  показывает. Две копии — строка драйвера и запись актива — разошлись бы
  на первой же замене: новый док приехал, а Code 43 остался.
*/
describe('периферия машины', () => {
  it('строки диспетчера — из подключённых активов; неисправный док — Code 43, гарнитура — исправна', () => {
    const w = createWorld()
    expect(peripheralsOf(w, 'AL-LPT-0512').map(d => d.device))
      .toEqual(['Halyard D6000 USB-C Dock', 'Generic PnP Monitor'])

    asset(w, 'AL-P2031').condition = 'faulty'
    expect(peripheralsOf(w, 'AL-LPT-0512')[0]).toEqual({
      device: 'Halyard D6000 USB-C Dock', provider: 'Halyard', version: '5.2.14.0',
      status: 'problem', problemCode: 43,
      problemText: 'Windows has stopped this device because it has reported problems. (Code 43)',
    })

    // Изношенная гарнитура электрически исправна: дело не в драйвере.
    asset(w, 'AL-P3017').condition = 'faulty'
    expect(peripheralsOf(w, 'AL-DSK-0192').find(d => d.device === 'Halyard H340 USB Headset'))
      .toMatchObject({ status: 'ok', problemCode: null })
  })

  it('гарантия действует до даты окончания, не включая её', () => {
    const w = createWorld()
    const cases: Array<[string, string, boolean]> = [
      ['AL-P2031', '2026-09-28T10:00:00Z', true],
      ['AL-P3017', '2026-09-28T10:00:00Z', false],
      ['AL-P2031', '2027-03-10T00:00:00Z', false],
      ['AL-P2031', '2027-03-09T23:59:59Z', true],
    ]
    for (const [tag, at, want] of cases) {
      expect(warrantyActive(asset(w, tag), new Date(at)), `${tag} ${at}`).toBe(want)
    }
  })
})
