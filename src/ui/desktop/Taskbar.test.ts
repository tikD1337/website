import { describe, it, expect } from 'vitest'
import { networkState } from './Taskbar'

/**
 * Иконка трея не имеет собственного состояния — она читает адаптер.
 * Эти тесты фиксируют именно это: те же данные, что видит ipconfig,
 * определяют, что показано в трее.
 */
describe('состояние сети в трее', () => {
  it('следует адаптеру: исправен, без доступа, нет линка, нет адаптера', () => {
    expect(networkState({ linkUp: true, autoconfigured: false, gateway: '10.20.14.1', internet: true }))
      .toEqual({ label: 'Подключено', tone: 'ok' })
    expect(networkState({ linkUp: true, autoconfigured: true, gateway: '', internet: false }))
      .toEqual({ label: 'Без доступа к сети', tone: 'warn' })
    expect(networkState({ linkUp: true, autoconfigured: false, gateway: '', internet: false }).tone).toBe('warn')
    expect(networkState({ linkUp: false, autoconfigured: false, gateway: '10.20.14.1', internet: false }))
      .toEqual({ label: 'Нет подключения', tone: 'bad' })
    expect(networkState(undefined).tone).toBe('bad')
    expect(networkState({ linkUp: true, autoconfigured: false, gateway: '10.20.14.254', internet: false }))
      .toEqual({ label: 'Без доступа к интернету', tone: 'warn' })
  })
})
