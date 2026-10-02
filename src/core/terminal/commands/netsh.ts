import { authorize } from '../../policy/authorize'
import { addDangerousAction } from '../../session/session'
import { setDnsDhcp, setDnsStatic, setAddressDhcp, setAddressStatic } from '../../device/adapter'
import { joinLines } from '../format'
import { linkOf } from '../../network/link'
import type { Adapter } from '../../world/types'
import type { CommandHandler, CommandContext, CommandResult } from '../types'

/**
 * netsh — контекст advfirewall, где живёт запрет на отключение защиты,
 * и `interface ip` (он же `ipv4`): конфигурация адаптера, источник DNS
 * и адреса. Источник DNS виден только здесь — `ipconfig /all` его не
 * показывает, и в этом диагностика сценария со списанным DNS.
 *
 * Команда намеренно принимает синтаксис отключения и отвечает
 * `Access is denied.` — как настоящая машина под управлением домена.
 * Отказ фиксируется как опасное действие: это событие для оценки,
 * а не безобидный тупик.
 */
export const netsh: CommandHandler = (args, ctx) => {
  const lower = args.map(a => a.toLowerCase())
  const [context, ...rest] = lower

  if (context === 'advfirewall') {
    const turningOff = rest.includes('state') && rest.includes('off')

    if (turningOff) {
      const r = authorize(
        {
          kind: 'disable-security',
          target: 'firewall',
          description: 'отключение фаервола',
        },
        ctx.world,
        ctx.session,
      )

      if (r.decision === 'deny') {
        addDangerousAction(
          ctx.session,
          ctx.clock,
          ['netsh', ...args].join(' '),
          r.reason,
        )
        return { stdout: 'Access is denied.', exitCode: 1 }
      }
    }

    return { stdout: 'Ok.', exitCode: 0 }
  }

  if (context === 'interface' || context === 'int') {
    if (rest[0] === 'show' && rest[1] === 'interface') return showInterfaces(ctx)
    if (rest[0] === 'ip' || rest[0] === 'ipv4') return interfaceIp(args.slice(2), ctx) ?? notFound(args)
  }

  return notFound(args)
}

const notFound = (args: string[]): CommandResult => ({
  stdout: `The following command was not found: ${args.join(' ')}.`,
  exitCode: 1,
})
const fail = (line: string): CommandResult => ({ stdout: joinLines([line, '']), exitCode: 1 })
const BAD_NAME = fail('The filename, directory name, or volume label syntax is incorrect.')
const BAD_SYNTAX = fail('The syntax supplied for this command is not valid. Check help for the correct syntax.')
const done = (canonical: string): CommandResult => ({ stdout: '', exitCode: 0, canonical })

/** Параметры по позиции и по имени (`name=`, `source=`, `address=`); имя сильнее позиции. */
function params(args: string[], order: string[]): Record<string, string> {
  const alias: Record<string, string> = { interface: 'name', addr: 'address' }
  const named: Record<string, string> = {}
  const positional: string[] = []
  for (const a of args) {
    const eq = a.indexOf('=')
    if (eq > 0) named[alias[a.slice(0, eq).toLowerCase()] ?? a.slice(0, eq).toLowerCase()] = a.slice(eq + 1)
    else positional.push(a)
  }
  const out: Record<string, string> = {}
  order.forEach((key, i) => { if (positional[i] !== undefined) out[key] = positional[i]! })
  return { ...out, ...named }
}

const isIp = (x: string | undefined) => /^(\d{1,3})(\.\d{1,3}){3}$/.test(x ?? '')

