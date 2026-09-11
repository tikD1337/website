import { describe, it, expect, beforeEach } from 'vitest'
import { net } from './net'
import { setEnabled, addToGroup, findUser, findGroup, resetPassword } from '../../directory/accounts'
import { createWorld } from '../../world/world'
import { createSession, setFlag } from '../../session/session'
import type { CommandContext } from '../types'

const clock = { now: () => new Date('2026-09-10T11:00:00.000Z') }
const HOST = 'AL-LPT-0447'

let ctx: CommandContext

/** Сверка относится к конкретной учётке, поэтому флага мало. */
function verifiedFor(sam: string) {
  setFlag(ctx.session, 'identityVerified', true)
  ctx.session.verifiedAccount = sam
}

beforeEach(() => {
  ctx = {
    world: createWorld(),
    session: createSession(),
    clock,
    device: HOST,
  }
})

const lines = (s: string) => s.split('\r\n')
const find = (s: string, label: string) =>
  lines(s).find(l => l.startsWith(label))

describe('net user — список', () => {
  it('печатает заголовок с именем домена', () => {
    const r = net(['user'], ctx)
    expect(r.exitCode).toBe(0)
    expect(lines(r.stdout)[1]).toBe('User accounts for \\\\arcline.corp')
  })

  it('отделяет список чертой в 79 символов', () => {
    const r = net(['user'], ctx)
    expect(lines(r.stdout)[3]).toBe('-'.repeat(79))
  })

  it('перечисляет всех пользователей каталога', () => {
    const r = net(['user'], ctx)
    for (const u of ctx.world.org.users) {
      expect(r.stdout).toContain(u.samAccountName)
    }
  })

  it('раскладывает по три в строку по 25 символов', () => {
    const r = net(['user'], ctx)
    const row = lines(r.stdout)[4]!
    expect(row.length).toBe(75)
    expect(row.slice(0, 25)).toBe('a.tier0'.padEnd(25))
  })

  it('заканчивается строкой об успехе', () => {
    const r = net(['user'], ctx)
    expect(r.stdout).toContain('The command completed successfully.')
  })
})

describe('net user <имя> — карточка', () => {
  it('метка занимает 29 символов, значение начинается с 30-й позиции', () => {
    const r = net(['user', 'p.raman'], ctx)
    const line = find(r.stdout, 'User name')!
    expect(line.indexOf('p.raman')).toBe(29)
  })

  it('печатает полное имя', () => {
    const r = net(['user', 'p.raman'], ctx)
    expect(find(r.stdout, 'Full Name')).toBe('Full Name'.padEnd(29) + 'Priya Raman')
  })

  it('активная учётная запись — Yes', () => {
    const r = net(['user', 'p.raman'], ctx)
    expect(find(r.stdout, 'Account active')).toBe('Account active'.padEnd(29) + 'Yes')
  })

  it('отключённая учётная запись — No', () => {
    findUser(ctx.world, 'p.raman')!.enabled = false
    const r = net(['user', 'p.raman'], ctx)
    expect(find(r.stdout, 'Account active')).toBe('Account active'.padEnd(29) + 'No')
  })

  /*
    Заблокированная учётка показывает Locked именно в поле Account
    active — отдельного поля у настоящего net user нет. Техник должен
    научиться читать блокировку там, где она реально печатается.
  */
  it('заблокированная учётная запись — Locked', () => {
    findUser(ctx.world, 'p.raman')!.lockedOut = true
    const r = net(['user', 'p.raman'], ctx)
    expect(find(r.stdout, 'Account active')).toBe('Account active'.padEnd(29) + 'Locked')
  })

  it('дата последней смены пароля печатается в формате Windows', () => {
    const r = net(['user', 'p.raman'], ctx)
    expect(find(r.stdout, 'Password last set'))
      .toBe('Password last set'.padEnd(29) + '01.07.2026 09:00:00')
  })

  /*
    Последний вход — отдельное поле, а не копия смены пароля.

    По нему техник отличает «не может войти со вчера» от «не входил
    с отпуска», и в сценарии с блокировкой смотрят именно сюда.
  */
  it('последний вход не совпадает со сменой пароля', () => {
    const r = net(['user', 'p.raman'], ctx)
    expect(find(r.stdout, 'Last logon')).toBe('Last logon'.padEnd(29) + '09.09.2026 17:42:11')
  })

  it('истёкший пароль виден в поле Password expires', () => {
    findUser(ctx.world, 'p.raman')!.pwdExpired = true
    const r = net(['user', 'p.raman'], ctx)
    expect(find(r.stdout, 'Password expires')).toContain('Expired')
  })

  it('членство в группах печатается со звёздочкой', () => {
    const r = net(['user', 'p.raman'], ctx)
    const line = find(r.stdout, 'Global Group memberships')!
    expect(line).toContain('*GRP-All-Staff')
    expect(line).toContain('*GRP-Sales-Contracts')
  })

  it('группы переносятся по две в строку с выравниванием', () => {
    const r = net(['user', 'p.raman'], ctx)
    const idx = lines(r.stdout).findIndex(l => l.startsWith('Global Group memberships'))
    // у p.raman три группы: вторая строка — продолжение с отступом 29
    const cont = lines(r.stdout)[idx + 1]!
    expect(cont.slice(0, 29)).toBe(' '.repeat(29))
    expect(cont.trim().startsWith('*')).toBe(true)
  })

  it('регистр логина значения не имеет', () => {
    expect(net(['user', 'P.RAMAN'], ctx).exitCode).toBe(0)
  })

  it('неизвестный пользователь даёт ошибку 2221', () => {
    const r = net(['user', 'нет.такого'], ctx)
    expect(r.exitCode).toBe(1)
    expect(r.stdout).toContain('The user name could not be found.')
    expect(r.stdout).toContain('NET HELPMSG 2221')
  })
})

