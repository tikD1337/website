import { describe, it, expect, beforeEach } from 'vitest'
import { dsquery } from './dsquery'
import { whoami } from './whoami'
import { createWorld } from '../../world/world'
import { createSession } from '../../session/session'
import { findUser, relogin } from '../../directory/accounts'
import type { CommandContext } from '../types'

const clock = { now: () => new Date('2026-09-10T11:00:00.000Z') }
const HOST = 'AL-LPT-0447'

let ctx: CommandContext

beforeEach(() => {
  ctx = { world: createWorld(), session: createSession(), clock, device: HOST }
})

const out = (...lines: string[]) => lines.map(l => l + '\r\n').join('')
const DC = 'DC=arcline,DC=corp'

describe('dsquery', () => {
  it('user и group — различающиеся имена в кавычках, по одному в строке', () => {
    expect(dsquery(['user'], ctx)).toEqual({
      exitCode: 0,
      stdout: out(
        `"CN=Priya Raman,OU=Sales,OU=Employees,OU=Corp,${DC}"`,
        `"CN=Sam Okafor,OU=Finance,OU=Employees,OU=Corp,${DC}"`,
        `"CN=Elena Varga,OU=Sales,OU=Employees,OU=Corp,${DC}"`,
        `"CN=Dumisani Mbeki,OU=Operations,OU=Employees,OU=Corp,${DC}"`,
        `"CN=Nadia Haruna,OU=Finance,OU=Employees,OU=Corp,${DC}"`,
        `"CN=Tomas Lindqvist,OU=Operations,OU=Employees,OU=Corp,${DC}"`,
        `"CN=Katarina Novak,OU=Finance,OU=Employees,OU=Corp,${DC}"`,
        `"CN=Rafael Alvarez,OU=Operations,OU=Employees,OU=Corp,${DC}"`,
        `"CN=Ama Osei,OU=Sales,OU=Employees,OU=Corp,${DC}"`,
        `"CN=Домен, административная учётная запись,OU=Tier0-Accounts,OU=Admin,OU=Corp,${DC}"`,
      ),
    })

    expect(dsquery(['group'], ctx).stdout).toBe(out(
      `"CN=GRP-All-Staff,OU=Security-Groups,OU=Groups,OU=Corp,${DC}"`,
      `"CN=GRP-Sales-Contracts,OU=Security-Groups,OU=Groups,OU=Corp,${DC}"`,
      `"CN=GRP-Finance-Reports,OU=Security-Groups,OU=Groups,OU=Corp,${DC}"`,
      `"CN=GRP-Printer-Floor3,OU=Security-Groups,OU=Groups,OU=Corp,${DC}"`,
      `"CN=Domain Admins,OU=Tier0-Accounts,OU=Admin,OU=Corp,${DC}"`,
      `"CN=GRP-Helpdesk-T1,OU=Helpdesk-Accounts,OU=Admin,OU=Corp,${DC}"`,
    ))
  })

  /*
    Фильтр по подразделению — то, ради чего команду вообще открывают:
    «покажи всех в продажах» вместо перелистывания дерева мышью. Поиск
    по поддереву включает вложенные подразделения, но не
    административные учётки.
  */
  it('фильтры: подразделение с поддеревом, -name с подстановкой, -samid, -o samid', () => {
    const q = (...args: string[]) => dsquery(args, ctx).stdout

    expect(q('user', `OU=Sales,OU=Employees,OU=Corp,${DC}`)).toBe(out(
      `"CN=Priya Raman,OU=Sales,OU=Employees,OU=Corp,${DC}"`,
      `"CN=Elena Varga,OU=Sales,OU=Employees,OU=Corp,${DC}"`,
      `"CN=Ama Osei,OU=Sales,OU=Employees,OU=Corp,${DC}"`,
    ))
    expect(q('user', `OU=Employees,OU=Corp,${DC}`, '-o', 'samid')).toBe(out(
      'p.raman', 's.okafor', 'e.varga', 'd.mbeki', 'n.haruna', 't.lindqvist', 'k.novak', 'r.alvarez', 'a.osei',
    ))
    expect(q('user', '-name', 'Priya*'))
      .toBe(out(`"CN=Priya Raman,OU=Sales,OU=Employees,OU=Corp,${DC}"`))
    expect(q('user', '-samid', 's.okafor'))
      .toBe(out(`"CN=Sam Okafor,OU=Finance,OU=Employees,OU=Corp,${DC}"`))
    expect(q('group', '-name', 'GRP-Finance*'))
      .toBe(out(`"CN=GRP-Finance-Reports,OU=Security-Groups,OU=Groups,OU=Corp,${DC}"`))
    expect(dsquery(['user', '-name', 'Такого-Нет*'], ctx)).toEqual({ exitCode: 0, stdout: '' })
  })

  it('ошибки: нет подразделения, нет аргументов, неизвестный тип', () => {
    expect(dsquery(['user', `OU=Нет,${DC}`], ctx))
      .toEqual({ exitCode: 1, stdout: 'dsquery failed:Directory object not found.' })
    for (const args of [[], ['wat']]) {
      const r = dsquery(args, ctx)
      expect(r.exitCode, args.join(' ')).toBe(1)
      expect(r.stdout, args.join(' ')).toContain('Syntax: dsquery user')
    }
  })
})

