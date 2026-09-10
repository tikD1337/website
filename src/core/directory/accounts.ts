import { authorize } from '../policy/authorize'
import { recordChange, addDangerousAction } from '../session/session'
import type { Clock, WorldState, OrgUser, DirectoryGroup } from '../world/types'
import type { SessionLog } from '../session/types'

/**
 * Операции над учётными записями.
 *
 * Единственное место, где меняется каталог. И консоль, и команды `net`
 * вызывают отсюда — то же правило, что со службами в срезе 2: окно и
 * команда лишь представления, операция одна.
 *
 * Ключевая особенность: изменение аккаунта без подтверждённой личности
 * **проходит**, но помечается несанкционированным. Смотри пояснение в
 * `policy/authorize.ts` — это различение невозможного и ошибочного.
 */

export interface AccountResult {
  ok: boolean
  error?: string
  /** учётка уже была в целевом состоянии */
  alreadyInState?: boolean
  /** операция выполнена, но без подтверждения личности */
  flagged?: boolean
}

const fail = (error: string): AccountResult => ({ ok: false, error })

export function findUser(world: WorldState, sam: string): OrgUser | undefined {
  return world.org.users.find(
    u => u.samAccountName.toLowerCase() === sam.toLowerCase(),
  )
}

export function findGroup(world: WorldState, name: string): DirectoryGroup | undefined {
  return world.org.groups.find(g => g.name.toLowerCase() === name.toLowerCase())
}

/**
 * Проводит изменение аккаунта через шлюз.
 *
 * Возвращает `null`, если можно продолжать, либо готовый результат
 * отказа. При исходе `flag` продолжать можно — но вызывающий обязан
 * записать изменение как несанкционированное.
 */
function gate(
  world: WorldState,
  session: SessionLog,
  clock: Clock,
  target: string,
  description: string,
): { blocked: AccountResult } | { flagged: boolean } {
  const decision = authorize(
    { kind: 'account-change', target, description },
    world,
    session,
  )

  if (decision.decision === 'deny') {
    addDangerousAction(session, clock, `${description}: ${target}`, decision.reason)
    return { blocked: fail(`отказано: ${decision.reason}`) }
  }

  if (decision.decision === 'flag') {
    // Инцидент безопасности: действие состоится, но останется в журнале.
    addDangerousAction(session, clock, `${description}: ${target}`, decision.reason)
    return { flagged: true }
  }

  return { flagged: false }
}

export function unlockAccount(
  world: WorldState, sam: string, session: SessionLog, clock: Clock,
): AccountResult {
  const user = findUser(world, sam)
  if (!user) return fail(`учётная запись ${sam} не найдена`)

  const g = gate(world, session, clock, user.samAccountName, 'разблокировка учётной записи')
  if ('blocked' in g) return g.blocked

  if (!user.lockedOut) return { ok: true, alreadyInState: true, flagged: g.flagged }

  user.lockedOut = false
  user.badPwdCount = 0

  recordChange(session, clock,
    `org.users.${user.samAccountName}.lockedOut`, true, false, !g.flagged)

  return { ok: true, flagged: g.flagged }
}

/**
 * Сброс пароля.
 *
 * Самая опасная операция первой линии: она даёт доступ к учётной
 * записи. Именно поэтому она остаётся доступной без подтверждения
 * личности — техник должен увидеть в разборе, что совершил инцидент.
 */
export function resetPassword(
  world: WorldState, sam: string, session: SessionLog, clock: Clock,
): AccountResult {
  const user = findUser(world, sam)
  if (!user) return fail(`учётная запись ${sam} не найдена`)

  const g = gate(world, session, clock, user.samAccountName, 'сброс пароля')
  if ('blocked' in g) return g.blocked

  const before = user.pwdLastSet
  user.pwdLastSet = clock.now().toISOString()
  user.pwdExpired = false
  user.badPwdCount = 0

  recordChange(session, clock,
    `org.users.${user.samAccountName}.pwdLastSet`, before, user.pwdLastSet, !g.flagged)

  return { ok: true, flagged: g.flagged }
}

export function setEnabled(
  world: WorldState, sam: string, enabled: boolean,
  session: SessionLog, clock: Clock,
): AccountResult {
  const user = findUser(world, sam)
  if (!user) return fail(`учётная запись ${sam} не найдена`)

  const action = enabled ? 'включение учётной записи' : 'отключение учётной записи'
  const g = gate(world, session, clock, user.samAccountName, action)
  if ('blocked' in g) return g.blocked

  if (user.enabled === enabled) return { ok: true, alreadyInState: true, flagged: g.flagged }

  user.enabled = enabled
  recordChange(session, clock,
    `org.users.${user.samAccountName}.enabled`, !enabled, enabled, !g.flagged)

  return { ok: true, flagged: g.flagged }
}

export function addToGroup(
  world: WorldState, sam: string, groupName: string,
  session: SessionLog, clock: Clock,
): AccountResult {
  const user = findUser(world, sam)
  if (!user) return fail(`учётная запись ${sam} не найдена`)

  const group = findGroup(world, groupName)
  if (!group) return fail(`группа ${groupName} не найдена`)

  /*
    Привилегированная группа — именно `deny`, а не `flag`.

    Выдать себе или кому-то права администратора домена первая линия
    не может физически: это Tier 0, отдельный контур доступа. Здесь
    отказ честен, в отличие от сброса пароля.
  */
  if (group.protected) {
    const reason = `${group.displayName} — привилегированная группа, `
      + 'первая линия не выдаёт административных прав'
    addDangerousAction(session, clock,
      `добавление в группу ${group.name}: ${user.samAccountName}`, reason)
    return fail(`отказано: ${reason}`)
  }

  const g = gate(world, session, clock, user.samAccountName,
    `добавление в группу ${group.name}`)
  if ('blocked' in g) return g.blocked

  if (user.groups.includes(group.name)) {
    return { ok: true, alreadyInState: true, flagged: g.flagged }
  }

  // Членство хранится с обеих сторон — обе и обновляем.
  user.groups.push(group.name)
  group.members.push(user.samAccountName)

  recordChange(session, clock,
    `org.users.${user.samAccountName}.groups`, null, group.name, !g.flagged)

  return { ok: true, flagged: g.flagged }
}

export function removeFromGroup(
  world: WorldState, sam: string, groupName: string,
  session: SessionLog, clock: Clock,
): AccountResult {
  const user = findUser(world, sam)
  if (!user) return fail(`учётная запись ${sam} не найдена`)

  const group = findGroup(world, groupName)
  if (!group) return fail(`группа ${groupName} не найдена`)

  const g = gate(world, session, clock, user.samAccountName,
    `исключение из группы ${group.name}`)
  if ('blocked' in g) return g.blocked

  if (!user.groups.includes(group.name)) {
    return { ok: true, alreadyInState: true, flagged: g.flagged }
  }

  user.groups = user.groups.filter(x => x !== group.name)
  group.members = group.members.filter(x => x !== user.samAccountName)

  recordChange(session, clock,
    `org.users.${user.samAccountName}.groups`, group.name, null, !g.flagged)

  return { ok: true, flagged: g.flagged }
}

/** Есть ли у пользователя доступ к общему ресурсу — через группы. */
export function hasShareAccess(
  world: WorldState, sam: string, sharePath: string,
): boolean {
  const user = findUser(world, sam)
  if (!user) return false

  const share = world.org.shares.find(s => s.path === sharePath)
  if (!share) return false

  return user.groups.includes(share.requiresGroup)
}
