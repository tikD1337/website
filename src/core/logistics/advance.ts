import { STAGES, WAREHOUSE_INBOX } from './types'
import { warrantyActive } from '../world/assets'
import type { Shipment, ShipmentDirection, WorldState } from '../world/types'

/**
 * Движение отправлений по часам.
 *
 * Единственное место, где двигается этап. Момент каждого этапа —
 * оформление плюс длительности предыдущих, а не момент вызова: тик раз в
 * секунду и тик раз в десять минут дают один и тот же мир, а вкладка,
 * проспавшая перерыв, догоняет его по порядку. Эффект этапа применяется
 * ровно при переходе, поэтому повторный вызов ничего не меняет.
 */

export interface ShipmentEvent {
  id: string
  /** номер тикета; у входящих — '' */
  ticket: string
  /** подпись наступившего этапа */
  stage: string
  final: boolean
  direction: ShipmentDirection
}

export function advanceShipments(world: WorldState, now: Date): ShipmentEvent[] {
  const events: ShipmentEvent[] = []
  for (const s of world.shipments) {
    const stages = STAGES[s.direction]
    let reached = Date.parse(s.createdAt)
      + stages.slice(1, s.stage + 1).reduce((sum, st) => sum + st.after * 1000, 0)

    while (s.stage < stages.length - 1) {
      const next = stages[s.stage + 1]!
      const at = reached + next.after * 1000
      if (at > now.getTime()) break
      reached = at
      s.stage++
      s.history.push({ stage: next.label, at: new Date(at).toISOString() })
      const final = s.stage === stages.length - 1
      if (final) complete(world, s, new Date(at))
      events.push({ id: s.id, ticket: s.ticket, stage: next.label, final, direction: s.direction })
    }
  }
  return events
}

/** Последний этап меняет учёт: доставка, решение вендора, списание, приёмка. */
function complete(world: WorldState, s: Shipment, at: Date): void {
  const a = world.cmdb.find(x => x.tag === s.assetTag)
  if (!a) return

  switch (s.direction) {
    case 'to-desk': {
      const user = world.org.users.find(u => u.samAccountName === s.recipient)
      const host = ['dock', 'monitor', 'headset'].includes(a.kind) ? user?.primaryDevice ?? '' : ''
      /*
        Прежний актив того же вида отключается, но остаётся на столе и в
        учёте за человеком: вернуть его или утилизировать — отдельное
        отправление. Монитор меняется только неисправный: их на столе
        может быть несколько.
      */
      for (const old of world.cmdb) {
        if (old === a || old.kind !== a.kind || !host || old.attachedTo !== host) continue
        if (a.kind !== 'monitor' || old.condition === 'faulty') old.attachedTo = ''
      }
      Object.assign(a, {
        lifecycle: 'in-use', owner: s.recipient, attachedTo: host,
        location: user?.office ? `Стол ${user.office}` : a.location,
      })
      return
    }
    case 'to-vendor':
      if (warrantyActive(a, at)) {
        s.outcome = 'accepted'
        Object.assign(a, {
          lifecycle: 'rma', location: `Сервисный центр ${a.vendor}`, note: 'Принято вендором по гарантии',
        })
      } else {
        s.outcome = 'rejected'
        Object.assign(a, {
          lifecycle: 'in-stock', owner: '', location: 'Склад, возврат от вендора',
          note: 'Отклонено вендором: гарантия истекла',
        })
      }
      return
    case 'to-disposal':
      Object.assign(a, { lifecycle: 'retired', owner: '', attachedTo: '', location: 'Утилизирован' })
      return
    case 'to-warehouse':
      Object.assign(a, { lifecycle: 'in-stock', location: WAREHOUSE_INBOX })
  }
}
