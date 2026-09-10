/**
 * Согласование существительного с числом по русским правилам.
 *
 * Слова в интерфейсе — такая же часть дизайна, как отступы: «54 очков»
 * читается как недоделка, даже если всё остальное безупречно.
 *
 * plural(1, 'очко', 'очка', 'очков')  → 'очко'
 * plural(2, ...)  → 'очка'
 * plural(54, ...) → 'очка'
 * plural(11, ...) → 'очков'
 */
export function plural(n: number, one: string, few: string, many: string): string {
  const abs = Math.abs(n) % 100
  const last = abs % 10

  if (abs > 10 && abs < 20) return many
  if (last > 1 && last < 5) return few
  if (last === 1) return one
  return many
}

/** Число вместе с согласованным словом: «54 очка». */
export function withPlural(
  n: number, one: string, few: string, many: string,
): string {
  return `${n} ${plural(n, one, few, many)}`
}
