# Срезы 0–1, часть 2: терминал и полномочия

> Продолжение `2026-09-09-helpdesk-simulator-slice-0-1.md`. Тот же заголовок,
> те же глобальные ограничения. Задачи 5–9.

---

### Задача 5: Форматирование вывода Windows

**Файлы:**
- Создать: `src/core/terminal/format.ts`
- Тест: `src/core/terminal/format.test.ts`

**Интерфейсы:**
- Отдаёт: `field(label: string, value: string): string`,
  `continuation(value: string): string`, `CRLF`, `joinLines(lines: string[]): string`

Ключ к достоверности: в настоящем `ipconfig /all` метка с точками занимает
ровно **34 символа** после трёхпробельного отступа, затем `': '`. Заполнитель
строится из пар `'. '`, а перед ними ставится один или два пробела, чтобы
длина сошлась.

- [ ] **Шаг 1: Написать падающий тест**

`src/core/terminal/format.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { field, continuation } from './format'

describe('field', () => {
  it('короткая метка добирается парами «точка-пробел»', () => {
    expect(field('Description', 'Ethernet Adapter'))
      .toBe('   Description . . . . . . . . . . . : Ethernet Adapter')
  })

  it('метка без пробела перед первой точкой, когда длина чётная', () => {
    expect(field('Physical Address', 'A4-83-E7-2C-91-44'))
      .toBe('   Physical Address. . . . . . . . . : A4-83-E7-2C-91-44')
  })

  it('длинная метка оставляет только две точки', () => {
    expect(field('Connection-specific DNS Suffix ', 'corp.arcline.local'))
      .toBe('   Connection-specific DNS Suffix  . : corp.arcline.local')
  })

  it('пустое значение оставляет висящий пробел после двоеточия', () => {
    expect(field('Default Gateway', ''))
      .toBe('   Default Gateway . . . . . . . . . : ')
  })

  it('длина части до двоеточия всегда 37 символов', () => {
    for (const label of ['DHCP Enabled', 'Subnet Mask', 'Lease Expires']) {
      const line = field(label, 'x')
      expect(line.indexOf(':')).toBe(37)
    }
  })
})

describe('continuation', () => {
  it('выравнивает продолжение под значение', () => {
    expect(continuation('10.20.14.11'))
      .toBe('                                       10.20.14.11')
  })
})
```

- [ ] **Шаг 2: Запустить тест и убедиться, что он падает**

Выполнить: `npx vitest run src/core/terminal/format.test.ts`
Ожидается: FAIL — `Failed to resolve import "./format"`

- [ ] **Шаг 3: Реализовать**

`src/core/terminal/format.ts`:
```ts
export const CRLF = '\r\n'

const INDENT = '   '
/** Ширина части «метка + точки» после отступа. */
const LABEL_WIDTH = 34

/**
 * Строит строку вида
 *   `   Description . . . . . . . . . . . : Ethernet Adapter`
 * Заполнитель — пары `'. '`, предварённые одним или двумя пробелами,
 * чтобы общая ширина метки составила ровно LABEL_WIDTH.
 */
export function field(label: string, value: string): string {
  const fillLen = LABEL_WIDTH - label.length
  if (fillLen < 0) throw new Error(`метка длиннее ${LABEL_WIDTH}: ${label}`)
  const lead = fillLen % 2 === 1 ? ' ' : '  '
  const pairs = Math.max(0, Math.floor((fillLen - lead.length) / 2))
  const fill = lead + '. '.repeat(pairs)
  return INDENT + label + fill.slice(0, fillLen) + ': ' + value
}

/** Вторая и последующие строки многозначного поля (например второй DNS). */
export function continuation(value: string): string {
  return ' '.repeat(INDENT.length + LABEL_WIDTH + 2) + value
}

export function joinLines(lines: string[]): string {
  return lines.join(CRLF)
}
```

Проверка арифметики на примерах из тестов:
`'Description'` = 11 → fillLen 23 (нечётное) → lead `' '`, пар 11 →
`' ' + '. '×11` = 23 ✓.
`'Physical Address'` = 16 → fillLen 18 (чётное) → lead `'  '`, пар 8 →
`'  ' + '. '×8` = 18. Но ожидается `'. '×9`. Поэтому для чётного fillLen
берём пары без ведущих пробелов, а лишний символ срезается `slice`.
Если тест на `Physical Address` падает — заменить вычисление на:
`const fill = fillLen % 2 === 1 ? ' ' + '. '.repeat((fillLen - 1) / 2)
: '. '.repeat(fillLen / 2)`, а случай длинной метки
(`Connection-specific DNS Suffix `, fillLen 3) покрыть нечётной веткой.
Довести до зелёных тестов — эталон здесь тесты, а не формула.

- [ ] **Шаг 4: Запустить тест и убедиться, что он проходит**

Выполнить: `npx vitest run src/core/terminal/format.test.ts`
Ожидается: PASS, 6 тестов

- [ ] **Шаг 5: Коммит**

