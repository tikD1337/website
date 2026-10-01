import { describe, it, expect } from 'vitest'
import { createLimiter } from './limits'

describe('корзины лимитов', () => {
  /*
    Найдено финальным обзором: корзины удалялись только полными, и поток
    новых адресов, каждый со свежим запросом, растил карту без предела, а
    очистка обходила её целиком на каждом запросе — на Pi 3 это и память,
    и процессор.
  */
  it('поток новых адресов не растит память без предела', () => {
    const limiter = createLimiter(() => 0)
    for (let i = 0; i < 25_000; i++) limiter.take(`10.0.${i >> 8}.${i & 255}`, 'capsule')
    expect(limiter.size()).toBeLessThanOrEqual(10_000)
    expect(limiter.take('10.0.0.1', 'capsule'), 'новый адрес по-прежнему обслуживается').toBe(0)
  })
})
