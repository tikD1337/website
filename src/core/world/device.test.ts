import { describe, it, expect } from 'vitest'
import { createWorld, cloneWorld } from './world'

const laptop = () => createWorld().devices['AL-LPT-0447']!

describe('службы', () => {
  it('машина несёт правдоподобный набор служб', () => {
    const s = laptop().services
    expect(s.length).toBeGreaterThanOrEqual(8)
    const names = s.map(x => x.name)
    expect(names).toContain('Spooler')
    expect(names).toContain('Dnscache')
    expect(names).toContain('Dhcp')
  })

  it('имена служб уникальны в пределах машины', () => {
    for (const d of Object.values(createWorld().devices)) {
      const names = d.services.map(s => s.name)
      expect(new Set(names).size, `машина ${d.hostname}`).toBe(names.length)
    }
  })

  it('у каждой службы есть отображаемое имя, статус и тип запуска', () => {
    for (const s of laptop().services) {
      expect(s.displayName.length, `служба ${s.name}`).toBeGreaterThan(3)
      expect(['running', 'stopped', 'paused']).toContain(s.status)
      expect(['auto', 'manual', 'disabled']).toContain(s.startType)
    }
  })

  it('защитные службы помечены — их нельзя останавливать', () => {
    const defender = laptop().services.find(s => s.name === 'WinDefend')
    expect(defender?.protected).toBe(true)
    expect(laptop().services.find(s => s.name === 'Spooler')?.protected).toBe(false)
  })

  it('зависимости ссылаются на существующие службы', () => {
    for (const d of Object.values(createWorld().devices)) {
      const names = new Set(d.services.map(s => s.name))
      for (const s of d.services) {
        for (const dep of s.dependsOn) {
          expect(names.has(dep), `${s.name} зависит от несуществующей ${dep}`).toBe(true)
        }
      }
    }
  })
})

describe('журнал событий', () => {
  it('непустой и отсортирован по времени', () => {
    const log = laptop().eventLog
    expect(log.length).toBeGreaterThanOrEqual(5)
    const times = log.map(e => e.at)
    expect([...times].sort()).toEqual(times)
  })

  it('записи корректны по структуре', () => {
    for (const e of laptop().eventLog) {
      expect(['System', 'Application', 'Security']).toContain(e.log)
      expect(['information', 'warning', 'error', 'critical']).toContain(e.level)
      expect(e.source.length).toBeGreaterThan(2)
      expect(e.eventId).toBeGreaterThan(0)
      expect(e.message.length).toBeGreaterThan(10)
    }
  })

  it('есть записи в обоих основных журналах', () => {
    const logs = new Set(laptop().eventLog.map(e => e.log))
    expect(logs.has('System')).toBe(true)
    expect(logs.has('Application')).toBe(true)
  })
})

describe('процессы, драйверы, диски', () => {
  it('процессы имеют уникальные идентификаторы', () => {
    const pids = laptop().processes.map(p => p.pid)
    expect(pids.length).toBeGreaterThanOrEqual(5)
    expect(new Set(pids).size).toBe(pids.length)
  })

  it('исправный драйвер не несёт кода проблемы', () => {
    const ok = laptop().drivers.filter(d => d.status === 'ok')
    expect(ok.length).toBeGreaterThan(0)
    for (const d of ok) expect(d.problemCode).toBeNull()
  })

  it('диск не может иметь свободного места больше общего', () => {
    for (const d of laptop().disks) {
      expect(d.freeGb).toBeLessThanOrEqual(d.totalGb)
      expect(d.freeGb).toBeGreaterThanOrEqual(0)
    }
  })
})

describe('cloneWorld копирует новые поля глубоко', () => {
  it('правка службы в копии не трогает оригинал', () => {
    const a = createWorld()
    const b = cloneWorld(a)
    b.devices['AL-LPT-0447']!.services[0]!.status = 'stopped'
    expect(a.devices['AL-LPT-0447']!.services[0]!.status).not.toBe('stopped')
  })

  it('дописывание в журнал копии не трогает оригинал', () => {
    const a = createWorld()
    const before = a.devices['AL-LPT-0447']!.eventLog.length
    const b = cloneWorld(a)
    b.devices['AL-LPT-0447']!.eventLog.push({
      at: '2026-09-10T10:00:00.000Z',
      log: 'System',
      level: 'error',
      source: 'Test',
      eventId: 1,
      message: 'тестовая запись достаточной длины',
    })
    expect(a.devices['AL-LPT-0447']!.eventLog).toHaveLength(before)
  })
})