```bash
git add -A
git commit -F - <<'EOF'
Форматирование вывода Windows с выравниванием по точкам

Метка с заполнителем занимает 34 символа, двоеточие всегда на позиции 37.
Эталон — тесты со строками, снятыми с настоящего ipconfig /all.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Задача 6: Разбор командной строки и реестр команд

**Файлы:**
- Создать: `src/core/terminal/types.ts`, `src/core/terminal/parse.ts`,
  `src/core/terminal/registry.ts`
- Тест: `src/core/terminal/parse.test.ts`, `src/core/terminal/registry.test.ts`

**Интерфейсы:**
- Потребляет: `WorldState`, `Clock`, `SessionLog`
- Отдаёт:
  `parseCommand(line: string): { name: string; args: string[] }`,
  `CommandContext = { world; session; clock; device: string }`,
  `CommandResult = { stdout: string; exitCode: number }`,
  `CommandHandler = (args: string[], ctx: CommandContext) => CommandResult`,
  `createRegistry(): Registry`, `Registry.register(name, handler)`,
  `Registry.run(line, ctx): CommandResult`

- [ ] **Шаг 1: Написать падающий тест разбора**

`src/core/terminal/parse.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { parseCommand } from './parse'

describe('parseCommand', () => {
  it('делит на имя и аргументы', () => {
    expect(parseCommand('ipconfig /all')).toEqual({ name: 'ipconfig', args: ['/all'] })
  })

  it('приводит имя к нижнему регистру, аргументы оставляет как есть', () => {
    expect(parseCommand('NSLOOKUP Internal-Portal.arcline.corp'))
      .toEqual({ name: 'nslookup', args: ['Internal-Portal.arcline.corp'] })
  })

  it('схлопывает лишние пробелы', () => {
    expect(parseCommand('  ping    8.8.8.8  ')).toEqual({ name: 'ping', args: ['8.8.8.8'] })
  })

  it('пустая строка даёт пустое имя', () => {
    expect(parseCommand('   ')).toEqual({ name: '', args: [] })
  })

  it('многословная команда сохраняет все аргументы', () => {
    expect(parseCommand('netsh advfirewall set allprofiles state off'))
      .toEqual({ name: 'netsh', args: ['advfirewall', 'set', 'allprofiles', 'state', 'off'] })
  })
})
```

- [ ] **Шаг 2: Написать падающий тест реестра**

`src/core/terminal/registry.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { createRegistry } from './registry'
import { createWorld } from '../world/world'
import { createSession } from '../session/session'
import type { CommandContext } from './types'

const ctx = (): CommandContext => ({
  world: createWorld(),
  session: createSession(),
  clock: { now: () => new Date('2026-09-09T18:00:00.000Z') },
  device: 'AL-LPT-0447',
})

describe('реестр команд', () => {
  it('вызывает зарегистрированный обработчик', () => {
    const r = createRegistry()
    r.register('echo', (args) => ({ stdout: args.join(' '), exitCode: 0 }))
    expect(r.run('echo привет мир', ctx()).stdout).toBe('привет мир')
  })

  it('неизвестная команда отвечает как настоящий cmd', () => {
    const r = createRegistry()
    const res = r.run('wat', ctx())
    expect(res.stdout).toBe(
      "'wat' is not recognized as an internal or external command,\r\noperable program or batch file.")
    expect(res.exitCode).toBe(1)
  })

  it('пустая строка ничего не делает', () => {
    const r = createRegistry()
    expect(r.run('   ', ctx())).toEqual({ stdout: '', exitCode: 0 })
  })

  it('пишет выполненную команду в журнал сессии', () => {
    const r = createRegistry()
    r.register('echo', () => ({ stdout: 'ok', exitCode: 0 }))
    const c = ctx()
    r.run('echo hi', c)
    expect(c.session.commands).toHaveLength(1)
    expect(c.session.commands[0]).toMatchObject({
      device: 'AL-LPT-0447', cmdline: 'echo hi', exitCode: 0,
    })
  })

  it('неизвестную команду тоже пишет в журнал', () => {
    const r = createRegistry()
    const c = ctx()
    r.run('wat', c)
    expect(c.session.commands[0]!.exitCode).toBe(1)
  })
})
```

- [ ] **Шаг 3: Запустить тесты и убедиться, что они падают**

Выполнить: `npx vitest run src/core/terminal/`
Ожидается: FAIL — модули `./parse` и `./registry` не найдены

- [ ] **Шаг 4: Реализовать типы**

`src/core/terminal/types.ts`:
```ts
import type { WorldState, Clock } from '../world/types'
import type { SessionLog } from '../session/types'

export interface CommandContext {
  world: WorldState
  session: SessionLog
  clock: Clock
  /** машина, на которой открыт терминал */
  device: string
}

export interface CommandResult {
  stdout: string
  exitCode: number
}

export type CommandHandler = (args: string[], ctx: CommandContext) => CommandResult

export interface Registry {
  register(name: string, handler: CommandHandler): void
  run(line: string, ctx: CommandContext): CommandResult
  has(name: string): boolean
}
```

- [ ] **Шаг 5: Реализовать разбор**

`src/core/terminal/parse.ts`:
```ts
export function parseCommand(line: string): { name: string; args: string[] } {
  const parts = line.trim().split(/\s+/).filter(Boolean)
  const [head, ...args] = parts
  return { name: (head ?? '').toLowerCase(), args }
}
```

- [ ] **Шаг 6: Реализовать реестр**

`src/core/terminal/registry.ts`:
```ts
import { parseCommand } from './parse'
import { recordCommand } from '../session/session'
import { CRLF } from './format'
import type { CommandHandler, CommandResult, CommandContext, Registry } from './types'

