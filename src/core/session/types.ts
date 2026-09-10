/**
 * Журнал сессии.
 *
 * Это не отладочный лог, а данные, из которых считается вся оценка.
 * Заметка игрока сверяется именно с ним: названы ли реально
 * запускавшиеся команды, реально изменённые значения, реально
 * состоявшееся подтверждение заявителя.
 */

export interface CommandEntry {
  at: string
  device: string
  cmdline: string
  exitCode: number
}

export interface ChangeEntry {
at: string
  path: string
  before: unknown
  after: unknown
  /** прошло ли изменение через шлюз полномочий */
  authorized: boolean
}

export type DialogueChannel = 'call' | 'chat' | 'mail'
export type Speaker = 'technician' | 'requester'

export interface DialogueEntry {
  at: string
  channel: DialogueChannel
  /** samAccountName собеседника */
  with: string
  speaker: Speaker
  text: string
}

export interface DangerousAction {
  at: string
  action: string
  reason: string
}

export interface SessionFlags {
  /** личность обратившегося подтверждена по каталогу */
  identityVerified: boolean
  /** выяснен масштаб: один человек или общая система */
  scopeChecked: boolean
  /** заявитель сам подтвердил, что проблема ушла */
  userConfirmed: boolean
  /** техник проговорил действие до его выполнения */
  announcedBeforeActing: boolean
  /**
   * Техник открывал просмотр событий.
   *
   * Нужен, чтобы отличить «запустил службу» от «разобрался, почему она
   * упала». Первое чинит на сегодня, второе — по-настоящему.
   */
  eventLogRead: boolean
  dangerousActions: DangerousAction[]
}

export interface SessionLog {
  /**
   * Чья личность подтверждена.
   *
   * Флаг `identityVerified` отвечает «была ли сверка вообще», а это
   * поле — «кого сверяли». Второе строже: подтвердив одного
   * обратившегося, техник не получает права менять чужие аккаунты.
   */
  verifiedAccount?: string
  commands: CommandEntry[]
  changes: ChangeEntry[]
  dialogue: DialogueEntry[]
  flags: SessionFlags
}

/** Ключи флагов, которые можно переключать булевым значением. */
export type BooleanFlag = keyof Omit<SessionFlags, 'dangerousActions'>
