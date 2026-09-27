import { describe, it, expect } from 'vitest'
import { rankFor, weekKey, RANKS } from './points'

describe('ранги', () => {
  /* Границы порога: именно здесь ошибка на единицу и живёт. */
  it('порог включителен, остаток считается, у вершины следующего нет', () => {
    expect(rankFor(0).current.title).toBe('Стажёр')
    expect(rankFor(499)).toMatchObject({
      current: { title: 'Стажёр' }, next: { title: 'Первая линия' }, toNext: 1,
    })
    expect(rankFor(500).current.title).toBe('Первая линия')

    const top = rankFor(99_999)
    expect(top.current.title).toBe(RANKS.at(-1)!.title)
    expect(top.next).toBeNull()
    expect(top.toNext).toBeNull()

    // Перепутанный порядок порогов дал бы ранг, который невозможно получить.
    const points = RANKS.map(r => r.points)
    expect([...points].sort((a, b) => a - b)).toEqual(points)
  })
})

describe('недельный ключ', () => {
  it('ISO-неделя: с понедельника по воскресенье включительно', () => {
    expect(weekKey(new Date('2026-01-01T00:00:00.000Z'))).toBe('2026-W01')
    // 2026-09-13 — воскресенье, неделя началась в понедельник 07-09.
    expect(weekKey(new Date('2026-09-07T00:00:00.000Z'))).toBe('2026-W37')
    expect(weekKey(new Date('2026-09-13T23:59:59.000Z'))).toBe('2026-W37')
    expect(weekKey(new Date('2026-09-14T00:00:00.000Z'))).toBe('2026-W38')
  })
})
