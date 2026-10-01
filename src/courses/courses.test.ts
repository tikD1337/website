import { describe, it, expect } from 'vitest'
import { COURSES } from '.'
import { firstLine } from './first-line'
import { SCENARIOS } from '../scenarios'
import { validateCourses } from '../core/learning/validate'

describe('курсы', () => {
  /*
    Загрузчик стоит и в сторе, но там он падает при запуске приложения.
    Здесь — чтобы испорченный курс ронял набор тестов, а не только сборку.
  */
  it('курсы проходят загрузчик и ссылаются на библиотеку', () => {
    expect(() => validateCourses(COURSES, SCENARIOS.map(s => s.id))).not.toThrow()
    expect(firstLine.sections.map(s => s.id)).toEqual(['process', 'network', 'accounts', 'workplace'])
    expect(firstLine.sections.map(s => [s.lessons.length, s.quiz.length])).toEqual([[4, 5], [4, 5], [4, 5], [4, 5]])
    expect(firstLine.sections.flatMap(s => s.lessons).every(l => l.checks.length >= 3 && l.practice)).toBe(true)
  })
})
