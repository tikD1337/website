import type { AssetKind, ShipmentDirection, ShipmentType } from '../world/types'

/**
 * Типы отправлений и их этапы.
 *
 * Восемь типов — как в оригинале. Этапы с длительностями задают, когда
 * наступает каждый: момент считается от оформления, поэтому таблица —
 * единственное место, где живёт «сколько едет курьер».
 */

export const SHIPMENT_TYPES: Record<ShipmentType, {
  label: string
  direction: ShipmentDirection
  kinds: AssetKind[]
}> = {
  'headset-to-desk': { label: 'Гарнитура на стол', direction: 'to-desk', kinds: ['headset'] },
  'phone-rma': { label: 'RMA телефона', direction: 'to-vendor', kinds: ['phone'] },
  'cable-kit': { label: 'Комплект кабелей', direction: 'to-desk', kinds: ['cable-kit'] },
  'dock-monitor-swap': { label: 'Замена дока или монитора', direction: 'to-desk', kinds: ['dock', 'monitor'] },
  'vendor-rma': {
    label: 'RMA вендору', direction: 'to-vendor',
    kinds: ['dock', 'monitor', 'headset', 'laptop', 'desktop', 'cable-kit'],
  },
  inbound: {
    label: 'Входящее оборудование', direction: 'to-warehouse',
    kinds: ['laptop', 'desktop', 'dock', 'monitor', 'headset', 'phone', 'cable-kit'],
  },
  loaner: { label: 'Подменный фонд', direction: 'to-desk', kinds: ['laptop'] },
  disposal: {
    label: 'Утилизация', direction: 'to-disposal',
    kinds: ['dock', 'monitor', 'headset', 'phone', 'laptop', 'desktop', 'cable-kit'],
  },
}

/** Этапы направления; `after` — секунд от предыдущего этапа. */
export const STAGES: Record<ShipmentDirection, Array<{ label: string; after: number }>> = {
  'to-desk': [
    { label: 'Оформлено', after: 0 },
    { label: 'Собирается на складе', after: 15 },
    { label: 'У курьера', after: 30 },
    { label: 'Доставлено', after: 45 },
  ],
  'to-vendor': [
    { label: 'Оформлено', after: 0 },
    { label: 'Передано курьеру', after: 20 },
    { label: 'У вендора', after: 60 },
    { label: 'Решение вендора', after: 60 },
  ],
  'to-disposal': [
    { label: 'Оформлено', after: 0 },
    { label: 'Вывезено', after: 30 },
    { label: 'Утилизировано', after: 60 },
  ],
  'to-warehouse': [
    { label: 'В пути', after: 0 },
    { label: 'Принято складом', after: 120 },
  ],
}

/** Номер отслеживания курьера — выводится из номера отправления, без случайности. */
export function trackingFor(n: number): string {
  return `HX-${n}-${String((n * 7919) % 100000).padStart(5, '0')}`
}

export const WAREHOUSE_INBOX = 'Склад, стеллаж A1'
export const DISPOSAL_POINT = 'Пункт утилизации'
