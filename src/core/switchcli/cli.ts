import { Cursor, Halt, tokenize, isVlanId, isIp, type Choice, type Stop } from './grammar'
import {
  interfacesStatus, interfaceDetail, sviDetail, allInterfaces, vlanBrief, macTable, dottedMac,
  portBlock, sviBlock, configListing, runningConfig, ipInterfaceBrief, logging, version,
  CRLF, type MacFilter,
} from './show'
import {
  findSwitch, setAccessVlan, setPortAdmin, setDescription, setPortMode, saveConfig,
  setHelper, changeSvi, type InfraResult,
} from '../infra/switchops'
import { recordCommand } from '../session/session'
import type { CommandContext } from '../terminal/types'
import type { NetSwitch } from '../world/types'

/**
 * Консоль коммутатора с синтаксисом IOS.
 *
 * Режимы, сокращения, каретка под ошибкой, подсказка `?` — как у
 * настоящей. Меняет мир она только через `switchops`: консоль и кнопки
 * серверной — два представления одной операции, и отказ шлюза выглядит
 * так, как его печатает консоль с проверкой полномочий на сервере
 * доступа: `Command authorization failed.`
 *
 * В журнал идёт и набранное, и полная форма: цель сценария сверяется с
 * `show running-config interface gigabitethernet1/0/22`, а техник
 * вправе набрать `sh run int gi1/0/22`.
 */

export type CliMode = 'user' | 'enable' | 'config' | 'config-if'

export interface CliState {
  /** имя коммутатора */
  device: string
  mode: CliMode
  /** интерфейс в режиме config-if: `Gi1/0/22` или `Vlan20` */
  iface: string | null
}

export interface SwitchResult {
  stdout: string
  exitCode: number
  state: CliState
  /** после `?` консоль возвращает набранное в строку ввода */
  prefill?: string
}

export function newCli(device: string): CliState {
  return { device, mode: 'user', iface: null }
}

export function promptOf(s: CliState): string {
  const suffix = { user: '>', enable: '#', config: '(config)#', 'config-if': '(config-if)#' }[s.mode]
  return `${s.device}${suffix}`
}

const DENIED = 'Command authorization failed.'

interface Outcome {
  stdout: string
  exitCode?: number
  state?: CliState
}

/** Разобранная команда: полная форма для журнала и действие. */
interface Parsed {
  canonical: string
  exec: () => Outcome
}

interface Env {
  c: Cursor
  ctx: CommandContext
  sw: NetSwitch
  state: CliState
}

const at = (state: CliState, mode: CliMode, iface: string | null = null): CliState =>
  ({ ...state, mode, iface })

/** Итог операции словами консоли: успех молчит, отказ шлюза — отказ в полномочиях. */
function applied(r: InfraResult, ok = ''): Outcome {
  if (r.ok) return { stdout: ok }
  if (r.denied) return { stdout: DENIED, exitCode: 1 }
  return { stdout: '% Access VLAN does not exist.', exitCode: 1 }
}

// ── exec: show ──────────────────────────────────────────────────────

