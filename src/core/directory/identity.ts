import { recordDialogue, setFlag } from '../session/session'
import { findUser } from './accounts'
import type { Clock, WorldState } from '../world/types'
import type { SessionLog } from '../session/types'

/**
 * Сверка личности обратившегося.
 *
 * Не кнопка «я подтвердил», а настоящая проверка: техник задаёт вопрос,
 * получает ответ и сверяет его с карточкой каталога. Из разбора
 * оригинала: подтверждать нужно «чем-то, чего в тикете ещё не было» —
 * поэтому вопросы про то, что видно в самом тикете, здесь бесполезны.
 *
 * Подтверждение относится к **конкретной** учётной записи. Сверив одного
 * обратившегося, техник не получает права менять чужие аккаунты.
 */

/** Поле, по которому можно свериться. */
export type VerificationField = 'manager' | 'office' | 'dept' | 'title'

/** Короткое имя поля — для выбора в списке. */
export const FIELD_LABEL: Record<VerificationField, string> = {
  manager: 'Руководитель',
  office: 'Кабинет',
  dept: 'Отдел',
  title: 'Должность',
}

export const FIELD_QUESTION: Record<VerificationField, string> = {
  manager: 'Назовите, пожалуйста, вашего руководителя',
  office: 'В каком кабинете вы сидите?',
  dept: 'В каком отделе вы работаете?',
  title: 'Как называется ваша должность?',
}

export interface VerificationResult {
  ok: boolean
  /** правильный ответ — показывается в разборе, не игроку заранее */
  expected: string
  error?: string
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim()
}

/**
 * Сверяет ответ обратившегося с каталогом.
 *
 * Пустое контрольное поле сверку не проходит: у директора нет
 * руководителя, и спрашивать про него бессмысленно — это подсказка
 * технику выбрать другой вопрос, а не повод пропустить проверку.
 */
export function verifyIdentity(
  world: WorldState,
  sam: string,
  field: VerificationField,
  answer: string,
  session: SessionLog,
  clock: Clock,
): VerificationResult {
  const user = findUser(world, sam)
  if (!user) {
    return { ok: false, expected: '', error: `учётная запись ${sam} не найдена` }
  }

  const expected = user[field]

  recordDialogue(session, clock, 'call', user.samAccountName, 'technician',
    FIELD_QUESTION[field])
  recordDialogue(session, clock, 'call', user.samAccountName, 'requester', answer)

  if (expected === '') {
    return {
      ok: false,
      expected: '',
      error: 'по этому полю свериться нельзя — оно не заполнено в каталоге',
    }
  }

  const ok = normalize(answer) === normalize(expected)

  if (ok) {
    setFlag(session, 'identityVerified', true)
    session.verifiedAccount = user.samAccountName
  }

  return { ok, expected }
}

/**
 * Подтверждена ли личность именно этого пользователя.
 *
 * Флаг в сессии отвечает «была ли сверка вообще», а этот вопрос —
 * «сверяли ли того, чей аккаунт меняем». Второе строже и важнее.
 */
export function isVerifiedFor(session: SessionLog, sam: string): boolean {
  return session.flags.identityVerified
    && session.verifiedAccount?.toLowerCase() === sam.toLowerCase()
}
