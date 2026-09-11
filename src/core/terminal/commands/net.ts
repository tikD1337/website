import { joinLines } from '../format'
import {
  findUser, findGroup, setEnabled, resetPassword, addToGroup, removeFromGroup,
} from '../../directory/accounts'
import { dnsDomain, netbiosDomain } from '../../directory/naming'
import type { CommandHandler, CommandContext } from '../types'
import type { WorldState, OrgUser, DirectoryGroup } from '../../world/types'

/**
 * net — учётные записи и группы из терминала.
 *
 * Как и `sc`, команда ничего не решает сама: разбирает аргументы,
 * вызывает операцию из `core/directory/accounts` и печатает результат.
 * Шлюз полномочий, пометка несанкционированных изменений и отказ по
 * привилегированным группам живут там, поэтому `net user /active:no`
 * и переключатель в консоли каталога не могут разойтись.
 *
 * Формат снят с живой Windows: метка карточки пользователя занимает 29
 * символов, значение начинается с тридцатой позиции, двоеточий нет.
 * У карточки группы метка 15 символов. Членство печатается со
 * звёздочкой, по два имени в строке.
 */

const OK = 'The command completed successfully.'
const RULE = '-'.repeat(79)

const USER_LABEL = 29
const GROUP_LABEL = 15
const MEMBER_COLUMN = 22
const LIST_COLUMN = 25

function labeled(label: string, value: string, width = USER_LABEL): string {
  return label.padEnd(width) + value
}

/**
 * Дата в том виде, в каком её печатает консоль.
 *
 * Время берём в UTC: мир детерминирован, и вывод не должен зависеть
 * от того, в каком часовом поясе запущен тренажёр.
 */
