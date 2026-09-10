import { describe, it, expect } from 'vitest'
import { plural, withPlural } from './plural'

const points = (n: number) => plural(n, 'очко', 'очка', 'очков')

describe('plural', () => {
  it('единственное число', () => {
    expect(points(1)).toBe('очко')
    expect(points(21)).toBe('очко')
    expect(points(101)).toBe('очко')
  })

  it('от двух до четырёх', () => {
    expect(points(2)).toBe('очка')
    expect(points(3)).toBe('очка')
    expect(points(4)).toBe('очка')
    expect(points(54)).toBe('очка')
    expect(points(22)).toBe('очка')
  })

  it('множественное число', () => {
    expect(points(0)).toBe('очков')
    expect(points(5)).toBe('очков')
    expect(points(10)).toBe('очков')
    expect(points(20)).toBe('очков')
    expect(points(100)).toBe('очков')
  })

  it('подросткам всегда множественное — это ловушка правила', () => {
    expect(points(11)).toBe('очков')
    expect(points(12)).toBe('очков')
    expect(points(13)).toBe('очков')
    expect(points(14)).toBe('очков')
    expect(points(111)).toBe('очков')
    expect(points(112)).toBe('очков')
  })

  it('работает для других слов', () => {
    expect(plural(1, 'команда', 'команды', 'команд')).toBe('команда')
    expect(plural(4, 'команда', 'команды', 'команд')).toBe('команды')
    expect(plural(7, 'команда', 'команды', 'команд')).toBe('команд')
  })
})

describe('withPlural', () => {
  it('склеивает число со словом', () => {
    expect(withPlural(54, 'очко', 'очка', 'очков')).toBe('54 очка')
    expect(withPlural(1, 'очко', 'очка', 'очков')).toBe('1 очко')
    expect(withPlural(11, 'очко', 'очка', 'очков')).toBe('11 очков')
  })
})