function parseShow(e: Env, privileged: boolean): Parsed {
  const { c, ctx, sw } = e
  const words: Choice[] = [
    ['interfaces', 'Interface status and configuration'],
    ['ip', 'IP information'],
    ['logging', 'Show the contents of logging buffers'],
    ['mac', 'MAC configuration'],
    ...(privileged ? [['running-config', 'Current operating configuration'] as const] : []),
    ['version', 'System hardware and software status'],
    ['vlan', 'VTP VLAN status'],
  ]
  const show = (canonical: string, render: () => string): Parsed =>
    ({ canonical: `show ${canonical}`, exec: () => ({ stdout: render() }) })

  switch (c.word(words)) {
    case 'interfaces': {
      const f = c.iface([['status', 'Show interface line status']], true)
      if (!f) { c.end(); return show('interfaces', () => allInterfaces(ctx.world, sw)) }
      if (f.kind === 'word') { c.end(); return show('interfaces status', () => interfacesStatus(ctx.world, sw)) }
      if (f.kind === 'port') {
        const port = sw.ports.find(p => p.name === f.name)
        if (!port) throw new Halt({ kind: 'invalid', at: f.at })
        c.end()
        return show(`interfaces gigabitethernet${f.name.slice(2)}`, () => interfaceDetail(ctx.world, sw, port))
      }
      const svi = sw.vlanInterfaces.find(v => v.vlan === f.vlan)
      if (!svi) throw new Halt({ kind: 'invalid', at: f.at })
      c.end()
      return show(`interfaces vlan${f.vlan}`, () => sviDetail(sw, svi))
    }
    case 'ip':
      c.word([['interface', 'IP interface status and configuration']])
      c.word([['brief', 'Brief summary of IP status and configuration']])
      c.end()
      return show('ip interface brief', () => ipInterfaceBrief(ctx.world, sw))
    case 'logging':
      c.end()
      return show('logging', () => logging(sw))
    case 'mac': {
      c.word([['address-table', 'MAC forwarding table']])
      const by = c.word([
        ['address', 'address keyword'],
        ['interface', 'interface keyword'],
        ['vlan', 'VLAN keyword'],
      ], true)
      let filter: MacFilter = null
      let suffix = ''
      if (by === 'address') {
        const mac = dottedMac(c.arg('H.H.H', '48 bit mac address', s => dottedMac(s) !== null).value)!
        filter = { mac }
        suffix = ` address ${mac}`
      } else if (by === 'interface') {
        const f = c.iface()
        if (f?.kind !== 'port' || !sw.ports.some(p => p.name === f.name)) {
          throw new Halt({ kind: 'invalid', at: f && f.kind !== 'word' ? f.at : 0 })
        }
        filter = { port: f.name }
        suffix = ` interface gigabitethernet${f.name.slice(2)}`
      } else if (by === 'vlan') {
        const vlan = Number(c.arg('<1-4094>', 'VLAN number', isVlanId).value)
        filter = { vlan }
        suffix = ` vlan ${vlan}`
      }
      c.end()
      return show(`mac address-table${suffix}`, () => macTable(ctx.world, sw, filter))
    }
    case 'running-config': {
      const sub = c.word([['interface', 'Show interface configuration']], true)
      if (!sub) { c.end(); return show('running-config', () => runningConfig(sw)) }
      const f = c.iface()!
      if (f.kind === 'port') {
        const port = sw.ports.find(p => p.name === f.name)
        if (!port) throw new Halt({ kind: 'invalid', at: f.at })
        c.end()
        return show(`running-config interface gigabitethernet${f.name.slice(2)}`,
          () => configListing(['!', ...portBlock(port), 'end']))
      }
      if (f.kind !== 'vlan') throw new Halt({ kind: 'incomplete' })
      const svi = sw.vlanInterfaces.find(v => v.vlan === f.vlan)
      if (!svi) throw new Halt({ kind: 'invalid', at: f.at })
      c.end()
      return show(`running-config interface vlan${f.vlan}`, () => configListing(['!', ...sviBlock(svi), 'end']))
    }
    case 'version':
      c.end()
      return show('version', () => version(sw, ctx.clock.now()))
    default: {
      const brief = c.word([['brief', 'VTP all VLAN status in brief']], true)
      c.end()
      return show(brief ? 'vlan brief' : 'vlan', () => vlanBrief(sw))
    }
  }
}

// ── exec: сохранение ────────────────────────────────────────────────

function save(e: Env, canonical: string, prompt = ''): Parsed {
  e.c.end()
  return {
    canonical,
    exec: () => applied(saveConfig(e.ctx.world, e.sw.hostname, e.ctx.session, e.ctx.clock),
      `${prompt}Building configuration...${CRLF}[OK]`),
  }
}

function parseWrite(e: Env): Parsed {
  e.c.word([['memory', 'Write to NV memory']], true)
  return save(e, 'write memory')
}

function parseCopy(e: Env): Parsed {
  e.c.word([['running-config', 'Copy from current system configuration']])
  e.c.word([['startup-config', 'Copy to startup configuration']])
  return save(e, 'copy running-config startup-config', `Destination filename [startup-config]? ${CRLF}`)
}

// ── exec: режимы ────────────────────────────────────────────────────

const USER: Choice[] = [
  ['enable', 'Turn on privileged commands'],
  ['exit', 'Exit from the EXEC'],
  ['show', 'Show running system information'],
]
const ENABLE: Choice[] = [
  ['configure', 'Enter configuration mode'],
  ['copy', 'Copy from one file to another'],
  ['disable', 'Turn off privileged commands'],
  ['exit', 'Exit from the EXEC'],
  ['show', 'Show running system information'],
  ['write', 'Write running configuration to memory, network, or terminal'],
]
/** Что можно выполнить из режима настройки через `do`. */
const DO: Choice[] = ENABLE.filter(([w]) => ['copy', 'show', 'write'].includes(w))

function parseExec(e: Env, privileged: boolean, choices: readonly Choice[]): Parsed {
  const { c, state } = e
  const cmd = c.word(choices)
  const to = (canonical: string, next: CliState, stdout = ''): Parsed => {
    c.end()
    return { canonical, exec: () => ({ stdout, state: next }) }
  }
  switch (cmd) {
    case 'enable': return to('enable', at(state, 'enable'))
    case 'disable': return to('disable', at(state, 'user'))
    case 'exit': return to('exit', newCli(state.device))
    case 'configure': {
      const t = c.word([['terminal', 'Configure from the terminal']], true)
      const ask = t ? '' : `Configuring from terminal, memory, or network [terminal]? ${CRLF}`
      return to('configure terminal', at(state, 'config'),
        `${ask}Enter configuration commands, one per line.  End with CNTL/Z.`)
    }
    case 'copy': return parseCopy(e)
    case 'write': return parseWrite(e)
    default: return parseShow(e, privileged)
  }
}

