import { describe, it, expect, beforeEach } from 'vitest'
import { dsquery } from './dsquery'
import { whoami } from './whoami'
import { createWorld } from '../../world/world'
import { createSession } from '../../session/session'
import { groupSid, userSid, DOMAIN_SID } from '../../directory/naming'
import { findUser, findGroup, relogin } from '../../directory/accounts'
import type { CommandContext } from '../types'

const clock = { now: () => new Date('2026-09-10T11:00:00.000Z') }
const HOST = 'AL-LPT-0447'

let ctx: CommandContext

beforeEach(() => {
  ctx = { world: createWorld(), session: createSession(), clock, device: HOST }
})

const lines = (s: string) => s.split('\r\n').filter(Boolean)

describe('dsquery user', () => {
  it('печатает различающиеся имена в кавычках', () => {
    const r = dsquery(['user'], ctx)
    expect(r.exitCode).toBe(0)
    expect(r.stdout).toContain('"CN=Priya Raman,OU=Sales,OU=Employees,OU=Corp,DC=arcline,DC=corp"')
  })

  it('выводит по одному объекту в строке', () => {
    const r = dsquery(['user'], ctx)
    expect(lines(r.stdout)).toHaveLength(ctx.world.org.users.length)
  })

  /*
    Фильтр по подразделению — то, ради чего команду вообще открывают:
    «покажи всех в продажах» вместо перелистывания дерева мышью.
  */
  it('фильтрует по подразделению', () => {
    const r = dsquery(['user', 'OU=Sales,OU=Employees,OU=Corp,DC=arcline,DC=corp'], ctx)
    expect(lines(r.stdout)).toHaveLength(2)
    expect(r.stdout).toContain('Priya Raman')
    expect(r.stdout).toContain('Elena Varga')
    expect(r.stdout).not.toContain('Sam Okafor')
  })

  /*
    Считаем от мира, а не константой: жёсткое число падало от каждого
    нового человека в каталоге, ничего при этом не защищая. Проверяется
    правило — поиск по поддереву находит всех сотрудников и никого из
    административных учётных записей.
  */
  it('поиск по подразделению включает вложенные', () => {
    const r = dsquery(['user', 'OU=Employees,OU=Corp,DC=arcline,DC=corp'], ctx)
    const employees = ctx.world.org.users.filter(u => u.ou.includes('OU=Employees'))
    expect(lines(r.stdout)).toHaveLength(employees.length)
    expect(r.stdout).not.toContain('a.tier0')
  })

  it('ключ -name фильтрует по имени с подстановкой', () => {
    const r = dsquery(['user', '-name', 'Priya*'], ctx)
    expect(lines(r.stdout)).toHaveLength(1)
    expect(r.stdout).toContain('Priya Raman')
  })

  it('ключ -samid ищет по логину', () => {
    const r = dsquery(['user', '-samid', 's.okafor'], ctx)
    expect(lines(r.stdout)).toHaveLength(1)
  })

  it('ключ -o samid печатает логины вместо имён', () => {
    const r = dsquery(['user', '-o', 'samid'], ctx)
    expect(r.stdout).toContain('p.raman')
    expect(r.stdout).not.toContain('CN=')
  })

  it('ничего не найдено — пустой вывод и нулевой код', () => {
    const r = dsquery(['user', '-name', 'Такого-Нет*'], ctx)
    expect(r.stdout).toBe('')
    expect(r.exitCode).toBe(0)
  })

  it('несуществующее подразделение даёт ошибку', () => {
    const r = dsquery(['user', 'OU=Нет,DC=arcline,DC=corp'], ctx)
    expect(r.exitCode).toBe(1)
    expect(r.stdout).toContain('dsquery failed')
  })
})

describe('dsquery group', () => {
  it('печатает группы каталога', () => {
    const r = dsquery(['group'], ctx)
    expect(r.stdout).toContain('CN=GRP-All-Staff')
  })

  it('фильтрует по имени', () => {
    const r = dsquery(['group', '-name', 'GRP-Finance*'], ctx)
    expect(lines(r.stdout)).toHaveLength(1)
  })
})

