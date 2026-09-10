/**
 * Типы состояния мира.
 *
 * `WorldState` — единственный источник истины. Терминал, окна удалёнки,
 * консоль каталога и телефон читают и пишут именно его; собственного
 * состояния не хранит никто. Отсюда бесплатно получается связность:
 * починка в терминале немедленно видна во всех остальных инструментах.
 */

/** Часы инжектируются, чтобы ядро оставалось детерминированным в тестах. */
export interface Clock {
  now(): Date
}

export interface Adapter {
  /** имя, как его показывает ipconfig: 'Ethernet', 'Wi-Fi' */
  name: string
  /** строка Description в ipconfig /all */
  description: string
  mac: string
  dhcpEnabled: boolean
  autoconfigEnabled: boolean
  /**
   * true, когда адрес самоназначен (169.254.x.x). Именно этот флаг
   * переключает вывод ipconfig между `IPv4 Address` и
   * `Autoconfiguration IPv4 Address` и блокирует renew без release.
   */
  autoconfigured: boolean
  ip: string
  mask: string
  /** пустая строка — шлюза нет */
  gateway: string
  dns: string[]
  /** ISO-строка либо null, когда аренды нет */
  leaseObtained: string | null
  leaseExpires: string | null
  /** физический линк; false — «Media disconnected» */
  linkUp: boolean
  /** vlan сегмента, к которому подключён адаптер */
  segment: string
}

export interface Device {
  hostname: string
  assetTag: string
  vendor: string
  model: string
  /** samAccountName владельца */
  assignedTo: string
  adapters: Adapter[]
}

export interface NetworkSegment {
  vlan: string
  subnet: string
  gateway: string
  dhcpServer: string
  /** false — DHCP на этом сегменте не отвечает */
  dhcpHealthy: boolean
  /** адреса, которые сервер выдаёт по порядку */
  leasePool: string[]
  dns: string[]
}

export interface DnsServer {
  ip: string
  reachable: boolean
  /** имя в нижнем регистре -> адрес */
  zones: Record<string, string>
}

export interface OrgUser {
  samAccountName: string
  displayName: string
  dept: string
  title: string
  email: string
  phone: string
  primaryDevice: string
}

export interface WorldState {
  org: {
    users: OrgUser[]
  }
  /** ключ — имя хоста */
  devices: Record<string, Device>
  network: {
    segments: NetworkSegment[]
    dnsServers: DnsServer[]
    /** публичные адреса, отвечающие на ping при рабочем маршруте */
    publicHosts: string[]
  }
}
