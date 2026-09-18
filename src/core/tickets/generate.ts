import type { Ticket } from './types'
import { buildTicket } from '../scenario/load'
import type { Scenario } from '../scenario/types'

/**
 * Пул экземпляров и окно смены.
 *
 * Срез 5 меняет взгляд на очередь: это не вся библиотека, а окно.
 * Пул — экземпляры (сценарий плюс идентификатор), и сегодня у каждого
 * сценария ровно один экземпляр — канонический, поэтому поведение не
 * меняется. В срезе 8 у сценария станет несколько экземпляров, и
 * генератор об этом уже не узнает: он видел пул всегда.
 *
 * Правила, и каждое существует по делу:
 *
 * - **Окно смены — три тикета.** Пополнение должно быть видно: закрыл
 *   один — пришёл следующий.
 * - **Две открытые поломки на одной машине невозможны.** Экземпляр, чья
 *   машина занята, откладывается до следующего наполнения: иначе две
 *   поломки ломали бы друг друга на одной машине, и обе диагностики
 *   стали бы враньём.
 * - **Скрытие без штрафа.** Тикет уходит, экземпляр возвращается в пул
 *   и может прийти снова. Скрытие — отложенное дело, а не брошенное.
 * - **Пул может исчерпаться, и об этом говорится прямо.** Смена
 *   заканчивается после того, как пул опустел до конца: молчаливое
 *   «очередь пуста и больше не будет» читалось бы как поломка.
 */


export interface QueueGeneratorState {
  /** экземпляры, ждущие своей смены */
  pool: string[]
  /** тикеты текущего окна, в порядке появления */
  tickets: Ticket[]
  /** было ли объявлено, что пул исчерпан */
  exhausted: boolean
  /** сколько тикетов занимает окно смены */
  window: number
}

export const SHIFT_WINDOW = 3

export function createQueueGenerator(
  scenarioIds: string[],
  window = SHIFT_WINDOW,
): QueueGeneratorState {
  return { pool: [...scenarioIds], tickets: [], exhausted: false, window }
}

/**
 * Наполняет очередь до окна смены.
 *
 * Ведёт собственное состояние; стор зовёт его после каждого закрытия
 * или скрытия тикета. Держит в очереди столько тикетов, сколько можно
 * взять подряд, не спрашивая у сценариев ничего, кроме id.
 */
export function fillQueue(
  g: QueueGeneratorState,
  scenarios: Scenario[],
): void {
  // Закрытые тикеты покидают окно: их место освободилось для новых.
  g.tickets = g.tickets.filter(t => t.status !== 'completed')

  // Машины ещё открытых тикетов — сесть на них нельзя.
  const busyDevices = new Set(g.tickets.map(t => t.device))

  // Экземпляры на занятых машинах уходят в конец пула, не теряясь.
  const blocked: string[] = []
  for (let i = g.pool.length - 1; i >= 0; i--) {
    const id = g.pool[i]!
    const sc = scenarios.find(s => s.id === id)
    if (sc && busyDevices.has(sc.device)) {
      blocked.push(id)
      g.pool.splice(i, 1)
    }
  }
  g.pool.push(...blocked)

  while (g.tickets.length < g.window && g.pool.length > 0) {
    const id = g.pool.shift()!
    const sc = scenarios.find(s => s.id === id)
    if (!sc) continue
    g.tickets.push(buildTicket(sc))
  }

  g.exhausted = g.pool.length === 0 && g.tickets.length === 0
}