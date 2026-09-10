export type PathSegment = string | number

/**
 * Разбирает путь вида "devices.AL-LPT-0447.adapters[0].ip".
 *
 * Имена хостов содержат дефисы, но не точки — точка всегда разделитель
 * сегментов. Индексы массивов записываются в квадратных скобках и могут
 * идти подряд: "a.b[0][1].c".
 */
export function parsePath(path: string): PathSegment[] {
  const out: PathSegment[] = []

  for (const raw of path.split('.')) {
    const m = raw.match(/^([^[\]]+)((?:\[\d+\])*)$/)
    if (!m) throw new Error(`некорректный путь: ${path}`)

    out.push(m[1]!)
    for (const idx of m[2]!.matchAll(/\[(\d+)\]/g)) out.push(Number(idx[1]))
  }

  return out
}

/** Возвращает значение по пути или undefined, если путь оборвался. */
export function getPath<T = unknown>(root: unknown, path: string): T | undefined {
  let cur: unknown = root

  for (const seg of parsePath(path)) {
    if (cur === null || typeof cur !== 'object') return undefined
    cur = (cur as Record<PathSegment, unknown>)[seg]
  }

  return cur as T | undefined
}

/**
 * Записывает значение по пути.
 *
 * Намеренно бросает исключение на несуществующем промежуточном сегменте:
 * опечатка в инъекции сценария должна падать громко, а не создавать
 * поломку, которой игрок никогда не увидит.
 */
export function setPath(root: unknown, path: string, value: unknown): void {
  const segs = parsePath(path)
  const last = segs.pop()
  if (last === undefined) throw new Error(`пустой путь: ${path}`)

  let cur: unknown = root
  for (const seg of segs) {
    if (cur === null || typeof cur !== 'object') {
      throw new Error(`путь не существует: ${path}`)
    }
    const next = (cur as Record<PathSegment, unknown>)[seg]
    if (next === undefined) throw new Error(`путь не существует: ${path}`)
    cur = next
  }

  if (cur === null || typeof cur !== 'object') {
    throw new Error(`путь не существует: ${path}`)
  }
  ;(cur as Record<PathSegment, unknown>)[last] = value
}
