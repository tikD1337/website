# Тренажёр службы поддержки — план реализации, срезы 0–1

> **Для агентов-исполнителей:** ОБЯЗАТЕЛЬНЫЙ ПОД-SKILL — используйте
> `superpowers:subagent-driven-development` (рекомендуется) или
> `superpowers:executing-plans` для выполнения плана задача за задачей.
> Шаги размечены чекбоксами (`- [ ]`).

**Цель:** играбельный сквозной инцидент — взять тикет из очереди, зайти в
терминал, продиагностировать APIPA, починить, написать заметку, закрыть и
получить разбор оценки.

**Архитектура:** ядро — чистый TypeScript без React: единое `WorldState`,
команды как чистые функции над ним, журнал сессии как вход для оценки.
React только рисует. Всё детерминированно: никаких `Date.now()` внутри ядра,
время приходит через инжектируемые часы.

**Стек:** Vite · TypeScript · React 18 · Vitest · zustand

**Спека:** `docs/superpowers/specs/2026-09-09-helpdesk-simulator-design.md`

## Глобальные ограничения

- Node 24, npm 11. Пакетный менеджер — npm.
- **Ядро (`src/core/**`) не импортирует React и не обращается к `window`,
  `localStorage`, `Date.now()`, `Math.random()`.** Время и случайность
  приходят параметрами. Это условие тестируемости и воспроизводимости.
- Вывод команд — по-английски, побайтово как в Windows. Интерфейс и тексты
  тикетов — по-русски. Имена людей, хостов и брендов — латиницей.
- Бренды только вымышленные, из `src/brand.ts`. Реальные товарные знаки
  (Microsoft, Dell, HP, Lenovo, Cisco, Apple) в коде и данных не появляются.
- Вымышленная компания: **Arcline Logistics**, домен `arcline.corp`,
  внутренний DNS-суффикс `corp.arcline.local`.
- Каждая задача заканчивается коммитом. Сообщения по-русски, с завершающей
  строкой `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`.

---

## Структура файлов

```
src/
├─ brand.ts                      словарь вымышленных брендов
├─ core/                         ← чистый TS, без React
│  ├─ world/
│  │  ├─ path.ts                 адресация «devices.AL-LPT-0447.adapters[0].ip»
│  │  ├─ types.ts                WorldState и подтипы
│  │  ├─ seed.ts                 стартовый мир Arcline
│  │  └─ world.ts                createWorld, cloneWorld, applyInject
│  ├─ session/
│  │  ├─ types.ts                SessionLog и записи
│  │  └─ session.ts              запись команд, изменений, реплик, флагов
│  ├─ terminal/
│  │  ├─ types.ts                CommandResult, CommandHandler
│  │  ├─ format.ts               выравнивание вывода Windows
│  │  ├─ parse.ts                разбор командной строки
│  │  ├─ registry.ts             реестр и диспетчер
│  │  └─ commands/
│  │     ├─ ipconfig.ts
│  │     ├─ ping.ts
│  │     ├─ nslookup.ts
│  │     └─ netsh.ts
│  ├─ policy/authorize.ts        шлюз полномочий
│  ├─ tickets/
│  │  ├─ types.ts                Ticket, статусы, коды закрытия
│  │  └─ queue.ts                claim, статус, resolve
│  ├─ scenario/
│  │  ├─ types.ts                Scenario, Objective
│  │  └─ load.ts                 применение сценария к миру
│  └─ grading/
│     ├─ types.ts
│     ├─ notes.ts                рубрика заметки против журнала
│     └─ grade.ts                шесть измерений и вердикт
├─ scenarios/net-apipa-no-lease.ts
├─ store/useGame.ts              zustand-обёртка + сохранение
├─ ui/
│  ├─ App.tsx  Shell.tsx  IncidentRail.tsx  Dock.tsx
│  ├─ QueueView.tsx  TicketView.tsx  TerminalView.tsx
│  └─ ScorecardView.tsx
├─ main.tsx
└─ styles.css
```

Тесты лежат рядом с исходником: `path.test.ts` возле `path.ts`.