// ── настройка ───────────────────────────────────────────────────────

const CONFIG: Choice[] = [
  ['do', 'To run exec commands in config mode'],
  ['end', 'Exit from configure mode'],
  ['exit', 'Exit from configure mode'],
  ['interface', 'Select an interface to configure'],
]

/** `interface …` из режима настройки или из другого интерфейса. */
function parseInterface(e: Env): Parsed {
  const { c, ctx, sw, state } = e
  const f = c.iface()!
  if (f.kind === 'port') {
    if (!sw.ports.some(p => p.name === f.name)) throw new Halt({ kind: 'invalid', at: f.at })
    c.end()
    return {
      canonical: `interface gigabitethernet${f.name.slice(2)}`,
      exec: () => ({ stdout: '', state: at(state, 'config-if', f.name) }),
    }
  }
  if (f.kind !== 'vlan') throw new Halt({ kind: 'incomplete' })
  c.end()
  return {
    canonical: `interface vlan${f.vlan}`,
    exec: () => {
      if (sw.vlanInterfaces.some(v => v.vlan === f.vlan)) {
        return { stdout: '', state: at(state, 'config-if', `Vlan${f.vlan}`) }
      }
      // Новый интерфейс VLAN — новая маршрутизация в сети, не работа первой линии.
      return applied(changeSvi(ctx.world, sw.hostname, f.vlan, `создание интерфейса Vlan${f.vlan}`,
        ctx.session, ctx.clock))
    }
  }
}

function parseConfig(e: Env): Parsed {
  const { c, state } = e
  const cmd = c.word(state.mode === 'config' ? CONFIG : ifaceChoices(state))
  switch (cmd) {
    case 'do': return parseExec(e, true, DO)
    case 'end':
      c.end()
      return { canonical: 'end', exec: () => ({ stdout: '', state: at(state, 'enable') }) }
    case 'exit':
      c.end()
      return {
        canonical: 'exit',
        exec: () => ({ stdout: '', state: state.mode === 'config-if' ? at(state, 'config') : at(state, 'enable') }),
      }
    case 'interface': return parseInterface(e)
    default:
      return state.iface!.startsWith('Vlan') ? parseSvi(e, cmd) : parsePort(e, cmd)
  }
}

const PORT_IF: Choice[] = [
  ['description', 'Interface specific description'],
  ['do', 'To run exec commands in config mode'],
  ['end', 'Exit from configure mode'],
  ['exit', 'Exit from interface configuration mode'],
  ['interface', 'Select an interface to configure'],
  ['no', 'Negate a command or set its defaults'],
  ['shutdown', 'Shutdown the selected interface'],
  ['switchport', 'Set switching mode characteristics'],
]
const SVI_IF: Choice[] = [
  ...PORT_IF.filter(([w]) => w !== 'switchport'),
  ['ip', 'Interface Internet Protocol config commands'] as const,
].sort(([a], [b]) => a.localeCompare(b))

const ifaceChoices = (s: CliState) => (s.iface!.startsWith('Vlan') ? SVI_IF : PORT_IF)
const DESCRIPTION = ['LINE', 'Up to 200 characters describing this interface'] as const

function parsePort(e: Env, cmd: string): Parsed {
  const { c, ctx, sw, state } = e
  const port = state.iface!
  const { world, session, clock } = ctx
  const op = (canonical: string, run: () => InfraResult): Parsed => ({ canonical, exec: () => applied(run()) })

  switch (cmd) {
    case 'description': {
      const text = c.rest(...DESCRIPTION)
      return op(`description ${text}`, () => setDescription(world, sw.hostname, port, text, session, clock))
    }
    case 'shutdown':
      c.end()
      return op('shutdown', () => setPortAdmin(world, sw.hostname, port, false, session, clock))
    case 'no': {
      const what = c.word([
        ['description', 'Interface specific description'],
        ['shutdown', 'Shutdown the selected interface'],
      ])
      c.end()
      return what === 'shutdown'
        ? op('no shutdown', () => setPortAdmin(world, sw.hostname, port, true, session, clock))
        : op('no description', () => setDescription(world, sw.hostname, port, '', session, clock))
    }
    default: {
      const sub = c.word([
        ['access', 'Set access mode characteristics of the interface'],
        ['mode', 'Set trunking mode of the interface'],
      ])
      if (sub === 'mode') {
        const mode = c.word([
          ['access', 'Set trunking mode to ACCESS unconditionally'],
          ['trunk', 'Set trunking mode to TRUNK unconditionally'],
        ]) as 'access' | 'trunk'
        c.end()
        return op(`switchport mode ${mode}`, () => setPortMode(world, sw.hostname, port, mode, session, clock))
      }
      c.word([['vlan', 'Set VLAN when interface is in access mode']])
      const vlan = Number(c.arg('<1-4094>', 'VLAN ID of the VLAN when this port is in access mode', isVlanId).value)
      c.end()
      return op(`switchport access vlan ${vlan}`,
        () => setAccessVlan(world, sw.hostname, port, vlan, session, clock))
    }
  }
}

