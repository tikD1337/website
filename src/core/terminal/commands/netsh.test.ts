import { describe, it, expect, beforeEach } from 'vitest'
import { createRegistry } from '../registry'
import { netsh } from './netsh'
import { createWorld } from '../../world/world'
import { createSession } from '../../session/session'
import { setAddressStatic, setDnsStatic } from '../../device/adapter'
import type { CommandContext } from '../types'

const HOST = 'AL-LPT-0821'
const clock = { now: () => new Date('2026-10-02T09:00:00.000Z') }
const registry = createRegistry()
registry.register('netsh', netsh)

let ctx: CommandContext

beforeEach(() => {
  ctx = { world: createWorld(), session: createSession(), clock, device: HOST }
})

const run = (line: string) => registry.run(line, ctx)
const adapter = () => ctx.world.devices[HOST]!.adapters[0]!
const out = (...lines: string[]) => lines.map(l => l + '\r\n').join('')

/*
  Эталоны сняты с формата живой Windows: метки с пятой позиции,
  значения — с сорок третьей, продолжение списка DNS — под значением.
  Источник DNS виден только здесь: `ipconfig /all` его не показывает.
*/
describe('netsh interface ip — вывод', () => {
  it('show config — адаптер по DHCP и статический с ручным DNS', () => {
    expect(run('netsh interface ip show config')).toEqual({
      exitCode: 0,
      stdout: out(
        '',
        'Configuration for interface "Ethernet"',
        '    DHCP enabled:                         Yes',
        '    IP Address:                           10.20.14.94',
        '    Subnet Prefix:                        10.20.14.0/24 (mask 255.255.255.0)',
        '    Default Gateway:                      10.20.14.1',
        '    Gateway Metric:                       0',
        '    InterfaceMetric:                      25',
        '    DNS servers configured through DHCP:  10.20.14.10',
        '                                          10.20.14.11',
        '    Register with which suffix:           Primary only',
        '    WINS servers configured through DHCP: None',
      ),
    })

    setDnsStatic(ctx.world, HOST, ['10.20.14.10'], ctx.session, clock)
    setAddressStatic(ctx.world, HOST, '10.20.14.97', '255.255.255.0', '10.20.14.254', ctx.session, clock)
    expect(run('netsh interface ipv4 show config name="Ethernet"')).toEqual({
      exitCode: 0,
      stdout: out(
        '',
        'Configuration for interface "Ethernet"',
        '    DHCP enabled:                         No',
        '    IP Address:                           10.20.14.97',
        '    Subnet Prefix:                        10.20.14.0/24 (mask 255.255.255.0)',
        '    Default Gateway:                      10.20.14.254',
        '    Gateway Metric:                       0',
        '    InterfaceMetric:                      25',
        '    Statically Configured DNS Servers:    10.20.14.10',
        '    Register with which suffix:           Primary only',
        '    Statically Configured WINS Servers:   None',
      ),
    })
  })

  it('interface show interface — таблица интерфейсов, состояние — из линка', () => {
    const table = (state: string) => ({
      exitCode: 0,
      stdout: out(
        '',
        'Admin State    State          Type             Interface Name',
        '-'.repeat(73),
        `Enabled        ${state.padEnd(15)}Dedicated        Ethernet`,
        '',
      ),
    })
    expect(run('netsh interface show interface')).toEqual(table('Connected'))
    adapter().linkUp = false
    expect(run('netsh int show interface')).toEqual(table('Disconnected'))
  })

  it('show dns — источник и серверы; без DNS — None', () => {
    setDnsStatic(ctx.world, HOST, ['10.20.14.9'], ctx.session, clock)
    expect(run('netsh int ip show dns "Ethernet"')).toEqual({
      exitCode: 0,
      stdout: out(
        '',
        'Configuration for interface "Ethernet"',
        '    Statically Configured DNS Servers:    10.20.14.9',
        '    Register with which suffix:           Primary only',
      ),
    })
    setDnsStatic(ctx.world, HOST, [], ctx.session, clock)
    expect(run('netsh interface ipv4 show dnsservers').stdout)
      .toContain('    Statically Configured DNS Servers:    None\r\n')
  })
})