---

### Задача 1: Каркас проекта и адресация путей

**Файлы:**
- Создать: `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`
- Создать: `src/core/world/path.ts`
- Тест: `src/core/world/path.test.ts`

**Интерфейсы:**
- Отдаёт: `parsePath(path: string): (string|number)[]`,
  `getPath<T>(root: unknown, path: string): T | undefined`,
  `setPath(root: unknown, path: string, value: unknown): void`

- [ ] **Шаг 1: Каркас**

`package.json`:
```json
{
  "name": "helpdesk-sim",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "react": "18.3.1",
    "react-dom": "18.3.1",
    "zustand": "4.5.5"
  },
  "devDependencies": {
    "@types/react": "18.3.12",
    "@types/react-dom": "18.3.1",
    "@vitejs/plugin-react": "4.3.3",
    "typescript": "5.6.3",
    "vite": "5.4.10",
    "vitest": "2.1.4"
  }
}
```

`tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noEmit": true,
    "skipLibCheck": true,
    "types": ["vitest/globals"]
  },
  "include": ["src"]
}
```

`vite.config.ts`:
```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: { globals: true, environment: 'node' },
})
```

`index.html`:
```html
<!doctype html>
<html lang="ru">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Служба поддержки — тренажёр</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

Выполнить: `npm install`

- [ ] **Шаг 2: Написать падающий тест**

`src/core/world/path.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { parsePath, getPath, setPath } from './path'

describe('parsePath', () => {
  it('разбирает точки и индексы массива', () => {
    expect(parsePath('devices.AL-LPT-0447.adapters[0].ip'))
      .toEqual(['devices', 'AL-LPT-0447', 'adapters', 0, 'ip'])
  })

  it('разбирает одиночный сегмент', () => {
    expect(parsePath('org')).toEqual(['org'])
  })
})

describe('getPath', () => {
  const root = { devices: { 'AL-LPT-0447': { adapters: [{ ip: '169.254.23.11' }] } } }

  it('достаёт вложенное значение через индекс массива', () => {
    expect(getPath(root, 'devices.AL-LPT-0447.adapters[0].ip')).toBe('169.254.23.11')
  })

  it('возвращает undefined для несуществующего пути', () => {
    expect(getPath(root, 'devices.NOPE.adapters[0].ip')).toBeUndefined()
  })
})

describe('setPath', () => {
  it('записывает значение по вложенному пути', () => {
    const root = { devices: { 'AL-LPT-0447': { adapters: [{ ip: '169.254.23.11' }] } } }
    setPath(root, 'devices.AL-LPT-0447.adapters[0].ip', '10.20.14.88')
    expect(root.devices['AL-LPT-0447'].adapters[0].ip).toBe('10.20.14.88')
  })

  it('бросает исключение, если промежуточный сегмент отсутствует', () => {
    const root = { devices: {} }
    expect(() => setPath(root, 'devices.NOPE.adapters[0].ip', 'x'))
      .toThrow('путь не существует')
  })
})
```

- [ ] **Шаг 3: Запустить тест и убедиться, что он падает**

Выполнить: `npx vitest run src/core/world/path.test.ts`
Ожидается: FAIL — `Failed to resolve import "./path"`

- [ ] **Шаг 4: Реализовать**

`src/core/world/path.ts`:
```ts
export type PathSegment = string | number

