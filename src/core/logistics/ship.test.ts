import { describe, it, expect, beforeEach } from 'vitest'
import { createShipment, type ShipmentInput } from './ship'
import { createWorld } from '../world/world'
import { createSession } from '../session/session'
import type { SessionLog } from '../session/types'
import type { WorldState } from '../world/types'

const clock = { now: () => new Date('2026-09-28T10:00:00.000Z') }
const INCIDENT = { number: 'INC1', device: 'AL-LPT-0512', requester: 'e.varga' }
const asset = (tag: string) => world.cmdb.find(a => a.tag === tag)!

let world: WorldState
let session: SessionLog
beforeEach(() => {
  world = createWorld()
  session = createSession(INCIDENT)
})

describe('оформление отправления', () => {
  it('оформление: номер по порядку, актив в пути, запись в журнале', () => {
    expect(createShipment(world, { type: 'dock-monitor-swap', assetTag: 'AL-P2040' }, session, clock))
      .toEqual({ ok: true, id: 'SHP-1041', flagged: false })
    expect(asset('AL-P2040')).toMatchObject({
      lifecycle: 'in-transit', location: 'В пути: Стол 3-20 (Elena Varga)',
    })
    expect(world.shipments.at(-1)).toMatchObject({
      id: 'SHP-1041', ticket: 'INC1', recipient: 'e.varga', stage: 0, direction: 'to-desk',
      tracking: 'HX-1041-43679', destination: 'Стол 3-20 (Elena Varga)',
      history: [{ stage: 'Оформлено', at: '2026-09-28T10:00:00.000Z' }],
    })
    expect(session.changes).toEqual([{
      at: '2026-09-28T10:00:00.000Z', path: 'shipments[id=SHP-1041]', before: null,
      after: 'Замена дока или монитора AL-P2040 → Стол 3-20 (Elena Varga)', authorized: true,
    }])
  })

  /*
    Отказ шлюза — граница полномочий, записанная опасным действием. Ошибка
    учёта — не нарушение, а невозможность: актива нет, он не того вида или
    уже в пути. Двойной клик по «Оформить» — второе ровно такое.
  */
  it('отказы шлюза и ошибки учёта — мир не меняется', () => {
    createShipment(world, { type: 'dock-monitor-swap', assetTag: 'AL-P2040' }, session, clock)
    const before = structuredClone({ cmdb: world.cmdb, shipments: world.shipments })
    const orphan = createSession()

    const cases: Array<[ShipmentInput, SessionLog, string]> = [
      [{ type: 'dock-monitor-swap', assetTag: 'AL-X' }, session, 'актив AL-X не найден'],
      [{ type: 'headset-to-desk', assetTag: 'AL-P2041' }, session,
        '«Гарнитура на стол» не подходит для вида «док-станция»'],
      [{ type: 'dock-monitor-swap', assetTag: 'AL-P2040' }, session, 'актив AL-P2040 не на складе'],
      [{ type: 'dock-monitor-swap', assetTag: 'AL-P2031' }, session, 'актив AL-P2031 не на складе'],
      [{ type: 'vendor-rma', assetTag: 'AL-P2040' }, session, 'актив AL-P2040 уже в пути'],
      [{ type: 'disposal', assetTag: 'AL-L0301' }, session, 'актив AL-L0301 уже списан'],
      [{ type: 'dock-monitor-swap', assetTag: 'AL-P2041' }, orphan,
        'отказано: нет открытого тикета — отправка оборудования только по тикету'],
      [{ type: 'dock-monitor-swap', assetTag: 'AL-P2041', recipient: 'p.raman' }, session,
        'отказано: вне области тикета — оборудование отправляется заявителю'],
      [{ type: 'vendor-rma', assetTag: 'AL-P2030' }, session,
        'отказано: вне области тикета — отправляется только оборудование заявителя'],
      [{ type: 'inbound', assetTag: 'AL-L9001' }, session, 'отказано: входящие поставки оформляет закупка'],
    ]
    for (const [input, s, error] of cases) {
      expect(createShipment(world, input, s, clock), `${input.type} ${input.assetTag}`)
        .toMatchObject({ ok: false, error })
    }
    expect({ cmdb: world.cmdb, shipments: world.shipments }).toEqual(before)
    expect(session.flags.dangerousActions.map(d => d.action)).toEqual([
      'отправка «Замена дока или монитора»: AL-P2041',
      'отправка «RMA вендору»: AL-P2030',
      'отправка «Входящее оборудование»: AL-L9001',
    ])
    expect(orphan.flags.dangerousActions).toHaveLength(1)
  })

  /*
    Утилизация оборудования на гарантии — не невозможное действие, а
    ошибка суждения: вендор заменил бы бесплатно. Проходит, помечается и
    стоит вердикта — как сброс пароля без сверки личности.
  */
  it('утилизация на гарантии проходит с флагом', () => {
    expect(createShipment(world, { type: 'disposal', assetTag: 'AL-P2031' }, session, clock))
      .toEqual({ ok: true, id: 'SHP-1041', flagged: true })
    expect(session.flags.dangerousActions).toEqual([{
      at: '2026-09-28T10:00:00.000Z', action: 'отправка «Утилизация»: AL-P2031',
      reason: 'утилизация оборудования на гарантии — вендор заменит его бесплатно',
    }])
    expect(session.changes[0]).toMatchObject({ authorized: false })
    expect(asset('AL-P2031')).toMatchObject({ lifecycle: 'in-transit', attachedTo: '' })
  })
})