describe('netsh interface ip — настройка', () => {
  /*
    Одна команда в разных записях: контекст ip или ipv4, имя в кавычках
    или без, позиционно или через name=, dns или dnsservers. Запись,
    которую принимает Windows, а тренажёр нет, учила бы синтаксису
    тренажёра.
  */
  it('все формы записи дают одно состояние', () => {
    const forms: Array<[string, string, Partial<ReturnType<typeof adapter>>]> = [
      ['dns static позиционно', 'netsh interface ip set dns "Ethernet" static 8.8.8.8',
        { dnsSource: 'static', dns: ['8.8.8.8'] }],
      ['dnsservers через name= и source=', 'netsh int ipv4 set dnsservers name=Ethernet source=static address=8.8.8.8 register=primary',
        { dnsSource: 'static', dns: ['8.8.8.8'] }],
      ['dns dhcp позиционно', 'netsh interface ip set dns Ethernet dhcp',
        { dnsSource: 'dhcp', dns: ['10.20.14.10', '10.20.14.11'] }],
      ['dns source=dhcp', 'netsh interface ipv4 set dnsservers name="Ethernet" source=dhcp',
        { dnsSource: 'dhcp', dns: ['10.20.14.10', '10.20.14.11'] }],
      ['address static позиционно', 'netsh interface ip set address "Ethernet" static 10.20.14.97 255.255.255.0 10.20.14.1',
        { dhcpEnabled: false, ip: '10.20.14.97', mask: '255.255.255.0', gateway: '10.20.14.1' }],
      ['address static через имена', 'netsh int ipv4 set address name="Ethernet" source=static address=10.20.14.97 mask=255.255.255.0 gateway=10.20.14.1',
        { dhcpEnabled: false, ip: '10.20.14.97', mask: '255.255.255.0', gateway: '10.20.14.1' }],
      ['address dhcp позиционно', 'netsh interface ip set address Ethernet dhcp',
        { dhcpEnabled: true, ip: '10.20.14.94', gateway: '10.20.14.1' }],
    ]
    for (const [name, line, state] of forms) {
      ctx = { world: createWorld(), session: createSession(), clock, device: HOST }
      if (state.dnsSource === 'dhcp') setDnsStatic(ctx.world, HOST, ['10.20.14.9'], ctx.session, clock)
      if (state.dhcpEnabled === true) {
        setAddressStatic(ctx.world, HOST, '10.20.14.97', '255.255.255.0', '10.20.14.254', ctx.session, clock)
      }
      expect(run(line), name).toEqual({ exitCode: 0, stdout: '' })
      expect(adapter(), name).toMatchObject(state)
    }
  })

  it('отказы: чужое имя, DHCP уже включён, неполная команда — мир не тронут', () => {
    const before = structuredClone(adapter())
    const cases: Array<[string, string]> = [
      ['netsh interface ip set dns "Wi-Fi" dhcp', 'The filename, directory name, or volume label syntax is incorrect.\r\n'],
      ['netsh interface ip show config "Wi-Fi"', 'The filename, directory name, or volume label syntax is incorrect.\r\n'],
      ['netsh interface ip set address "Ethernet" dhcp', 'DHCP is already enabled on this interface.\r\n'],
      ['netsh interface ip set address "Ethernet" static 10.20.14.97',
        'The syntax supplied for this command is not valid. Check help for the correct syntax.\r\n'],
      ['netsh interface ip set dns "Ethernet" static',
        'The syntax supplied for this command is not valid. Check help for the correct syntax.\r\n'],
      ['netsh interface ip reset', 'The following command was not found: interface ip reset.'],
    ]
    for (const [line, stdout] of cases) expect(run(line), line).toEqual({ exitCode: 1, stdout })
    expect(adapter()).toEqual(before)
    expect(ctx.session.changes).toEqual([])
  })
})