/**
 * Разбирает путь вида "devices.AL-LPT-0447.adapters[0].ip".
 * Имена хостов содержат дефисы, но не точки — точка всегда разделитель.
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

export function getPath<T = unknown>(root: unknown, path: string): T | undefined {
  let cur: unknown = root
  for (const seg of parsePath(path)) {
    if (cur === null || typeof cur !== 'object') return undefined
    cur = (cur as Record<PathSegment, unknown>)[seg]
  }
  return cur as T | undefined
}

export function setPath(root: unknown, path: string, value: unknown): void {
  const segs = parsePath(path)
  const last = segs.pop()
  if (last === undefined) throw new Error(`пустой путь`)
  let cur: unknown = root
  for (const seg of segs) {
    if (cur === null || typeof cur !== 'object') throw new Error(`путь не существует: ${path}`)
    const next = (cur as Record<PathSegment, unknown>)[seg]
    if (next === undefined) throw new Error(`путь не существует: ${path}`)
    cur = next
  }
  if (cur === null || typeof cur !== 'object') throw new Error(`путь не существует: ${path}`)
  ;(cur as Record<PathSegment, unknown>)[last] = value
}
```

- [ ] **Шаг 5: Запустить тест и убедиться, что он проходит**

Выполнить: `npx vitest run src/core/world/path.test.ts`
Ожидается: PASS, 6 тестов

- [ ] **Шаг 6: Коммит**

```bash
git add -A
git commit -F - <<'EOF'
Каркас проекта и адресация путей в состоянии мира

Vite + TypeScript + React + Vitest. parsePath/getPath/setPath для
инъекции поломок по путям вида devices.AL-LPT-0447.adapters[0].ip.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Задача 2: Словарь брендов и типы состояния мира

**Файлы:**
- Создать: `src/brand.ts`, `src/core/world/types.ts`
- Тест: `src/brand.test.ts`

**Интерфейсы:**
- Потребляет: ничего
- Отдаёт: `BRAND` (константы), типы `WorldState`, `Device`, `Adapter`,
  `NetworkSegment`, `DnsServer`, `OrgUser`, `Clock`

- [ ] **Шаг 1: Написать падающий тест**

`src/brand.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { BRAND, FORBIDDEN_TRADEMARKS } from './brand'

describe('словарь брендов', () => {
  it('задаёт компанию и домен', () => {
    expect(BRAND.company).toBe('Arcline Logistics')
    expect(BRAND.domain).toBe('arcline.corp')
    expect(BRAND.dnsSuffix).toBe('corp.arcline.local')
  })

  it('не содержит реальных товарных знаков', () => {
    const blob = JSON.stringify(BRAND).toLowerCase()
    for (const tm of FORBIDDEN_TRADEMARKS) {
      expect(blob).not.toContain(tm)
    }
  })
})
```

- [ ] **Шаг 2: Запустить тест и убедиться, что он падает**

Выполнить: `npx vitest run src/brand.test.ts`
Ожидается: FAIL — `Failed to resolve import "./brand"`

- [ ] **Шаг 3: Реализовать словарь брендов**

`src/brand.ts`:
```ts
/** Реальные марки, которые не должны попасть ни в код, ни в данные. */
export const FORBIDDEN_TRADEMARKS = [
  'microsoft', 'windows nt', 'dell', 'hewlett', 'lenovo', 'thinkpad',
  'cisco', 'apple', 'ipad', 'macbook', 'canon', 'logitech', 'jabra',
  'zebra', 'panasonic', 'office 365', 'onedrive', 'outlook', 'teams',
] as const

export const BRAND = {
  company: 'Arcline Logistics',
  domain: 'arcline.corp',
  dnsSuffix: 'corp.arcline.local',

  os: 'Vantage Windows',
  osVersion: '10.0.22631.3880',
  browser: 'Larkspur Browser',
  mail: 'ArcMail',
  office: 'WorkGrid 365',
  chat: 'Loopline',
  cloud: 'ArcDrive',

  vendors: {
    laptop: ['Torvald', 'Novatek', 'Kestrel'],
    desktop: ['Novatek', 'Kestrel'],
    tablet: ['Bramble'],
    network: ['Ferrix'],
    printer: ['Kiyomi'],
    peripheral: ['Halyard'],
  },
} as const
```

Примечание: `'windows nt'` в списке, а не `'windows'` — строка
`Windows IP Configuration` является частью вывода команд и обязана
совпадать с настоящей, это не марка продукта в наших данных.

- [ ] **Шаг 4: Реализовать типы мира**

`src/core/world/types.ts`:
```ts
/** Часы инжектируются, чтобы ядро оставалось детерминированным. */
export interface Clock {
  now(): Date
}

