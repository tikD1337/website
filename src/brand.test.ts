import { describe, it, expect } from 'vitest'
import { BRAND, FORBIDDEN_TRADEMARKS } from './brand'

describe('словарь брендов', () => {
  it('задаёт компанию, домен и внутренний суффикс', () => {
    expect(BRAND.company).toBe('Arcline Logistics')
    expect(BRAND.domain).toBe('arcline.corp')
    expect(BRAND.dnsSuffix).toBe('corp.arcline.local')
  })

  it('не содержит реальных товарных знаков', () => {
    const blob = JSON.stringify(BRAND).toLowerCase()
    const hits = FORBIDDEN_TRADEMARKS.filter(tm => blob.includes(tm))
    expect(hits).toEqual([])
  })

  it('перечисляет вендоров по каждому классу оборудования', () => {
    for (const kind of ['laptop', 'desktop', 'tablet', 'network', 'printer', 'peripheral'] as const) {
      expect(BRAND.vendors[kind].length).toBeGreaterThan(0)
    }
  })

  it('даёт вымышленные имена браузеру, почте и офисному пакету', () => {
    expect(BRAND.browser).toBeTruthy()
    expect(BRAND.mail).toBeTruthy()
    expect(BRAND.office).toBeTruthy()
    expect(BRAND.chat).toBeTruthy()
    expect(BRAND.cloud).toBeTruthy()
  })
})
