import { describe, it, expect } from 'vitest'
import { BRAND, FORBIDDEN_TRADEMARKS } from './brand'
import { createWorld } from './core/world/world'
import { SCENARIOS } from './scenarios'
import { COURSES } from './courses'
import { INTERVIEWS } from './interviews'

describe('вымышленные бренды', () => {
  /*
    Реальных товарных знаков нет ни в словаре, ни в данных мира, ни в
    сценариях, курсах и интервью — там, куда их проще всего занести новым
    контентом.
  */
  it('реальные товарные знаки не встречаются ни в словаре, ни в мире, ни в сценариях, курсах и интервью', () => {
    const sources = { BRAND, world: createWorld(), scenarios: SCENARIOS, courses: COURSES, interviews: INTERVIEWS }
    for (const [name, data] of Object.entries(sources)) {
      const blob = JSON.stringify(data).toLowerCase()
      expect(FORBIDDEN_TRADEMARKS.filter(tm => blob.includes(tm)), name).toEqual([])
    }
  })
})