export interface Adapter {
  name: string                 // 'Ethernet'
  description: string          // 'Ethernet Adapter'
  mac: string                  // 'A4-83-E7-2C-91-44'
  dhcpEnabled: boolean
  autoconfigEnabled: boolean
  /** true, когда адрес самоназначен (169.254.x.x) */
  autoconfigured: boolean
  ip: string
  mask: string
  gateway: string
  dns: string[]
  leaseObtained: string | null // ISO
  leaseExpires: string | null  // ISO
  linkUp: boolean
  /** VLAN сегмента, к которому физически подключён адаптер */
  segment: string
}

export interface Device {
  hostname: string
  assetTag: string
  vendor: string
  model: string
  assignedTo: string           // samAccountName
  adapters: Adapter[]
}

export interface NetworkSegment {
  vlan: string                 // 'vlan20'
  subnet: string               // '10.20.14.0/24'
  gateway: string              // '10.20.14.1'
  dhcpServer: string           // '10.20.14.5'
  /** false — DHCP не отвечает на этом сегменте */
  dhcpHealthy: boolean
  /** пул, из которого выдаются адреса */
  leasePool: string[]
  dns: string[]
}

export interface DnsServer {
  ip: string
  reachable: boolean
  zones: Record<string, string>   // 'internal-portal.arcline.corp' -> '10.20.14.50'
}

export interface OrgUser {
  samAccountName: string
  displayName: string
  dept: string
  title: string
  email: string
  phone: string
  primaryDevice: string
}

export interface WorldState {
  org: { users: OrgUser[] }
  devices: Record<string, Device>
  network: {
    segments: NetworkSegment[]
    dnsServers: DnsServer[]
    /** публичные адреса, которые отвечают на ping при рабочем маршруте */
    publicHosts: string[]
  }
}
```

- [ ] **Шаг 5: Запустить тест и убедиться, что он проходит**

Выполнить: `npx vitest run src/brand.test.ts`
Ожидается: PASS, 2 теста

- [ ] **Шаг 6: Коммит**

```bash
git add -A
git commit -F - <<'EOF'
Словарь вымышленных брендов и типы состояния мира

Arcline Logistics вместо реальных марок, с тестом на отсутствие
товарных знаков. WorldState: org, devices с адаптерами, network с
сегментами, DHCP и DNS. Часы инжектируются.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Задача 3: Стартовый мир и инъекция поломок

**Файлы:**
- Создать: `src/core/world/seed.ts`, `src/core/world/world.ts`
- Тест: `src/core/world/world.test.ts`

**Интерфейсы:**
- Потребляет: `setPath` (задача 1), типы `WorldState` (задача 2)
- Отдаёт: `createWorld(): WorldState`, `cloneWorld(w): WorldState`,
  `applyInject(w, patches: InjectPatch[]): void`,
  `InjectPatch = { path: string; value: unknown }`

- [ ] **Шаг 1: Написать падающий тест**

`src/core/world/world.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { createWorld, cloneWorld, applyInject } from './world'

describe('createWorld', () => {
  it('создаёт машину заявителя со здоровым адресом', () => {
    const w = createWorld()
    const a = w.devices['AL-LPT-0447']!.adapters[0]!
    expect(a.ip).toBe('10.20.14.88')
    expect(a.gateway).toBe('10.20.14.1')
    expect(a.autoconfigured).toBe(false)
  })

  it('сегмент vlan20 здоров по умолчанию', () => {
    const w = createWorld()
    expect(w.network.segments.find(s => s.vlan === 'vlan20')!.dhcpHealthy).toBe(true)
  })
})

describe('cloneWorld', () => {
  it('делает глубокую копию — правка копии не трогает оригинал', () => {
    const a = createWorld()
    const b = cloneWorld(a)
    b.devices['AL-LPT-0447']!.adapters[0]!.ip = '1.2.3.4'
    expect(a.devices['AL-LPT-0447']!.adapters[0]!.ip).toBe('10.20.14.88')
  })
})

describe('applyInject', () => {
  it('ломает адаптер по списку патчей', () => {
    const w = createWorld()
    applyInject(w, [
      { path: 'devices.AL-LPT-0447.adapters[0].ip', value: '169.254.23.11' },
      { path: 'devices.AL-LPT-0447.adapters[0].gateway', value: '' },
      { path: 'devices.AL-LPT-0447.adapters[0].autoconfigured', value: true },
    ])
    const a = w.devices['AL-LPT-0447']!.adapters[0]!
    expect(a.ip).toBe('169.254.23.11')
    expect(a.gateway).toBe('')
    expect(a.autoconfigured).toBe(true)
  })

  it('падает на несуществующем пути, а не проглатывает опечатку', () => {
    const w = createWorld()
    expect(() => applyInject(w, [{ path: 'devices.NOPE.adapters[0].ip', value: 'x' }]))
      .toThrow('путь не существует')
  })
})
```

