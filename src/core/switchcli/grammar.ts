/**
 * Разбор строки консоли коммутатора.
 *
 * Правила настоящей консоли, ради которых этот модуль и существует:
 * слово можно сократить до однозначного префикса (`sh vl br`);
 * неоднозначный префикс — ошибка с самим префиксом; неверное слово
 * отмечается кареткой под местом, где разбор споткнулся; `?` вместо
 * слова перечисляет, что можно ввести дальше.
 *
 * Разбор идёт курсором по словам. Команда спрашивает у курсора «одно из
 * этих слов», «число», «остаток строки» — и курсор либо отдаёт полное
 * слово, либо останавливает разбор с причиной. Каждое место, где
 * консоль перечисляет варианты, одно и то же для ошибки и для
 * подсказки: так они не могут разойтись.
 */

export interface Token {
  text: string
  /** смещение слова в строке — под ним встанет каретка */
  at: number
}

/** Слово и его пояснение для подсказки. Слово сравнивается без учёта регистра. */
export type Choice = readonly [word: string, help: string]

export type Stop =
  | { kind: 'invalid'; at: number }
  | { kind: 'ambiguous'; text: string }
  | { kind: 'incomplete' }
  | { kind: 'unrecognized' }
  | { kind: 'help'; lines: string[]; prefill: string }

/** Остановка разбора. Бросается курсором и ловится консолью. */
export class Halt {
  constructor(readonly stop: Stop) {}
}

export function tokenize(line: string): Token[] {
  const out: Token[] = []
  for (const m of line.matchAll(/\S+/g)) out.push({ text: m[0], at: m.index })
  return out
}

const helpLine = (word: string, help: string) => `  ${word.padEnd(22)}${help}`.trimEnd()
const CR = '  <cr>'

export type Iface =
  | { kind: 'word'; word: string }
  | { kind: 'port'; name: string; at: number }
  | { kind: 'vlan'; vlan: number; at: number }

const IFACE_TYPES: Choice[] = [
  ['GigabitEthernet', 'Gigabit Ethernet IEEE 802.3z'],
  ['Vlan', 'VLAN interface'],
]

export const isVlanId = (s: string) => /^\d+$/.test(s) && Number(s) >= 1 && Number(s) <= 4094
export const isIp = (s: string) =>
  /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.test(s) && s.split('.').every(o => Number(o) <= 255)

export class Cursor {
  private i = 0

  constructor(private readonly line: string, private readonly tokens: Token[]) {}

  get done(): boolean {
    return this.i >= this.tokens.length
  }

  /** Следующее слово из списка. Необязательное слово на конце строки — `null`. */
  word(choices: readonly Choice[], optional?: false): string
  word(choices: readonly Choice[], optional: boolean): string | null
  word(choices: readonly Choice[], optional = false): string | null {
    const t = this.tokens[this.i]
    if (!t) {
      if (optional) return null
      throw new Halt({ kind: 'incomplete' })
    }
    this.help(t, choices, optional)
    const typed = t.text.toLowerCase()
    const hits = choices.filter(([w]) => w.toLowerCase().startsWith(typed))
    const exact = hits.find(([w]) => w.toLowerCase() === typed)
    const hit = exact ?? (hits.length === 1 ? hits[0] : undefined)
    if (hit) {
      this.i++
      return hit[0].toLowerCase()
    }
    if (hits.length > 1) {
      throw new Halt({ kind: 'ambiguous', text: this.line.slice(0, t.at + t.text.length).trim() })
    }
    throw new Halt({ kind: 'invalid', at: t.at })
  }

  /** Значение: число, адрес. `label` и `help` — строка подсказки, как в консоли. */
  arg(label: string, help: string, valid: (s: string) => boolean): { value: string; at: number } {
    const t = this.tokens[this.i]
    if (!t) throw new Halt({ kind: 'incomplete' })
    this.help(t, [[label, help]], false, true)
    if (!valid(t.text)) throw new Halt({ kind: 'invalid', at: t.at })
    this.i++
    return { value: t.text, at: t.at }
  }

  /** Остаток строки как есть — для описания порта. */
  rest(label: string, help: string): string {
    const t = this.tokens[this.i]
    if (!t) throw new Halt({ kind: 'incomplete' })
    this.help(t, [[label, help]], false, true)
    this.i = this.tokens.length
    return this.line.slice(t.at).trimEnd()
  }

  /** Имя интерфейса в любой записи: `gi1/0/22`, `gi 1/0/22`, `vlan20`, `Vlan 20`. */
  iface(extra: readonly Choice[] = [], optional = false): Iface | null {
    const t = this.tokens[this.i]
    if (!t) {
      if (optional) return null
      throw new Halt({ kind: 'incomplete' })
    }
    const joined = /^([a-z-]+)(\d[\d/]*)$/i.exec(t.text)
    let type: string | null
    let num: { value: string; at: number }
    if (joined) {
      type = matchType(joined[1]!)
      if (!type) throw new Halt({ kind: 'invalid', at: t.at })
      this.i++
      num = { value: joined[2]!, at: t.at }
    } else {
      const w = this.word([...extra, ...IFACE_TYPES], optional)
      if (w === null) return null
      if (!IFACE_TYPES.some(([x]) => x.toLowerCase() === w)) return { kind: 'word', word: w }
      type = w
      num = type === 'vlan'
        ? this.arg('<1-4094>', 'Vlan interface number', isVlanId)
        : this.arg('<1-9>', 'GigabitEthernet interface number', s => /^\d+\/\d+\/\d+$/.test(s))
    }
    if (type === 'vlan') {
      if (!isVlanId(num.value)) throw new Halt({ kind: 'invalid', at: num.at })
      return { kind: 'vlan', vlan: Number(num.value), at: num.at }
    }
    if (!/^\d+\/\d+\/\d+$/.test(num.value)) throw new Halt({ kind: 'invalid', at: num.at })
    return { kind: 'port', name: `Gi${num.value}`, at: num.at }
  }

  /** Конец команды: лишнее слово — ошибка под ним. */
  end(): void {
    const t = this.tokens[this.i]
    if (!t) return
    if (t.text === '?') throw new Halt({ kind: 'help', lines: [CR], prefill: this.line.slice(0, t.at) })
    throw new Halt({ kind: 'invalid', at: t.at })
  }

  /**
   * `?` отдельным словом — список вариантов с пояснениями; `?` в конце
   * слова — варианты его продолжения через два пробела.
   */
  private help(t: Token, choices: readonly Choice[], optional: boolean, isArg = false): void {
    if (t.text === '?') {
      const lines = choices.map(([w, h]) => helpLine(w, h))
      if (optional) lines.push(CR)
      throw new Halt({ kind: 'help', lines, prefill: this.line.slice(0, t.at) })
    }
    if (!t.text.endsWith('?') || isArg) return
    const typed = t.text.slice(0, -1).toLowerCase()
    const words = choices.map(([w]) => w).filter(w => w.toLowerCase().startsWith(typed))
    if (words.length === 0) throw new Halt({ kind: 'unrecognized' })
    throw new Halt({
      kind: 'help',
      lines: [words.join('  ')],
      prefill: this.line.slice(0, t.at + t.text.length - 1),
    })
  }
}

function matchType(prefix: string): string | null {
  const p = prefix.toLowerCase()
  const hits = IFACE_TYPES.filter(([w]) => w.toLowerCase().startsWith(p))
  return hits.length === 1 ? hits[0]![0].toLowerCase() : null
}
