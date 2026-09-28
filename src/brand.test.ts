import { describe, it, expect } from 'vitest'
import { BRAND, FORBIDDEN_TRADEMARKS } from './brand'
import { createWorld } from './core/world/world'
import { SCENARIOS } from './scenarios'

describe('вымышленные бренды', () => {
  /*
    Реальных товарных знаков нет ни в словаре, ни в данных мира, ни в
    сценариях — там, куда их проще всего занести новым контентом.
  */
  it('реальные товарные знаки не встречаются ни в словаре, ни в мире, ни в сценариях', () => {
    const sources = { BRAND, world: createWorld(), scenarios: SCENARIOS }
    for (const [name, data] of Object.entries(sources)) {
      const blob = JSON.stringify(data).toLowerCase()
      expect(FORBIDDEN_TRADEMARKS.filter(tm => blob.includes(tm)), name).toEqual([])
    }
  })
})
