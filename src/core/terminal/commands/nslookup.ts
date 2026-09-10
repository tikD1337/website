import { joinLines } from '../format'
import type { CommandHandler } from '../types'

/**
 * nslookup спрашивает первый DNS-сервер, прописанный на адаптере.
 *
 * Это та команда, что отделяет проблему имён от проблемы связности:
 * ping может проходить, а разрешение имён — нет. Поэтому она смотрит
 * именно на `adapter.dns`, а не на список серверов мира: важно, что
 * машина знает, а не что существует.
 */
export const nslookup: CommandHandler = (args, ctx) => {
  const name = args[0]
  const adapter = ctx.world.devices[ctx.device]?.adapters[0]
  const serverIp = adapter?.dns[0]

  if (!serverIp) {
    return {
      stdout: joinLines([
        "*** Can't find server name for address: Timed out",
        '*** Default servers are not available',
        'Server:  UnKnown',
        'Address:  0.0.0.0',
        '',
      ]),
      exitCode: 1,
    }
  }

  if (!name) {
    return {
      stdout: joinLines([
        `Default Server:  ${serverIp}`,
        `Address:  ${serverIp}`,
        '',
      ]),
      exitCode: 0,
    }
  }

  const server = ctx.world.network.dnsServers.find(d => d.ip === serverIp)
  const head = [`Server:  ${serverIp}`, `Address:  ${serverIp}`, '']

  if (!server?.reachable) {
    return {
      stdout: joinLines([
        `*** Request to ${serverIp} timed-out`,
        '',
      ]),
      exitCode: 1,
    }
  }

  const answer = server.zones[name.toLowerCase()]

  if (!answer) {
    return {
      stdout: joinLines([
        ...head,
        `*** ${serverIp} can't find ${name}: Non-existent domain`,
        '',
      ]),
      exitCode: 1,
    }
  }

  return {
    stdout: joinLines([
      ...head,
      `Name:    ${name}`,
      `Address:  ${answer}`,
      '',
    ]),
    exitCode: 0,
  }
}
