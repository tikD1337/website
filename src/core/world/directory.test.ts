import { describe, it, expect } from 'vitest'
import { createWorld, cloneWorld } from './world'

/*
  Инварианты стартового каталога. Сид растёт с каждым сценарием, и
  ошибка в нём — не падение, а сценарий, который тихо ведёт себя не так:
  несогласованное членство, руководитель-призрак, машина без хозяина.
*/
const unique = (xs: string[]) => new Set(xs).size === xs.length

describe('стартовый каталог', () => {
  it('подразделения: один корень, пути уникальны, родители существуют, имя = первый сегмент', () => {
    const { ous } = createWorld().org
    const paths = new Set(ous.map(o => o.path))

    expect(unique(ous.map(o => o.path))).toBe(true)
    expect(ous.filter(o => o.parent === null).map(o => o.path)).toEqual(['OU=Corp'])
    for (const ou of ous) {
      if (ou.parent !== null) expect(paths.has(ou.parent), ou.path).toBe(true)
      expect(ou.path.startsWith(`OU=${ou.name}`), ou.path).toBe(true)
    }
  })

  it('учётки: уникальны, в своих подразделениях, исправны, руководители и машины существуют', () => {
    const w = createWorld()
    const paths = new Set(w.org.ous.map(x => x.path))
    const names = new Set(w.org.users.map(u => u.displayName))

    expect(unique(w.org.users.map(u => u.samAccountName))).toBe(true)
    for (const u of w.org.users) {
      const who = u.samAccountName
      expect(paths.has(u.ou), who).toBe(true)
      expect([u.enabled, u.lockedOut, u.lockoutSource, u.badPwdCount], who)
        .toEqual([true, false, null, 0])
      if (u.manager !== '') expect(names.has(u.manager), who).toBe(true)
      expect(u.manager, who).not.toBe(u.displayName)
      expect(w.devices[u.primaryDevice], who).toBeDefined()
    }
  })

  it('группы: уникальны, в своих подразделениях, членство согласовано с обеих сторон', () => {
    const { ous, groups, users } = createWorld().org
    const paths = new Set(ous.map(x => x.path))

    expect(unique(groups.map(g => g.name))).toBe(true)
    for (const g of groups) {
      expect(paths.has(g.ou), g.name).toBe(true)
      for (const m of g.members) {
        expect(users.find(u => u.samAccountName === m)?.groups, `${g.name} ↔ ${m}`)
          .toContain(g.name)
      }
    }
    for (const u of users) {
      for (const name of u.groups) {
        expect(groups.find(g => g.name === name)?.members, `${u.samAccountName} ↔ ${name}`)
          .toContain(u.samAccountName)
      }
    }
  })

  it('привилегированные группы помечены, и обычных сотрудников в них нет', () => {
    const { groups, users } = createWorld().org
    expect(groups.filter(g => g.protected).map(g => g.name))
      .toEqual(['Domain Admins', 'GRP-Helpdesk-T1'])
    for (const u of users.filter(x => x.ou.includes('OU=Employees'))) {
      expect(u.groups, u.samAccountName).not.toContain('Domain Admins')
      expect(u.groups, u.samAccountName).not.toContain('GRP-Helpdesk-T1')
    }
  })

  it('общие ресурсы: пути уникальны, группа доступа существует и ссылается на ресурс', () => {
    const { shares, groups } = createWorld().org
    expect(unique(shares.map(s => s.path))).toBe(true)
    for (const s of shares) {
      expect(groups.find(g => g.name === s.requiresGroup)?.grantsAccessTo, s.path)
        .toContain(s.path)
    }
  })

  /*
    Пул шире числа машин: иначе renew на второй машине выдал бы адрес,
    уже занятый первой, и получился бы конфликт из ничего.
  */
  it('адреса машин уникальны, а пул аренды не меньше числа машин', () => {
    const w = createWorld()
    const ips = Object.values(w.devices).map(d => d.adapters[0]!.ip)
    expect(unique(ips)).toBe(true)
    expect(w.network.segments.find(s => s.vlan === 'vlan20')!.leasePool.length)
      .toBeGreaterThanOrEqual(ips.length)
  })

  it('копия мира глубокая: правка копии не трогает оригинал', () => {
    const a = createWorld()
    const b = cloneWorld(a)
    b.org.users[0]!.lockedOut = true
    b.org.groups[0]!.members.push('кто-то')
    b.devices['AL-LPT-0447']!.services[0]!.status = 'stopped'
    b.devices['AL-LPT-0447']!.adapters[0]!.dns.push('9.9.9.9')
    b.devices['AL-LPT-0447']!.eventLog.pop()
    expect(a).toEqual(createWorld())
  })
})
