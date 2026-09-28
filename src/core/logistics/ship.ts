import { SHIPMENT_TYPES, STAGES, trackingFor, DISPOSAL_POINT, WAREHOUSE_INBOX } from './types'
import { authorize } from '../policy/authorize'
import { KIND_LABEL, LIFECYCLE_LABEL, warrantyActive } from '../world/assets'
import { recordChange, addDangerousAction } from '../session/session'
import type { Clock, ShipmentType, WorldState } from '../world/types'
import type { SessionLog } from '../session/types'

/**
 * Оформление отправления.
 *
 * Единственная операция, которая отправляет оборудование, и её зовёт
 * кнопка «Логистики». Порядок проверок намеренный: сначала учёт — есть
 * ли актив, того ли вида, в том ли он состоянии, — и только потом шлюз.
 * Ошибка учёта — невозможность, а не нарушение, и опасным действием не
 * пишется: двойной клик по «Оформить» не должен стоить вердикта.
 */

export interface ShipmentInput {
  type: ShipmentType
  assetTag: string
  /** получатель отправки на стол; по умолчанию — заявитель тикета */
  recipient?: string
}

export type ShipResult =
  | { ok: true; id: string; flagged: boolean }
  | { ok: false; error: string; denied?: boolean }

export function createShipment(
  world: WorldState, input: ShipmentInput, session: SessionLog, clock: Clock,
): ShipResult {
  const kind = SHIPMENT_TYPES[input.type]
  const asset = world.cmdb.find(a => a.tag === input.assetTag)
  if (!asset) return { ok: false, error: `актив ${input.assetTag} не найден` }
  if (!kind.kinds.includes(asset.kind)) {
    return { ok: false, error: `«${kind.label}» не подходит для вида «${KIND_LABEL[asset.kind]}»` }
  }
  if (kind.direction === 'to-desk' && asset.lifecycle !== 'in-stock') {
    return { ok: false, error: `актив ${asset.tag} не на складе` }
  }
  if ((kind.direction === 'to-vendor' || kind.direction === 'to-disposal')
    && ['in-transit', 'rma', 'retired'].includes(asset.lifecycle)) {
    return { ok: false, error: `актив ${asset.tag} уже ${LIFECYCLE_LABEL[asset.lifecycle]}` }
  }

  const recipient = kind.direction === 'to-desk' ? input.recipient ?? session.incident?.requester ?? '' : ''

  const now = clock.now()
  const action = `отправка «${kind.label}»: ${asset.tag}`
  const d = authorize({
    kind: 'shipment', target: asset.tag, description: action,
    shipment: {
      direction: kind.direction, recipient, owner: asset.owner, attachedTo: asset.attachedTo,
      warrantyActive: warrantyActive(asset, now),
    },
  }, world, session)
  if (d.decision !== 'allow') addDangerousAction(session, clock, action, d.reason)
  if (d.decision === 'deny') return { ok: false, error: `отказано: ${d.reason}`, denied: true }
  const flagged = d.decision === 'flag'

  // Шлюз пропускает отправку на стол только заявителю, а он в каталоге есть.
  const user = world.org.users.find(u => u.samAccountName === recipient)
  if (kind.direction === 'to-desk' && !user) return { ok: false, error: `получатель ${recipient} не найден` }

  const destination = kind.direction === 'to-desk' ? `Стол ${user!.office} (${user!.displayName})`
    : kind.direction === 'to-vendor' ? `${asset.vendor} — сервисный центр`
      : kind.direction === 'to-disposal' ? DISPOSAL_POINT : WAREHOUSE_INBOX

  const n = 1 + Math.max(0, ...world.shipments.map(s => Number(s.id.replace(/\D/g, ''))))
  const id = `SHP-${n}`
  const at = now.toISOString()
  world.shipments.push({
    id, type: input.type, direction: kind.direction, assetTag: asset.tag,
    ticket: session.incident?.number ?? '', recipient, destination, createdAt: at, stage: 0,
    history: [{ stage: STAGES[kind.direction][0]!.label, at }], tracking: trackingFor(n), outcome: '',
  })

  // Курьер забирает возвращаемое сразу; то, что едет на стол, уходит со склада.
  asset.lifecycle = 'in-transit'
  asset.location = `В пути: ${destination}`
  if (kind.direction !== 'to-desk') asset.attachedTo = ''

  recordChange(session, clock, `shipments[id=${id}]`, null, `${kind.label} ${asset.tag} → ${destination}`, !flagged)
  return { ok: true, id, flagged }
}
