import { describe, it, expect } from 'vitest'
import { field, continuation, joinLines, FIELD_LABEL, CRLF } from './format'

/**
 * Эталонные строки сняты с настоящего `ipconfig /all` на Windows 11.
 * Их нельзя «поправить под реализацию» — это они определяют реализацию.
 */
describe('метки полей', () => {
  it('каждая метка занимает ровно 34 символа', () => {
    for (const [key, label] of Object.entries(FIELD_LABEL)) {
      expect(label.length, `метка ${key}`).toBe(34)
    }
  })

  it('двоеточие всегда попадает на позицию 37', () => {
    for (const key of Object.keys(FIELD_LABEL) as Array<keyof typeof FIELD_LABEL>) {
      expect(field(key, 'x').indexOf(':'), `метка ${key}`).toBe(37)
    }
  })
})

describe('field — точное совпадение с Windows', () => {
  it('короткая метка добирается парами «пробел-точка»', () => {
    expect(field('description', 'Ethernet Adapter'))
      .toBe('   Description . . . . . . . . . . . : Ethernet Adapter')
  })

  it('Physical Address ставит точку сразу, без пробела', () => {
    expect(field('physicalAddress', 'A4-83-E7-2C-91-44'))
      .toBe('   Physical Address. . . . . . . . . : A4-83-E7-2C-91-44')
  })

  it('Connection-specific DNS Suffix оставляет два пробела и одну точку', () => {
    expect(field('dnsSuffix', 'corp.arcline.local'))
      .toBe('   Connection-specific DNS Suffix  . : corp.arcline.local')
  })

  it('DHCP Enabled — точка сразу', () => {
    expect(field('dhcpEnabled', 'Yes'))
      .toBe('   DHCP Enabled. . . . . . . . . . . : Yes')
  })

  it('Autoconfiguration Enabled — один пробел перед точкой', () => {
    expect(field('autoconfigEnabled', 'Yes'))
      .toBe('   Autoconfiguration Enabled . . . . : Yes')
  })

  it('IPv4 Address — точка сразу', () => {
    expect(field('ipv4', '10.20.14.88(Preferred)'))
      .toBe('   IPv4 Address. . . . . . . . . . . : 10.20.14.88(Preferred)')
  })

  it('Autoconfiguration IPv4 Address — две точки', () => {
    expect(field('autoconfigIpv4', '169.254.23.11(Preferred)'))
      .toBe('   Autoconfiguration IPv4 Address. . : 169.254.23.11(Preferred)')
  })

  it('Subnet Mask', () => {
    expect(field('subnetMask', '255.255.255.0'))
      .toBe('   Subnet Mask . . . . . . . . . . . : 255.255.255.0')
  })

  it('Default Gateway', () => {
    expect(field('defaultGateway', '10.20.14.1'))
      .toBe('   Default Gateway . . . . . . . . . : 10.20.14.1')
  })

  it('DNS Servers', () => {
    expect(field('dnsServers', '10.20.14.10'))
      .toBe('   DNS Servers . . . . . . . . . . . : 10.20.14.10')
  })

  it('Lease Obtained — точка сразу', () => {
    expect(field('leaseObtained', 'x'))
      .toBe('   Lease Obtained. . . . . . . . . . : x')
  })

  it('Lease Expires — пробел перед точкой', () => {
    expect(field('leaseExpires', 'x'))
      .toBe('   Lease Expires . . . . . . . . . . : x')
  })

  it('Media State', () => {
    expect(field('mediaState', 'Media disconnected'))
      .toBe('   Media State . . . . . . . . . . . : Media disconnected')
  })

  it('пустое значение оставляет висящий пробел после двоеточия', () => {
    expect(field('defaultGateway', ''))
      .toBe('   Default Gateway . . . . . . . . . : ')
  })
})

describe('continuation', () => {
  it('выравнивает второй адрес под первый', () => {
    const first = field('dnsServers', '10.20.14.10')
    const second = continuation('10.20.14.11')
    expect(second).toBe('                                       10.20.14.11')
    // значение во второй строке начинается там же, где в первой
    expect(second.indexOf('10.20.14.11')).toBe(first.indexOf('10.20.14.10'))
  })
})

describe('joinLines', () => {
  it('склеивает через CRLF, как настоящая консоль', () => {
    expect(joinLines(['a', 'b'])).toBe(`a${CRLF}b`)
  })
})