- [ ] **Шаг 2: Запустить тест и убедиться, что он падает**

Выполнить: `npx vitest run src/core/world/world.test.ts`
Ожидается: FAIL — `Failed to resolve import "./world"`

- [ ] **Шаг 3: Реализовать стартовый мир**

`src/core/world/seed.ts`:
```ts
import { BRAND } from '../../brand'
import type { WorldState } from './types'

export function seedWorld(): WorldState {
  return {
    org: {
      users: [
        {
          samAccountName: 'p.raman',
          displayName: 'Priya Raman',
          dept: 'Sales',
          title: 'Account Executive',
          email: `priya.raman@${BRAND.domain}`,
          phone: '+1 (512) 555-0148',
          primaryDevice: 'AL-LPT-0447',
        },
        {
          samAccountName: 's.okafor',
          displayName: 'Sam Okafor',
          dept: 'Finance',
          title: 'Financial Analyst',
          email: `sam.okafor@${BRAND.domain}`,
          phone: '+1 (512) 555-0152',
          primaryDevice: 'AL-DSK-0192',
        },
      ],
    },

    devices: {
      'AL-LPT-0447': {
        hostname: 'AL-LPT-0447',
        assetTag: 'AL-L0447',
        vendor: 'Torvald',
        model: 'WorkLine T14 Gen 4',
        assignedTo: 'p.raman',
        adapters: [
          {
            name: 'Ethernet',
            description: 'Ethernet Adapter',
            mac: 'A4-83-E7-2C-91-44',
            dhcpEnabled: true,
            autoconfigEnabled: true,
            autoconfigured: false,
            ip: '10.20.14.88',
            mask: '255.255.255.0',
            gateway: '10.20.14.1',
            dns: ['10.20.14.10', '10.20.14.11'],
            leaseObtained: '2026-09-09T09:00:00.000Z',
            leaseExpires: '2026-09-10T09:00:00.000Z',
            linkUp: true,
            segment: 'vlan20',
          },
        ],
      },
      'AL-DSK-0192': {
        hostname: 'AL-DSK-0192',
        assetTag: 'AL-D0192',
        vendor: 'Novatek',
        model: 'OptiLine 7010',
        assignedTo: 's.okafor',
        adapters: [
          {
            name: 'Ethernet',
            description: 'Ethernet Adapter',
            mac: 'B2-1E-4C-77-03-A9',
            dhcpEnabled: true,
            autoconfigEnabled: true,
            autoconfigured: false,
            ip: '10.20.14.91',
            mask: '255.255.255.0',
            gateway: '10.20.14.1',
            dns: ['10.20.14.10', '10.20.14.11'],
            leaseObtained: '2026-09-09T08:30:00.000Z',
            leaseExpires: '2026-09-10T08:30:00.000Z',
            linkUp: true,
            segment: 'vlan20',
          },
        ],
      },
    },

    network: {
      segments: [
        {
          vlan: 'vlan20',
          subnet: '10.20.14.0/24',
          gateway: '10.20.14.1',
          dhcpServer: '10.20.14.5',
          dhcpHealthy: true,
          leasePool: ['10.20.14.88', '10.20.14.89', '10.20.14.90'],
          dns: ['10.20.14.10', '10.20.14.11'],
        },
      ],
      dnsServers: [
        {
          ip: '10.20.14.10',
          reachable: true,
          zones: {
            [`internal-portal.${BRAND.domain}`]: '10.20.14.50',
            [`fileserver.${BRAND.domain}`]: '10.20.14.15',
          },
        },
        { ip: '10.20.14.11', reachable: true, zones: {} },
      ],
      publicHosts: ['8.8.8.8', '1.1.1.1'],
    },
  }
}
```