/** Строка таблицы whoami: колонки 68/16/108/50, сверено с живой Windows. */
const row = (...cells: string[]) =>
  cells.map((c, i) => c.padEnd([68, 16, 108, 50][i]!)).join(' ')
const ENABLED = 'Mandatory group, Enabled by default, Enabled group'
const SID = 'S-1-5-21-1284937461-2089553178-3417229640'

describe('whoami', () => {
  /*
    Удалёнка открыта в сеансе владельца машины, поэтому whoami
    показывает его, а не техника: техник смотрит на права пользователя,
    а не на свои.
  */
  it('печатает владельца машины', () => {
    expect(whoami([], ctx)).toEqual({ exitCode: 0, stdout: 'arcline\\p.raman' })
    expect(whoami([], { ...ctx, device: 'AL-DSK-0192' }).stdout).toBe('arcline\\s.okafor')
  })

  it('/user и /groups — таблицы с SID', () => {
    expect(whoami(['/user'], ctx).stdout).toBe(out(
      '',
      'USER INFORMATION',
      '----------------',
      '',
      'User Name'.padEnd(68) + ' ' + 'SID'.padEnd(108),
      '='.repeat(68) + ' ' + '='.repeat(108),
      'arcline\\p.raman'.padEnd(68) + ' ' + `${SID}-1397`.padEnd(108),
    ))

    expect(whoami(['/groups'], ctx).stdout).toBe(out(
      '',
      'GROUP INFORMATION',
      '-----------------',
      '',
      row('Group Name', 'Type', 'SID', 'Attributes'),
      row('='.repeat(68), '='.repeat(16), '='.repeat(108), '='.repeat(50)),
      row('Everyone', 'Well-known group', 'S-1-1-0', ENABLED),
      row('BUILTIN\\Users', 'Alias', 'S-1-5-32-545', ENABLED),
      row('NT AUTHORITY\\INTERACTIVE', 'Well-known group', 'S-1-5-4', ENABLED),
      row('NT AUTHORITY\\Authenticated Users', 'Well-known group', 'S-1-5-11', ENABLED),
      row('NT AUTHORITY\\This Organization', 'Well-known group', 'S-1-5-15', ENABLED),
      row('ARCLINE\\GRP-All-Staff', 'Group', `${SID}-6068`, ENABLED),
      row('ARCLINE\\GRP-Sales-Contracts', 'Group', `${SID}-5888`, ENABLED),
      row('ARCLINE\\GRP-Printer-Floor3', 'Group', `${SID}-7242`, ENABLED),
    ))
  })

  /*
    Печатается билет входа, а не карточка каталога. `net user`
    показывает, что записано в каталоге, `whoami /groups` — что попало
    в билет при входе. Расхождение между ними и есть штатный способ
    диагностировать «добавил в группу, а доступа нет».
  */
  it('/groups показывает группу только после повторного входа', () => {
    findUser(ctx.world, 'p.raman')!.groups.push('GRP-Finance-Reports')
    expect(whoami(['/groups'], ctx).stdout).not.toContain('ARCLINE\\GRP-Finance-Reports')

    relogin(ctx.world, 'p.raman', clock)
    expect(whoami(['/groups'], ctx).stdout).toContain('ARCLINE\\GRP-Finance-Reports')
  })

  it('неизвестный ключ — ошибка', () => {
    const r = whoami(['/wat'], ctx)
    expect(r.exitCode).toBe(1)
    expect(r.stdout).toContain('ERROR:')
  })
})
