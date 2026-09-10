/**
 * Форматирование вывода консоли Windows.
 *
 * Достоверность вывода — часть тренировки: техник учится читать то,
 * что реально увидит на работе. Поэтому метки полей взяты дословно с
 * настоящего `ipconfig /all`, а не вычисляются.
 *
 * Формулы для них не существует. Windows держит эти строки в ресурсах,
 * и выравнивание не выводится из длины метки: `IP Routing Enabled.` и
 * `Primary Dns Suffix  .` имеют одинаковую длину, но разный заполнитель.
 * Единственный честный способ — таблица. Набор полей конечен, так что
 * это не костыль, а точность.
 *
 * Инвариант, проверяемый тестом: метка занимает 34 символа, двоеточие
 * всегда попадает на позицию 37.
 */

export const CRLF = '\r\n'

const INDENT = '   '
const LABEL_WIDTH = 34

/** Метки полей `ipconfig /all`, дословно. Длина каждой — 34 символа. */
export const FIELD_LABEL = {
  hostName: 'Host Name . . . . . . . . . . . . ',
  primaryDnsSuffix: 'Primary Dns Suffix  . . . . . . . ',
  nodeType: 'Node Type . . . . . . . . . . . . ',
  ipRouting: 'IP Routing Enabled. . . . . . . . ',
  winsProxy: 'WINS Proxy Enabled. . . . . . . . ',

  dnsSuffix: 'Connection-specific DNS Suffix  . ',
  description: 'Description . . . . . . . . . . . ',
  physicalAddress: 'Physical Address. . . . . . . . . ',
  dhcpEnabled: 'DHCP Enabled. . . . . . . . . . . ',
  autoconfigEnabled: 'Autoconfiguration Enabled . . . . ',

  ipv4: 'IPv4 Address. . . . . . . . . . . ',
  autoconfigIpv4: 'Autoconfiguration IPv4 Address. . ',
  subnetMask: 'Subnet Mask . . . . . . . . . . . ',
  leaseObtained: 'Lease Obtained. . . . . . . . . . ',
  leaseExpires: 'Lease Expires . . . . . . . . . . ',
  defaultGateway: 'Default Gateway . . . . . . . . . ',
  dhcpServer: 'DHCP Server . . . . . . . . . . . ',
  dnsServers: 'DNS Servers . . . . . . . . . . . ',
  netbios: 'NetBIOS over Tcpip. . . . . . . . ',
  mediaState: 'Media State . . . . . . . . . . . ',
} as const

export type FieldKey = keyof typeof FIELD_LABEL

/**
 * Строка поля: отступ, метка с заполнителем, двоеточие, значение.
 *
 * Пустое значение оставляет висящий пробел после двоеточия — именно
 * так Windows печатает отсутствующий шлюз, и именно этот вид техник
 * должен научиться распознавать.
 */
export function field(key: FieldKey, value: string): string {
  const label = FIELD_LABEL[key]
  if (label.length !== LABEL_WIDTH) {
    throw new Error(`метка ${key} должна занимать ${LABEL_WIDTH} символов`)
  }
  return `${INDENT}${label}: ${value}`
}

/** Вторая и последующие строки многозначного поля — например второй DNS. */
export function continuation(value: string): string {
  return ' '.repeat(INDENT.length + LABEL_WIDTH + 2) + value
}

export function joinLines(lines: string[]): string {
  return lines.join(CRLF)
}
