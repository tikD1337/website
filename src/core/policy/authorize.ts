import type { WorldState } from '../world/types'
import type { SessionLog } from '../session/types'

/**
 * Подтверждена ли личность владельца именно этой учётной записи.
 *
 * Дублирует `directory/identity.ts`, чтобы политика не зависела от
 * каталога: шлюз обязан оставаться самым нижним слоем.
 */
function isVerifiedFor(session: SessionLog, sam: string): boolean {
  return session.flags.identityVerified
    && session.verifiedAccount?.toLowerCase() === sam.toLowerCase()
}

/**
 * Шлюз полномочий.
 *
 * Единственная точка, через которую проходит любое изменение мира —
 * из терминала, из окна удалёнки, из консоли каталога, из серверной.
 * Добавленное здесь правило немедленно действует во всех инструментах.
 *
 * Три исхода, и разница между ними — это разница природы запрета:
 *
 * - `deny` — действие невозможно. Отключить защиту не даст доменная
 *   политика, и техник получает отказ доступа.
 * - `flag` — действие возможно и является ошибкой суждения. Сброс
 *   пароля неподтверждённому обратившемуся проходит, но записывается
 *   как несанкционированное и стоит балла.
 * - `allow` — всё в порядке.
 *
 * Общий принцип для первых двух: **граница обозначается, а не
 * прячется**. Прятать кнопку значило бы учить, что границ нет — их
 * просто не показывают.
 */

export type ActionKind =
  | 'disable-security'
  | 'account-change'
  | 'shared-system'
  | 'device-change'

export interface Action {
  kind: ActionKind
  target: string
  description: string
}

export type Decision = 'allow' | 'deny' | 'flag'

export interface AuthResult {
  decision: Decision
  reason: string
}

export function authorize(
  action: Action,
  _world: WorldState,
  session: SessionLog,
): AuthResult {
  switch (action.kind) {
    case 'disable-security':
      // Правило без исключений: работоспособность не оправдывает
      // снятие защиты. Обходной путь через отключение — не решение.
      return {
        decision: 'deny',
        reason: 'нельзя отключать защитный контроль ради работоспособности',
      }

    case 'shared-system':
      // Общая система затрагивает не одного заявителя. Это граница
      // между первой линией и второй, а не вопрос умения.
      return {
        decision: 'deny',
        reason: 'нельзя менять общую систему ради одного пользователя — нужна эскалация',
      }

    case 'account-change':
      /*
        Изменение аккаунта без подтверждённой личности — не «нельзя»,
        а «можно и это ошибка».

        Разница принципиальная. Отключить фаервол физически невозможно:
        доменная политика не даст. А сбросить пароль неподтверждённому
        обратившемуся техник вполне может — и это инцидент безопасности,
        а не услуга. Прятать кнопку значило бы учить, что границ нет,
        их просто не показывают. Поэтому действие проходит, помечается
        несанкционированным и стоит балла в оценке.
      */
      if (!isVerifiedFor(session, action.target)) {
        return {
          decision: 'flag',
          reason: session.flags.identityVerified
            ? 'сверяли другого человека — подтверждение относится к '
              + 'конкретной учётной записи, а не даёт права менять любые'
            : 'личность обратившегося не подтверждена — изменение '
              + 'аккаунта без сверки является инцидентом безопасности',
        }
      }
      return { decision: 'allow', reason: '' }

    case 'device-change':
      return { decision: 'allow', reason: '' }
  }
}
