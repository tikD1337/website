import type { Asset, AssetKind, Lifecycle } from './types'

/** Вид актива словами — для карточек, форм и ошибок учёта. */
export const KIND_LABEL: Record<AssetKind, string> = {
  laptop: 'ноутбук',
  desktop: 'компьютер',
  dock: 'док-станция',
  monitor: 'монитор',
  headset: 'гарнитура',
  phone: 'телефон',
  'cable-kit': 'комплект кабелей',
  switch: 'коммутатор',
  router: 'маршрутизатор',
  server: 'сервер',
  printer: 'принтер',
}

/** Состояние учёта словами. */
export const LIFECYCLE_LABEL: Record<Lifecycle, string> = {
  'in-use': 'в работе',
  'in-stock': 'на складе',
  'in-transit': 'в пути',
  rma: 'у вендора',
  retired: 'списан',
}

/** Действует ли гарантия в этот момент: до даты окончания, не включая её. */
export function warrantyActive(asset: Asset, now: Date): boolean {
  return now.getTime() < new Date(asset.warrantyUntil).getTime()
}
