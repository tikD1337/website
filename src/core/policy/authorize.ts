import type { WorldState } from '../world/types'
import type { SessionLog } from '../session/types'

/**
 * Шлюз полномочий.
 *
 * Единственная точка, через которую проходит любое изменение мира —
 * из терминала, из окна удалёнки, из консоли каталога, из серверной.
 * Добавленное здесь правило немедленно действует во всех инструментах.
 *
 * Ключевой принцип: запрещённое действие остаётся **технически
 * выполнимым в интерфейсе** и отклоняется здесь с записью в журнал.
 * Прятать кнопку нельзя — тренажёр учит границе, а не её отсутствию:
 * техник должен столкнуться с отказом и понять, почему он получен.
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
      if (!session.flags.identityVerified) {
        return {
          decision: 'deny',
          reason: 'сначала подтвердите личность обратившегося',
        }
      }
      return { decision: 'allow', reason: '' }

    case 'device-change':
      return { decision: 'allow', reason: '' }
  }
}
