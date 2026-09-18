import type { Scorecard } from '../grading/grade'
import type { ResolutionCode } from '../tickets/types'

/**
 * Память тренажёра.
 *
 * До среза 5 закрытый тикет не оставлял следа: экран разбора жил до
 * первой перезагрузки. Здесь появляется история прохождений, и из неё
 * выводится всё остальное — очки, ранг, счётчики, профиль.
 *
 * **Сохраняется прогресс, а не мир.** Мир собирается из seed при каждом
 * запуске: сериализовать `WorldState` целиком значило бы решать, что
 * делать с половинчато изменённой машиной, а это отдельный разговор.
 * Отсюда прямое следствие, и оно намеренное: перезагрузка начинает
 * новую смену, незакрытый тикет не восстанавливается.
 */

/**
 * Одно прохождение.
 *
 * Несёт `Scorecard` целиком, а не пересказ: разбор рисуется из него же,
 * и второе описание того же экрана разошлось бы с первым через срез.
 * Остальные поля — то, без чего список истории не нарисовать, не
 * поднимая мир: мира у прошлой смены уже нет.
 */
export interface TicketRecord {
  /** `смена:номер` — детерминированный, без случайности */
  id: string
  /** к какой смене относится прохождение */
  shiftId: string
  /** когда закрыт, ISO */
  at: string
  /** ISO-неделя закрытия: недельный счёт очков идёт по ней */
  weekKey: string

  number: string
  scenarioId: string
  summary: string
  category: string
  subcategory: string
  priority: 'P1' | 'P2' | 'P3' | 'P4'
  requester: string
  device: string

  resolutionCode: ResolutionCode
  /** текст заметки: разбор показывает его вместе с оценкой */
  resolutionNotes: string

  card: Scorecard
}

/** Всё, что переживает перезагрузку. */
export interface Progress {
  /** версия схемы: следующая не станет молча читать чужое */
  version: 1
  records: TicketRecord[]
}

export function emptyProgress(): Progress {
  return { version: 1, records: [] }
}
