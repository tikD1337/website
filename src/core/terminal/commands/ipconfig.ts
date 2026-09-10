import { BRAND } from '../../../brand'
import { field, continuation, joinLines } from '../format'
import { recordChange } from '../../session/session'
import type { CommandHandler, CommandContext, CommandResult } from '../types'
import type { Adapter, NetworkSegment } from '../../world/types'

function adaptersOf(ctx: CommandContext): Adapter[] {
  return ctx.world.devices[ctx.device]?.adapters ?? []
}

function segmentOf(ctx: CommandContext, a: Adapter): NetworkSegment | undefined {
  return ctx.world.network.segments.find(s => s.vlan === a.segment)
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

/**
 * Формат даты аренды, как его печатает англоязычный ipconfig:
 * «Wednesday, September 9, 2026 6:13:39 PM».
 *
 * Считается в UTC намеренно: часовой пояс машины не должен менять
 * вывод тренажёра, иначе тесты станут зависеть от того, где их запустили.
 */
function leaseDate(iso: string): string {
  const d = new Date(iso)
  const h24 = d.getUTCHours()
  const ampm = h24 >= 12 ? 'PM' : 'AM'
  const h = h24 % 12 || 12
  const mm = String(d.getUTCMinutes()).padStart(2, '0')
  const ss = String(d.getUTCSeconds()).padStart(2, '0')
  return `${DAYS[d.getUTCDay()]}, ${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, `
    + `${d.getUTCFullYear()} ${h}:${mm}:${ss} ${ampm}`
}

function header(name: string): string[] {
  return ['Windows IP Configuration', '', `Ethernet adapter ${name}:`, '']
}

function renderAll(ctx: CommandContext): string {
  const lines: string[] = ['Windows IP Configuration', '']

  for (const a of adaptersOf(ctx)) {
    lines.push(`Ethernet adapter ${a.name}:`, '')

    // Опущенный линк обрывает вывод на Media State — так же, как Windows.
    if (!a.linkUp) {
      lines.push(field('mediaState', 'Media disconnected'))
      lines.push(field('dnsSuffix', BRAND.dnsSuffix))
      lines.push(field('description', a.description))
      lines.push(field('physicalAddress', a.mac))
      lines.push(field('dhcpEnabled', a.dhcpEnabled ? 'Yes' : 'No'))
      lines.push(field('autoconfigEnabled', a.autoconfigEnabled ? 'Yes' : 'No'))
      lines.push('')
      continue
    }

    lines.push(field('dnsSuffix', BRAND.dnsSuffix))
    lines.push(field('description', a.description))
    lines.push(field('physicalAddress', a.mac))
    lines.push(field('dhcpEnabled', a.dhcpEnabled ? 'Yes' : 'No'))
    lines.push(field('autoconfigEnabled', a.autoconfigEnabled ? 'Yes' : 'No'))

    lines.push(a.autoconfigured
      ? field('autoconfigIpv4', `${a.ip}(Preferred)`)
      : field('ipv4', `${a.ip}(Preferred)`))
    lines.push(field('subnetMask', a.mask))

    if (a.leaseObtained) lines.push(field('leaseObtained', leaseDate(a.leaseObtained)))
    if (a.leaseExpires) lines.push(field('leaseExpires', leaseDate(a.leaseExpires)))

    lines.push(field('defaultGateway', a.gateway))

    const [firstDns, ...restDns] = a.dns
    if (firstDns === undefined) {
      lines.push(field('dnsServers', ''))
    } else {
      lines.push(field('dnsServers', firstDns))
      for (const extra of restDns) lines.push(continuation(extra))
    }

    lines.push('')
  }

  return joinLines(lines)
}

function renderBrief(ctx: CommandContext): string {
  const lines: string[] = ['Windows IP Configuration', '']

  for (const a of adaptersOf(ctx)) {
    lines.push(`Ethernet adapter ${a.name}:`, '')
    if (!a.linkUp) {
      lines.push(field('mediaState', 'Media disconnected'))
      lines.push(field('dnsSuffix', BRAND.dnsSuffix))
      lines.push('')
      continue
    }
    lines.push(field('dnsSuffix', BRAND.dnsSuffix))
    lines.push(a.autoconfigured
      ? field('autoconfigIpv4', a.ip)
      : field('ipv4', a.ip))
    lines.push(field('subnetMask', a.mask))
    lines.push(field('defaultGateway', a.gateway))
    lines.push('')
  }

  return joinLines(lines)
}

function doRelease(ctx: CommandContext): CommandResult {
  const a = adaptersOf(ctx)[0]
  if (!a) return { stdout: joinLines(header('Ethernet')), exitCode: 1 }

  const before = a.ip

  a.ip = '0.0.0.0'
  a.mask = '0.0.0.0'
  a.gateway = ''
  a.dns = []
  a.autoconfigured = false
  a.leaseObtained = null
  a.leaseExpires = null

  recordChange(ctx.session, ctx.clock,
    `devices.${ctx.device}.adapters[0].ip`, before, '0.0.0.0', true)

  return {
    stdout: joinLines([...header(a.name), '   IP address released.', '']),
    exitCode: 0,
  }
}

function doRenew(ctx: CommandContext): CommandResult {
  const a = adaptersOf(ctx)[0]
  if (!a) return { stdout: joinLines(header('Ethernet')), exitCode: 1 }

  const seg = segmentOf(ctx, a)

  /**
   * Предусловие, ради которого всё и затевалось.
   *
   * Пока адаптер удерживает самоназначенный адрес, Windows не отправляет
   * новый DHCP-запрос — renew возвращает таймаут. Освобождение адреса
   * снимает удержание и открывает путь запросу. Именно эта развилка
   * отличает диагностику от заучивания: очевидная команда не работает,
   * и надо понять почему.
   */
  const holdsApipa = a.autoconfigured
  const dhcpReachable = Boolean(seg?.dhcpHealthy) && a.linkUp

  if (holdsApipa || !dhcpReachable) {
    return {
      stdout: joinLines([
        ...header(a.name),
        `   An error occurred while renewing interface ${a.name} : `
        + 'unable to contact your DHCP server. Request has timed out.',
        '',
      ]),
      exitCode: 1,
    }
  }

  const before = a.ip
  const now = ctx.clock.now()
  const lease = seg!.leasePool[0] ?? '10.20.14.88'

  a.ip = lease
  a.mask = '255.255.255.0'
  a.gateway = seg!.gateway
  a.dns = [...seg!.dns]
  a.autoconfigured = false
  a.leaseObtained = now.toISOString()
  a.leaseExpires = new Date(now.getTime() + 24 * 3600 * 1000).toISOString()

  recordChange(ctx.session, ctx.clock,
    `devices.${ctx.device}.adapters[0].ip`, before, lease, true)

  return {
    stdout: joinLines([
      ...header(a.name),
      '   Renewing IP address...',
      '   DHCP lease renewed successfully.',
      '',
    ]),
    exitCode: 0,
  }
}

export const ipconfig: CommandHandler = (args, ctx) => {
  const flag = (args[0] ?? '').toLowerCase()

  switch (flag) {
    case '':
      return { stdout: renderBrief(ctx), exitCode: 0 }
    case '/all':
      return { stdout: renderAll(ctx), exitCode: 0 }
    case '/release':
      return doRelease(ctx)
    case '/renew':
      return doRenew(ctx)
    case '/flushdns':
      return {
        stdout: joinLines([
          'Windows IP Configuration', '',
          '        Successfully flushed the DNS Resolver Cache.',
        ]),
        exitCode: 0,
      }
    default:
      return {
        stdout: 'Error: unrecognized or incomplete command line.',
        exitCode: 1,
      }
  }
}
