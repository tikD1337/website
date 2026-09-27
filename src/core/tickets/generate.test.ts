import { describe, it, expect } from 'vitest'
import {
  createQueueGenerator, fillQueue, SHIFT_WINDOW,
  type QueueGeneratorState,
} from './generate'
import type { Scenario } from '../scenario/types'
import { createWorld } from '../world/world'
import type { WorldState } from '../world/types'

// Сценарии ниже ничего не ломают, поэтому мир общий на весь файл.
const world: WorldState = createWorld()

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
  fillQueue(g, SCENARIOS, world)
  return g
}
const ids = (g: QueueGeneratorState) => g.tickets.map(t => t.scenarioId)

describe('окно смены', () => {
  it('наполняется до окна, у каждого тикета свой номер', () => {
    const g = gen()
    expect(ids(g)).toEqual(['a', 'b', 'c'])
    expect(g.pool).toEqual(['c2'])
    expect(SHIFT_WINDOW).toBe(3)
    expect(new Set(g.tickets.map(t => t.number)).size).toBe(3)
  })

  it('закрыл тикет — пришёл следующий из пула, если его машина свободна', () => {
    // Закрыт тикет на свободной машине M-1: C2 ждёт занятую M-3 и не входит.
    const freeSlot = gen()
    freeSlot.tickets.find(t => t.device === 'M-1')!.status = 'completed'
    fillQueue(freeSlot, SCENARIOS, world)
    expect(ids(freeSlot).sort()).toEqual(['b', 'c'])
    expect(freeSlot.pool).toEqual(['c2'])

    // Закрыт тикет на M-3: C2 входит.
    const waited = gen()
    waited.tickets.find(t => t.device === 'M-3')!.status = 'completed'
    fillQueue(waited, SCENARIOS, world)
    expect(ids(waited)).toEqual(['a', 'b', 'c2'])
    expect(waited.pool).toEqual([])
  })

  it('скрытый тикет возвращается в пул без штрафа и может прийти снова', () => {
    const g = gen()
    const gone = g.tickets.splice(0, 1)[0]!
    g.pool.push(gone.scenarioId)
    fillQueue(g, SCENARIOS, world)
    expect(g.tickets).toHaveLength(SHIFT_WINDOW)
    expect(ids(g)).toContain(gone.scenarioId)
  })

  /*
    Пустым пул объявляется громко: «тикетов нет» и «тикетов больше не
    будет» — разные состояния. Пока в пуле ждёт отложенный, смена не
    кончилась.
  */
  it('исчерпание объявляется, только когда пуст и пул, и окно', () => {
    const waiting = createQueueGenerator(['c', 'c2'])
    fillQueue(waiting, SCENARIOS, world)
    expect(waiting.exhausted).toBe(false)

    const g = gen()
    while (g.pool.length > 0 || g.tickets.some(t => t.status !== 'completed')) {
      for (const t of g.tickets) t.status = 'completed'
      fillQueue(g, SCENARIOS, world)
    }
    expect(g.tickets).toEqual([])
    expect(g.exhausted).toBe(true)
  })
})

/**
 * Одна открытая поломка на машину, и занятость проверяется на каждой
 * вставке. Множество занятых машин строилось до цикла и внутри не
 * пополнялось: пока окно наполнялось с нуля, два сценария на одной
 * машине въезжали вместе, после чего ломали друг друга.
 */
describe('одна открытая поломка на машину', () => {
  it('в пустое окно не въедут два сценария одной машины; свободная машина не ждёт занятую', () => {
    const g = createQueueGenerator(['c', 'c2', 'b'])
    fillQueue(g, SCENARIOS, world)
    expect(ids(g).sort()).toEqual(['b', 'c'])
    expect(g.pool).toEqual(['c2'])
  })

  /*
    Поломка входит в мир вместе с тикетом, и один раз. Раньше мир
    ломался сразу по всей библиотеке, и правило держалось только в
    очереди; вернувшийся скрытый тикет не должен откатывать начатую
    починку.
  */
  it('поломка входит в мир с тикетом и только один раз', () => {
    const HOST = 'AL-LPT-0601'
    const LINK = { ...A, id: 'link', device: HOST,
      inject: [{ path: `devices.${HOST}.adapters[0].linkUp`, value: false }] }
    const DISK = { ...A, id: 'disk', device: HOST,
      inject: [{ path: `devices.${HOST}.disks[0].health`, value: 'failing' }] }
    const BOTH = [LINK, DISK]
    const w = createWorld()
    const g = createQueueGenerator(['link', 'disk'])
    const machine = () => w.devices[HOST]!

    fillQueue(g, BOTH, w)
    expect([machine().adapters[0]!.linkUp, machine().disks[0]!.health]).toEqual([false, 'healthy'])

    g.tickets[0]!.status = 'completed'
    fillQueue(g, BOTH, w)
    expect(ids(g)).toEqual(['disk'])
    expect(machine().disks[0]!.health).toBe('failing')

    // Техник начал чинить и отложил тикет — вернувшись, тот не ломает машину заново.
    const w2 = createWorld()
    const g2 = createQueueGenerator(['link'])
    fillQueue(g2, BOTH, w2)
    w2.devices[HOST]!.adapters[0]!.linkUp = true
    g2.tickets = []
    g2.pool.push('link')
    fillQueue(g2, BOTH, w2)
    expect(ids(g2)).toEqual(['link'])
    expect(w2.devices[HOST]!.adapters[0]!.linkUp).toBe(true)
  })
})
