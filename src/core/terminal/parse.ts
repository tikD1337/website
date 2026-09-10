/**
 * Разбор командной строки.
 *
 * Кавычек и переменных окружения намеренно нет: в тренажёре они не
 * нужны, а их отсутствие делает разбор предсказуемым. Появятся, когда
 * появится сценарий, которому они действительно понадобятся.
 */
export function parseCommand(line: string): { name: string; args: string[] } {
  const parts = line.trim().split(/\s+/).filter(Boolean)
  const [head, ...args] = parts
  return { name: (head ?? '').toLowerCase(), args }
}