function parseSvi(e: Env, cmd: string): Parsed {
  const { c, ctx, sw, state } = e
  const vlan = Number(state.iface!.slice(4))
  const { world, session, clock } = ctx
  const deny = (canonical: string, what: string): Parsed =>
    ({ canonical, exec: () => applied(changeSvi(world, sw.hostname, vlan, what, session, clock)) })
  const helper = (add: boolean): Parsed => {
    const ip = c.arg('A.B.C.D', 'IP destination address', isIp).value
    c.end()
    return {
      canonical: `${add ? '' : 'no '}ip helper-address ${ip}`,
      exec: () => applied(setHelper(world, sw.hostname, vlan, ip, add, session, clock)),
    }
  }
  const IP: Choice[] = [
    ['address', 'Set the IP address of an interface'],
    ['helper-address', 'Specify a destination address for UDP broadcasts'],
  ]

  switch (cmd) {
    case 'description':
      return deny(`description ${c.rest(...DESCRIPTION)}`, `смена описания Vlan${vlan}`)
    case 'shutdown':
      c.end()
      return deny('shutdown', `выключение Vlan${vlan}`)
    case 'ip': {
      if (c.word(IP) === 'helper-address') return helper(true)
      const ip = c.arg('A.B.C.D', 'IP address', isIp).value
      const mask = c.arg('A.B.C.D', 'IP subnet mask', isIp).value
      c.end()
      return deny(`ip address ${ip} ${mask}`, `смена адреса Vlan${vlan}`)
    }
    default: {
      const what = c.word([
        ['description', 'Interface specific description'],
        ['ip', 'Interface Internet Protocol config commands'],
        ['shutdown', 'Shutdown the selected interface'],
      ])
      if (what === 'ip') {
        c.word([['helper-address', 'Specify a destination address for UDP broadcasts']])
        return helper(false)
      }
      c.end()
      return what === 'shutdown'
        ? deny('no shutdown', `включение Vlan${vlan}`)
        : deny('no description', `смена описания Vlan${vlan}`)
    }
  }
}

// ── вход ────────────────────────────────────────────────────────────

function parseLine(e: Env): Parsed {
  switch (e.state.mode) {
    case 'user': return parseExec(e, false, USER)
    case 'enable': return parseExec(e, true, ENABLE)
    default: return parseConfig(e)
  }
}

function describe(stop: Exclude<Stop, { kind: 'help' }>, prompt: string): string {
  switch (stop.kind) {
    case 'invalid':
      return `${' '.repeat(prompt.length + stop.at)}^${CRLF}% Invalid input detected at '^' marker.`
    case 'ambiguous':
      return `% Ambiguous command:  "${stop.text}"`
    case 'incomplete':
      return '% Incomplete command.'
    case 'unrecognized':
      return '% Unrecognized command'
  }
}

export function runSwitch(line: string, state: CliState, ctx: CommandContext): SwitchResult {
  const typed = line.trim()
  if (!typed) return { stdout: '', exitCode: 0, state }
  const sw = findSwitch(ctx.world, state.device)
  if (!sw) return { stdout: '% Connection closed by foreign host.', exitCode: 1, state }

  const c = new Cursor(line, tokenize(line))
  let parsed: Parsed
  try {
    parsed = parseLine({ c, ctx, sw, state })
  } catch (err) {
    if (!(err instanceof Halt)) throw err
    const stop = err.stop
    // Подсказка — не команда: ничего не выполняет и в журнал не идёт.
    if (stop.kind === 'help') {
      return { stdout: stop.lines.join(CRLF), exitCode: 0, state, prefill: stop.prefill }
    }
    recordCommand(ctx.session, ctx.clock, state.device, typed, 1)
    return { stdout: describe(stop, promptOf(state)), exitCode: 1, state }
  }

  const r = parsed.exec()
  const exitCode = r.exitCode ?? 0
  recordCommand(ctx.session, ctx.clock, state.device, typed, exitCode, parsed.canonical)
  return { stdout: r.stdout, exitCode, state: r.state ?? state }
}