export function createRegistry(): Registry {
  const handlers = new Map<string, CommandHandler>()

  return {
    register(name, handler) {
      handlers.set(name.toLowerCase(), handler)
    },

    has(name) {
      return handlers.has(name.toLowerCase())
    },

    run(line, ctx): CommandResult {
      const { name, args } = parseCommand(line)
      if (name === '') return { stdout: '', exitCode: 0 }

      const handler = handlers.get(name)
      const result: CommandResult = handler
        ? handler(args, ctx)
        : {
            stdout: `'${name}' is not recognized as an internal or external command,`
              + CRLF + 'operable program or batch file.',
            exitCode: 1,
          }

      recordCommand(ctx.session, ctx.clock, ctx.device, line.trim(), result.exitCode)
      return result
    },
  }
}
```

- [ ] **Шаг 7: Запустить тесты и убедиться, что они проходят**

Выполнить: `npx vitest run src/core/terminal/`
Ожидается: PASS, 16 тестов (5 разбор + 5 реестр + 6 формат)

- [ ] **Шаг 8: Коммит**

```bash
git add -A
git commit -F - <<'EOF'
Разбор командной строки и реестр команд

Команда — чистая функция (args, ctx) -> {stdout, exitCode}. Реестр сам
пишет каждый вызов в журнал сессии, включая нераспознанные.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Задача 7: ipconfig с предусловиями

**Файлы:**
- Создать: `src/core/terminal/commands/ipconfig.ts`
- Тест: `src/core/terminal/commands/ipconfig.test.ts`

**Интерфейсы:**
- Потребляет: `field`, `continuation`, `joinLines`, `CRLF`, `CommandHandler`,
  `recordChange`
- Отдаёт: `ipconfig: CommandHandler`

Главная механика среза: `/renew` при удерживаемом APIPA-адресе обязан
падать, а после `/release` — проходить. Это предусловие живёт в команде,
а не в сценарии.

- [ ] **Шаг 1: Написать падающий тест**

`src/core/terminal/commands/ipconfig.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { ipconfig } from './ipconfig'
import { createWorld, applyInject } from '../../world/world'
import { createSession } from '../../session/session'
import type { CommandContext } from '../types'

const BROKEN = [
  { path: 'devices.AL-LPT-0447.adapters[0].ip', value: '169.254.23.11' },
  { path: 'devices.AL-LPT-0447.adapters[0].mask', value: '255.255.0.0' },
  { path: 'devices.AL-LPT-0447.adapters[0].gateway', value: '' },
  { path: 'devices.AL-LPT-0447.adapters[0].dns', value: [] },
  { path: 'devices.AL-LPT-0447.adapters[0].autoconfigured', value: true },
  { path: 'devices.AL-LPT-0447.adapters[0].leaseObtained', value: null },
  { path: 'devices.AL-LPT-0447.adapters[0].leaseExpires', value: null },
]

let ctx: CommandContext

beforeEach(() => {
  ctx = {
    world: createWorld(),
    session: createSession(),
    clock: { now: () => new Date('2026-09-09T18:13:39.000Z') },
    device: 'AL-LPT-0447',
  }
})

const adapter = () => ctx.world.devices['AL-LPT-0447']!.adapters[0]!

describe('ipconfig /all в сломанном состоянии', () => {
  beforeEach(() => applyInject(ctx.world, BROKEN))

  it('печатает самоназначенный адрес, пустой шлюз и пустой DNS', () => {
    const out = ipconfig(['/all'], ctx).stdout
    expect(out).toContain('   Autoconfiguration IPv4 Address. . : 169.254.23.11(Preferred)')
    expect(out).toContain('   Subnet Mask . . . . . . . . . . . : 255.255.0.0')
    expect(out).toContain('   Default Gateway . . . . . . . . . : ')
    expect(out).not.toContain('Lease Obtained')
  })

  it('начинается с шапки и заголовка адаптера', () => {
    const out = ipconfig(['/all'], ctx).stdout
    expect(out.startsWith('Windows IP Configuration')).toBe(true)
    expect(out).toContain('Ethernet adapter Ethernet:')
  })
})

describe('ipconfig /renew без предварительного release', () => {
  beforeEach(() => applyInject(ctx.world, BROKEN))

  it('падает с ошибкой обращения к DHCP', () => {
    const res = ipconfig(['/renew'], ctx)
    expect(res.stdout).toContain(
      'An error occurred while renewing interface Ethernet : unable to contact your DHCP server. Request has timed out.')
    expect(res.exitCode).toBe(1)
  })

  it('не меняет адрес', () => {
    ipconfig(['/renew'], ctx)
    expect(adapter().ip).toBe('169.254.23.11')
  })
})

describe('release затем renew', () => {
  beforeEach(() => applyInject(ctx.world, BROKEN))

  it('release обнуляет адрес и сообщает об этом', () => {
    const res = ipconfig(['/release'], ctx)
    expect(res.stdout).toContain('   IP address released.')
    expect(adapter().ip).toBe('0.0.0.0')
  })

  it('renew после release выдаёт настоящую аренду', () => {
    ipconfig(['/release'], ctx)
    const res = ipconfig(['/renew'], ctx)
    expect(res.stdout).toContain('   DHCP lease renewed successfully.')
    expect(res.exitCode).toBe(0)
    const a = adapter()
    expect(a.ip).toBe('10.20.14.88')
    expect(a.mask).toBe('255.255.255.0')
    expect(a.gateway).toBe('10.20.14.1')
    expect(a.dns).toEqual(['10.20.14.10', '10.20.14.11'])
    expect(a.autoconfigured).toBe(false)
  })

  it('после починки /all печатает обычный IPv4 и аренду', () => {
    ipconfig(['/release'], ctx)
    ipconfig(['/renew'], ctx)
    const out = ipconfig(['/all'], ctx).stdout
    expect(out).toContain('   IPv4 Address. . . . . . . . . . . : 10.20.14.88(Preferred)')
    expect(out).toContain('Lease Obtained')
    expect(out).toContain('   DNS Servers . . . . . . . . . . . : 10.20.14.10')
    expect(out).toContain('                                       10.20.14.11')
  })

  it('пишет изменение адреса в журнал сессии', () => {
    ipconfig(['/release'], ctx)
    ipconfig(['/renew'], ctx)
    const change = ctx.session.changes.find(c => c.path.endsWith('adapters[0].ip')
      && c.after === '10.20.14.88')
    expect(change).toBeDefined()
    expect(change!.authorized).toBe(true)
  })
})

describe('renew при неисправном сегменте', () => {
  it('падает даже после release, если DHCP на сегменте лежит', () => {
    applyInject(ctx.world, [
      ...BROKEN,
      { path: 'network.segments[0].dhcpHealthy', value: false },
    ])
    ipconfig(['/release'], ctx)
    const res = ipconfig(['/renew'], ctx)
    expect(res.exitCode).toBe(1)
    expect(adapter().ip).toBe('0.0.0.0')
  })
})
```

