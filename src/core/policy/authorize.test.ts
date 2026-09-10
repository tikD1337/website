import { describe, it, expect, beforeEach } from 'vitest'
import { authorize } from './authorize'
import { netsh } from '../terminal/commands/netsh'
import { createWorld } from '../world/world'
import { createSession, setFlag } from '../session/session'
import type { CommandContext } from '../terminal/types'

let ctx: CommandContext

beforeEach(() => {
  ctx = {
    world: createWorld(),
    session: createSession(),
    clock: { now: () => new Date('2026-09-09T18:00:00.000Z') },
    device: 'AL-LPT-0447',
  }
})

describe('authorize — отключение защиты', () => {
  it('запрещено всегда, даже с подтверждённой личностью', () => {
    setFlag(ctx.session, 'identityVerified', true)
    const r = authorize(
      { kind: 'disable-security', target: 'firewall', description: 'выключить фаервол' },
      ctx.world, ctx.session)
    expect(r.decision).toBe('deny')
    expect(r.reason).toContain('защит')
  })
})

describe('authorize — изменение учётной записи', () => {
  /*
    Без подтверждения личности изменение помечается, а не запрещается.

    Это не смягчение правила, а различение природы запрета: отключить
    защиту физически нельзя, а сбросить пароль неподтверждённому
    обратившемуся вполне можно — и это инцидент безопасности, за который
    оценка снимает балл. Спрятанная кнопка учила бы, что границ нет.
  */
  it('без проверки личности помечается как ошибка, но не блокируется', () => {
    const r = authorize(
      { kind: 'account-change', target: 'p.raman', description: 'сброс пароля' },
      ctx.world, ctx.session)
    expect(r.decision).toBe('flag')
    expect(r.reason).toContain('личность')
    expect(r.reason).toContain('инцидент')
  })

  it('отличается от отключения защиты, которое именно запрещено', () => {
    const account = authorize(
      { kind: 'account-change', target: 'p.raman', description: 'сброс пароля' },
      ctx.world, ctx.session)
    const security = authorize(
      { kind: 'disable-security', target: 'firewall', description: 'выключить' },
      ctx.world, ctx.session)
    expect(account.decision).toBe('flag')
    expect(security.decision).toBe('deny')
  })

  it('разрешено после проверки личности того же человека', () => {
    setFlag(ctx.session, 'identityVerified', true)
    ctx.session.verifiedAccount = 'p.raman'
    const r = authorize(
      { kind: 'account-change', target: 'p.raman', description: 'сброс пароля' },
      ctx.world, ctx.session)
    expect(r.decision).toBe('allow')
  })
})

describe('authorize — общая система', () => {
  it('изменение ради одного человека запрещено и объясняет почему', () => {
    const r = authorize(
      { kind: 'shared-system', target: 'vlan20', description: 'правка DHCP-области' },
      ctx.world, ctx.session)
    expect(r.decision).toBe('deny')
    expect(r.reason).toContain('общ')
    expect(r.reason).toContain('эскалац')
  })
})

describe('authorize — обычное изменение на машине', () => {
  it('разрешено', () => {
    const r = authorize(
      { kind: 'device-change', target: 'AL-LPT-0447', description: 'обновить аренду' },
      ctx.world, ctx.session)
    expect(r.decision).toBe('allow')
    expect(r.reason).toBe('')
  })
})

describe('netsh advfirewall', () => {
  it('отключение отвечает Access is denied', () => {
    const res = netsh(['advfirewall', 'set', 'allprofiles', 'state', 'off'], ctx)
    expect(res.stdout).toBe('Access is denied.')
    expect(res.exitCode).toBe(1)
  })

  it('отключение пишется в журнал как опасное действие', () => {
    netsh(['advfirewall', 'set', 'allprofiles', 'state', 'off'], ctx)
    expect(ctx.session.flags.dangerousActions).toHaveLength(1)
    expect(ctx.session.flags.dangerousActions[0]!.action)
      .toBe('netsh advfirewall set allprofiles state off')
    expect(ctx.session.flags.dangerousActions[0]!.reason).toContain('защит')
  })

  it('отключение отдельного профиля тоже ловится', () => {
    const res = netsh(['advfirewall', 'set', 'domainprofile', 'state', 'off'], ctx)
    expect(res.exitCode).toBe(1)
    expect(ctx.session.flags.dangerousActions).toHaveLength(1)
  })

  it('регистр не помогает обойти запрет', () => {
    const res = netsh(['ADVFIREWALL', 'SET', 'ALLPROFILES', 'STATE', 'OFF'], ctx)
    expect(res.exitCode).toBe(1)
    expect(ctx.session.flags.dangerousActions).toHaveLength(1)
  })

  it('включение фаервола обратно не считается опасным', () => {
    const res = netsh(['advfirewall', 'set', 'allprofiles', 'state', 'on'], ctx)
    expect(res.exitCode).toBe(0)
    expect(ctx.session.flags.dangerousActions).toHaveLength(0)
  })

  it('netsh interface отрабатывает без последствий', () => {
    expect(netsh(['interface', 'show', 'interface'], ctx).exitCode).toBe(0)
  })

  it('неизвестный контекст даёт ошибку синтаксиса', () => {
    const res = netsh(['wat'], ctx)
    expect(res.exitCode).toBe(1)
    expect(res.stdout).toContain('The following command was not found')
  })

  it('без аргументов печатает подсказку', () => {
    const res = netsh([], ctx)
    expect(res.exitCode).toBe(1)
  })
})
