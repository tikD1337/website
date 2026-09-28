import { describe, it, expect } from 'vitest'
import { field, continuation, FIELD_LABEL } from './format'

/**
 * Эталонные строки сняты с настоящего `ipconfig /all` на Windows 11.
 * Их нельзя «поправить под реализацию» — это они определяют реализацию:
 * формулы для точек не существует, у каждой метки свой рисунок.
 */
describe('метки полей ipconfig', () => {
  it('совпадают с Windows построчно, двоеточие на позиции 37', () => {
    const expected: Record<keyof typeof FIELD_LABEL, string> = {
      hostName: '   Host Name . . . . . . . . . . . . : x',
      primaryDnsSuffix: '   Primary Dns Suffix  . . . . . . . : x',
      nodeType: '   Node Type . . . . . . . . . . . . : x',
      ipRouting: '   IP Routing Enabled. . . . . . . . : x',
      winsProxy: '   WINS Proxy Enabled. . . . . . . . : x',
      dnsSuffix: '   Connection-specific DNS Suffix  . : x',
      description: '   Description . . . . . . . . . . . : x',
      physicalAddress: '   Physical Address. . . . . . . . . : x',
      dhcpEnabled: '   DHCP Enabled. . . . . . . . . . . : x',
      autoconfigEnabled: '   Autoconfiguration Enabled . . . . : x',
      ipv4: '   IPv4 Address. . . . . . . . . . . : x',
      autoconfigIpv4: '   Autoconfiguration IPv4 Address. . : x',
      subnetMask: '   Subnet Mask . . . . . . . . . . . : x',
      leaseObtained: '   Lease Obtained. . . . . . . . . . : x',
      leaseExpires: '   Lease Expires . . . . . . . . . . : x',
      defaultGateway: '   Default Gateway . . . . . . . . . : x',
      dhcpServer: '   DHCP Server . . . . . . . . . . . : x',
      dnsServers: '   DNS Servers . . . . . . . . . . . : x',
      netbios: '   NetBIOS over Tcpip. . . . . . . . : x',
      mediaState: '   Media State . . . . . . . . . . . : x',
    }
    for (const key of Object.keys(FIELD_LABEL) as Array<keyof typeof FIELD_LABEL>) {
      expect(field(key, 'x'), key).toBe(expected[key])
    }
    // Пустое значение оставляет висящий пробел; продолжение — под значением.
    expect(field('defaultGateway', '')).toBe('   Default Gateway . . . . . . . . . : ')
    expect(continuation('10.20.14.11')).toBe(' '.repeat(39) + '10.20.14.11')
  })
})