describe('net user /active', () => {
  beforeEach(() => verifiedFor('p.raman'))

  it('отключает учётную запись', () => {
    const r = net(['user', 'p.raman', '/active:no'], ctx)
    expect(r.exitCode).toBe(0)
    expect(findUser(ctx.world, 'p.raman')!.enabled).toBe(false)
  })

  it('включает обратно', () => {
    findUser(ctx.world, 'p.raman')!.enabled = false
    net(['user', 'p.raman', '/active:yes'], ctx)
    expect(findUser(ctx.world, 'p.raman')!.enabled).toBe(true)
  })

  it('отвечает строкой об успехе', () => {
    expect(net(['user', 'p.raman', '/active:no'], ctx).stdout)
      .toContain('The command completed successfully.')
  })

  it('неизвестное значение ключа даёт ошибку синтаксиса', () => {
    const r = net(['user', 'p.raman', '/active:maybe'], ctx)
    expect(r.exitCode).toBe(1)
    expect(r.stdout).toContain('The syntax of this command is:')
  })
})

/**
 * Обязательный тест среза: окно и команда — представления одной
 * операции. Если они разойдутся, связность мира перестанет быть
 * правдой, а именно она — смысл проекта.
 */
describe('команда и операция неотличимы', () => {
  it('net user /active:no и setEnabled дают одинаковый каталог', () => {
    const viaCommand: CommandContext = {
      world: createWorld(), session: createSession(), clock, device: HOST,
    }
    setFlag(viaCommand.session, 'identityVerified', true)
    viaCommand.session.verifiedAccount = 'p.raman'
    net(['user', 'p.raman', '/active:no'], viaCommand)

    const viaOperation = createWorld()
    const s2 = createSession()
    setFlag(s2, 'identityVerified', true)
    s2.verifiedAccount = 'p.raman'
    setEnabled(viaOperation, 'p.raman', false, s2, clock)

    expect(viaCommand.world.org).toEqual(viaOperation.org)
  })

  it('оба пути пишут одинаковое изменение в журнал', () => {
    const s1 = createSession()
    setFlag(s1, 'identityVerified', true)
    s1.verifiedAccount = 'p.raman'
    net(['user', 'p.raman', '/active:no'],
      { world: createWorld(), session: s1, clock, device: HOST })

    const s2 = createSession()
    setFlag(s2, 'identityVerified', true)
    s2.verifiedAccount = 'p.raman'
    setEnabled(createWorld(), 'p.raman', false, s2, clock)

    expect(s1.changes).toEqual(s2.changes)
  })

  it('net group /add и addToGroup дают одинаковый каталог', () => {
    const viaCommand: CommandContext = {
      world: createWorld(), session: createSession(), clock, device: HOST,
    }
    setFlag(viaCommand.session, 'identityVerified', true)
    viaCommand.session.verifiedAccount = 'e.varga'
    net(['group', 'GRP-Sales-Contracts', 'e.varga', '/add'], viaCommand)

    const viaOperation = createWorld()
    const s2 = createSession()
    setFlag(s2, 'identityVerified', true)
    s2.verifiedAccount = 'e.varga'
    addToGroup(viaOperation, 'e.varga', 'GRP-Sales-Contracts', s2, clock)

    expect(viaCommand.world.org).toEqual(viaOperation.org)
  })

  it('сброс пароля через net user неотличим от resetPassword', () => {
    const viaCommand: CommandContext = {
      world: createWorld(), session: createSession(), clock, device: HOST,
    }
    net(['user', 'p.raman', 'Новый-пароль-1'], viaCommand)

    const viaOperation = createWorld()
    resetPassword(viaOperation, 'p.raman', createSession(), clock)

    expect(viaCommand.world.org).toEqual(viaOperation.org)
  })
})