- [ ] **Шаг 2: Запустить тест и убедиться, что он падает**

Выполнить: `npx vitest run src/core/terminal/commands/ipconfig.test.ts`
Ожидается: FAIL — `Failed to resolve import "./ipconfig"`

- [ ] **Шаг 3: Реализовать**

`src/core/terminal/commands/ipconfig.ts`:
```ts
import { BRAND } from '../../../brand'
import { field, continuation, joinLines, CRLF } from '../format'
import { recordChange } from '../../session/session'
import type { CommandHandler, CommandContext, CommandResult } from '../types'
import type { Adapter, WorldState } from '../../world/types'

function adaptersOf(ctx: CommandContext): Adapter[] {
  return ctx.world.devices[ctx.device]?.adapters ?? []
}

function segmentOf(world: WorldState, a: Adapter) {
  return world.network.segments.find(s => s.vlan === a.segment)
}

/** Формат даты аренды как в настоящем ipconfig. */
function leaseDate(iso: string): string {
  const d = new Date(iso)
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  const months = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December']
  let h = d.getUTCHours()
  const ampm = h >= 12 ? 'PM' : 'AM'
  h = h % 12 || 12
  const mm = String(d.getUTCMinutes()).padStart(2, '0')
  const ss = String(d.getUTCSeconds()).padStart(2, '0')
  return `${days[d.getUTCDay()]}, ${months[d.getUTCMonth()]} ${d.getUTCDate()}, `
    + `${d.getUTCFullYear()} ${h}:${mm}:${ss} ${ampm}`
}

function renderAll(ctx: CommandContext): string {
  const lines: string[] = ['Windows IP Configuration', '']

  for (const a of adaptersOf(ctx)) {
    lines.push(`Ethernet adapter ${a.name}:`, '')
    lines.push(field('Connection-specific DNS Suffix ', BRAND.dnsSuffix))
    lines.push(field('Description', a.description))
    lines.push(field('Physical Address', a.mac))
    lines.push(field('DHCP Enabled', a.dhcpEnabled ? 'Yes' : 'No'))
    lines.push(field('Autoconfiguration Enabled', a.autoconfigEnabled ? 'Yes' : 'No'))

    if (a.autoconfigured) {
      lines.push(field('Autoconfiguration IPv4 Address', `${a.ip}(Preferred)`))
    } else {
      lines.push(field('IPv4 Address', `${a.ip}(Preferred)`))
    }
    lines.push(field('Subnet Mask', a.mask))

    if (a.leaseObtained) lines.push(field('Lease Obtained', leaseDate(a.leaseObtained)))
    if (a.leaseExpires) lines.push(field('Lease Expires', leaseDate(a.leaseExpires)))

    lines.push(field('Default Gateway', a.gateway))

    if (a.dns.length === 0) {
      lines.push(field('DNS Servers', '').trimEnd())
    } else {
      lines.push(field('DNS Servers', a.dns[0]!))
      for (const extra of a.dns.slice(1)) lines.push(continuation(extra))
    }
    lines.push('')
  }

  return joinLines(lines)
}

function doRelease(ctx: CommandContext): CommandResult {
  const lines: string[] = ['Windows IP Configuration', '']
  for (const a of adaptersOf(ctx)) {
    const before = a.ip
    lines.push(`Ethernet adapter ${a.name}:`, '')
    a.ip = '0.0.0.0'
    a.mask = '0.0.0.0'
    a.gateway = ''
    a.dns = []
    a.autoconfigured = false
    a.leaseObtained = null
    a.leaseExpires = null
    recordChange(ctx.session, ctx.clock,
      `devices.${ctx.device}.adapters[0].ip`, before, '0.0.0.0', true)
    lines.push(field('IP address released', '').trimEnd().replace(/\s*:$/, '.'))
    lines.push('')
  }
  // Настоящий вывод — просто «   IP address released.»
  return {
    stdout: joinLines(['Windows IP Configuration', '',
      `Ethernet adapter ${adaptersOf(ctx)[0]?.name ?? 'Ethernet'}:`, '',
      '   IP address released.', '']),
    exitCode: 0,
  }
}

function doRenew(ctx: CommandContext): CommandResult {
  const a = adaptersOf(ctx)[0]
  const name = a?.name ?? 'Ethernet'
  const head = ['Windows IP Configuration', '', `Ethernet adapter ${name}:`, '']

  if (!a) return { stdout: joinLines(head), exitCode: 1 }

  const seg = segmentOf(ctx.world, a)
  const dhcpUp = Boolean(seg?.dhcpHealthy) && a.linkUp

  // Предусловие: пока держится самоназначенный адрес, запрос не уходит.
  const holdsApipa = a.autoconfigured

  if (!dhcpUp || holdsApipa) {
    return {
      stdout: joinLines([...head,
        `   An error occurred while renewing interface ${name} : `
        + 'unable to contact your DHCP server. Request has timed out.', '']),
      exitCode: 1,
    }
  }

  const before = a.ip
  const now = ctx.clock.now()
  a.ip = seg!.leasePool[0] ?? '10.20.14.88'
  a.mask = '255.255.255.0'
  a.gateway = seg!.gateway
  a.dns = [...seg!.dns]
  a.autoconfigured = false
  a.leaseObtained = now.toISOString()
  a.leaseExpires = new Date(now.getTime() + 24 * 3600 * 1000).toISOString()

  recordChange(ctx.session, ctx.clock,
    `devices.${ctx.device}.adapters[0].ip`, before, a.ip, true)

  return {
    stdout: joinLines([...head, '   Renewing IP address...',
      '   DHCP lease renewed successfully.', '']),
    exitCode: 0,
  }
}

export const ipconfig: CommandHandler = (args, ctx) => {
  const flag = (args[0] ?? '').toLowerCase()

  if (flag === '/all') return { stdout: renderAll(ctx), exitCode: 0 }
  if (flag === '/release') return doRelease(ctx)
  if (flag === '/renew') return doRenew(ctx)
  if (flag === '/flushdns') {
    return { stdout: 'Windows IP Configuration' + CRLF + CRLF
      + '        Successfully flushed the DNS Resolver Cache.', exitCode: 0 }
  }
  if (flag === '') {
    // краткий вывод
    const a = adaptersOf(ctx)[0]
    if (!a) return { stdout: 'Windows IP Configuration', exitCode: 0 }
    return {
      stdout: joinLines(['Windows IP Configuration', '',
        `Ethernet adapter ${a.name}:`, '',
        field('Connection-specific DNS Suffix ', BRAND.dnsSuffix),
        field(a.autoconfigured ? 'Autoconfiguration IPv4 Address' : 'IPv4 Address', a.ip),
        field('Subnet Mask', a.mask),
        field('Default Gateway', a.gateway), '']),
      exitCode: 0,
    }
  }

  return { stdout: `Error: unrecognized or incomplete command line.`, exitCode: 1 }
}
```

