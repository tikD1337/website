import { describe, it, expect } from 'vitest'
import { checkAnswer, gradeQuiz } from './answer'
import type { Answer, Check } from './types'

const choice: Check = {
  id: 'k1', kind: 'choice', prompt: 'Что значит адрес 169.254.x.x?',
  options: [
    { text: 'DNS не отвечает', why: 'DNS тут ни при чём: адрес выдаёт DHCP.' },
    { text: 'DHCP не ответил', correct: true, why: 'Система не дождалась аренды и назначила адрес сама.' },
  ],
}

const text: Check = {
  id: 'k2', kind: 'text', prompt: 'Какой командой освободить аренду?',
  accept: ['ipconfig /release'],
  why: 'Освобождение снимает удержание самоназначенного адреса.',
  misses: [{ answer: 'ipconfig /renew', why: 'renew в одиночку падает, пока адаптер держит самоназначенный адрес.' }],
}

describe('разбор ответа', () => {
  it('ответ разбирается: выбор, текст с нормализацией, известный промах', () => {
    const cases: Array<[string, Check, Answer | undefined, { correct: boolean; why: string | null }]> = [
      ['верный вариант', choice, 1, { correct: true, why: 'Система не дождалась аренды и назначила адрес сама.' }],
      ['неверный вариант', choice, 0, { correct: false, why: 'DNS тут ни при чём: адрес выдаёт DHCP.' }],
      ['индекс вне вариантов', choice, 5, { correct: false, why: null }],
      ['текст с краями, регистром и пробелами', text, '  IPCONFIG   /release ', { correct: true, why: 'Освобождение снимает удержание самоназначенного адреса.' }],
      ['известный промах', text, 'ipconfig  /RENEW', { correct: false, why: 'renew в одиночку падает, пока адаптер держит самоназначенный адрес.' }],
      ['незнакомый текст', text, 'ping 8.8.8.8', { correct: false, why: null }],
      ['без ответа', text, undefined, { correct: false, why: null }],
      ['текст на вопрос с вариантами', choice, '1', { correct: false, why: null }],
    ]
    for (const [name, check, answer, expected] of cases) {
      expect(checkAnswer(check, answer), name).toEqual(expected)
    }
  })
})

describe('квиз секции', () => {
  const q = (id: string): Check => ({ ...choice, id })
  const quiz = ['q1', 'q2', 'q3', 'q4', 'q5'].map(q)

  it('квиз: порог 4 из 5, у несданного разобраны только неверные', () => {
    const passed = gradeQuiz(quiz, { q1: 1, q2: 1, q3: 1, q4: 1, q5: 0 })
    expect(passed).toMatchObject({ score: 4, total: 5, passed: true })
    expect(passed.items.map(i => i.why === null)).toEqual([false, false, false, false, false])

    // q4 без ответа: считается неверным и не роняет оценку
    const failed = gradeQuiz(quiz, { q1: 1, q2: 1, q3: 1, q5: 0 })
    expect(failed).toEqual({
      score: 3, total: 5, passed: false,
      items: [
        { id: 'q1', correct: true, why: null },
        { id: 'q2', correct: true, why: null },
        { id: 'q3', correct: true, why: null },
        { id: 'q4', correct: false, why: null },
        { id: 'q5', correct: false, why: 'DNS тут ни при чём: адрес выдаёт DHCP.' },
      ],
    })
  })
})
