import { describe, it, expect, beforeEach } from 'vitest'
import { net } from './net'
import {
  setEnabled, addToGroup, removeFromGroup, findUser, resetPassword,
} from '../../directory/accounts'
import { createWorld } from '../../world/world'
import { createSession, setFlag } from '../../session/session'
import type { CommandContext } from '../types'
import type { SessionLog } from '../../session/types'

const clock = { now: () => new Date('2026-09-10T11:00:00.000Z') }
const HOST = 'AL-LPT-0447'

let ctx: CommandContext

function verified(session: SessionLog, sam: string) {
  setFlag(session, 'identityVerified', true)
  session.verifiedAccount = sam
}

beforeEach(() => {
  ctx = { world: createWorld(), session: createSession(), clock, device: HOST }
})

const text = (...lines: string[]) => lines.join('\r\n')
const line = (stdout: string, label: string) =>
  stdout.split('\r\n').find(l => l.startsWith(label))

/*
  Эталоны сняты с формата живой Windows: у карточки пользователя метка
  занимает 29 символов и значение начинается с тридцатой позиции,
  двоеточий нет; у карточки группы метка — 15 символов; список
  пользователей — по три имени в колонках по 25; членство — со
  звёздочкой, по два имени в строке, продолжение выровнено под значение.
*/
describe('вывод', () => {
  it('net user — список пользователей домена', () => {
    expect(net(['USER'], ctx)).toEqual({
      exitCode: 0,
      stdout: text(
        '',
        'User accounts for \\\\arcline.corp',
        '',
        '-'.repeat(79),
        'a.osei                   a.tier0                  d.mbeki                  ',
        'e.varga                  k.novak                  n.haruna                 ',
        'p.raman                  r.alvarez                s.okafor                 ',
        't.lindqvist              ',
        'The command completed successfully.',
        '',
      ),
    })
  })

  it('net user <имя> — карточка пользователя', () => {
    expect(net(['user', 'P.RAMAN'], ctx)).toEqual({
      exitCode: 0,
      stdout: text(
        'User name                    p.raman',
        'Full Name                    Priya Raman',
        'Comment                      менеджер по работе с клиентами',
        'User\'s comment               ',
        'Country/region code          000 (System Default)',
        'Account active               Yes',
        'Account expires              Never',
        '',
        'Password last set            01.07.2026 09:00:00',
        'Password expires             Never',
        'Password changeable          01.07.2026 09:00:00',
        'Password required            Yes',
        'User may change password     Yes',
        '',
        'Workstations allowed         All',
        'Logon script                 ',
        'User profile                 ',
        'Home directory               \\\\fileserver.arcline.corp\\p.raman',
        // Последний вход — отдельное поле, а не копия смены пароля: по
        // нему отличают «не может войти со вчера» от «не входил с отпуска».
        'Last logon                   09.09.2026 17:42:11',
        '',
        'Logon hours allowed          All',
        '',
        'Local Group Memberships      ',
        'Global Group memberships     *GRP-All-Staff        *GRP-Sales-Contracts  ',
        '                             *GRP-Printer-Floor3   ',
        'The command completed successfully.',
        '',
      ),
    })
  })

  /*
    Блокировка печатается в поле Account active — отдельного поля у
    настоящего net user нет. Техник должен научиться читать её там, где
    она реально печатается.
  */
  it('карточка отражает состояние учётки', () => {
    const u = findUser(ctx.world, 'p.raman')!

    u.enabled = false
    expect(line(net(['user', 'p.raman'], ctx).stdout, 'Account active'))
      .toBe('Account active               No')

    u.enabled = true
    u.lockedOut = true
    expect(line(net(['user', 'p.raman'], ctx).stdout, 'Account active'))
      .toBe('Account active               Locked')

    u.pwdExpired = true
    expect(line(net(['user', 'p.raman'], ctx).stdout, 'Password expires'))
      .toBe('Password expires             Expired')
  })

  it('net group — список и карточка группы', () => {
    expect(net(['group'], ctx).stdout).toBe(text(
      '',
      'Group Accounts for \\\\arcline.corp',
      '',
      '-'.repeat(79),
      '*Domain Admins',
      '*GRP-All-Staff',
      '*GRP-Finance-Reports',
      '*GRP-Helpdesk-T1',
      '*GRP-Printer-Floor3',
      '*GRP-Sales-Contracts',
      'The command completed successfully.',
      '',
    ))

    expect(net(['group', 'GRP-Finance-Reports'], ctx).stdout).toBe(text(
      'Group name     GRP-Finance-Reports',
      'Comment        Доступ к финансовой отчётности',
      '',
      'Members',
      '',
      '-'.repeat(79),
      's.okafor',
      'The command completed successfully.',
      '',
    ))

    // Имя с пробелом приходит одним аргументом — кавычки снимает разбор строки.
    expect(line(net(['group', 'Domain Admins'], ctx).stdout, 'Group name'))
      .toBe('Group name     Domain Admins')
  })

  /*
    Локальные администраторы машины — не формальность: именно туда
    просят добавить, когда «программа не ставится». Состав виден, чтобы
    техник мог сверить просьбу с тем, что уже есть.
  */
  it('net localgroup — псевдонимы машины и состав администраторов', () => {
    expect(net(['localgroup'], ctx).stdout).toBe(text(
      '',
      'Aliases for \\\\AL-LPT-0447',
      '',
      '-'.repeat(79),
      '*Administrators',
      '*Backup Operators',
      '*Event Log Readers',
      '*Performance Log Users',
      '*Remote Desktop Users',
      '*Users',
      'The command completed successfully.',
      '',
    ))

    expect(net(['localgroup', 'Administrators'], ctx).stdout).toBe(text(
      'Alias name     Administrators',
      'Comment        Administrators have complete and unrestricted access to the computer',
      '',
      'Members',
      '',
      '-'.repeat(79),
      'ARCLINE\\Domain Admins',
      'Administrator',
      'The command completed successfully.',
      '',
    ))
  })

  it('ошибки: номер справки у ненайденного, синтаксис у непонятого', () => {
    const notFound: Array<[string[], string, number]> = [
      [['user', 'нет.такого'], 'The user name could not be found.', 2221],
      [['group', 'GRP-Нет'], 'The group name could not be found.', 2220],
      [['localgroup', 'Нет-такой'], 'The specified local group does not exist.', 1376],
    ]
    for (const [args, message, helpmsg] of notFound) {
      expect(net(args, ctx), args.join(' ')).toEqual({
        exitCode: 1,
        stdout: text(message, '', `More help is available by typing NET HELPMSG ${helpmsg}.`, ''),
      })
    }

    for (const args of [[], ['wat'], ['user', 'p.raman', '/active:maybe']]) {
      const r = net(args, ctx)
      expect(r.exitCode, args.join(' ')).toBe(1)
      expect(r.stdout.startsWith('The syntax of this command is:'), args.join(' ')).toBe(true)
    }
  })
})

