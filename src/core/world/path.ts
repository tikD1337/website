export type PathSegment = string | number

/** Выбор элемента массива по значению поля: `[samAccountName=e.varga]`. */
export interface FieldSelector {
  field: string
  value: string
}

export type Step = PathSegment | FieldSelector

function isSelector(seg: Step): seg is FieldSelector {
  return typeof seg === 'object'
}

/**
 * Разбирает путь вида "devices.AL-LPT-0447.adapters[0].ip".
 *
 * Имена хостов содержат дефисы, но не точки — точка всегда разделитель
 * сегментов. Индексы массивов записываются в квадратных скобках и могут
 * идти подряд: "a.b[0][1].c".
 *
 * В скобках вместо числа может стоять выбор по полю:
 * "org.users[samAccountName=e.varga].lockedOut". Индекс держится на
 * порядке в seed, и перестановка молча уводит патч в соседний объект;
 * выбор по имени переживает перестановку и читается без сверки с seed.
 *
 * Разбор посимвольный, а не через `split('.')`: значение внутри выбора
 * само содержит точки — `[path=\\fileserver.arcline.corp\Finance]`.
 */
export function parsePath(path: string): Step[] {
  const out: Step[] = []
  let name = ''
  let depth = 0
  let bracket = ''
  /** было ли на этом сегменте хоть что-то, кроме пустоты */
  let sawSomething = false

  const flushName = () => {
    if (name !== '') {
      out.push(name)
      name = ''
    }
  }

  const flushBracket = () => {
    const eq = bracket.indexOf('=')
    if (eq === -1) {
      /*
        Только десятичные цифры. `Number('')` равен нулю и целый,
        поэтому проверка через `Number.isInteger` пропускала `[]` как
        «нулевой элемент»: потерянное внутри скобок условие выбора
        молча ломало первого человека в seed вместо заявителя. Заодно
        отсекаются `0x10`, `1e3` и пробелы вокруг числа.
      */
      if (!/^\d+$/.test(bracket)) throw new Error(`некорректный путь: ${path}`)
      out.push(Number(bracket))
    } else {
      // Пустое имя поля не совпадёт ни с чем и вернуло бы undefined молча.
      if (eq === 0) throw new Error(`некорректный путь: ${path}`)
      out.push({ field: bracket.slice(0, eq), value: bracket.slice(eq + 1) })
    }
    bracket = ''
  }

  for (const ch of path) {
    if (depth > 0) {
      if (ch === ']') {
        depth--
        flushBracket()
      } else {
        bracket += ch
      }
      continue
    }

    if (ch === '[') {
      depth++
      flushName()
      sawSomething = true
      continue
    }

    if (ch === '.') {
      if (!sawSomething) throw new Error(`некорректный путь: ${path}`)
      flushName()
      sawSomething = false
      continue
    }

    if (ch === ']') throw new Error(`некорректный путь: ${path}`)

    name += ch
    sawSomething = true
  }

  if (depth !== 0) throw new Error(`некорректный путь: ${path}`)
  if (!sawSomething) throw new Error(`некорректный путь: ${path}`)
  flushName()

  return out
}

/** Ищет элемент массива по значению поля. */
function selectFrom(cur: unknown, sel: FieldSelector): unknown {
  if (!Array.isArray(cur)) return undefined
  return cur.find(item =>
    item !== null
    && typeof item === 'object'
    && String((item as Record<string, unknown>)[sel.field]) === sel.value)
}

function step(cur: unknown, seg: Step): unknown {
  return isSelector(seg)
    ? selectFrom(cur, seg)
    : (cur as Record<PathSegment, unknown>)[seg]
}

/** Возвращает значение по пути или undefined, если путь оборвался. */
export function getPath<T = unknown>(root: unknown, path: string): T | undefined {
  let cur: unknown = root

  for (const seg of parsePath(path)) {
    if (cur === null || typeof cur !== 'object') return undefined
    cur = step(cur, seg)
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
    const next = step(cur, seg)
    if (next === undefined) throw new Error(`путь не существует: ${path}`)
    cur = next
  }

  if (cur === null || typeof cur !== 'object') {
    throw new Error(`путь не существует: ${path}`)
  }

  if (isSelector(last)) {
    throw new Error(`путь оканчивается выбором, а не полем: ${path}`)
  }

  ;(cur as Record<PathSegment, unknown>)[last] = value
}
