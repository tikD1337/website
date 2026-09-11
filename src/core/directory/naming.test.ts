import { describe, it, expect } from 'vitest'
import {
  dnsDomain, netbiosDomain, userDn, groupDn, userSid, groupSid, DOMAIN_SID,
} from './naming'
import { findUser, findGroup } from './accounts'
import { createWorld } from '../world/world'

const world = createWorld()

describe('имена домена', () => {
  it('различающееся имя разворачивается в DNS-имя', () => {
    expect(dnsDomain(world)).toBe('arcline.corp')
  })

  it('NetBIOS-имя — первая часть заглавными', () => {
    expect(netbiosDomain(world)).toBe('ARCLINE')
  })
})

describe('различающиеся имена объектов', () => {
  it('у пользователя собирается из CN, его OU и домена', () => {
    expect(userDn(world, findUser(world, 'p.raman')!))
      .toBe('CN=Priya Raman,OU=Sales,OU=Employees,OU=Corp,DC=arcline,DC=corp')
  })

  it('у группы — то же самое от её OU', () => {
    expect(groupDn(world, findGroup(world, 'GRP-Finance-Reports')!))
      .toBe('CN=GRP-Finance-Reports,OU=Security-Groups,OU=Groups,OU=Corp,DC=arcline,DC=corp')
  })

  it('привилегированная группа лежит в Tier0', () => {
    expect(groupDn(world, findGroup(world, 'Domain Admins')!))
      .toContain('OU=Tier0-Accounts,OU=Admin,OU=Corp')
  })
})

/*
  SID выводятся из имени, а не хранятся.

  Идентификатор должен быть одинаковым в каждом запуске, иначе вывод
  `whoami /groups` поплывёт между сессиями и техник решит, что что-то
  изменилось. Хранить их в seed значило бы дублировать то, что
  однозначно выводится из имени.
*/
describe('SID', () => {
  it('доменный SID имеет вид настоящего', () => {
    expect(DOMAIN_SID).toMatch(/^S-1-5-21-\d+-\d+-\d+$/)
  })

  it('SID пользователя начинается с доменного', () => {
    expect(userSid(findUser(world, 'p.raman')!).startsWith(DOMAIN_SID + '-')).toBe(true)
  })

  it('повторный вызов даёт тот же SID', () => {
    const u = findUser(world, 'p.raman')!
    expect(userSid(u)).toBe(userSid(u))
  })

  it('разные объекты получают разные SID', () => {
    const a = userSid(findUser(world, 'p.raman')!)
    const b = userSid(findUser(world, 's.okafor')!)
    expect(a).not.toBe(b)
  })

  it('у Domain Admins настоящий известный RID 512', () => {
    expect(groupSid(findGroup(world, 'Domain Admins')!)).toBe(`${DOMAIN_SID}-512`)
  })

  it('обычная группа получает RID из пользовательского диапазона', () => {
    const sid = groupSid(findGroup(world, 'GRP-All-Staff')!)
    const rid = Number(sid.slice(sid.lastIndexOf('-') + 1))
    expect(rid).toBeGreaterThanOrEqual(1000)
  })

  it('SID пользователя и группы с одинаковым именем не совпадают', () => {
    // разные пространства: пользователь и группа никогда не делят RID
    const users = world.org.users.map(userSid)
    const groups = world.org.groups.map(groupSid)
    expect(users.some(s => groups.includes(s))).toBe(false)
  })
})
