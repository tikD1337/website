/**
 * Разбор командной строки.
 *
 * Переменных окружения намеренно нет: в тренажёре они не нужны, а их
 * отсутствие делает разбор предсказуемым. Появятся, когда появится
 * сценарий, которому они действительно понадобятся.
 *
 * Кавычки такой сценарий получили. `net group "Domain Admins"` без них
 * распадается на два аргумента, и запрет на привилегированную группу
 * обходится опечаткой, а не решением техника — то есть граница
 * перестаёт быть границей.
 */
export function parseCommand(line: string): { name: string; args: string[] } {
  const parts = tokenize(line)
  const [head, ...args] = parts
  return { name: (head ?? '').toLowerCase(), args }
}

/**
 * Разбивает строку на аргументы, уважая кавычки.
 *
 * Кавычка открывает и закрывает буквальный кусок, в сам аргумент не
 * попадает. Незакрытая кавычка забирает остаток строки — так ведёт
 * себя cmd.exe, и так техник не получает молчаливо обрезанный ввод.
 */
function tokenize(line: string): string[] {
  const out: string[] = []
  let current = ''
  let started = false
  let quoted = false

  for (const ch of line) {
    if (ch === '"') {
      quoted = !quoted
      // Кавычка сама по себе начинает аргумент: "" — это пустая строка,
      // а не отсутствие аргумента.
      started = true
      continue
    }

    if (!quoted && /\s/.test(ch)) {
      if (started) out.push(current)
      current = ''
      started = false
      continue
    }

    current += ch
    started = true
  }

  if (started) out.push(current)
  return out
}
