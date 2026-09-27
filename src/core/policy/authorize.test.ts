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

const decide = (kind: 'disable-security' | 'account-change' | 'shared-system' | 'device-change',
  target: string) => authorize({ kind, target, description: 'действие' }, ctx.world, ctx.session)

/*
  Три исхода и разница их природы. Отключить защиту физически нельзя —
  отказ. Сбросить пароль неподтверждённому обратившемуся вполне можно —
  и это инцидент безопасности: действие проходит с пометкой и стоит
  балла. Спрятанная кнопка учила бы, что границ нет.
*/
describe('шлюз полномочий', () => {
  it('защиту отключить нельзя никогда, даже со сверкой', () => {
    setFlag(ctx.session, 'identityVerified', true)
    ctx.session.verifiedAccount = 'p.raman'
    const r = decide('disable-security', 'firewall')
    expect(r.decision).toBe('deny')
    expect(r.reason).toContain('защит')
  })

  it('изменение учётки: без сверки — пометка, со сверкой того же человека — можно', () => {
    const flagged = decide('account-change', 'p.raman')
    expect(flagged.decision).toBe('flag')
    expect(flagged.reason).toMatch(/личность.*инцидент/)

    setFlag(ctx.session, 'identityVerified', true)
    ctx.session.verifiedAccount = 'p.raman'
    expect(decide('account-change', 'P.Raman')).toEqual({ decision: 'allow', reason: '' })
  })

  it('общая система — отказ с требованием эскалации; обычное изменение на машине — можно', () => {
    const shared = decide('shared-system', 'vlan20')
    expect(shared.decision).toBe('deny')
    expect(shared.reason).toMatch(/общ.*эскалац/)
    expect(decide('device-change', 'AL-LPT-0447')).toEqual({ decision: 'allow', reason: '' })
  })
})

/*
  Область тикета: первая линия меняет только порт машины из взятого
  тикета. Чужой порт, аплинк и изменения без тикета — отказ: это уже
  чужое рабочее место или общая сеть, и нужна эскалация.
*/
describe('область тикета', () => {
  const port = (target: string) =>
    authorize({ kind: 'infra-change', target, description: 'смена VLAN' }, ctx.world, ctx.session)

  it('порт машины из тикета — можно; чужой, аплинк и без тикета — нельзя', () => {
    ctx.session = createSession({ number: 'INC0000001', device: 'AL-LPT-0447', requester: 'p.raman' })
    expect(port('SW-FL3-01/Gi1/0/1')).toEqual({ decision: 'allow', reason: '' })

    for (const target of ['SW-FL3-01/Gi1/0/2', 'SW-FL3-01/Gi1/0/48', 'SW-FL3-01/Gi1/0/99']) {
      const r = port(target)
      expect(r.decision, target).toBe('deny')
      expect(r.reason, target).toContain('вне области тикета')
    }

    ctx.session = createSession()
    expect(port('SW-FL3-01/Gi1/0/1')).toMatchObject({
      decision: 'deny', reason: expect.stringContaining('нет открытого тикета'),
    })
  })
})

describe('netsh advfirewall', () => {
  /*
    Проверено на ориентире: `netsh advfirewall ... state off` → Access is
    denied. Попытка — событие, а не безобидный тупик: пишется опасным
    действием, и ни профиль, ни регистр обойти запрет не помогают.
  */
  it('отключение фаервола — Access is denied и опасное действие', () => {
    for (const args of [
      ['advfirewall', 'set', 'allprofiles', 'state', 'off'],
      ['advfirewall', 'set', 'domainprofile', 'state', 'off'],
      ['ADVFIREWALL', 'SET', 'ALLPROFILES', 'STATE', 'OFF'],
    ]) {
      expect(netsh(args, ctx), args.join(' ')).toEqual({ exitCode: 1, stdout: 'Access is denied.' })
    }
    expect(ctx.session.flags.dangerousActions).toHaveLength(3)
    expect(ctx.session.flags.dangerousActions[0]).toMatchObject({
      action: 'netsh advfirewall set allprofiles state off',
      reason: expect.stringContaining('защит'),
    })
  })

  it('включение и просмотр безопасны; неизвестное — ошибка синтаксиса', () => {
    expect(netsh(['advfirewall', 'set', 'allprofiles', 'state', 'on'], ctx).exitCode).toBe(0)
    expect(netsh(['interface', 'show', 'interface'], ctx).exitCode).toBe(0)
    expect(ctx.session.flags.dangerousActions).toHaveLength(0)

    expect(netsh(['wat'], ctx).stdout).toContain('The following command was not found')
    expect(netsh([], ctx).exitCode).toBe(1)
  })
})
