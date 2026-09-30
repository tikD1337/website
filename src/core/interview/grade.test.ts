import { describe, it, expect } from 'vitest'
import { coverage, verdictFor } from './grade'
import type { Question, Verdict } from './types'

const q: Question = {
  id: 'apipa', stage: 'technical', prompt: 'Что вы сделаете, если у машины адрес не из своей сети?',
  expected: 'Самоназначенный адрес — DHCP не ответил; освободить аренду, затем запросить заново.',
  points: [
    { id: 'release', label: 'освободить аренду', markers: ['release', 'освобо'], why: 'без освобождения renew падает' },
    { id: 'order', label: 'порядок', markers: ['сначала', 'потом', 'затем'], why: 'порядок важен' },
    { id: 'apipa', label: 'самоназначенный адрес', markers: ['169.254', 'сам назнач', 'самоназнач'], why: 'DHCP не ответил' },
  ],
}

describe('оценка ответа', () => {
  it('пункт прозвучал, если есть любой его маркер; регистр, ё и пробелы не мешают', () => {
    const cases: Array<[string, string[], string[]]> = [
      ['регистр', ['Сначала IPCONFIG /Release'], ['release', 'order']],
      ['форма слова', ['адрес САМОНАЗНАЧЕННЫЙ'], ['apipa']],
      ['два ответа засчитываются вместе', ['освобождаю', 'затем renew'], ['release', 'order']],
      ['ё и лишние пробелы', ['адрес   сам  назначён, потом release'], ['release', 'order', 'apipa']],
      ['пустой ответ', [''], []],
    ]
    for (const [name, answers, covered] of cases) {
      expect(coverage(q, answers).covered, name).toEqual(covered)
    }
    expect(coverage(q, ['Сначала IPCONFIG /Release'])).toEqual({ covered: ['release', 'order'], missing: ['apipa'], score: 2 / 3 })
  })

  it('вердикт по порогам', () => {
    const cases: Array<[number, number, number, Verdict]> = [
      [0.7, 0.5, 1, 'hire'],
      [0.9, 0.9, 0, 'maybe'],
      [0.69, 1, 3, 'maybe'],
      [0.8, 0.4, 2, 'maybe'],
      [0.45, 0, 0, 'maybe'],
      [0.44, 1, 1, 'no'],
    ]
    for (const [t, e, asked, v] of cases) expect(verdictFor(t, e, asked), `${t}/${e}/${asked}`).toBe(v)
  })
})