Примечание для исполнителя: в `doRelease` оставлен один рабочий путь —
сборка вывода в `return`, а цикл выше меняет состояние. Если линтер
ругается на неиспользуемый `lines`, убрать его и оставить только мутацию
адаптеров плюс формирование вывода.

- [ ] **Шаг 4: Запустить тест и убедиться, что он проходит**

Выполнить: `npx vitest run src/core/terminal/commands/ipconfig.test.ts`
Ожидается: PASS, 9 тестов

- [ ] **Шаг 5: Коммит**

```bash
git add -A
git commit -F - <<'EOF'
ipconfig с предусловием release-перед-renew

/all рендерится из состояния адаптера, /renew падает пока держится
самоназначенный адрес или лежит DHCP на сегменте, /release снимает адрес
и открывает путь к настоящей аренде. Изменения пишутся в журнал.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Задача 8: ping и nslookup

**Файлы:**
- Создать: `src/core/terminal/commands/ping.ts`, `src/core/terminal/commands/nslookup.ts`
- Тест: `src/core/terminal/commands/reachability.test.ts`

**Интерфейсы:**
- Отдаёт: `ping: CommandHandler`, `nslookup: CommandHandler`

- [ ] **Шаг 1: Написать падающий тест**

`src/core/terminal/commands/reachability.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { ping } from './ping'
import { nslookup } from './nslookup'
import { createWorld, applyInject } from '../../world/world'
import { createSession } from '../../session/session'
import type { CommandContext } from '../types'

