import { describe, it, expect } from 'vitest'
import {
  dnsDomain, netbiosDomain, userDn, groupDn, userSid, groupSid, DOMAIN_SID,
} from './naming'
import { findUser, findGroup } from './accounts'
import { createWorld } from '../world/world'

const world = createWorld()

describe('имена каталога', () => {
  it('имена домена и различающиеся имена объектов', () => {
    expect(dnsDomain(world)).toBe('arcline.corp')
    expect(netbiosDomain(world)).toBe('ARCLINE')
    expect(userDn(world, findUser(world, 'p.raman')!))
      .toBe('CN=Priya Raman,OU=Sales,OU=Employees,OU=Corp,DC=arcline,DC=corp')
    expect(groupDn(world, findGroup(world, 'Domain Admins')!))
      .toBe('CN=Domain Admins,OU=Tier0-Accounts,OU=Admin,OU=Corp,DC=arcline,DC=corp')
  })

  /*
    SID выводятся из имени, а не хранятся: идентификатор одинаков в
    каждом запуске, иначе `whoami /groups` поплывёт между сессиями и
    техник решит, что что-то изменилось.
  */
  it('SID: вид настоящего, устойчивы, уникальны, у Domain Admins — известный RID 512', () => {
    expect(DOMAIN_SID).toMatch(/^S-1-5-21-\d+-\d+-\d+$/)
    expect(userSid(findUser(world, 'p.raman')!)).toBe(`${DOMAIN_SID}-1397`)
    expect(groupSid(findGroup(world, 'Domain Admins')!)).toBe(`${DOMAIN_SID}-512`)

    const all = [...world.org.users.map(userSid), ...world.org.groups.map(groupSid)]
    expect(new Set(all).size).toBe(all.length)
    for (const sid of all.filter(x => !x.endsWith('-512'))) {
      expect(Number(sid.slice(sid.lastIndexOf('-') + 1)), sid).toBeGreaterThanOrEqual(1000)
    }
  })
})