describe('net user <имя> <пароль> — сброс', () => {
  it('меняет отметку времени пароля', () => {
    const before = findUser(ctx.world, 'p.raman')!.pwdLastSet
    net(['user', 'p.raman', 'Пароль-1'], ctx)
    expect(findUser(ctx.world, 'p.raman')!.pwdLastSet).not.toBe(before)
  })

  /*
    Без сверки личности сброс проходит и записывается инцидентом —
    решение среза. Команда обязана вести себя ровно как консоль.
  */
  it('без сверки личности проходит, но попадает в опасные действия', () => {
    const r = net(['user', 'p.raman', 'Пароль-1'], ctx)
    expect(r.exitCode).toBe(0)
    expect(ctx.session.flags.dangerousActions).toHaveLength(1)
  })

  it('со сверкой опасным действием не считается', () => {
    verifiedFor('p.raman')
    net(['user', 'p.raman', 'Пароль-1'], ctx)
    expect(ctx.session.flags.dangerousActions).toHaveLength(0)
  })
})

describe('net group', () => {
  it('без аргументов печатает группы домена', () => {
    const r = net(['group'], ctx)
    expect(r.exitCode).toBe(0)
    expect(lines(r.stdout)[1]).toBe('Group Accounts for \\\\arcline.corp')
    expect(r.stdout).toContain('*GRP-All-Staff')
  })

  it('карточка группы печатает имя, описание и членов', () => {
    const r = net(['group', 'GRP-Finance-Reports'], ctx)
    expect(find(r.stdout, 'Group name')).toBe('Group name'.padEnd(15) + 'GRP-Finance-Reports')
    expect(find(r.stdout, 'Comment')).toBe('Comment'.padEnd(15) + 'Доступ к финансовой отчётности')
    expect(r.stdout).toContain('Members')
    expect(r.stdout).toContain('s.okafor')
  })

  it('добавляет в группу', () => {
    verifiedFor('e.varga')
    const r = net(['group', 'GRP-Finance-Reports', 'e.varga', '/add'], ctx)
    expect(r.exitCode).toBe(0)
    expect(findGroup(ctx.world, 'GRP-Finance-Reports')!.members).toContain('e.varga')
  })

  it('исключает из группы', () => {
    verifiedFor('p.raman')
    net(['group', 'GRP-Sales-Contracts', 'p.raman', '/delete'], ctx)
    expect(findUser(ctx.world, 'p.raman')!.groups).not.toContain('GRP-Sales-Contracts')
  })

  /*
    Привилегированная группа — отказ, а не пометка. Через команду это
    должно быть так же честно, как через консоль: иначе терминал
    становится обходным путём.
  */
  it('добавление в привилегированную группу отклоняется с Access is denied', () => {
    verifiedFor('p.raman')
    const r = net(['group', 'Domain Admins', 'p.raman', '/add'], ctx)
    expect(r.exitCode).toBe(1)
    expect(r.stdout).toContain('Access is denied.')
    expect(findUser(ctx.world, 'p.raman')!.groups).not.toContain('Domain Admins')
  })

  it('кавычки позволяют назвать группу с пробелом', () => {
    const r = net(['group', 'Domain Admins'], ctx)
    expect(r.exitCode).toBe(0)
    expect(find(r.stdout, 'Group name')).toContain('Domain Admins')
  })

  it('неизвестная группа даёт ошибку 2220', () => {
    const r = net(['group', 'GRP-Нет'], ctx)
    expect(r.exitCode).toBe(1)
    expect(r.stdout).toContain('The group name could not be found.')
    expect(r.stdout).toContain('NET HELPMSG 2220')
  })
})

describe('net localgroup', () => {
  it('печатает псевдонимы машины', () => {
    const r = net(['localgroup'], ctx)
    expect(lines(r.stdout)[1]).toBe(`Aliases for \\\\${HOST}`)
  })

  it('карточка псевдонима печатает Alias name', () => {
    const r = net(['localgroup', 'Administrators'], ctx)
    expect(find(r.stdout, 'Alias name')).toBe('Alias name'.padEnd(15) + 'Administrators')
  })

  /*
    Локальные администраторы машины — не пустая формальность: именно
    туда просят добавить, когда «программа не ставится». Состав виден,
    чтобы техник мог сверить просьбу с тем, что уже есть.
  */
  it('в локальных администраторах видны доменные админы', () => {
    const r = net(['localgroup', 'Administrators'], ctx)
    expect(r.stdout).toContain('ARCLINE\\Domain Admins')
  })

  it('неизвестный псевдоним даёт ошибку 1376', () => {
    const r = net(['localgroup', 'Нет-такой'], ctx)
    expect(r.exitCode).toBe(1)
    expect(r.stdout).toContain('The specified local group does not exist.')
  })
})

describe('net — разное', () => {
  it('без аргументов печатает синтаксис', () => {
    const r = net([], ctx)
    expect(r.exitCode).toBe(1)
    expect(r.stdout).toContain('The syntax of this command is:')
  })

  it('неизвестная подкоманда печатает синтаксис', () => {
    expect(net(['wat'], ctx).exitCode).toBe(1)
  })

  it('регистр подкоманды значения не имеет', () => {
    expect(net(['USER'], ctx).exitCode).toBe(0)
  })
})