let ctx: CommandContext
beforeEach(() => {
  ctx = {
    world: createWorld(),
    session: createSession(),
    clock: { now: () => new Date('2026-09-09T18:13:39.000Z') },
    device: 'AL-LPT-0447',
  }
})

const breakAddressing = () => applyInject(ctx.world, [
  { path: 'devices.AL-LPT-0447.adapters[0].ip', value: '169.254.23.11' },
  { path: 'devices.AL-LPT-0447.adapters[0].gateway', value: '' },
  { path: 'devices.AL-LPT-0447.adapters[0].dns', value: [] },
  { path: 'devices.AL-LPT-0447.adapters[0].autoconfigured', value: true },
])

describe('ping при рабочей адресации', () => {
  it('отвечает четырьмя пакетами и статистикой', () => {
    const res = ping(['8.8.8.8'], ctx)
    expect(res.exitCode).toBe(0)
    expect(res.stdout).toContain('Pinging 8.8.8.8 with 32 bytes of data:')
    expect((res.stdout.match(/Reply from 8\.8\.8\.8/g) ?? [])).toHaveLength(4)
    expect(res.stdout).toContain('Packets: Sent = 4, Received = 4, Lost = 0 (0% loss),')
  })

  it('пингует шлюз', () => {
    expect(ping(['10.20.14.1'], ctx).exitCode).toBe(0)
  })
})

describe('ping без шлюза', () => {
  beforeEach(breakAddressing)

  it('до публичного адреса — таймауты', () => {
    const res = ping(['8.8.8.8'], ctx)
    expect(res.exitCode).toBe(1)
    expect((res.stdout.match(/Request timed out\./g) ?? [])).toHaveLength(4)
    expect(res.stdout).toContain('Lost = 4 (100% loss)')
  })
})

describe('ping без аргументов', () => {
  it('печатает подсказку по использованию', () => {
    const res = ping([], ctx)
    expect(res.exitCode).toBe(1)
    expect(res.stdout).toContain('Usage: ping')
  })
})

describe('nslookup', () => {
  it('резолвит внутреннее имя через первый DNS', () => {
    const res = nslookup(['internal-portal.arcline.corp'], ctx)
    expect(res.exitCode).toBe(0)
    expect(res.stdout).toContain('Server:  10.20.14.10')
    expect(res.stdout).toContain('Name:    internal-portal.arcline.corp')
    expect(res.stdout).toContain('Address:  10.20.14.50')
  })

  it('без DNS-серверов сообщает, что резолвер недоступен', () => {
    breakAddressing()
    const res = nslookup(['internal-portal.arcline.corp'], ctx)
    expect(res.exitCode).toBe(1)
    expect(res.stdout).toContain(
      "can't find server name for address")
  })

  it('неизвестное имя даёт NXDOMAIN', () => {
    const res = nslookup(['nope.arcline.corp'], ctx)
    expect(res.exitCode).toBe(1)
    expect(res.stdout).toContain("*** 10.20.14.10 can't find nope.arcline.corp: Non-existent domain")
  })
})
```

- [ ] **Шаг 2: Запустить тест и убедиться, что он падает**

Выполнить: `npx vitest run src/core/terminal/commands/reachability.test.ts`
Ожидается: FAIL — модули `./ping` и `./nslookup` не найдены

- [ ] **Шаг 3: Реализовать ping**

`src/core/terminal/commands/ping.ts`:
```ts
import { joinLines } from '../format'
import type { CommandHandler, CommandContext } from '../types'

/** Есть ли у машины путь наружу: линк, адрес не APIPA, задан шлюз. */
function hasRoute(ctx: CommandContext): boolean {
  const a = ctx.world.devices[ctx.device]?.adapters[0]
  if (!a) return false
  return a.linkUp && !a.autoconfigured && a.gateway !== '' && a.ip !== '0.0.0.0'
}

function isLocalTarget(ctx: CommandContext, target: string): boolean {
  const a = ctx.world.devices[ctx.device]?.adapters[0]
  if (!a) return false
  const seg = ctx.world.network.segments.find(s => s.vlan === a.segment)
  return seg?.gateway === target
}

