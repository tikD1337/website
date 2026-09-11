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

export type ServiceStatus = 'running' | 'stopped' | 'paused'
export type ServiceStartType = 'auto' | 'manual' | 'disabled'

export interface Service {
  /** короткое имя, как в sc: 'Spooler' */
  name: string
  /** отображаемое имя: 'Print Spooler' */
  displayName: string
  status: ServiceStatus
  startType: ServiceStartType
  /**
   * Защитная служба. Останов отклоняется шлюзом полномочий — по тому же
   * правилу, по которому нельзя отключить фаервол. Флаг живёт здесь, а
   * не в политике, потому что это свойство службы, а не решения.
   */
  protected: boolean
  /** имена служб, без которых эта не запустится */
  dependsOn: string[]
}

export type EventLevel = 'information' | 'warning' | 'error' | 'critical'
export type EventLogName = 'System' | 'Application' | 'Security'

export interface EventEntry {
  at: string
  log: EventLogName
  level: EventLevel
  source: string
  eventId: number
  message: string
}

export interface DeviceProcess {
  pid: number
  name: string
  /** процент загрузки процессора */
  cpu: number
  memMb: number
}

export interface Driver {
  device: string
  provider: string
  version: string
  status: 'ok' | 'problem'
  /** код проблемы диспетчера устройств; null у исправного */
  problemCode: number | null
  problemText: string | null
}

export interface Disk {
  letter: string
  label: string
  totalGb: number
  freeGb: number
  health: 'healthy' | 'warning' | 'failing'
}

export interface Device {
  hostname: string
  assetTag: string
  vendor: string
  model: string
  /** samAccountName владельца */
  assignedTo: string
  adapters: Adapter[]
  services: Service[]
  processes: DeviceProcess[]
  /** отсортирован по времени, старые записи первыми */
  eventLog: EventEntry[]
  drivers: Driver[]
  disks: Disk[]
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

export interface OrganizationalUnit {
  /** различающееся имя: 'OU=Sales,OU=Employees,OU=Corp' */
  path: string
  name: string
  /** путь родителя; null у корня */
  parent: string | null
}

export interface DirectoryGroup {
  name: string
  displayName: string
  ou: string
  description: string
  /** samAccountName участников */
  members: string[]
  /** пути общих ресурсов, к которым группа даёт доступ */
  grantsAccessTo: string[]
  /**
   * Привилегированная группа. Добавление в неё отклоняется шлюзом:
   * первая линия не выдаёт административных прав.
   */
  protected: boolean
}

export interface FileShare {
  path: string
  description: string
  /** имя группы, членство в которой открывает доступ */
  requiresGroup: string
}

export interface OrgUser {
  samAccountName: string
  displayName: string
  dept: string
  title: string
  email: string
  phone: string
  primaryDevice: string
  /** путь OU, в которой лежит учётная запись */
  ou: string
  /** руководитель — контрольное поле для сверки личности */
  manager: string
  /** кабинет — второе контрольное поле */
  office: string
  enabled: boolean
  lockedOut: boolean
  /**
   * Что именно блокирует учётную запись.
   *
   * Заполнено, когда блокировки повторяются: устройство с устаревшими
   * учётными данными. Разблокировка без устранения источника вернёт
   * проблему через несколько минут — это и есть тихая поломка.
   */
  lockoutSource: string | null
  pwdExpired: boolean
  pwdLastSet: string
  /**
   * Последний успешный вход.
   *
   * Отдельно от смены пароля: по этому полю техник отличает «не может
   * войти со вчера» от «не входил с отпуска», и в сценарии с
   * блокировкой это первое, что нужно посмотреть.
   */
  lastLogon: string
  badPwdCount: number
  /** имена групп; согласовано с DirectoryGroup.members */
  groups: string[]
}

export interface WorldState {
  org: {
    /** различающееся имя домена: 'DC=arcline,DC=corp' */
    domain: string
    ous: OrganizationalUnit[]
    groups: DirectoryGroup[]
    users: OrgUser[]
    shares: FileShare[]
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
