import { describe, it, expect } from 'vitest'
import { networkState } from './Taskbar'

/**
 * Иконка трея не имеет собственного состояния — она читает адаптер.
 * Эти тесты фиксируют именно это: те же данные, что видит ipconfig,
 * определяют, что показано в трее.
 */
describe('состояние сети в трее', () => {
  it('исправный адаптер — подключено', () => {
    expect(networkState({ linkUp: true, autoconfigured: false, gateway: '10.20.14.1' }))
      .toEqual({ label: 'Подключено', tone: 'ok' })
  })

  it('самоназначенный адрес — без доступа к сети', () => {
    expect(networkState({ linkUp: true, autoconfigured: true, gateway: '' }))
      .toEqual({ label: 'Без доступа к сети', tone: 'warn' })
  })

  it('пустой шлюз без самоназначения — тоже без доступа', () => {
    expect(networkState({ linkUp: true, autoconfigured: false, gateway: '' }).tone)
      .toBe('warn')
  })

  it('опущенный линк — нет подключения', () => {
    expect(networkState({ linkUp: false, autoconfigured: false, gateway: '10.20.14.1' }))
      .toEqual({ label: 'Нет подключения', tone: 'bad' })
  })

  it('без адаптера — нет подключения', () => {
    expect(networkState(undefined).tone).toBe('bad')
  })
})
