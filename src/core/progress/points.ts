/**
 * Очки, ранги и недельный счёт.
 *
 * Очки за тикет считает оценка (`grading/grade.ts`) и здесь не
 * пересчитываются: шесть измерений по десять баллов, умноженные на
 * 0.9, дают 0–54 за прохождение. Эта арифметика выстрадана и
 * трогать её незачем — здесь только лестница поверх неё.
 *
 * Первый порог взят у ориентира: 500 очков. При 47–54 за образцовое
 * прохождение это примерно десяток закрытых инцидентов, то есть ранг
 * не меняется от одной удачной смены — и в этом весь смысл порога.
 */

export interface Rank {
  /** сколько очков нужно набрать, чтобы ранг открылся */
  points: number
  title: string
}

export const RANKS: Rank[] = [
  { points: 0, title: 'Стажёр' },
  { points: 500, title: 'Первая линия' },
  { points: 1500, title: 'Вторая линия' },
  { points: 3000, title: 'Ведущий инженер' },
  { points: 5000, title: 'Инженер инфраструктуры' },
]

export interface RankState {
  current: Rank
  /** null на вершине лестницы */
  next: Rank | null
  /** сколько очков до следующего ранга; null на вершине */
  toNext: number | null
}

export function rankFor(points: number): RankState {
  /*
    Ищем с конца: текущий ранг — последний, порог которого взят.
    Поиск с начала требовал бы заглядывать на шаг вперёд, а это ровно
    то место, где заводится ошибка на единицу.
  */
  let idx = 0
  for (let i = RANKS.length - 1; i >= 0; i--) {
    if (points >= RANKS[i]!.points) { idx = i; break }
  }

  const current = RANKS[idx]!
  const next = RANKS[idx + 1] ?? null

  return {
    current,
    next,
    toNext: next ? next.points - points : null,
  }
}

/**
 * Ключ ISO-недели: `2026-W37`.
 *
 * Именно ISO, а не «неделя с воскресенья»: неделя начинается в
 * понедельник, а к первой неделе года относится та, в которую попал
 * первый четверг. Иначе воскресный тикет уезжал бы в следующую неделю,
 * а конец декабря — в первую неделю следующего года.
 */
export function weekKey(d: Date): string {
  // Полдень не нужен: считаем строго в UTC, часового пояса тут нет.
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))

  // Воскресенье даёт 0 — переводим в 7, чтобы неделя шла с понедельника.
  const day = t.getUTCDay() || 7

  // Сдвигаемся на четверг своей недели: он и решает, чья это неделя.
  t.setUTCDate(t.getUTCDate() + 4 - day)

  const yearStart = Date.UTC(t.getUTCFullYear(), 0, 1)
  const days = (t.getTime() - yearStart) / 86_400_000
  const week = Math.ceil((days + 1) / 7)

  return `${t.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}