describe('изменения', () => {
  it('/active переключает учётку в обе стороны', () => {
    verified(ctx.session, 'p.raman')
    const off = net(['user', 'p.raman', '/active:no'], ctx)
    expect(off).toEqual({ exitCode: 0, stdout: 'The command completed successfully.\r\n' })
    expect(findUser(ctx.world, 'p.raman')!.enabled).toBe(false)

    net(['user', 'p.raman', '/active:yes'], ctx)
    expect(findUser(ctx.world, 'p.raman')!.enabled).toBe(true)
  })

  /*
    Привилегированная группа — отказ, а не пометка. Через команду это
    так же честно, как через консоль: иначе терминал стал бы обходным
    путём.
  */
  it('добавление в привилегированную группу — Access is denied', () => {
    verified(ctx.session, 'p.raman')
    const r = net(['group', 'Domain Admins', 'p.raman', '/add'], ctx)
    expect(r.exitCode).toBe(1)
    expect(r.stdout).toContain('Access is denied.')
    expect(findUser(ctx.world, 'p.raman')!.groups).not.toContain('Domain Admins')
  })
})

/**
 * Обязательный тест: окно и команда — представления одной операции.
 * Если они разойдутся, связность мира перестанет быть правдой, а
 * именно она — смысл проекта. Сравнивается всё, что видит оценка:
 * каталог, журнал изменений и опасные действия.
 */
describe('команда и операция неотличимы', () => {
  type Case = {
    name: string
    verifiedAs?: string
    args: string[]
    op: (w: ReturnType<typeof createWorld>, s: SessionLog) => void
  }

  const cases: Case[] = [
    {
      name: 'net user /active:no ≡ setEnabled',
      verifiedAs: 'p.raman',
      args: ['user', 'p.raman', '/active:no'],
      op: (w, s) => setEnabled(w, 'p.raman', false, s, clock),
    },
    {
      name: 'net group /add ≡ addToGroup',
      verifiedAs: 'e.varga',
      args: ['group', 'GRP-Sales-Contracts', 'e.varga', '/add'],
      op: (w, s) => addToGroup(w, 'e.varga', 'GRP-Sales-Contracts', s, clock),
    },
    {
      name: 'net group /delete ≡ removeFromGroup',
      verifiedAs: 'p.raman',
      args: ['group', 'GRP-Sales-Contracts', 'p.raman', '/delete'],
      op: (w, s) => removeFromGroup(w, 'p.raman', 'GRP-Sales-Contracts', s, clock),
    },
    {
      // Без сверки: сброс проходит и записывается инцидентом — и там, и там.
      name: 'net user <имя> <пароль> без сверки ≡ resetPassword',
      args: ['user', 'p.raman', 'Новый-пароль-1'],
      op: (w, s) => resetPassword(w, 'p.raman', s, clock),
    },
    {
      name: 'net user <имя> <пароль> со сверкой ≡ resetPassword',
      verifiedAs: 'p.raman',
      args: ['user', 'p.raman', 'Новый-пароль-1'],
      op: (w, s) => resetPassword(w, 'p.raman', s, clock),
    },
  ]

  it('каталог, журнал и опасные действия совпадают', () => {
    for (const { name, verifiedAs, args, op } of cases) {
      const viaCommand: CommandContext = {
        world: createWorld(), session: createSession(), clock, device: HOST,
      }
      const viaOp = { world: createWorld(), session: createSession() }
      if (verifiedAs) {
        verified(viaCommand.session, verifiedAs)
        verified(viaOp.session, verifiedAs)
      }

      net(args, viaCommand)
      op(viaOp.world, viaOp.session)

      expect(viaCommand.world.org, name).toEqual(viaOp.world.org)
      expect(viaCommand.session.changes, name).toEqual(viaOp.session.changes)
      expect(viaCommand.session.changes, name).toHaveLength(1)
      expect(viaCommand.session.flags.dangerousActions, name)
        .toEqual(viaOp.session.flags.dangerousActions)
    }
  })
})
