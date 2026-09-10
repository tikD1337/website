import { describe, it, expect } from 'vitest'
import { createWorld, cloneWorld } from './world'

const org = () => createWorld().org

describe('дерево подразделений', () => {
  it('непустое и содержит ожидаемые ветви', () => {
    const paths = org().ous.map(o => o.path)
    expect(paths).toContain('OU=Corp')
    expect(paths).toContain('OU=Employees,OU=Corp')
    expect(paths).toContain('OU=Tier0-Accounts,OU=Admin,OU=Corp')
  })

  it('пути уникальны', () => {
    const paths = org().ous.map(o => o.path)
    expect(new Set(paths).size).toBe(paths.length)
  })

  it('каждый родитель существует', () => {
    const o = org()
    const paths = new Set(o.ous.map(x => x.path))
    for (const ou of o.ous) {
      if (ou.parent === null) continue
      expect(paths.has(ou.parent), `родитель ${ou.parent} не найден`).toBe(true)
    }
  })

  it('ровно один корень', () => {
    expect(org().ous.filter(o => o.parent === null)).toHaveLength(1)
  })

  it('имя подразделения совпадает с первым сегментом пути', () => {
    for (const ou of org().ous) {
      expect(ou.path.startsWith(`OU=${ou.name}`), `${ou.path}`).toBe(true)
    }
  })
})

describe('учётные записи', () => {
  it('логины уникальны', () => {
    const logins = org().users.map(u => u.samAccountName)
    expect(new Set(logins).size).toBe(logins.length)
  })

  it('каждая лежит в существующем подразделении', () => {
    const o = org()
    const paths = new Set(o.ous.map(x => x.path))
    for (const u of o.users) {
      expect(paths.has(u.ou), `${u.samAccountName} в ${u.ou}`).toBe(true)
    }
  })

  it('на старте все включены и не заблокированы', () => {
    for (const u of org().users) {
      expect(u.enabled, u.samAccountName).toBe(true)
      expect(u.lockedOut, u.samAccountName).toBe(false)
      expect(u.lockoutSource, u.samAccountName).toBeNull()
      expect(u.badPwdCount, u.samAccountName).toBe(0)
    }
  })

  it('руководитель указан существующим человеком либо пуст', () => {
    const o = org()
    const names = new Set(o.users.map(u => u.displayName))
    for (const u of o.users) {
      if (u.manager === '') continue
      expect(names.has(u.manager), `${u.samAccountName} → ${u.manager}`).toBe(true)
    }
  })

  it('никто не назначен руководителем самому себе', () => {
    for (const u of org().users) {
      expect(u.manager).not.toBe(u.displayName)
    }
  })

  it('у каждой есть основная машина', () => {
    const w = createWorld()
    for (const u of w.org.users) {
      expect(w.devices[u.primaryDevice], u.samAccountName).toBeDefined()
    }
  })
})

describe('группы', () => {
  it('имена уникальны', () => {
    const names = org().groups.map(g => g.name)
    expect(new Set(names).size).toBe(names.length)
  })

  it('лежат в существующих подразделениях', () => {
    const o = org()
    const paths = new Set(o.ous.map(x => x.path))
    for (const g of o.groups) {
      expect(paths.has(g.ou), `${g.name} в ${g.ou}`).toBe(true)
    }
  })

  it('членство двусторонне согласовано', () => {
    const o = org()

    for (const g of o.groups) {
      for (const member of g.members) {
        const user = o.users.find(u => u.samAccountName === member)
        expect(user, `${g.name}: участник ${member} не найден`).toBeDefined()
        expect(user!.groups, `${member} не знает о ${g.name}`).toContain(g.name)
      }
    }

    for (const u of o.users) {
      for (const name of u.groups) {
        const group = o.groups.find(g => g.name === name)
        expect(group, `${u.samAccountName}: группа ${name} не найдена`).toBeDefined()
        expect(group!.members, `${name} не знает о ${u.samAccountName}`)
          .toContain(u.samAccountName)
      }
    }
  })

  it('привилегированные группы помечены', () => {
    const o = org()
    expect(o.groups.find(g => g.name === 'Domain Admins')?.protected).toBe(true)
    expect(o.groups.find(g => g.name === 'GRP-All-Staff')?.protected).toBe(false)
  })

  it('обычные сотрудники не состоят в привилегированных группах', () => {
    const o = org()
    const privileged = o.groups.filter(g => g.protected).map(g => g.name)
    const regular = o.users.filter(u => u.ou.includes('OU=Employees'))
    for (const u of regular) {
      for (const g of u.groups) {
        expect(privileged, `${u.samAccountName} состоит в ${g}`).not.toContain(g)
      }
    }
  })
})

describe('общие ресурсы', () => {
  it('каждый требует существующую группу', () => {
    const o = org()
    const names = new Set(o.groups.map(g => g.name))
    for (const s of o.shares) {
      expect(names.has(s.requiresGroup), `${s.path} → ${s.requiresGroup}`).toBe(true)
    }
  })

  it('группа, дающая доступ, действительно на него ссылается', () => {
    const o = org()
    for (const s of o.shares) {
      const g = o.groups.find(x => x.name === s.requiresGroup)!
      expect(g.grantsAccessTo, `${g.name} не даёт ${s.path}`).toContain(s.path)
    }
  })

  it('пути уникальны', () => {
    const paths = org().shares.map(s => s.path)
    expect(new Set(paths).size).toBe(paths.length)
  })
})

describe('cloneWorld копирует каталог глубоко', () => {
  it('правка учётной записи в копии не трогает оригинал', () => {
    const a = createWorld()
    const b = cloneWorld(a)
    b.org.users[0]!.lockedOut = true
    expect(a.org.users[0]!.lockedOut).toBe(false)
  })

  it('правка членства в копии не трогает оригинал', () => {
    const a = createWorld()
    const before = a.org.groups[0]!.members.length
    const b = cloneWorld(a)
    b.org.groups[0]!.members.push('кто-то')
    expect(a.org.groups[0]!.members).toHaveLength(before)
  })
})

describe('адресный пул шире числа машин', () => {
  it('иначе renew на второй машине выдал бы занятый адрес', () => {
    const w = createWorld()
    const machines = Object.keys(w.devices).length
    expect(w.network.segments[0]!.leasePool.length).toBeGreaterThanOrEqual(machines)
  })

  it('адреса машин уникальны', () => {
    const w = createWorld()
    const ips = Object.values(w.devices).map(d => d.adapters[0]!.ip)
    expect(new Set(ips).size).toBe(ips.length)
  })
})