/** `interface ip …`; undefined — такой команды нет. */
function interfaceIp(args: string[], ctx: CommandContext): CommandResult | undefined {
  const [verb, object, ...rest] = args.map((a, i) => (i < 2 ? a.toLowerCase() : a))
  const a = ctx.world.devices[ctx.device]?.adapters[0]
  if (!a || !verb || !object) return undefined
  const { world, session, clock, device } = ctx

  if (verb === 'show' && ['config', 'dns', 'dnsservers'].includes(object)) {
    const p = params(rest, ['name'])
    if (p.name !== undefined && p.name.toLowerCase() !== a.name.toLowerCase()) return BAD_NAME
    const full = object === 'config'
    return { stdout: showConfig(a, full), exitCode: 0, canonical: `netsh interface ip show ${full ? 'config' : 'dns'}` }
  }
  if (verb !== 'set' || !['dns', 'dnsservers', 'address'].includes(object)) return undefined

  const p = object === 'address'
    ? params(rest, ['name', 'source', 'address', 'mask', 'gateway', 'gwmetric'])
    : params(rest, ['name', 'source', 'address', 'register'])
  if (p.name === undefined) return BAD_SYNTAX
  if (p.name.toLowerCase() !== a.name.toLowerCase()) return BAD_NAME
  const source = p.source?.toLowerCase()
  const head = `netsh interface ip set ${object === 'address' ? 'address' : 'dns'} "${a.name}"`

  if (object !== 'address') {
    if (source === 'dhcp') {
      if (a.dnsSource !== 'dhcp') setDnsDhcp(world, device, session, clock)
      return done(`${head} dhcp`)
    }
    if (source !== 'static') return BAD_SYNTAX
    const none = p.address?.toLowerCase() === 'none'
    if (!none && !isIp(p.address)) return BAD_SYNTAX
    setDnsStatic(world, device, none ? [] : [p.address!], session, clock)
    return done(`${head} static ${none ? 'none' : p.address}`)
  }

  if (source === 'dhcp') {
    return setAddressDhcp(world, device, session, clock).alreadyInState
      ? fail('DHCP is already enabled on this interface.')
      : done(`${head} dhcp`)
  }
  const gateway = p.gateway === undefined || p.gateway.toLowerCase() === 'none' ? '' : p.gateway
  if (source !== 'static' || !isIp(p.address) || !isIp(p.mask) || (gateway && !isIp(gateway))) return BAD_SYNTAX
  setAddressStatic(world, device, p.address!, p.mask!, gateway, session, clock)
  return done([`${head} static`, p.address, p.mask, gateway].filter(Boolean).join(' '))
}

/** `interface show interface`: состояние — итоговый линк, с портом коммутатора. */
function showInterfaces(ctx: CommandContext): CommandResult {
  const lines = ['', 'Admin State    State          Type             Interface Name', '-'.repeat(73)]
  for (const a of ctx.world.devices[ctx.device]?.adapters ?? []) {
    const state = linkOf(ctx.world, ctx.device) ? 'Connected' : 'Disconnected'
    lines.push(`Enabled        ${state.padEnd(15)}Dedicated        ${a.name}`)
  }
  return { stdout: joinLines([...lines, '', '']), exitCode: 0 }
}

/** Метка с пятой позиции, значение — с сорок третьей. */
const row = (label: string, value: string) => `    ${label.padEnd(38)}${value}`
const more = (value: string) => ' '.repeat(42) + value

function prefixOf(ip: string, mask: string): string {
  const m = mask.split('.').map(Number)
  const net = ip.split('.').map((o, i) => Number(o) & m[i]!)
  const bits = m.reduce((n, o) => n + o.toString(2).replace(/0/g, '').length, 0)
  return `${net.join('.')}/${bits} (mask ${mask})`
}

function showConfig(a: Adapter, full: boolean): string {
  const dnsLabel = a.dnsSource === 'static'
    ? 'Statically Configured DNS Servers:' : 'DNS servers configured through DHCP:'
  const [first, ...others] = a.dns
  const dns = [row(dnsLabel, first ?? 'None'), ...others.map(more)]
  const lines = ['', `Configuration for interface "${a.name}"`]
  if (full) {
    lines.push(row('DHCP enabled:', a.dhcpEnabled ? 'Yes' : 'No'))
    if (a.ip !== '0.0.0.0') {
      lines.push(row('IP Address:', a.ip), row('Subnet Prefix:', prefixOf(a.ip, a.mask)))
    }
    if (a.gateway) lines.push(row('Default Gateway:', a.gateway), row('Gateway Metric:', '0'))
    lines.push(row('InterfaceMetric:', '25'))
  }
  lines.push(...dns, row('Register with which suffix:', 'Primary only'))
  if (full) {
    lines.push(a.dhcpEnabled
      ? row('WINS servers configured through DHCP:', 'None')
      : row('Statically Configured WINS Servers:', 'None'))
  }
  return joinLines([...lines, ''])
}
