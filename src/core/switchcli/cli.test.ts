import { describe, it, expect, beforeEach } from 'vitest'
import { newCli, promptOf, runSwitch, type CliState } from './cli'
import { setAccessVlan, setPortAdmin, saveConfig, findPort } from '../infra/switchops'
import { createWorld } from '../world/world'
import { createSession } from '../session/session'
import type { CommandContext } from '../terminal/types'

const clock = { now: () => new Date('2026-09-10T09:30:00.000Z') }
const INCIDENT = { number: 'INC0000001', device: 'AL-LPT-0447', requester: 'p.raman' }

let ctx: CommandContext

beforeEach(() => {
  ctx = { world: createWorld(), session: createSession(INCIDENT), clock, device: 'SW-FL3-01' }
})

/** Прогоняет строки подряд и отдаёт последний ответ и режим. */
function run(...lines: string[]): { stdout: string; exitCode: number; state: CliState } {
  let state = newCli(ctx.device)
  let last = { stdout: '', exitCode: 0 }
  for (const line of lines) {
    const r = runSwitch(line, state, ctx)
    state = r.state
    last = r
  }
  return { ...last, state }
}
const rows = (s: string) => s.split('\r\n')
const out = (...lines: string[]) => lines.join('\r\n')
const port = (name: string) => findPort(ctx.world, 'SW-FL3-01', name)!

describe('вывод show', () => {
  it('show interfaces status — все порты, состояние, VLAN', () => {
    port('Gi1/0/7').adminUp = false
    const r = rows(run('show interfaces status').stdout)
    expect(r.slice(0, 3)).toEqual([
      '',
      'Port         Name               Status       Vlan       Duplex  Speed Type',
      'Gi1/0/1      DESK-3-14          connected    20         a-full a-1000 10/100/1000BaseTX',
    ])
    expect(r).toContain('Gi1/0/7      DESK-2-14          disabled     20           auto   auto 10/100/1000BaseTX')
    expect(r).toContain('Gi1/0/10     DESK-3-10          notconnect   20           auto   auto 10/100/1000BaseTX')
    expect(r).toContain('Gi1/0/40     PRN-FL3-01         connected    40         a-full a-1000 10/100/1000BaseTX')
    expect(r).toContain('Gi1/0/48     UPLINK-CR-01       connected    trunk      a-full a-1000 10/100/1000BaseTX')
    expect(r.filter(l => l.startsWith('Gi1/0/'))).toHaveLength(48)
  })

  it('show vlan brief — VLAN и порты по четыре в строке', () => {
    const r = rows(run('show vlan brief').stdout)
    expect(r.slice(0, 7)).toEqual([
      '',
      'VLAN Name                             Status    Ports',
      '---- -------------------------------- --------- -------------------------------',
      '1    default                          active    ',
      '10   SERVERS                          active    ',
      '20   STAFF                            active    Gi1/0/1, Gi1/0/2, Gi1/0/3, Gi1/0/4',
      '                                                Gi1/0/5, Gi1/0/6, Gi1/0/7, Gi1/0/8',
    ])
    expect(r).toContain('40   PRINTERS                         active    Gi1/0/40')
  })

  it('show mac address-table — адрес машины на её порту, фильтр в любой записи MAC', () => {
    const table = (...entries: string[]) => out(
      '          Mac Address Table',
      '-------------------------------------------',
      '',
      'Vlan    Mac Address       Type        Ports',
      '----    -----------       --------    -----',
      ...entries,
      `Total Mac Addresses for this criterion: ${entries.length}`,
      '',
    )
    expect(run('show mac address-table address a483.e72c.9144').stdout)
      .toBe(table('  20    a483.e72c.9144    DYNAMIC     Gi1/0/1'))
    expect(run('show mac address-table address A4-83-E7-2C-91-44').stdout)
      .toBe(table('  20    a483.e72c.9144    DYNAMIC     Gi1/0/1'))
    expect(run('show mac address-table interface gi1/0/10').stdout).toBe(table())
    // Девять машин и принтер; незанятые розетки в таблице не видны.
    expect(rows(run('show mac address-table').stdout).filter(l => l.includes('DYNAMIC'))).toHaveLength(10)
  })

  it('show running-config interface — порт и интерфейс VLAN', () => {
    expect(run('enable', 'show running-config interface gi1/0/22').stdout).toBe(out(
      'Building configuration...',
      '',
      'Current configuration : 136 bytes',
      '!',
      'interface GigabitEthernet1/0/22',
      ' description DESK-3-22',
      ' switchport access vlan 20',
      ' switchport mode access',
      ' spanning-tree portfast',
      'end',
      '',
    ))

    ctx.device = 'CR-01'
    expect(run('enable', 'sh run int vlan 20').stdout).toBe(out(
      'Building configuration...',
      '',
      'Current configuration : 90 bytes',
      '!',
      'interface Vlan20',
      ' ip address 10.20.14.1 255.255.255.0',
      ' ip helper-address 10.20.10.5',
      'end',
      '',
    ))
  })

  it('show ip interface brief, show interfaces, show logging', () => {
    ctx.device = 'CR-01'
    const brief = rows(run('show ip interface brief').stdout)
    expect(brief.slice(0, 5)).toEqual([
      'Interface              IP-Address      OK? Method Status                Protocol',
      'Vlan10                 10.20.10.1      YES NVRAM  up                    up',
      'Vlan20                 10.20.14.1      YES NVRAM  up                    up',
      'Vlan40                 10.20.40.1      YES NVRAM  up                    up',
      'GigabitEthernet1/0/1   unassigned      YES unset  up                    up',
    ])
    expect(brief).toContain('GigabitEthernet1/0/9   unassigned      YES unset  down                  down')

    ctx.device = 'SW-FL3-01'
    port('Gi1/0/7').adminUp = false
    const detail = rows(run('show interfaces gi1/0/1').stdout)
    expect(detail[0]).toBe('GigabitEthernet1/0/1 is up, line protocol is up (connected)')
    expect(detail).toContain('  Description: DESK-3-14')
    expect(detail).toContain('  Full-duplex, 1000Mb/s, media type is 10/100/1000BaseTX')
    expect(rows(run('show interfaces gi1/0/7').stdout)[0])
      .toBe('GigabitEthernet1/0/7 is administratively down, line protocol is down (disabled)')

    expect(run('show logging').stdout.split('Log Buffer')[1]).toBe(out(
      ' (8192 bytes):',
      '',
      '*Sep  9 07:58:12.000: %LINK-3-UPDOWN: Interface GigabitEthernet1/0/5, changed state to up',
      '*Sep  9 08:31:40.000: %LINK-3-UPDOWN: Interface GigabitEthernet1/0/1, changed state to up',
      '',
    ))
  })
})

