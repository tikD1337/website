import type { WorldState, OrgUser, DirectoryGroup } from '../world/types'

/**
 * Имена и идентификаторы каталога.
 *
 * Одно и то же подразделение называется в домене тремя способами:
 * различающимся именем (`DC=arcline,DC=corp`), DNS-именем
 * (`arcline.corp`) и NetBIOS-именем (`ARCLINE`). Все три нужны в
 * выводе разных команд, и все три выводятся из первого — хранить их
 * по отдельности значило бы завести три источника истины там, где
 * достаточно одного.
 */

/** `DC=arcline,DC=corp` → `arcline.corp` */
export function dnsDomain(world: WorldState): string {
  return world.org.domain
    .split(',')
    .map(part => part.trim())
    .filter(part => part.toUpperCase().startsWith('DC='))
    .map(part => part.slice(3))
    .join('.')
}

/** `DC=arcline,DC=corp` → `ARCLINE` */
export function netbiosDomain(world: WorldState): string {
  return (dnsDomain(world).split('.')[0] ?? '').toUpperCase()
}

export function userDn(world: WorldState, user: OrgUser): string {
  return `CN=${user.displayName},${user.ou},${world.org.domain}`
}

export function groupDn(world: WorldState, group: DirectoryGroup): string {
  return `CN=${group.name},${group.ou},${world.org.domain}`
}

/**
 * Идентификатор безопасности домена.
 *
 * Настоящий SID домена — три случайных 32-битных числа, назначенных
 * при его создании. Здесь они постоянны: мир детерминирован, и вывод
 * `whoami /groups` обязан совпадать между запусками, иначе техник
 * решит, что в домене что-то поменялось.
 */
export const DOMAIN_SID = 'S-1-5-21-1284937461-2089553178-3417229640'

/** Известные RID, которые Windows назначает одинаково в любом домене. */
const WELL_KNOWN_RID: Record<string, number> = {
  'Domain Admins': 512,
  'Domain Users': 513,
  'Domain Guests': 514,
}

/**
 * Относительный идентификатор из имени.
 *
 * Диапазоны разведены: пользователи получают 1000–4999, группы
 * 5000–8999. В настоящем домене они общие и выдаются по счётчику, но
 * тогда RID зависел бы от порядка создания — а у нас объекты приходят
 * из seed, и добавление человека в середину списка сдвинуло бы чужие
 * идентификаторы.
 */
function ridFrom(name: string, base: number, span: number): number {
  let h = 0
  for (const ch of name.toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return base + (h % span)
}

export function userSid(user: OrgUser): string {
  return `${DOMAIN_SID}-${ridFrom(user.samAccountName, 1000, 4000)}`
}

export function groupSid(group: DirectoryGroup): string {
  const known = WELL_KNOWN_RID[group.name]
  if (known !== undefined) return `${DOMAIN_SID}-${known}`
  return `${DOMAIN_SID}-${ridFrom(group.name, 5000, 4000)}`
}