export const ping: CommandHandler = (args, ctx) => {
  const target = args[0]
  if (!target) {
    return {
      stdout: joinLines([
        'Usage: ping [-t] [-a] [-n count] [-l size] target_name', '']),
      exitCode: 1,
    }
  }

  const reachable = hasRoute(ctx)
    && (isLocalTarget(ctx, target) || ctx.world.network.publicHosts.includes(target)
      || target.startsWith('10.20.14.'))

  const head = [`Pinging ${target} with 32 bytes of data:`]

  if (!reachable) {
    return {
      stdout: joinLines([...head,
        'Request timed out.', 'Request timed out.',
        'Request timed out.', 'Request timed out.', '',
        `Ping statistics for ${target}:`,
        '    Packets: Sent = 4, Received = 0, Lost = 4 (100% loss),', '']),
      exitCode: 1,
    }
  }

  const times = [3, 4, 3, 4]
  const replies = times.map(t => `Reply from ${target}: bytes=32 time=${t}ms TTL=118`)
  return {
    stdout: joinLines([...head, ...replies, '',
      `Ping statistics for ${target}:`,
      '    Packets: Sent = 4, Received = 4, Lost = 0 (0% loss),',
      'Approximate round trip times in milli-seconds:',
      '    Minimum = 3ms, Maximum = 4ms, Average = 3ms', '']),
    exitCode: 0,
  }
}
```

- [ ] **Шаг 4: Реализовать nslookup**

`src/core/terminal/commands/nslookup.ts`:
```ts
import { joinLines } from '../format'
import type { CommandHandler } from '../types'

export const nslookup: CommandHandler = (args, ctx) => {
  const name = args[0]
  const adapter = ctx.world.devices[ctx.device]?.adapters[0]
  const serverIp = adapter?.dns[0]

  if (!serverIp) {
    return {
      stdout: joinLines([
        "*** Can't find server name for address: Timed out",
        '*** Default servers are not available',
        'Server:  UnKnown', 'Address:  0.0.0.0', '']),
      exitCode: 1,
    }
  }

  if (!name) {
    return { stdout: joinLines([`Default Server:  ${serverIp}`,
      `Address:  ${serverIp}`, '']), exitCode: 0 }
  }

  const server = ctx.world.network.dnsServers.find(d => d.ip === serverIp)
  const answer = server?.reachable ? server.zones[name.toLowerCase()] : undefined

  const head = [`Server:  ${serverIp}`, `Address:  ${serverIp}`, '']

  if (!answer) {
    return {
      stdout: joinLines([...head,
        `*** ${serverIp} can't find ${name}: Non-existent domain`, '']),
      exitCode: 1,
    }
  }

  return {
    stdout: joinLines([...head, `Name:    ${name}`, `Address:  ${answer}`, '']),
    exitCode: 0,
  }
}
```

Примечание: зоны в `seed.ts` записаны в нижнем регистре, поиск идёт по
`name.toLowerCase()` — иначе `NSLOOKUP Internal-Portal...` не найдёт запись.

- [ ] **Шаг 5: Запустить тест и убедиться, что он проходит**

Выполнить: `npx vitest run src/core/terminal/commands/reachability.test.ts`
Ожидается: PASS, 7 тестов

- [ ] **Шаг 6: Коммит**

```bash
git add -A
git commit -F - <<'EOF'
ping и nslookup поверх состояния сети

Достижимость выводится из линка, адреса и шлюза, а не задаётся сценарием.
nslookup спрашивает первый DNS адаптера и честно отвечает NXDOMAIN.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Задача 9: Шлюз полномочий и netsh

**Файлы:**
- Создать: `src/core/policy/authorize.ts`, `src/core/terminal/commands/netsh.ts`
- Тест: `src/core/policy/authorize.test.ts`

**Интерфейсы:**
- Потребляет: `WorldState`, `SessionLog`, `Clock`, `addDangerousAction`
- Отдаёт:
  `Action = { kind: 'disable-security' | 'account-change' | 'shared-system' | 'device-change';
             target: string; description: string }`,
  `authorize(action, world, session): { decision: 'allow'|'deny'|'flag'; reason: string }`,
  `netsh: CommandHandler`

- [ ] **Шаг 1: Написать падающий тест**

`src/core/policy/authorize.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { authorize } from './authorize'
import { netsh } from '../terminal/commands/netsh'
import { createWorld } from '../world/world'
import { createSession, setFlag } from '../session/session'
import type { CommandContext } from '../terminal/types'

let ctx: CommandContext
beforeEach(() => {
  ctx = {
    world: createWorld(),
    session: createSession(),
    clock: { now: () => new Date('2026-09-09T18:00:00.000Z') },
    device: 'AL-LPT-0447',
  }
})

describe('authorize', () => {
  it('запрещает отключение защиты всегда', () => {
    const r = authorize(
      { kind: 'disable-security', target: 'firewall', description: 'выключить фаервол' },
      ctx.world, ctx.session)
    expect(r.decision).toBe('deny')
    expect(r.reason).toContain('защит')
  })

  it('запрещает изменение аккаунта без проверки личности', () => {
    const r = authorize(
      { kind: 'account-change', target: 'p.raman', description: 'сброс пароля' },
      ctx.world, ctx.session)
    expect(r.decision).toBe('deny')
    expect(r.reason).toContain('личность')
  })

  it('разрешает изменение аккаунта после проверки личности', () => {
    setFlag(ctx.session, 'identityVerified', true)
    const r = authorize(
      { kind: 'account-change', target: 'p.raman', description: 'сброс пароля' },
      ctx.world, ctx.session)
    expect(r.decision).toBe('allow')
  })

  it('помечает изменение общей системы, но не запрещает молча', () => {
    const r = authorize(
      { kind: 'shared-system', target: 'vlan20', description: 'правка DHCP-области' },
      ctx.world, ctx.session)
    expect(r.decision).toBe('deny')
    expect(r.reason).toContain('общ')
  })

  it('разрешает обычное изменение на машине с тикетом', () => {
    const r = authorize(
      { kind: 'device-change', target: 'AL-LPT-0447', description: 'обновить аренду' },
      ctx.world, ctx.session)
    expect(r.decision).toBe('allow')
  })
})

describe('netsh advfirewall', () => {
  it('отказывает и пишет опасное действие в журнал', () => {
    const res = netsh(['advfirewall', 'set', 'allprofiles', 'state', 'off'], ctx)
    expect(res.stdout).toBe('Access is denied.')
    expect(res.exitCode).toBe(1)
    expect(ctx.session.flags.dangerousActions).toHaveLength(1)
    expect(ctx.session.flags.dangerousActions[0]!.action)
      .toBe('netsh advfirewall set allprofiles state off')
  })

  it('включение фаервола обратно не считается опасным', () => {
    const res = netsh(['advfirewall', 'set', 'allprofiles', 'state', 'on'], ctx)
    expect(res.exitCode).toBe(0)
    expect(ctx.session.flags.dangerousActions).toHaveLength(0)
  })

  it('неизвестный контекст даёт ошибку синтаксиса', () => {
    const res = netsh(['wat'], ctx)
    expect(res.exitCode).toBe(1)
    expect(res.stdout).toContain('The following command was not found')
  })
})
```