function winDateTime(iso: string): string {
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getUTCDate())}.${p(d.getUTCMonth() + 1)}.${d.getUTCFullYear()} `
    + `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`
}

function error(text: string, helpmsg: number): string {
  return joinLines([text, '', `More help is available by typing NET HELPMSG ${helpmsg}.`, ''])
}

function syntax(): string {
  return joinLines([
    'The syntax of this command is:',
    '',
    'NET USER',
    '[username [password] [/ACTIVE:{YES | NO}]] [/DOMAIN]',
    '',
    'NET GROUP',
    'groupname {/ADD | /DELETE} [/DOMAIN]',
    'groupname username [...] {/ADD | /DELETE} [/DOMAIN]',
    '',
    'NET LOCALGROUP',
    '[groupname]',
    '',
  ])
}

/** Многоколоночный список: имена по 25 символов, по три в строке. */
function columns(items: string[], width = LIST_COLUMN, perRow = 3): string[] {
  const rows: string[] = []
  for (let i = 0; i < items.length; i += perRow) {
    rows.push(items.slice(i, i + perRow).map(x => x.padEnd(width)).join(''))
  }
  return rows
}

/**
 * Членство: по два имени в строке, продолжение выровнено под значение.
 *
 * Так печатает настоящий `net user`, и по этой раскладке техник
 * привыкает читать длинные списки групп, не теряя строку.
 */
function membershipLines(label: string, names: string[]): string[] {
  if (names.length === 0) return [labeled(label, '')]

  const marked = names.map(n => '*' + n)
  const out: string[] = []
  for (let i = 0; i < marked.length; i += 2) {
    const chunk = marked.slice(i, i + 2).map(x => x.padEnd(MEMBER_COLUMN)).join('')
    out.push(i === 0 ? labeled(label, chunk) : ' '.repeat(USER_LABEL) + chunk)
  }
  return out
}

function userList(world: WorldState): string {
  const names = world.org.users
    .map(u => u.samAccountName)
    .sort((a, b) => a.localeCompare(b))

  return joinLines([
    '',
    `User accounts for \\\\${dnsDomain(world)}`,
    '',
    RULE,
    ...columns(names),
    OK,
    '',
  ])
}

/**
 * Карточка пользователя.
 *
 * Поля и их порядок взяты с настоящей Windows целиком, включая те,
 * что тренажёр не моделирует: пустой сценарий входа и «All» в
 * разрешённых рабочих станциях — часть картины, которую техник видит
 * на работе. Убрать их значило бы научить читать чужой, упрощённый
 * вывод.
 */
function userCard(world: WorldState, u: OrgUser): string {
  const active = u.lockedOut ? 'Locked' : u.enabled ? 'Yes' : 'No'

  return joinLines([
    labeled('User name', u.samAccountName),
    labeled('Full Name', u.displayName),
    labeled('Comment', u.title),
    labeled("User's comment", ''),
    labeled('Country/region code', '000 (System Default)'),
    labeled('Account active', active),
    labeled('Account expires', 'Never'),
    '',
    labeled('Password last set', winDateTime(u.pwdLastSet)),
    labeled('Password expires', u.pwdExpired ? 'Expired' : 'Never'),
    labeled('Password changeable', winDateTime(u.pwdLastSet)),
    labeled('Password required', 'Yes'),
    labeled('User may change password', 'Yes'),
    '',
    labeled('Workstations allowed', 'All'),
    labeled('Logon script', ''),
    labeled('User profile', ''),
    labeled('Home directory', `\\\\fileserver.${dnsDomain(world)}\\${u.samAccountName}`),
    labeled('Last logon', winDateTime(u.lastLogon)),
    '',
    labeled('Logon hours allowed', 'All'),
    '',
    ...membershipLines('Local Group Memberships', []),
    ...membershipLines('Global Group memberships', u.groups),
    OK,
    '',
  ])
}

function groupList(world: WorldState): string {
  const names = world.org.groups
    .map(g => g.name)
    .sort((a, b) => a.localeCompare(b))

  return joinLines([
    '',
    `Group Accounts for \\\\${dnsDomain(world)}`,
    '',
    RULE,
    ...names.map(n => '*' + n),
    OK,
    '',
  ])
}

function groupCard(g: DirectoryGroup): string {
  return joinLines([
    labeled('Group name', g.name, GROUP_LABEL),
    labeled('Comment', g.description, GROUP_LABEL),
    '',
    'Members',
    '',
    RULE,
    ...g.members,
    OK,
    '',
  ])
}

/**
 * Локальные группы машины.
 *
 * Это не состояние мира, а постоянный набор Windows: он одинаков на
 * любой рабочей станции. В `WorldState` он переедет, когда появится
 * сценарий, где состав локальных администраторов действительно
 * меняется — до тех пор хранить копию на каждой машине незачем.
 */
const LOCAL_GROUPS: Record<string, { comment: string; members: (nb: string) => string[] }> = {
  'Administrators': {
    comment: 'Administrators have complete and unrestricted access to the computer',
    members: nb => [`${nb}\\Domain Admins`, 'Administrator'],
  },
  'Users': {
    comment: 'Users are prevented from making accidental or intentional system-wide changes',
    members: nb => [`${nb}\\Domain Users`, 'NT AUTHORITY\\INTERACTIVE'],
  },
  'Remote Desktop Users': {
    comment: 'Members are granted the right to logon remotely',
    members: () => [],
  },
  'Backup Operators': {
    comment: 'Backup Operators can override security restrictions for backup purposes',
    members: () => [],
  },
  'Event Log Readers': {
    comment: 'Members can read event logs from local machine',
    members: () => [],
  },
  'Performance Log Users': {
    comment: 'Members may schedule logging of performance counters',
    members: () => [],
  },
}

function localGroupList(host: string): string {
  return joinLines([
    '',
    `Aliases for \\\\${host}`,
    '',
    RULE,
    ...Object.keys(LOCAL_GROUPS).sort((a, b) => a.localeCompare(b)).map(n => '*' + n),
    OK,
    '',
  ])
}

function localGroupCard(name: string, nb: string): string {
  const found = Object.entries(LOCAL_GROUPS)
    .find(([key]) => key.toLowerCase() === name.toLowerCase())

  if (!found) {
    return error('The specified local group does not exist.', 1376)
  }

  const [realName, def] = found
  return joinLines([
    labeled('Alias name', realName, GROUP_LABEL),
    labeled('Comment', def.comment, GROUP_LABEL),
    '',
    'Members',
    '',
    RULE,
    ...def.members(nb),
    OK,
    '',
  ])
}

/** Отказ шлюза выглядит как отказ Windows, а не как текст тренажёра. */
function accessDenied(): string {
  return joinLines(['System error 5 has occurred.', '', 'Access is denied.', ''])
}

function handleUser(args: string[], ctx: CommandContext) {
  const rest = args.filter(a => a.toLowerCase() !== '/domain')

  if (rest.length === 0) return { stdout: userList(ctx.world), exitCode: 0 }

  const name = rest[0]!
  const user = findUser(ctx.world, name)
  if (!user) {
    return { stdout: error('The user name could not be found.', 2221), exitCode: 1 }
  }

  const options = rest.slice(1)
  if (options.length === 0) {
    return { stdout: userCard(ctx.world, user), exitCode: 0 }
  }

  const active = options.find(o => o.toLowerCase().startsWith('/active:'))
  if (active) {
    const value = active.slice('/active:'.length).toLowerCase()
    if (value !== 'yes' && value !== 'no') {
      return { stdout: syntax(), exitCode: 1 }
    }
    const r = setEnabled(ctx.world, user.samAccountName, value === 'yes', ctx.session, ctx.clock)
    if (!r.ok) return { stdout: accessDenied(), exitCode: 1 }
    return { stdout: joinLines([OK, '']), exitCode: 0 }
  }

  // Единственный оставшийся вариант без ключа — новый пароль.
  const password = options.find(o => !o.startsWith('/'))
  if (password !== undefined) {
    const r = resetPassword(ctx.world, user.samAccountName, ctx.session, ctx.clock)
    if (!r.ok) return { stdout: accessDenied(), exitCode: 1 }
    return { stdout: joinLines([OK, '']), exitCode: 0 }
  }

  return { stdout: syntax(), exitCode: 1 }
}

function handleGroup(args: string[], ctx: CommandContext) {
  const rest = args.filter(a => a.toLowerCase() !== '/domain')

  if (rest.length === 0) return { stdout: groupList(ctx.world), exitCode: 0 }

  const name = rest[0]!
  const group = findGroup(ctx.world, name)
  if (!group) {
    return { stdout: error('The group name could not be found.', 2220), exitCode: 1 }
  }

  const add = rest.some(a => a.toLowerCase() === '/add')
  const del = rest.some(a => a.toLowerCase() === '/delete')
  const members = rest.slice(1).filter(a => !a.startsWith('/'))

  if (!add && !del) {
    return { stdout: groupCard(group), exitCode: 0 }
  }

  if (members.length === 0) return { stdout: syntax(), exitCode: 1 }

  for (const m of members) {
    const r = add
      ? addToGroup(ctx.world, m, group.name, ctx.session, ctx.clock)
      : removeFromGroup(ctx.world, m, group.name, ctx.session, ctx.clock)

    if (!r.ok) {
      // Несуществующий пользователь и отказ шлюза различаются: первое
      // ошибка ввода, второе граница полномочий.
      return findUser(ctx.world, m)
        ? { stdout: accessDenied(), exitCode: 1 }
        : { stdout: error('The user name could not be found.', 2221), exitCode: 1 }
    }
  }

  return { stdout: joinLines([OK, '']), exitCode: 0 }
}

export const net: CommandHandler = (args, ctx) => {
  const sub = (args[0] ?? '').toLowerCase()
  const rest = args.slice(1)

  switch (sub) {
    case 'user':
      return handleUser(rest, ctx)
    case 'group':
      return handleGroup(rest, ctx)
    case 'localgroup': {
      if (rest.length === 0) return { stdout: localGroupList(ctx.device), exitCode: 0 }
      const card = localGroupCard(rest[0]!, netbiosDomain(ctx.world))
      return { stdout: card, exitCode: card.includes(OK) ? 0 : 1 }
    }
    default:
      return { stdout: syntax(), exitCode: 1 }
  }
}