describe('консоль', () => {
  it('режимы и приглашение', () => {
    let s = newCli('SW-FL3-01')
    const prompts = [promptOf(s)]
    for (const line of ['enable', 'conf t', 'int gi1/0/1', 'exit', 'int gi1/0/1', 'end', 'disable']) {
      s = runSwitch(line, s, ctx).state
      prompts.push(promptOf(s))
    }
    expect(prompts).toEqual([
      'SW-FL3-01>', 'SW-FL3-01#', 'SW-FL3-01(config)#', 'SW-FL3-01(config-if)#',
      'SW-FL3-01(config)#', 'SW-FL3-01(config-if)#', 'SW-FL3-01#', 'SW-FL3-01>',
    ])
    expect(run('enable', 'conf t').stdout).toBe('Enter configuration commands, one per line.  End with CNTL/Z.')
  })

  /*
    Настоящая консоль понимает однозначные сокращения, и журнал пишет
    полную форму: цель сценария не должна зависеть от того, как техник
    сократил команду.
  */
  it('сокращения, неоднозначность и ошибки ввода', () => {
    expect(run('sh vl br').stdout).toBe(run('show vlan brief').stdout)
    expect(ctx.session.commands.slice(0, 2).map(c => [c.cmdline, c.canonical])).toEqual([
      ['sh vl br', 'show vlan brief'],
      ['show vlan brief', 'show vlan brief'],
    ])

    const before = structuredClone(ctx.world.network)
    expect(run('enable', 'conf t', 'int gi1/0/1', 's')).toMatchObject({
      exitCode: 1, stdout: '% Ambiguous command:  "s"',
    })
    expect(run('show vlna')).toEqual({
      exitCode: 1, state: expect.anything(),
      stdout: out(`${' '.repeat('SW-FL3-01>show '.length)}^`, "% Invalid input detected at '^' marker."),
    })
    expect(run('show').stdout).toBe('% Incomplete command.')
    expect(run('conf t').stdout).toContain("% Invalid input detected at '^' marker.")
    expect(ctx.world.network).toEqual(before)
  })

  /*
    Знак вопроса — главный способ разобраться в незнакомой консоли: он
    перечисляет, что можно ввести дальше, и возвращает набранное в
    строку ввода. Командой не считается и в журнал не пишется.
  */
  it('подсказка ?', () => {
    expect(runSwitch('show ip ?', newCli('SW-FL3-01'), ctx)).toMatchObject({
      exitCode: 0, prefill: 'show ip ',
      stdout: '  interface             IP interface status and configuration',
    })
    expect(runSwitch('show vlan ?', newCli('SW-FL3-01'), ctx).stdout)
      .toBe(out('  brief                 VTP all VLAN status in brief', '  <cr>'))
    expect(runSwitch('sh?', newCli('SW-FL3-01'), ctx)).toMatchObject({ stdout: 'show', prefill: 'sh' })
    expect(ctx.session.commands).toEqual([])
  })

  it('порт из тикета: VLAN, передёргивание, сохранение', () => {
    const adapter = ctx.world.devices['AL-LPT-0447']!.adapters[0]!
    run('enable', 'conf t', 'int gi1/0/1', 'sw acc vl 40', 'shut', 'no shut', 'end')
    expect(port('Gi1/0/1')).toMatchObject({ accessVlan: 40, adminUp: true, saved: { accessVlan: 20 } })
    expect(adapter.autoconfigured).toBe(true)

    expect(run('enable', 'wr').stdout).toBe(out('Building configuration...', '[OK]'))
    expect(port('Gi1/0/1').saved.accessVlan).toBe(40)
    expect(run('enable', 'copy running-config startup-config').stdout)
      .toBe(out('Destination filename [startup-config]? ', 'Building configuration...', '[OK]'))
  })

  /*
    Отказ шлюза печатается, как в IOS с проверкой полномочий на сервере
    доступа. Чужой порт, ретрансляция на ядре и что угодно без тикета.
  */
  it('вне области тикета — Command authorization failed., мир не меняется', () => {
    const before = structuredClone(ctx.world.network)
    expect(run('enable', 'conf t', 'int gi1/0/2', 'switchport access vlan 40'))
      .toMatchObject({ exitCode: 1, stdout: 'Command authorization failed.' })

    // Свой порт, но режим порта — проектное решение сети, а не первой линии.
    expect(run('enable', 'conf t', 'int gi1/0/1', 'switchport mode trunk').stdout)
      .toBe('Command authorization failed.')
    // Интерфейс VLAN на коммутаторе доступа создал бы новый маршрут в сети.
    expect(run('enable', 'conf t', 'int vlan 20').stdout).toBe('Command authorization failed.')

    ctx.device = 'CR-01'
    expect(run('enable', 'conf t', 'int vlan 20', 'ip helper-address 10.20.10.5').stdout)
      .toBe('Command authorization failed.')

    ctx.device = 'SW-FL3-01'
    ctx.session = createSession()
    expect(run('enable', 'conf t', 'int gi1/0/1', 'shutdown').stdout).toBe('Command authorization failed.')

    expect(ctx.world.network.switches.map(s => [s.ports, s.vlanInterfaces]))
      .toEqual(before.switches.map(s => [s.ports, s.vlanInterfaces]))
    expect(ctx.session.flags.dangerousActions).toHaveLength(1)
  })

  /**
   * Обязательный тест: консоль и кнопки серверной — представления одной
   * операции. Сравнивается всё, что видит оценка: мир и журнал изменений.
   */
  it('консоль и операции неотличимы', () => {
    const cases: Array<[string[], (c: CommandContext) => void]> = [
      [['enable', 'conf t', 'int gi1/0/1', 'switchport access vlan 40'],
        c => setAccessVlan(c.world, 'SW-FL3-01', 'Gi1/0/1', 40, c.session, clock)],
      [['enable', 'conf t', 'int gi1/0/1', 'shutdown'],
        c => setPortAdmin(c.world, 'SW-FL3-01', 'Gi1/0/1', false, c.session, clock)],
      [['enable', 'write memory'], c => saveConfig(c.world, 'SW-FL3-01', c.session, clock)],
    ]
    for (const [lines, op] of cases) {
      ctx = { world: createWorld(), session: createSession(INCIDENT), clock, device: 'SW-FL3-01' }
      run(...lines)
      const viaOp: CommandContext = { ...ctx, world: createWorld(), session: createSession(INCIDENT) }
      op(viaOp)
      expect(ctx.world.network, lines.at(-1)).toEqual(viaOp.world.network)
      expect(ctx.session.changes, lines.at(-1)).toEqual(viaOp.session.changes)
    }
  })
})
