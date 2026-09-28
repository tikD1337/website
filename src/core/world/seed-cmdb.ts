import { BRAND } from '../../brand'
import type { Asset, AssetKind, Device, OrgUser, WorldState } from './types'

/**
 * Учёт оборудования Arcline.
 *
 * Всё, что стоит на столах и в серверной, плюс склад. Даты покупки и
 * гарантии — литералы: на них держатся решения сценариев («на гарантии —
 * вендору, нет — в утилизацию»), и вычислять их из «сегодня» значило бы
 * менять правильный ответ от даты запуска.
 */

const PERIPHERAL = BRAND.vendors.peripheral[0]
const PHONE = BRAND.vendors.phone[0]
const STOCK = 'Склад, стеллаж B2'
const LOANER = 'Склад, подменный фонд'

/** 'Halyard', 'AL-P2031' → 'HA2031K7' */
const serialOf = (vendor: string, tag: string) =>
  `${vendor.slice(0, 2).toUpperCase()}${tag.replace(/\D/g, '')}K7`

const plus3 = (iso: string) => `${Number(iso.slice(0, 4)) + 3}${iso.slice(4)}`

function asset(
  tag: string, kind: AssetKind, vendor: string, model: string,
  rest: Partial<Asset> & Pick<Asset, 'purchased' | 'warrantyUntil' | 'location'>,
): Asset {
  return {
    tag, kind, vendor, model, serial: serialOf(vendor, tag),
    owner: '', lifecycle: 'in-use', hostname: '', attachedTo: '', condition: 'ok', note: '',
    ...rest,
  }
}

/** Когда куплены машины мира. */
const PURCHASED: Record<string, string> = {
  'AL-LPT-0447': '2024-02-12',
  'AL-LPT-0512': '2024-05-20',
  'AL-LPT-0601': '2023-11-06',
  'AL-LPT-0714': '2026-09-01',
  'AL-DSK-0192': '2023-02-01',
  'AL-LPT-0788': '2025-01-15',
}

const DOCKS: Record<string, string> = {
  'AL-LPT-0447': 'AL-P2030',
  'AL-LPT-0512': 'AL-P2031',
  'AL-LPT-0601': 'AL-P2032',
  'AL-LPT-0714': 'AL-P2033',
  'AL-LPT-0788': 'AL-P2034',
}

const MONITORS: Array<[string, string]> = [
  ['AL-LPT-0447', 'AL-P2101'], ['AL-LPT-0512', 'AL-P2102'], ['AL-LPT-0601', 'AL-P2103'],
  ['AL-LPT-0714', 'AL-P2104'], ['AL-DSK-0192', 'AL-P2105'], ['AL-LPT-0788', 'AL-P2106'],
]

export function seedCmdb(
  devices: Record<string, Device>, network: Pick<WorldState['network'], 'switches' | 'routers' | 'servers' | 'printers'>,
  users: OrgUser[],
): Asset[] {
  const desk = (sam: string) => {
    const office = users.find(u => u.samAccountName === sam)?.office
    return office ? `Стол ${office}` : 'Склад, стеллаж B2'
  }
  const onDesk = (host: string) => {
    const owner = devices[host]!.assignedTo
    return { owner, location: desk(owner), attachedTo: host }
  }

  const computers = Object.values(devices).map(d => asset(
    d.assetTag, d.hostname.startsWith('AL-DSK') ? 'desktop' : 'laptop', d.vendor, d.model, {
      owner: d.assignedTo, location: desk(d.assignedTo), hostname: d.hostname,
      purchased: PURCHASED[d.hostname]!, warrantyUntil: plus3(PURCHASED[d.hostname]!),
    }))

  const docks = Object.entries(DOCKS).map(([host, tag]) => asset(
    tag, 'dock', PERIPHERAL, 'D6000 USB-C Dock',
    { ...onDesk(host), purchased: '2025-03-10', warrantyUntil: '2027-03-10' }))

  const monitors = MONITORS.map(([host, tag]) => asset(
    tag, 'monitor', PERIPHERAL, 'M27Q',
    { ...onDesk(host), purchased: '2024-06-01', warrantyUntil: '2027-06-01' }))

  const headsets = [
    asset('AL-P3017', 'headset', PERIPHERAL, 'H340 USB Headset',
      { ...onDesk('AL-DSK-0192'), purchased: '2023-02-01', warrantyUntil: '2025-02-01' }),
    asset('AL-P3018', 'headset', PERIPHERAL, 'H340 USB Headset',
      { ...onDesk('AL-LPT-0447'), purchased: '2025-09-01', warrantyUntil: '2027-09-01' }),
  ]

  const phones = (['d.mbeki', 'e.varga', 'p.raman'] as const).map((sam, i) => asset(
    `AL-M400${i + 1}`, 'phone', PHONE, 'Note 12',
    { owner: sam, location: desk(sam), purchased: '2025-01-15', warrantyUntil: '2027-01-15' }))

  const stocked = { lifecycle: 'in-stock' as const, purchased: '2026-06-01', warrantyUntil: '2028-06-01' }
  const stock = [
    asset('AL-P2040', 'dock', PERIPHERAL, 'D6000 USB-C Dock', { ...stocked, location: STOCK }),
    asset('AL-P2041', 'dock', PERIPHERAL, 'D6000 USB-C Dock', { ...stocked, location: STOCK }),
    asset('AL-P2110', 'monitor', PERIPHERAL, 'M27Q', { ...stocked, location: STOCK }),
    asset('AL-P3030', 'headset', PERIPHERAL, 'H340 USB Headset', { ...stocked, location: STOCK }),
    asset('AL-P3031', 'headset', PERIPHERAL, 'H340 USB Headset', { ...stocked, location: STOCK }),
    asset('AL-P3032', 'headset', PERIPHERAL, 'H340 USB Headset', { ...stocked, location: STOCK }),
    asset('AL-P5001', 'cable-kit', PERIPHERAL, 'Комплект кабелей USB-C/HDMI', { ...stocked, location: STOCK }),
    asset('AL-L9001', 'laptop', 'Kestrel', 'Meridian 5450', { ...stocked, location: LOANER }),
    asset('AL-L9002', 'laptop', 'Kestrel', 'Meridian 5450', { ...stocked, location: LOANER }),
    asset('AL-L9003', 'laptop', 'Kestrel', 'Meridian 5450', { ...stocked, location: LOANER }),
  ]

  const retired = [
    asset('AL-L0301', 'laptop', 'Torvald', 'WorkLine T14 Gen 2', {
      lifecycle: 'retired', location: 'Утилизирован', purchased: '2021-03-01', warrantyUntil: '2024-03-01',
    }),
  ]

  const room = { purchased: '2024-01-10', warrantyUntil: '2029-01-10' }
  const serverRoom = [
    ...network.switches.map((sw, i) => asset(`AL-N010${i + 1}`, 'switch', sw.vendor, sw.model,
      { ...room, hostname: sw.hostname, location: sw.location })),
    ...network.routers.map(r => asset('AL-N0103', 'router', r.vendor, r.model,
      { ...room, hostname: r.hostname, location: r.location })),
    ...network.printers.map(p => asset('AL-N0110', 'printer', p.vendor, p.model,
      { ...room, hostname: p.hostname, location: p.location })),
    ...network.servers.map((s, i) => asset(`AL-S020${i + 1}`, 'server', 'Kestrel', 'PowerLine R650',
      { ...room, hostname: s.hostname, location: s.location })),
  ]

  return [...computers, ...docks, ...monitors, ...headsets, ...phones, ...stock, ...retired, ...serverRoom]
}
