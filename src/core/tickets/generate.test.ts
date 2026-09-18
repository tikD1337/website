import { describe, it, expect } from 'vitest'
import {
  createQueueGenerator, fillQueue, SHIFT_WINDOW,
  type QueueGeneratorState,
} from './generate'
import type { Scenario } from '../scenario/types'

const A: Scenario = {
  id: 'a', category: 'Сеть', subcategory: 'Связность', priority: 'P3',
  service: 'Корпоративная сеть', summary: 'A', description: 'a',
  requester: 'u1', device: 'M-1', slaResponseHours: 4, slaResolveHours: 24,
  inject: [], rootCause: '', objectives: [], actionsToAvoid: [],
  persona: { knows: [], doesntKnow: [], canDoIfAsked: [], scripted: [] },
  fixedWhen: [], confirmReplies: ['ок', 'нет'],
  expectedResolution: 'solved',
}
const B = { ...A, id: 'b', summary: 'B', requester: 'u2', device: 'M-2' }
// C и C2 — разные сценарии на одной машине: проверка правила «две поломки
// на одной машине невозможны».
const C = { ...A, id: 'c', summary: 'C', requester: 'u3', device: 'M-3' }
const C2 = { ...A, id: 'c2', summary: 'C2', requester: 'u4', device: 'M-3' }
const SCENARIOS = [A, B, C, C2]

function gen(): QueueGeneratorState {
  const g = createQueueGenerator(SCENARIOS.map(s => s.id))
  fillQueue(g, SCENARIOS)
  return g
}

describe('окно смены', () => {
  it('наполняет очередь до окна, а не на весь пул', () => {
    const g = gen()
    expect(g.tickets).toHaveLength(SHIFT_WINDOW)
    expect(g.pool).toHaveLength(SCENARIOS.length - SHIFT_WINDOW)
  })

  it('закрыл тикет — пришёл следующий из пула', () => {
    const g = gen()
    g.tickets[0]!.status = 'completed'
    fillQueue(g, SCENARIOS)
    expect(g.tickets).toHaveLength(SHIFT_WINDOW)
    // закрытый ушёл из окна, на его месте — новый из пула
    expect(g.pool.length).toBe(SCENARIOS.length - SHIFT_WINDOW - 1)
  })

  it('у каждого тикета свой номер', () => {
    const g = gen()
    const nums = g.tickets.map(t => t.number)
    expect(new Set(nums).size).toBe(nums.length)
  })
})

describe('две поломки на одной машине невозможны', () => {
  it('экземпляр на занятой машине откладывается', () => {
    const g = gen()
    // C стоит на той же машине, что и C2. Один из них уже в окне,
    // второй должен остаться в пуле, а не встать рядом.
    const onM3 = g.tickets.filter(t => t.device === 'M-3')
    const inPoolOnM3 = g.pool.filter(id =>
      SCENARIOS.find(s => s.id === id)!.device === 'M-3')
    expect(onM3.length + inPoolOnM3.length).toBe(2)
    expect(onM3.length).toBe(1) // только один экземпляр на машине в окне
  })

  it('экземпляр вернётся, когда машина освободится', () => {
    const g = gen()
    // Находим тикет на M-3 и закрываем его — второй экземпляр должен войти.
    const onM3 = g.tickets.find(t => t.device === 'M-3')!
    onM3.status = 'completed'
    fillQueue(g, SCENARIOS)
    // Теперь второй экземпляр на M-3 в окне.
    const stillOnM3 = g.tickets.find(t =>
      t.device === 'M-3' && t.scenarioId !== onM3.scenarioId)
    expect(stillOnM3).toBeDefined()
  })
})

describe('скрытие без штрафа', () => {
  it('скрытый тикет возвращается в пул и может прийти снова', () => {
    const g = gen()
    const gone = g.tickets[0]!
    // Скрытие: тикет уходит из окна, экземпляр — обратно в пул.
    g.tickets.splice(0, 1)
    g.pool.push(gone.scenarioId)
    fillQueue(g, SCENARIOS)
    // Экземпляр вернулся в окно (одно из двух мест освободилось).
    expect(g.tickets.some(t => t.scenarioId === gone.scenarioId)).toBe(true)
    // Штрафа нет: счётчиков здесь вообще нет, это отложенное дело.
    expect(g.tickets).toHaveLength(SHIFT_WINDOW)
  })
})

describe('пул может исчерпаться', () => {
  it('пустым пул объявляется громко', () => {
    const g = gen()
    // Закрываем все тикеты окна и наполняем, пока пул не опустеет.
    while (g.pool.length > 0 || g.tickets.some(t => t.status !== 'completed')) {
      for (const t of g.tickets) t.status = 'completed'
      fillQueue(g, SCENARIOS)
    }
    expect(g.tickets.length).toBe(0)
    expect(g.exhausted).toBe(true)
  })
})