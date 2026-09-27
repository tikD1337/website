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
  /**
   * Полная форма команды: `show ip interface brief` для набранного
   * `sh ip int br`. Цели сценария сверяются и с ней, иначе сокращение,
   * которое понимает настоящая консоль, наказывалось бы.
   */
  canonical?: string
}

/** Инцидент, к которому относится журнал: чья машина, кто обратился. */
export interface Incident {
  number: string
  device: string
  requester: string
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
  /**
   * Заявителю сказали, что заявка передана дальше и кому.
   *
   * Для эскалации это то же, что подтверждение для починки: без него
   * человек сидит без сети и не знает, ждать ли, и чего.
   */
  userInformed: boolean
  dangerousActions: DangerousAction[]
}

export interface SessionLog {
  /**
   * Инцидент журнала. По нему шлюз решает, что входит в область тикета:
   * порт машины заявителя — да, чужой — нет.
   */
  incident?: Incident
  /**
   * Чья личность подтверждена.
   *
   * Флаг `identityVerified` отвечает «была ли сверка вообще», а это
   * поле — «кого сверяли». Второе строже: подтвердив одного
   * обратившегося, техник не получает права менять чужие аккаунты.
   */
  verifiedAccount?: string
  /**
   * Просьбы к заявителю, которые он выполнил.
   *
   * Отдельно от изменений, потому что менял мир не техник. Для оценки
   * важно именно это: догадался ли он, что часть работы делается не
   * его руками.
   */
  askedFor: string[]
  /**
   * Объекты, карточки которых техник открывал: `user:n.haruna`,
   * `group:GRP-Finance-Reports`.
   *
   * Работа мышью — такая же проверка, как команда. Цель «посмотреть,
   * в каких группах состоит заявитель» закрывается и `net user`, и
   * карточкой в консоли; засчитывать только команду значит наказывать
   * за использование инструмента, который сам же срез и построил.
   */
  inspected: string[]
  commands: CommandEntry[]
  changes: ChangeEntry[]
  dialogue: DialogueEntry[]
  flags: SessionFlags
}

/** Ключи флагов, которые можно переключать булевым значением. */
export type BooleanFlag = keyof Omit<SessionFlags, 'dangerousActions'>
