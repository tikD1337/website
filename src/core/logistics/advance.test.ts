import { describe, it, expect } from 'vitest'
import { advanceShipments } from './advance'
import { trackingFor } from './types'
import { createWorld } from '../world/world'
import type { Shipment, ShipmentDirection, ShipmentType, WorldState } from '../world/types'

const T0 = '2026-09-28T10:00:00.000Z'
const at = (sec: number) => new Date(Date.parse(T0) + sec * 1000)
const asset = (w: WorldState, tag: string) => w.cmdb.find(a => a.tag === tag)!

/** Отправление, как его оставило бы оформление: этап 0, актив уже в пути. */
function ship(
  w: WorldState, type: ShipmentType, direction: ShipmentDirection, assetTag: string, recipient = '',
): Shipment {
  const n = 1041 + w.shipments.filter(x => x.createdAt === T0).length
  const s: Shipment = {
    id: `SHP-${n}`, type, direction, assetTag, ticket: 'INC1', recipient,
    destination: 'куда-то', createdAt: T0, stage: 0,
    history: [{ stage: direction === 'to-warehouse' ? 'В пути' : 'Оформлено', at: T0 }],
    tracking: trackingFor(n), outcome: '',
  }
  w.shipments.push(s)
  Object.assign(asset(w, assetTag), { lifecycle: 'in-transit' })
  return s
}

/*
  Этап наступает в момент «оформление плюс длительности», а не в момент
  тика. Иначе мир зависел бы от того, как часто тикает интерфейс, и
  вкладка, проспавшая десять минут, получала бы другую историю.
*/
describe('движение отправлений', () => {
  it('этапы наступают по часам; тик после долгого перерыва равен тикам каждую секунду', () => {
    const w = createWorld()
    ship(w, 'dock-monitor-swap', 'to-desk', 'AL-P2040', 'e.varga')
    expect(advanceShipments(w, at(14))).toEqual([])
    expect(advanceShipments(w, at(15))).toEqual([
      { id: 'SHP-1041', ticket: 'INC1', stage: 'Собирается на складе', final: false, direction: 'to-desk' },
    ])

    const everySecond = createWorld()
    ship(everySecond, 'dock-monitor-swap', 'to-desk', 'AL-P2040', 'e.varga')
    for (let t = 1; t <= 90; t++) advanceShipments(everySecond, at(t))
    const once = createWorld()
    ship(once, 'dock-monitor-swap', 'to-desk', 'AL-P2040', 'e.varga')
    advanceShipments(once, at(600))

    expect(once.shipments).toEqual(everySecond.shipments)
    expect(once.cmdb).toEqual(everySecond.cmdb)
    expect(once.shipments.at(-1)!.history.map(h => h.at)).toEqual([
      '2026-09-28T10:00:00.000Z', '2026-09-28T10:00:15.000Z',
      '2026-09-28T10:00:45.000Z', '2026-09-28T10:01:30.000Z',
    ])
    expect(advanceShipments(once, at(900))).toEqual([])
  })

  it('доставка на стол: актив в работе у заявителя, прежний того же вида отключён', () => {
    const w = createWorld()
    ship(w, 'dock-monitor-swap', 'to-desk', 'AL-P2040', 'e.varga')
    const events = advanceShipments(w, at(90))
    expect(events.at(-1)).toEqual(
      { id: 'SHP-1041', ticket: 'INC1', stage: 'Доставлено', final: true, direction: 'to-desk' })
    expect(asset(w, 'AL-P2040')).toMatchObject({
      lifecycle: 'in-use', owner: 'e.varga', location: 'Стол 3-20', attachedTo: 'AL-LPT-0512',
    })
    expect(asset(w, 'AL-P2031')).toMatchObject({ attachedTo: '', lifecycle: 'in-use', owner: 'e.varga' })
    // Монитор того же стола не тронут: заменили док, а не всё подряд.
    expect(asset(w, 'AL-P2102').attachedTo).toBe('AL-LPT-0512')
  })

  it('вендор: по гарантии принимает, без гарантии возвращает на склад неисправным', () => {
    const w = createWorld()
    asset(w, 'AL-P3017').condition = 'faulty'
    const dock = ship(w, 'vendor-rma', 'to-vendor', 'AL-P2031')
    const headset = ship(w, 'vendor-rma', 'to-vendor', 'AL-P3017')
    advanceShipments(w, at(140))

    expect(dock.outcome).toBe('accepted')
    expect(asset(w, 'AL-P2031')).toMatchObject({ lifecycle: 'rma', location: 'Сервисный центр Halyard' })
    expect(headset.outcome).toBe('rejected')
    expect(asset(w, 'AL-P3017')).toMatchObject({
      lifecycle: 'in-stock', owner: '', location: 'Склад, возврат от вендора',
      note: 'Отклонено вендором: гарантия истекла', condition: 'faulty',
    })
  })

  it('утилизация списывает, входящее принимается складом', () => {
    const w = createWorld()
    ship(w, 'disposal', 'to-disposal', 'AL-P3017')
    ship(w, 'inbound', 'to-warehouse', 'AL-L9001')
    advanceShipments(w, at(120))
    expect(asset(w, 'AL-P3017')).toMatchObject(
      { lifecycle: 'retired', owner: '', location: 'Утилизирован', attachedTo: '' })
    expect(asset(w, 'AL-L9001')).toMatchObject({ lifecycle: 'in-stock', location: 'Склад, стеллаж A1' })
    expect(w.shipments.slice(-2).map(s => s.history.at(-1)!.stage)).toEqual(['Утилизировано', 'Принято складом'])
  })
})
