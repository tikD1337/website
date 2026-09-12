import { joinLines } from '../format'
import { findUser, findGroup } from '../../directory/accounts'
import { netbiosDomain, userSid, groupSid } from '../../directory/naming'
import type { CommandHandler, CommandContext } from '../types'

/**
 * whoami — чьи это права.
 *
 * Удалённый сеанс открыт в сеансе владельца машины, поэтому команда
 * показывает пользователя, а не техника. Разница принципиальна:
 * техник выясняет, что может сам обратившийся, и подменять это
 * собственными правами значило бы отвечать не на тот вопрос.
 *
 * Членство берётся из **билета входа**, а не из карточки каталога.
 * Это не рассогласование с `net user`, а два разных факта: каталог
 * говорит, в каких группах человек состоит, билет — какие из них
 * действуют в его текущем сеансе. Расхождение между ними и есть
 * штатный способ понять, почему доступа нет сразу после добавления в
 * группу; печатая каталог, команда опровергала бы верную догадку
 * техника ровно там, где сценарий её проверяет.
 */

/** Ширины колонок сняты с живой Windows: сумма со стыками — 245. */
const COLUMNS = [68, 16, 108, 50]

const DEFAULT_ATTRS = 'Mandatory group, Enabled by default, Enabled group'

/** Постоянные группы Windows — одинаковы в любом сеансе домена. */
const WELL_KNOWN: Array<[name: string, type: string, sid: string]> = [
  ['Everyone', 'Well-known group', 'S-1-1-0'],
  ['BUILTIN\\Users', 'Alias', 'S-1-5-32-545'],
  ['NT AUTHORITY\\INTERACTIVE', 'Well-known group', 'S-1-5-4'],
  ['NT AUTHORITY\\Authenticated Users', 'Well-known group', 'S-1-5-11'],
  ['NT AUTHORITY\\This Organization', 'Well-known group', 'S-1-5-15'],
]

function row(cells: string[]): string {
  return cells.map((c, i) => c.padEnd(COLUMNS[i] ?? 0)).join(' ')
}

/** Владелец машины: чей сеанс открыт в удалёнке. */
function sessionUser(ctx: CommandContext): string {
  return ctx.world.devices[ctx.device]?.assignedTo ?? ''
}

function groupsTable(ctx: CommandContext, sam: string): string {
  const user = findUser(ctx.world, sam)
  const nb = netbiosDomain(ctx.world)

  const own = (user?.tokenGroups ?? []).map(name => {
    const g = findGroup(ctx.world, name)
    return [
      `${nb}\\${name}`,
      'Group',
      g ? groupSid(g) : '',
      DEFAULT_ATTRS,
    ]
  })

  const known = WELL_KNOWN.map(([name, type, sid]) => [name, type, sid, DEFAULT_ATTRS])

  return joinLines([
    '',
    'GROUP INFORMATION',
    '-----------------',
    '',
    row(['Group Name', 'Type', 'SID', 'Attributes']),
    row(COLUMNS.map(w => '='.repeat(w))),
    ...known.map(row),
    ...own.map(row),
    '',
  ])
}

function userTable(ctx: CommandContext, sam: string): string {
  const user = findUser(ctx.world, sam)
  const nb = netbiosDomain(ctx.world).toLowerCase()
  const widths = [COLUMNS[0]!, COLUMNS[2]!]

  const line = (cells: string[]) =>
    cells.map((c, i) => c.padEnd(widths[i] ?? 0)).join(' ')

  return joinLines([
    '',
    'USER INFORMATION',
    '----------------',
    '',
    line(['User Name', 'SID']),
    line(widths.map(w => '='.repeat(w))),
    line([`${nb}\\${sam}`, user ? userSid(user) : '']),
    '',
  ])
}

export const whoami: CommandHandler = (args, ctx) => {
  const sam = sessionUser(ctx)
  const key = (args[0] ?? '').toLowerCase()

  switch (key) {
    case '':
      return { stdout: `${netbiosDomain(ctx.world).toLowerCase()}\\${sam}`, exitCode: 0 }
    case '/groups':
      return { stdout: groupsTable(ctx, sam), exitCode: 0 }
    case '/user':
      return { stdout: userTable(ctx, sam), exitCode: 0 }
    default:
      return {
        stdout: `ERROR: Invalid argument/option - '${args[0]}'.` + '\r\n'
          + 'Type "WHOAMI /?" for usage.',
        exitCode: 1,
      }
  }
}