- [ ] **Шаг 4: Реализовать операции над миром**

`src/core/world/world.ts`:
```ts
import { setPath } from './path'
import { seedWorld } from './seed'
import type { WorldState } from './types'

export interface InjectPatch {
  path: string
  value: unknown
}

export function createWorld(): WorldState {
  return seedWorld()
}

export function cloneWorld(w: WorldState): WorldState {
  return structuredClone(w)
}

export function applyInject(w: WorldState, patches: InjectPatch[]): void {
  for (const p of patches) setPath(w, p.path, p.value)
}
```

- [ ] **Шаг 5: Запустить тест и убедиться, что он проходит**

Выполнить: `npx vitest run src/core/world/world.test.ts`
Ожидается: PASS, 5 тестов

- [ ] **Шаг 6: Коммит**

```bash
git add -A
git commit -F - <<'EOF'
Стартовый мир Arcline и инъекция поломок

Две машины, сегмент vlan20 с DHCP и двумя DNS, две учётные записи.
applyInject падает на несуществующем пути, чтобы опечатка в сценарии
не превращалась в тихо неработающую поломку.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Задача 4: Журнал сессии

**Файлы:**
- Создать: `src/core/session/types.ts`, `src/core/session/session.ts`
- Тест: `src/core/session/session.test.ts`

**Интерфейсы:**
- Потребляет: `Clock` (задача 2)
- Отдаёт: `createSession()`, `recordCommand`, `recordChange`, `recordDialogue`,
  `setFlag`, `addDangerousAction`; типы `SessionLog`, `CommandEntry`,
  `ChangeEntry`, `DialogueEntry`, `SessionFlags`

- [ ] **Шаг 1: Написать падающий тест**

`src/core/session/session.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import {
  createSession, recordCommand, recordChange, recordDialogue,
  setFlag, addDangerousAction,
} from './session'
import type { Clock } from '../world/types'

const clock: Clock = { now: () => new Date('2026-09-09T18:00:00.000Z') }

describe('журнал сессии', () => {
  it('стартует пустым со сброшенными флагами', () => {
    const s = createSession()
    expect(s.commands).toEqual([])
    expect(s.flags.identityVerified).toBe(false)
    expect(s.flags.userConfirmed).toBe(false)
    expect(s.flags.dangerousActions).toEqual([])
  })

  it('пишет команду с машиной, строкой и кодом возврата', () => {
    const s = createSession()
    recordCommand(s, clock, 'AL-LPT-0447', 'ipconfig /all', 0)
    expect(s.commands).toHaveLength(1)
    expect(s.commands[0]).toMatchObject({
      device: 'AL-LPT-0447', cmdline: 'ipconfig /all', exitCode: 0,
      at: '2026-09-09T18:00:00.000Z',
    })
  })

  it('пишет изменение с прежним и новым значением', () => {
    const s = createSession()
    recordChange(s, clock, 'devices.AL-LPT-0447.adapters[0].ip',
      '169.254.23.11', '10.20.14.88', true)
    expect(s.changes[0]).toMatchObject({
      path: 'devices.AL-LPT-0447.adapters[0].ip',
      before: '169.254.23.11', after: '10.20.14.88', authorized: true,
    })
  })

  it('пишет реплику с каналом и собеседником', () => {
    const s = createSession()
    recordDialogue(s, clock, 'call', 'p.raman', 'requester',
      'Сайты не открываются')
    expect(s.dialogue[0]).toMatchObject({
      channel: 'call', with: 'p.raman', speaker: 'requester',
    })
  })

  it('копит опасные действия', () => {
    const s = createSession()
    addDangerousAction(s, clock, 'netsh advfirewall set allprofiles state off',
      'попытка отключить защиту')
    expect(s.flags.dangerousActions).toHaveLength(1)
    expect(s.flags.dangerousActions[0]!.reason).toBe('попытка отключить защиту')
  })

  it('ставит флаг', () => {
    const s = createSession()
    setFlag(s, 'identityVerified', true)
    expect(s.flags.identityVerified).toBe(true)
  })
})
```

- [ ] **Шаг 2: Запустить тест и убедиться, что он падает**

Выполнить: `npx vitest run src/core/session/session.test.ts`
Ожидается: FAIL — `Failed to resolve import "./session"`

- [ ] **Шаг 3: Реализовать типы**

`src/core/session/types.ts`:
```ts
export interface CommandEntry {
  at: string
  device: string
  cmdline: string
  exitCode: number
}