describe('dsquery — разное', () => {
  it('без аргументов печатает подсказку', () => {
    const r = dsquery([], ctx)
    expect(r.exitCode).toBe(1)
    expect(r.stdout).toContain('dsquery')
  })

  it('неизвестный тип объекта даёт ошибку', () => {
    expect(dsquery(['wat'], ctx).exitCode).toBe(1)
  })
})

describe('whoami', () => {
  /*
    Удалёнка открыта в сеансе владельца машины, поэтому whoami
    показывает его, а не техника. Это важно: техник смотрит на права
    пользователя, а не на свои.
  */
  it('печатает домен и логин владельца машины строчными', () => {
    const r = whoami([], ctx)
    expect(r.stdout).toBe('arcline\\p.raman')
    expect(r.exitCode).toBe(0)
  })

  it('на другой машине показывает её владельца', () => {
    const r = whoami([], { ...ctx, device: 'AL-DSK-0192' })
    expect(r.stdout).toBe('arcline\\s.okafor')
  })
})

describe('whoami /groups', () => {
  it('печатает заголовок таблицы', () => {
    const r = whoami(['/groups'], ctx)
    expect(r.stdout).toContain('GROUP INFORMATION')
    expect(r.stdout).toContain('Group Name')
    expect(r.stdout).toContain('Attributes')
  })

  it('показывает группы пользователя с доменным префиксом', () => {
    const r = whoami(['/groups'], ctx)
    expect(r.stdout).toContain('ARCLINE\\GRP-All-Staff')
    expect(r.stdout).toContain('ARCLINE\\GRP-Sales-Contracts')
  })

  it('печатает SID группы', () => {
    const r = whoami(['/groups'], ctx)
    expect(r.stdout).toContain(groupSid(findGroup(ctx.world, 'GRP-All-Staff')!))
  })

  it('включает известные группы Windows', () => {
    const r = whoami(['/groups'], ctx)
    expect(r.stdout).toContain('Everyone')
    expect(r.stdout).toContain('S-1-1-0')
  })

  /*
    Печатается билет входа, а не карточка каталога.

    Это два разных факта, а не два источника одной истины: `net user`
    показывает, что записано в каталоге, `whoami /groups` — что попало
    в билет при входе в систему. Расхождение между ними и есть штатный
    способ диагностировать «добавил в группу, а доступа нет».
  */
  it('добавление в группу до повторного входа в билете не появляется', () => {
    findUser(ctx.world, 'p.raman')!.groups.push('GRP-Finance-Reports')
    expect(whoami(['/groups'], ctx).stdout).not.toContain('ARCLINE\\GRP-Finance-Reports')
  })

  it('после повторного входа появляется', () => {
    findUser(ctx.world, 'p.raman')!.groups.push('GRP-Finance-Reports')
    relogin(ctx.world, 'p.raman', clock)
    expect(whoami(['/groups'], ctx).stdout).toContain('ARCLINE\\GRP-Finance-Reports')
  })

  it('колонки выровнены по ширине заголовка', () => {
    const r = whoami(['/groups'], ctx)
    const rows = r.stdout.split('\r\n')
    const header = rows.find(l => l.startsWith('Group Name'))!
    const rule = rows.find(l => l.startsWith('='))!
    expect(rule.length).toBe(header.length)
  })
})

describe('whoami /user', () => {
  it('печатает SID пользователя', () => {
    const r = whoami(['/user'], ctx)
    expect(r.stdout).toContain(userSid(findUser(ctx.world, 'p.raman')!))
    expect(r.stdout).toContain(DOMAIN_SID)
  })

  it('печатает заголовок USER INFORMATION', () => {
    expect(whoami(['/user'], ctx).stdout).toContain('USER INFORMATION')
  })
})

describe('whoami — ошибки', () => {
  it('неизвестный ключ даёт ошибку', () => {
    const r = whoami(['/wat'], ctx)
    expect(r.exitCode).toBe(1)
    expect(r.stdout).toContain('ERROR:')
  })
})
