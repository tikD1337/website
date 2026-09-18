import { describe, it, expect } from 'vitest'
import { rankFor, weekKey, RANKS } from './points'

describe('ранги', () => {
  it('нулевые очки — стажёр', () => {
    expect(rankFor(0).current.title).toBe('Стажёр')
  })

  /* Границы порога: именно здесь ошибка на единицу и живёт. */
  it('на очко ниже порога ранг ещё прежний', () => {
    expect(rankFor(499).current.title).toBe('Стажёр')
  })

  it('ровно на пороге ранг уже следующий', () => {
    expect(rankFor(500).current.title).toBe('Первая линия')
  })

  it('до следующего ранга считается остаток', () => {
    const r = rankFor(499)
    expect(r.next?.title).toBe('Первая линия')
    expect(r.toNext).toBe(1)
  })

  it('на вершине следующего ранга нет', () => {
    const r = rankFor(99_999)
    expect(r.current.title).toBe(RANKS.at(-1)!.title)
    expect(r.next).toBeNull()
    expect(r.toNext).toBeNull()
  })

  /*
    Пороги обязаны идти по возрастанию: перепутанный порядок дал бы
    ранг, который невозможно получить, и заметно это стало бы нескоро.
  */
  it('пороги упорядочены', () => {
    const points = RANKS.map(r => r.points)
    expect([...points].sort((a, b) => a - b)).toEqual(points)
  })
})

describe('недельный ключ', () => {
  it('первое января 2026 — первая неделя', () => {
    expect(weekKey(new Date('2026-01-01T00:00:00.000Z'))).toBe('2026-W01')
  })

  it('воскресенье относится к своей неделе, а не к следующей', () => {
    // 2026-09-13 — воскресенье, неделя началась в понедельник 07-09.
    expect(weekKey(new Date('2026-09-13T23:59:59.000Z'))).toBe('2026-W37')
    expect(weekKey(new Date('2026-09-07T00:00:00.000Z'))).toBe('2026-W37')
  })

  it('понедельник начинает новую неделю', () => {
    expect(weekKey(new Date('2026-09-14T00:00:00.000Z'))).toBe('2026-W38')
  })
})
