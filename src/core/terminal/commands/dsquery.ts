import { joinLines } from '../format'
import { userDn, groupDn } from '../../directory/naming'
import type { CommandHandler } from '../types'
import type { WorldState } from '../../world/types'

/**
 * dsquery — поиск объектов каталога.
 *
 * Команда только читает. Она существует ради одного вопроса, на
 * который мышью отвечать долго: «покажи всех в этом подразделении».
 * Вывод — различающиеся имена в кавычках, по одному в строке, ровно
 * как у настоящей dsquery, чтобы результат можно было передать дальше
 * по конвейеру.
 */

function usage(): string {
  return joinLines([
    'Description: This tool\'s commands find objects in the directory',
    'according to specified search criteria.',
    '',
    'Syntax: dsquery user [{StartNode|forestroot|domainroot}]',
    '        [-o {dn | rdn | samid}] [-name Name] [-samid SAMName]',
    '',
    '        dsquery group [{StartNode|forestroot|domainroot}]',
    '        [-o {dn | rdn | samid}] [-name Name]',
    '',
  ])
}

function notFound(): string {
  return 'dsquery failed:Directory object not found.'
}

/** Подстановка `*` в конце — единственная, которую поддерживает dsquery. */
function matchesName(value: string, pattern: string): boolean {
  const v = value.toLowerCase()
  const p = pattern.toLowerCase()
  if (p.endsWith('*')) return v.startsWith(p.slice(0, -1))
  return v === p
}

/** Значение ключа: `-name Priya*` → `Priya*`. */
function option(args: string[], key: string): string | undefined {
  const i = args.findIndex(a => a.toLowerCase() === key)
  return i >= 0 ? args[i + 1] : undefined
}

/**
 * Узел, с которого начинается поиск.
 *
 * Это первый аргумент без ключа. Вложенные подразделения попадают в
 * результат: `OU=Employees` находит и продажи, и финансы — так же,
 * как настоящий поиск по поддереву.
 */
function startNode(args: string[]): string | undefined {
  const first = args[0]
  if (first === undefined || first.startsWith('-')) return undefined
  return first
}

function ouExists(world: WorldState, node: string): boolean {
  const withoutDomain = node.replace(new RegExp(',' + world.org.domain + '$', 'i'), '')
  return world.org.ous.some(o => o.path.toLowerCase() === withoutDomain.toLowerCase())
}

function inSubtree(objectOu: string, node: string, world: WorldState): boolean {
  const withoutDomain = node.replace(new RegExp(',' + world.org.domain + '$', 'i'), '')
  const target = withoutDomain.toLowerCase()
  const ou = objectOu.toLowerCase()
  return ou === target || ou.endsWith(',' + target)
}

export const dsquery: CommandHandler = (args, ctx) => {
  const kind = (args[0] ?? '').toLowerCase()
  if (kind !== 'user' && kind !== 'group') {
    return { stdout: usage(), exitCode: 1 }
  }

  const rest = args.slice(1)
  const node = startNode(rest)
  if (node !== undefined && !ouExists(ctx.world, node)) {
    return { stdout: notFound(), exitCode: 1 }
  }

  const output = (option(rest, '-o') ?? 'dn').toLowerCase()
  const nameFilter = option(rest, '-name')
  const samFilter = option(rest, '-samid')

  const rows = kind === 'user'
    ? ctx.world.org.users
        .filter(u => node === undefined || inSubtree(u.ou, node, ctx.world))
        .filter(u => nameFilter === undefined || matchesName(u.displayName, nameFilter))
        .filter(u => samFilter === undefined || matchesName(u.samAccountName, samFilter))
        .map(u => output === 'samid'
          ? u.samAccountName
          : output === 'rdn'
            ? u.displayName
            : `"${userDn(ctx.world, u)}"`)
    : ctx.world.org.groups
        .filter(g => node === undefined || inSubtree(g.ou, node, ctx.world))
        .filter(g => nameFilter === undefined || matchesName(g.name, nameFilter))
        .map(g => output === 'samid'
          ? g.name
          : output === 'rdn'
            ? g.name
            : `"${groupDn(ctx.world, g)}"`)

  if (rows.length === 0) return { stdout: '', exitCode: 0 }
  return { stdout: joinLines([...rows, '']), exitCode: 0 }
}
