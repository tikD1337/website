import { describe, it, expect } from 'vitest'
import { railNetwork } from './IncidentRail'
import { createWorld } from '../core/world/world'

/*
  Карточка повторяет то, что показал ipconfig. Найдено визуальной
  проверкой 8Б: порт в err-disabled, ipconfig пишет «Media disconnected»,
  а карточка под номером тикета — адрес, шлюз и DNS, как у живой машины.
*/
describe('сеть в карточке тикета', () => {
  it('без линка — Media disconnected вместо адреса', () => {
    const a = createWorld().devices['AL-LPT-0846']!.adapters[0]!
    expect(railNetwork(a, true)).toEqual([
      ['Адрес', '10.20.14.96'], ['Маска', '255.255.255.0'], ['Шлюз', '10.20.14.1'], ['DNS', '10.20.14.10, 10.20.14.11'],
    ])
    expect(railNetwork(a, false)).toEqual([['Сеть', 'Media disconnected']])
    expect(railNetwork({ ...a, gateway: '', dns: [] }, true).slice(2)).toEqual([['Шлюз', '—'], ['DNS', '—']])
  })
})