- [ ] **Шаг 2: Запустить тест и убедиться, что он падает**

Выполнить: `npx vitest run src/core/policy/authorize.test.ts`
Ожидается: FAIL — модули не найдены

- [ ] **Шаг 3: Реализовать шлюз**

`src/core/policy/authorize.ts`:
```ts
import type { WorldState } from '../world/types'
import type { SessionLog } from '../session/types'

export type ActionKind =
  | 'disable-security'
  | 'account-change'
  | 'shared-system'
  | 'device-change'

export interface Action {
  kind: ActionKind
  target: string
  description: string
}

export type Decision = 'allow' | 'deny' | 'flag'

export interface AuthResult {
  decision: Decision
  reason: string
}

/**
 * Единственная точка, через которую проходит любое изменение мира —
 * из терминала, из окна удалёнки, из консоли каталога.
 */
export function authorize(
  action: Action, _world: WorldState, session: SessionLog,
): AuthResult {
  switch (action.kind) {
    case 'disable-security':
      return {
        decision: 'deny',
        reason: 'нельзя отключать защитный контроль ради работоспособности',
      }

    case 'shared-system':
      return {
        decision: 'deny',
        reason: 'нельзя менять общую систему ради одного пользователя — это эскалация',
      }

    case 'account-change':
      if (!session.flags.identityVerified) {
        return {
          decision: 'deny',
          reason: 'сначала подтвердите личность обратившегося',
        }
      }
      return { decision: 'allow', reason: '' }

    case 'device-change':
      return { decision: 'allow', reason: '' }
  }
}
```

- [ ] **Шаг 4: Реализовать netsh**

`src/core/terminal/commands/netsh.ts`:
```ts
import { authorize } from '../../policy/authorize'
import { addDangerousAction } from '../../session/session'
import type { CommandHandler } from '../types'

export const netsh: CommandHandler = (args, ctx) => {
  const [context, ...rest] = args.map(a => a.toLowerCase())

  if (context === 'advfirewall') {
    const turningOff = rest.includes('state') && rest.includes('off')
    if (turningOff) {
      const r = authorize(
        { kind: 'disable-security', target: 'firewall',
          description: 'отключение фаервола' },
        ctx.world, ctx.session)
      if (r.decision === 'deny') {
        addDangerousAction(ctx.session, ctx.clock,
          ['netsh', ...args].join(' '), r.reason)
        return { stdout: 'Access is denied.', exitCode: 1 }
      }
    }
    return { stdout: 'Ok.', exitCode: 0 }
  }

  if (context === 'interface') {
    return { stdout: 'Ok.', exitCode: 0 }
  }

  return {
    stdout: 'The following command was not found: ' + args.join(' ') + '.',
    exitCode: 1,
  }
}
```

- [ ] **Шаг 5: Запустить тест и убедиться, что он проходит**

Выполнить: `npx vitest run src/core/policy/authorize.test.ts`
Ожидается: PASS, 8 тестов

- [ ] **Шаг 6: Прогнать весь набор тестов**

Выполнить: `npm test`
Ожидается: PASS, все тесты задач 1–9

- [ ] **Шаг 7: Коммит**

```bash
git add -A
git commit -F - <<'EOF'
Шлюз полномочий и netsh с отказом по политике

Одна функция authorize решает: отключение защиты и правка общей системы
запрещены всегда, изменение аккаунта — только после проверки личности.
netsh advfirewall ... state off отвечает Access is denied и пишет
опасное действие в журнал.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

Задачи 10–14 — в части 3
(`2026-09-09-helpdesk-simulator-slice-0-1-part3.md`): сценарий APIPA,
очередь тикетов, оценка заметки, шесть измерений, интерфейс.