export interface ChangeEntry {
  at: string
  path: string
  before: unknown
  after: unknown
  authorized: boolean
}

export type DialogueChannel = 'call' | 'chat' | 'mail'
export type Speaker = 'technician' | 'requester'

export interface DialogueEntry {
  at: string
  channel: DialogueChannel
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
  identityVerified: boolean
  scopeChecked: boolean
  userConfirmed: boolean
  announcedBeforeActing: boolean
  dangerousActions: DangerousAction[]
}

export interface SessionLog {
  commands: CommandEntry[]
  changes: ChangeEntry[]
  dialogue: DialogueEntry[]
  flags: SessionFlags
}
```

- [ ] **Шаг 4: Реализовать операции**

`src/core/session/session.ts`:
```ts
import type { Clock } from '../world/types'
import type {
  SessionLog, SessionFlags, DialogueChannel, Speaker,
} from './types'

export function createSession(): SessionLog {
  return {
    commands: [],
    changes: [],
    dialogue: [],
    flags: {
      identityVerified: false,
      scopeChecked: false,
      userConfirmed: false,
      announcedBeforeActing: false,
      dangerousActions: [],
    },
  }
}

export function recordCommand(
  s: SessionLog, clock: Clock, device: string, cmdline: string, exitCode: number,
): void {
  s.commands.push({ at: clock.now().toISOString(), device, cmdline, exitCode })
}

export function recordChange(
  s: SessionLog, clock: Clock, path: string,
  before: unknown, after: unknown, authorized: boolean,
): void {
  s.changes.push({ at: clock.now().toISOString(), path, before, after, authorized })
}

export function recordDialogue(
  s: SessionLog, clock: Clock, channel: DialogueChannel,
  withWhom: string, speaker: Speaker, text: string,
): void {
  s.dialogue.push({ at: clock.now().toISOString(), channel, with: withWhom, speaker, text })
}

export function addDangerousAction(
  s: SessionLog, clock: Clock, action: string, reason: string,
): void {
  s.flags.dangerousActions.push({ at: clock.now().toISOString(), action, reason })
}

export function setFlag<K extends keyof Omit<SessionFlags, 'dangerousActions'>>(
  s: SessionLog, key: K, value: boolean,
): void {
  s.flags[key] = value
}
```

- [ ] **Шаг 5: Запустить тест и убедиться, что он проходит**

Выполнить: `npx vitest run src/core/session/session.test.ts`
Ожидается: PASS, 6 тестов

- [ ] **Шаг 6: Коммит**

```bash
git add -A
git commit -F - <<'EOF'
Журнал сессии как вход для оценки

Команды, изменения мира, реплики по каналам, флаги процесса и список
опасных действий. Время только из инжектируемых часов.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

Задачи 5–14 — во второй части плана
(`docs/superpowers/plans/2026-09-09-helpdesk-simulator-slice-0-1-part2.md`),
которая пишется следом: форматирование вывода Windows, разбор и реестр
команд, `ipconfig` с предусловиями, `ping`/`nslookup`, шлюз полномочий и
`netsh`, сценарий APIPA, очередь тикетов, оценка заметки, шесть измерений,
интерфейс.
