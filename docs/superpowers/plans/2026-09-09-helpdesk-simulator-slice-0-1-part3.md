# Срезы 0–1, часть 3: сценарий, тикеты, оценка

> Продолжение частей 1–2. Задачи 10–13.

---

### Задача 10: Сценарий и его загрузка

**Файлы:**
- Создать: `src/core/scenario/types.ts`, `src/core/scenario/load.ts`,
  `src/scenarios/net-apipa-no-lease.ts`
- Тест: `src/core/scenario/load.test.ts`

**Интерфейсы:**
- Потребляет: `applyInject`, `InjectPatch`, `createWorld`
- Отдаёт: типы `Scenario`, `Objective`, `Persona`;
  `loadScenario(s: Scenario): { world: WorldState; ticket: Ticket }`

- [ ] **Шаг 1: Написать падающий тест**

`src/core/scenario/load.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { loadScenario } from './load'
import { apipaNoLease } from '../../scenarios/net-apipa-no-lease'

describe('loadScenario', () => {
  it('ломает мир согласно инъекции', () => {
    const { world } = loadScenario(apipaNoLease)
    const a = world.devices['AL-LPT-0447']!.adapters[0]!
    expect(a.ip).toBe('169.254.23.11')
    expect(a.gateway).toBe('')
    expect(a.autoconfigured).toBe(true)
  })

  it('строит тикет из описания сценария', () => {
    const { ticket } = loadScenario(apipaNoLease)
    expect(ticket.number).toMatch(/^INC\d{7}$/)
    expect(ticket.status).toBe('new')
    expect(ticket.category).toBe('Сеть')
    expect(ticket.subcategory).toBe('Связность')
    expect(ticket.priority).toBe('P3')
    expect(ticket.requester).toBe('p.raman')
    expect(ticket.device).toBe('AL-LPT-0447')
    expect(ticket.resolutionCode).toBeNull()
  })

  it('сценарий несёт корневую причину и цели', () => {
    expect(apipaNoLease.rootCause).toContain('DHCP')
    expect(apipaNoLease.objectives.length).toBeGreaterThanOrEqual(5)
    const titles = apipaNoLease.objectives.map(o => o.title)
    expect(titles.some(t => t.includes('аренду'))).toBe(true)
    expect(titles.some(t => t.includes('заявител'))).toBe(true)
  })

  it('персона не знает разгадку', () => {
    const blob = JSON.stringify(apipaNoLease.persona).toLowerCase()
    expect(blob).not.toContain('dhcp')
    expect(blob).not.toContain('169.254')
  })

  it('запрещённые действия перечислены', () => {
    expect(apipaNoLease.actionsToAvoid.length).toBeGreaterThan(0)
  })
})
```

- [ ] **Шаг 2: Запустить тест и убедиться, что он падает**

Выполнить: `npx vitest run src/core/scenario/load.test.ts`
Ожидается: FAIL — модули не найдены

- [ ] **Шаг 3: Реализовать типы сценария**

`src/core/scenario/types.ts`:
```ts
import type { InjectPatch } from '../world/world'

export interface Objective {
  id: string
  title: string
  /** человекочитаемые шаги — показываются в подсказке */
  steps: string[]
  /** команды, засчитывающие цель; пусто для процессных целей */
  commands: string[]
  /** флаги сессии, которые должны быть подняты; пусто для технических */
  requires: string[]
  why: string
}

export interface Persona {
  /** то, что заявитель реально мог заметить */
  knows: string[]
  /** термины, которых он не понимает */
  doesntKnow: string[]
  /** что он может сделать, если попросить простыми словами */
  canDoIfAsked: string[]
  /** реплики на случай отсутствия модели: вопрос -> ответ */
  scripted: Array<{ ask: string; reply: string }>
}

export interface Scenario {
  id: string
  category: string
  subcategory: string
  priority: 'P1' | 'P2' | 'P3' | 'P4'
  service: string
  summary: string
  description: string
  requester: string
  device: string
  slaResponseHours: number
  slaResolveHours: number

  inject: InjectPatch[]
  rootCause: string
  objectives: Objective[]
  actionsToAvoid: string[]
  persona: Persona

  /** ожидаемый код закрытия */
  expectedResolution: 'solved' | 'escalate' | 'not-reproducible' | 'cancelled'
}
```

- [ ] **Шаг 4: Написать сценарий APIPA**

`src/scenarios/net-apipa-no-lease.ts`:
```ts
import type { Scenario } from '../core/scenario/types'

export const apipaNoLease: Scenario = {
  id: 'net-apipa-no-lease',
  category: 'Сеть',
  subcategory: 'Связность',
  priority: 'P3',
  service: 'Корпоративная сеть',
  summary: 'Не открываются сайты — нет доступа в интернет',
  description:
    'Здравствуйте, это Priya Raman из отдела продаж. Вернулась со встречи, '
    + 'и теперь ни один сайт не открывается — браузер пишет какую-то ошибку '
    + 'про DNS. Локальные программы работают, документы открываются. '
    + 'Скоро звонок клиенту, помогите, пожалуйста, вернуть AL-LPT-0447 в сеть.',
  requester: 'p.raman',
  device: 'AL-LPT-0447',
  slaResponseHours: 4,
  slaResolveHours: 24,

  inject: [
    { path: 'devices.AL-LPT-0447.adapters[0].ip', value: '169.254.23.11' },
    { path: 'devices.AL-LPT-0447.adapters[0].mask', value: '255.255.0.0' },
    { path: 'devices.AL-LPT-0447.adapters[0].gateway', value: '' },
    { path: 'devices.AL-LPT-0447.adapters[0].dns', value: [] },
    { path: 'devices.AL-LPT-0447.adapters[0].autoconfigured', value: true },
    { path: 'devices.AL-LPT-0447.adapters[0].leaseObtained', value: null },
    { path: 'devices.AL-LPT-0447.adapters[0].leaseExpires', value: null },
  ],

  rootCause:
    'В момент загрузки машины DHCP-релей на порту коммутатора был недоступен. '
    + 'Аренда не пришла, и Windows назначил адрес сам.',

  objectives: [
    {
      id: 'obj-diagnose',
      title: 'Увидеть самоназначенный адрес',
      steps: [
        'Подключиться к машине через удалённый доступ',
        'Открыть командную строку',
        'Выполнить ipconfig /all и прочитать адрес, шлюз и DNS',
      ],
      commands: ['ipconfig /all'],
      requires: [],
      why: 'Адрес 169.254.x.x означает, что Windows не дождался DHCP. '
        + 'Ошибка DNS в браузере — следствие, а не причина.',
    },
    {
      id: 'obj-renew',
      title: 'Получить настоящую аренду',
      steps: [
        'Выполнить ipconfig /release, чтобы снять самоназначенный адрес',
        'Выполнить ipconfig /renew, чтобы запросить аренду заново',
        'Повторить ipconfig /all и убедиться, что адрес, шлюз и DNS появились',
      ],
      commands: ['ipconfig /release', 'ipconfig /renew'],
      requires: [],
      why: 'Пока адаптер держит самоназначенный адрес, запрос к DHCP не уходит. '
        + 'Освобождение открывает путь новому запросу.',
    },
    {
      id: 'obj-ping',
      title: 'Проверить, что трафик уходит наружу',
      steps: ['Выполнить ping 8.8.8.8', 'Дождаться четырёх ответов'],
      commands: ['ping 8.8.8.8'],
      requires: [],
      why: 'Пинг публичного адреса подтверждает маршрутизацию, не завися от DNS.',
    },
    {
      id: 'obj-dns',
      title: 'Проверить разрешение внутренних имён',
      steps: ['Выполнить nslookup internal-portal.arcline.corp'],
      commands: ['nslookup internal-portal.arcline.corp'],
      requires: [],
      why: 'Это отделяет проблему имён от проблемы связности: '
        + 'пинг может проходить, а имена не разрешаться.',
    },
    {
      id: 'obj-confirm',
      title: 'Подтвердить результат у заявителя',
      steps: [
        'Позвонить или написать заявителю',
        'Попросить его повторить то, что не получалось',
        'Дождаться подтверждения от него, а не от своего экрана',
      ],
      commands: [],
      requires: ['userConfirmed'],
      why: 'Инцидент закрывает подтверждение пользователя. '
        + 'Работающий у вас экран ничего не доказывает.',
    },
    {
      id: 'obj-note',
      title: 'Написать заметку для заявителя и следующего техника',
      steps: [
        'Указать симптом словами заявителя',
        'Перечислить проверки и то, что они исключили',
        'Назвать внесённое изменение конкретно',
        'Указать, чем подтвердили',
        'Добавить, что нужно знать следующему',
      ],
      commands: [],
      requires: ['resolutionNotes'],
      why: 'Заметка — единственное, что останется от инцидента через месяц.',
    },
    {
      id: 'obj-code',
      title: 'Выбрать код закрытия',
      steps: ['Открыть панель рабочего процесса', 'Выбрать подходящий код'],
      commands: [],
      requires: ['resolutionCode'],
      why: 'Код питает отчётность: без него повторяющаяся проблема невидима.',
    },
  ],

  actionsToAvoid: [
    'netsh advfirewall set allprofiles state off',
    'прописать статический IP вместо получения аренды',
    'перезагрузить машину, не разобравшись',
  ],

  persona: {
    knows: [
      'сайты не открываются',
      'локальные программы работают',
      'вернулась со встречи, до этого всё работало',
      'ничего сама не устанавливала',
      'скоро звонок клиенту',
    ],
    doesntKnow: ['IP-адрес', 'DNS', 'аренда адреса', 'шлюз'],
    canDoIfAsked: [
      'посмотреть, горит ли лампочка возле разъёма сетевого кабеля',
      'перезагрузить компьютер',
      'открыть сайт и сказать, что появилось на экране',
    ],
    scripted: [
      { ask: 'Когда это началось?',
        reply: 'Сегодня, когда я вернулась со встречи. Утром всё работало.' },
      { ask: 'Что именно вы видите на экране?',
        reply: 'Белая страница и что-то про DNS. Я не запомнила, там длинными буквами.' },
      { ask: 'У коллег рядом так же?',
        reply: 'Не знаю, я не спрашивала. Сейчас гляну... нет, у соседки всё открывается.' },
      { ask: 'Вы что-нибудь меняли или устанавливали?',
        reply: 'Нет, я вообще ничего не трогала. Просто ушла и вернулась.' },
      { ask: 'Проверьте, пожалуйста, сайт ещё раз',
        reply: 'Сейчас... да, открылось! Спасибо большое.' },
    ],
  },

  expectedResolution: 'solved',
}
```

- [ ] **Шаг 5: Реализовать загрузчик**

`src/core/scenario/load.ts`:
```ts
import { createWorld, applyInject } from '../world/world'
import type { WorldState } from '../world/types'
import type { Ticket } from '../tickets/types'
import type { Scenario } from './types'

/** Детерминированный номер инцидента из идентификатора сценария. */
function incidentNumber(id: string): string {
  let h = 0
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return 'INC' + String(h % 10_000_000).padStart(7, '0')
}

export function loadScenario(s: Scenario): { world: WorldState; ticket: Ticket } {
  const world = createWorld()
  applyInject(world, s.inject)

  const ticket: Ticket = {
    number: incidentNumber(s.id),
    scenarioId: s.id,
    summary: s.summary,
    description: s.description,
    service: s.service,
    category: s.category,
    subcategory: s.subcategory,
    priority: s.priority,
    assignmentGroup: 'Служба поддержки, первая линия',
    status: 'new',
    resolutionCode: null,
    workNotes: '',
    resolutionNotes: '',
    requester: s.requester,
    device: s.device,
    createdAt: null,
    slaResponseHours: s.slaResponseHours,
    slaResolveHours: s.slaResolveHours,
    communications: [],
  }

  return { world, ticket }
}
```

- [ ] **Шаг 6: Запустить тест и убедиться, что он проходит**

Выполнить: `npx vitest run src/core/scenario/load.test.ts`
Ожидается: PASS, 5 тестов (после задачи 11, дающей тип `Ticket`)

Если типа `Ticket` ещё нет — выполнить задачу 11 и вернуться сюда.

- [ ] **Шаг 7: Коммит**

```bash
git add -A
git commit -F - <<'EOF'
Сценарий APIPA как инъекция поломки со списком целей

Сценарий описывает, во что сломан мир, корневую причину, семь целей
(включая три процессных), запрещённые действия и персону заявителя.
Тест проверяет, что персона не знает разгадку.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Задача 11: Тикеты и очередь

**Файлы:**
- Создать: `src/core/tickets/types.ts`, `src/core/tickets/queue.ts`
- Тест: `src/core/tickets/queue.test.ts`

**Интерфейсы:**
- Отдаёт: типы `Ticket`, `TicketStatus`, `ResolutionCode`, `Communication`;
  `claim(state, number, clock)`, `setStatus(state, number, status)`,
  `resolve(state, number, code, clock)`, `unassign(state, number)`;
  `QueueState = { tickets: Ticket[]; assigned: string | null }`

- [ ] **Шаг 1: Написать падающий тест**

`src/core/tickets/queue.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { claim, setStatus, resolve, unassign, createQueue } from './queue'
import { loadScenario } from '../scenario/load'
import { apipaNoLease } from '../../scenarios/net-apipa-no-lease'
import type { QueueState } from './queue'

const clock = { now: () => new Date('2026-09-09T18:00:00.000Z') }

let q: QueueState
let num: string

beforeEach(() => {
  const { ticket } = loadScenario(apipaNoLease)
  const second = { ...ticket, number: 'INC0000002', scenarioId: 'other' }
  q = createQueue([ticket, second])
  num = ticket.number
})

describe('claim', () => {
  it('переводит тикет в назначенный и запоминает его', () => {
    claim(q, num, clock)
    expect(q.assigned).toBe(num)
    expect(q.tickets.find(t => t.number === num)!.status).toBe('assigned')
  })

  it('проставляет время создания при первом взятии', () => {
    claim(q, num, clock)
    expect(q.tickets.find(t => t.number === num)!.createdAt)
      .toBe('2026-09-09T18:00:00.000Z')
  })

  it('отказывает, если уже есть тикет в работе', () => {
    claim(q, num, clock)
    expect(() => claim(q, 'INC0000002', clock))
      .toThrow('сначала завершите текущий тикет')
  })
})

describe('setStatus', () => {
  it('меняет рабочий статус', () => {
    claim(q, num, clock)
    setStatus(q, num, 'in-progress')
    expect(q.tickets.find(t => t.number === num)!.status).toBe('in-progress')
  })

  it('не позволяет выставить completed напрямую', () => {
    claim(q, num, clock)
    expect(() => setStatus(q, num, 'completed' as never))
      .toThrow('статус сам по себе не закрывает тикет')
  })

  it('не позволяет менять статус невзятого тикета', () => {
    expect(() => setStatus(q, num, 'in-progress'))
      .toThrow('тикет не назначен на вас')
  })
})

describe('resolve', () => {
  it('закрывает тикет с кодом и освобождает слот', () => {
    claim(q, num, clock)
    resolve(q, num, 'solved', clock)
    const t = q.tickets.find(x => x.number === num)!
    expect(t.status).toBe('completed')
    expect(t.resolutionCode).toBe('solved')
    expect(q.assigned).toBeNull()
  })

  it('после закрытия можно взять следующий', () => {
    claim(q, num, clock)
    resolve(q, num, 'solved', clock)
    claim(q, 'INC0000002', clock)
    expect(q.assigned).toBe('INC0000002')
  })

  it('нельзя закрыть чужой тикет', () => {
    expect(() => resolve(q, num, 'solved', clock))
      .toThrow('тикет не назначен на вас')
  })
})

describe('unassign', () => {
  it('возвращает тикет в очередь', () => {
    claim(q, num, clock)
    unassign(q, num)
    expect(q.assigned).toBeNull()
    expect(q.tickets.find(t => t.number === num)!.status).toBe('new')
  })
})
```

- [ ] **Шаг 2: Запустить тест и убедиться, что он падает**

Выполнить: `npx vitest run src/core/tickets/queue.test.ts`
Ожидается: FAIL — модули не найдены

- [ ] **Шаг 3: Реализовать типы**

`src/core/tickets/types.ts`:
```ts
export type TicketStatus = 'new' | 'assigned' | 'in-progress' | 'pending-user' | 'completed'

/** Рабочие статусы, которые техник может выставить руками. */
export const WORKFLOW_STATUSES = ['assigned', 'in-progress', 'pending-user'] as const
export type WorkflowStatus = (typeof WORKFLOW_STATUSES)[number]

export type ResolutionCode = 'solved' | 'escalate' | 'not-reproducible' | 'cancelled'

export const RESOLUTION_LABELS: Record<ResolutionCode, string> = {
  solved: 'Решено (окончательно)',
  escalate: 'Эскалация',
  'not-reproducible': 'Не решено (не воспроизводится)',
  cancelled: 'Закрыто (отменено пользователем)',
}

export interface Communication {
  at: string
  channel: 'call' | 'chat' | 'mail'
  from: string
  text: string
}

export interface Ticket {
  number: string
  scenarioId: string
  summary: string
  description: string
  service: string
  category: string
  subcategory: string
  priority: 'P1' | 'P2' | 'P3' | 'P4'
  assignmentGroup: string
  status: TicketStatus
  resolutionCode: ResolutionCode | null
  workNotes: string
  resolutionNotes: string
  requester: string
  device: string
  createdAt: string | null
  slaResponseHours: number
  slaResolveHours: number
  communications: Communication[]
}
```

- [ ] **Шаг 4: Реализовать очередь**

`src/core/tickets/queue.ts`:
```ts
import type { Clock } from '../world/types'
import type { Ticket, WorkflowStatus, ResolutionCode } from './types'

export interface QueueState {
  tickets: Ticket[]
  /** номер тикета в работе — одновременно можно держать только один */
  assigned: string | null
}

export function createQueue(tickets: Ticket[]): QueueState {
  return { tickets, assigned: null }
}

function find(q: QueueState, number: string): Ticket {
  const t = q.tickets.find(x => x.number === number)
  if (!t) throw new Error(`тикет не найден: ${number}`)
  return t
}

function requireMine(q: QueueState, number: string): Ticket {
  if (q.assigned !== number) throw new Error('тикет не назначен на вас')
  return find(q, number)
}

export function claim(q: QueueState, number: string, clock: Clock): void {
  if (q.assigned !== null && q.assigned !== number) {
    throw new Error('сначала завершите текущий тикет')
  }
  const t = find(q, number)
  if (t.status === 'completed') throw new Error('тикет уже закрыт')
  t.status = 'assigned'
  t.createdAt ??= clock.now().toISOString()
  q.assigned = number
}

export function setStatus(q: QueueState, number: string, status: WorkflowStatus): void {
  if (status === ('completed' as unknown as WorkflowStatus)) {
    throw new Error('статус сам по себе не закрывает тикет — используйте закрытие с кодом')
  }
  const t = requireMine(q, number)
  t.status = status
}

export function resolve(
  q: QueueState, number: string, code: ResolutionCode, _clock: Clock,
): void {
  const t = requireMine(q, number)
  t.resolutionCode = code
  t.status = 'completed'
  q.assigned = null
}

export function unassign(q: QueueState, number: string): void {
  const t = requireMine(q, number)
  t.status = 'new'
  q.assigned = null
}
```

- [ ] **Шаг 5: Запустить тесты и убедиться, что они проходят**

Выполнить: `npx vitest run src/core/tickets/ src/core/scenario/`
Ожидается: PASS, 15 тестов

- [ ] **Шаг 6: Коммит**

```bash
git add -A
git commit -F - <<'EOF'
Тикеты и очередь с одним тикетом в работе

Полная модель тикета: двухуровневая категория, два срока SLA, рабочий
статус отдельно от кода закрытия, две заметки, лента общения. Взять
второй тикет, не закрыв первый, нельзя. Статус completed напрямую
не выставляется.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Задача 12: Оценка заметки сверкой с журналом

**Файлы:**
- Создать: `src/core/grading/types.ts`, `src/core/grading/notes.ts`
- Тест: `src/core/grading/notes.test.ts`

**Интерфейсы:**
- Потребляет: `SessionLog`, `Ticket`, `Scenario`
- Отдаёт: `gradeNote(note, session, ticket, scenario): NoteScore`,
  `NoteScore = { score: number; parts: NotePart[]; penalties: Penalty[] }`,
  `NotePart = { id; label; earned: boolean; explain: string }`

Ключ: заметка сверяется не со словарём, а с **фактами из журнала** —
названы ли реально запускавшиеся команды, реально изменённые значения,
реально произошедшее подтверждение.

- [ ] **Шаг 1: Написать падающий тест**

`src/core/grading/notes.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { gradeNote } from './notes'
import { createSession, recordCommand, recordChange, recordDialogue, setFlag }
  from '../session/session'
import { loadScenario } from '../scenario/load'
import { apipaNoLease } from '../../scenarios/net-apipa-no-lease'
import type { SessionLog } from '../session/types'
import type { Ticket } from '../tickets/types'

const clock = { now: () => new Date('2026-09-09T18:00:00.000Z') }

let s: SessionLog
let ticket: Ticket

beforeEach(() => {
  s = createSession()
  ticket = loadScenario(apipaNoLease).ticket

  recordCommand(s, clock, 'AL-LPT-0447', 'ipconfig /all', 0)
  recordCommand(s, clock, 'AL-LPT-0447', 'ipconfig /renew', 1)   // проверка без находки
  recordCommand(s, clock, 'AL-LPT-0447', 'ipconfig /release', 0)
  recordCommand(s, clock, 'AL-LPT-0447', 'ipconfig /renew', 0)
  recordCommand(s, clock, 'AL-LPT-0447', 'ping 8.8.8.8', 0)
  recordChange(s, clock, 'devices.AL-LPT-0447.adapters[0].ip',
    '169.254.23.11', '10.20.14.88', true)
  recordDialogue(s, clock, 'call', 'p.raman', 'requester', 'Да, открылось, спасибо')
  setFlag(s, 'userConfirmed', true)
})

const GOOD = `Priya Raman сообщила, что не открывается ни один сайт, при этом
локальные программы работают. ipconfig /all показал самоназначенный адрес
169.254.23.11 без шлюза и без DNS — это исключило неверные настройки DNS и
указало на неполученную аренду. ipconfig /renew сам по себе завершился
ошибкой обращения к DHCP. После ipconfig /release повторный renew выдал
адрес 10.20.14.88 со шлюзом и DNS. Проверено: ping 8.8.8.8 отвечает,
заявительница подтвердила по телефону, что сайты открываются. Причина —
кратковременная недоступность DHCP-релея при загрузке; при повторении на
том же порту нужна проверка сетевой командой.`

describe('gradeNote — хорошая заметка', () => {
  it('набирает высокий балл', () => {
    const r = gradeNote(GOOD, s, ticket, apipaNoLease)
    expect(r.score).toBeGreaterThanOrEqual(8)
    expect(r.penalties).toHaveLength(0)
  })

  it('засчитывает все пять частей', () => {
    const r = gradeNote(GOOD, s, ticket, apipaNoLease)
    expect(r.parts.every(p => p.earned)).toBe(true)
  })
})

describe('gradeNote — пустая отписка', () => {
  it('«починил» получает ноль и штраф', () => {
    const r = gradeNote('починил', s, ticket, apipaNoLease)
    expect(r.score).toBe(0)
    expect(r.penalties.some(p => p.id === 'no-specifics')).toBe(true)
  })
})

describe('gradeNote — частичная заметка', () => {
  it('без упоминания подтверждения теряет соответствующую часть', () => {
    const note = `Не открывались сайты. ipconfig /all показал 169.254.23.11 без шлюза.
      ipconfig /release и ipconfig /renew выдали 10.20.14.88.`
    const r = gradeNote(note, s, ticket, apipaNoLease)
    const confirm = r.parts.find(p => p.id === 'verification')!
    expect(confirm.earned).toBe(false)
    expect(r.score).toBeLessThan(8)
  })

  it('без единой безрезультатной проверки теряет часть про исключения', () => {
    const note = `Не открывались сайты. Сделал ipconfig /release и ipconfig /renew,
      адрес стал 10.20.14.88. Заявительница подтвердила, что открывается.`
    const r = gradeNote(note, s, ticket, apipaNoLease)
    expect(r.parts.find(p => p.id === 'checks')!.earned).toBe(false)
  })
})

describe('gradeNote — штрафы', () => {
  it('пароль открытым текстом штрафуется', () => {
    const note = GOOD + ' Временный пароль: Passw0rd!2026'
    const r = gradeNote(note, s, ticket, apipaNoLease)
    expect(r.penalties.some(p => p.id === 'plaintext-secret')).toBe(true)
  })
})
```

- [ ] **Шаг 2: Запустить тест и убедиться, что он падает**

Выполнить: `npx vitest run src/core/grading/notes.test.ts`
Ожидается: FAIL — модули не найдены

- [ ] **Шаг 3: Реализовать типы**

`src/core/grading/types.ts`:
```ts
export interface NotePart {
  id: 'symptom' | 'checks' | 'change' | 'verification' | 'handoff'
  label: string
  earned: boolean
  explain: string
}

export interface Penalty {
  id: 'plaintext-secret' | 'no-specifics' | 'symptom-as-diagnosis'
  label: string
  points: number
}

export interface NoteScore {
  /** 0–10 */
  score: number
  parts: NotePart[]
  penalties: Penalty[]
}
```

- [ ] **Шаг 4: Реализовать оценку заметки**

`src/core/grading/notes.ts`:
```ts
import type { SessionLog } from '../session/types'
import type { Ticket } from '../tickets/types'
import type { Scenario } from '../scenario/types'
import type { NoteScore, NotePart, Penalty } from './types'

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ')

/** Все значения, которые реально фигурировали в изменениях мира. */
function changedValues(session: SessionLog): string[] {
  const out: string[] = []
  for (const c of session.changes) {
    for (const v of [c.before, c.after]) {
      if (typeof v === 'string' && v.length > 3) out.push(v)
    }
  }
  return out
}

/** Имена команд с флагами, реально запускавшиеся в сессии. */
function ranCommands(session: SessionLog): string[] {
  return [...new Set(session.commands.map(c => c.cmdline.toLowerCase()))]
}

/** Команды, завершившиеся неуспешно — «проверки, которые ничего не нашли». */
function fruitlessCommands(session: SessionLog): string[] {
  return [...new Set(session.commands.filter(c => c.exitCode !== 0)
    .map(c => c.cmdline.toLowerCase()))]
}

export function gradeNote(
  note: string, session: SessionLog, ticket: Ticket, scenario: Scenario,
): NoteScore {
  const n = norm(note)
  const words = n.split(' ').filter(Boolean).length

  const ran = ranCommands(session)
  const fruitless = fruitlessCommands(session)
  const values = changedValues(session)

  // 1. Симптом словами заявителя
  const symptomTokens = ['сайт', 'не открыва', 'локальные программы', 'интернет']
  const symptomEarned = symptomTokens.some(t => n.includes(t))

  // 2. Проверки и что они исключили — назван хотя бы один безрезультатный вызов
  const mentionsFruitless = fruitless.some(c => n.includes(c))
  const mentionsAnyCommand = ran.filter(c => n.includes(c)).length >= 2
  const checksEarned = mentionsAnyCommand && mentionsFruitless

  // 3. Конкретное изменение — назван реальный новый адрес или значение
  const changeEarned = values.some(v => n.includes(v.toLowerCase()))

  // 4. Подтверждение — оно было в журнале и упомянуто в заметке
  const confirmedInLog = session.flags.userConfirmed
    || session.dialogue.some(d => d.speaker === 'requester')
  const mentionsConfirm = ['подтверд', 'заявитель', 'пользовател', 'ping', 'проверено']
    .some(t => n.includes(t))
  const verificationEarned = confirmedInLog && mentionsConfirm

  // 5. Что нужно следующему
  const handoffEarned = ['причин', 'при повторении', 'следующ', 'эскал', 'сетев']
    .some(t => n.includes(t))

  const parts: NotePart[] = [
    { id: 'symptom', label: 'Симптом словами заявителя', earned: symptomEarned,
      explain: symptomEarned ? 'Симптом описан так, как его видел пользователь.'
        : 'Не сказано, что именно наблюдал заявитель.' },
    { id: 'checks', label: 'Проверки и что они исключили', earned: checksEarned,
      explain: checksEarned
        ? 'Названы выполненные проверки, включая безрезультатную.'
        : 'Нужно назвать хотя бы две реально выполненные команды, '
          + 'и хотя бы одну, которая ничего не дала.' },
    { id: 'change', label: 'Внесённое изменение', earned: changeEarned,
      explain: changeEarned ? 'Изменение названо конкретным значением.'
        : 'Не названо конкретное значение — адрес, служба или учётная запись.' },
    { id: 'verification', label: 'Чем подтверждено', earned: verificationEarned,
      explain: verificationEarned ? 'Подтверждение состоялось и упомянуто.'
        : confirmedInLog ? 'Подтверждение было, но в заметке о нём ни слова.'
          : 'Подтверждения от заявителя вообще не было.' },
    { id: 'handoff', label: 'Что нужно следующему', earned: handoffEarned,
      explain: handoffEarned ? 'Указана причина или что делать при повторении.'
        : 'Следующий техник не узнает ни причины, ни что делать при повторе.' },
  ]

  const penalties: Penalty[] = []

  if (/пароль\s*[:—-]?\s*\S{6,}/i.test(note) || /passw0rd/i.test(note)) {
    penalties.push({ id: 'plaintext-secret',
      label: 'Пароль или секрет открытым текстом', points: 3 })
  }

  if (words < 12 && !changeEarned) {
    penalties.push({ id: 'no-specifics',
      label: 'Отписка без единой конкретики', points: 10 })
  }

  const earned = parts.filter(p => p.earned).length
  const raw = Math.round((earned / parts.length) * 10)
  const score = Math.max(0, raw - penalties.reduce((a, p) => a + p.points, 0))

  void ticket
  void scenario
  return { score, parts, penalties }
}
```

- [ ] **Шаг 5: Запустить тест и убедиться, что он проходит**

Выполнить: `npx vitest run src/core/grading/notes.test.ts`
Ожидается: PASS, 6 тестов

Если какая-то часть не засчиталась на «хорошей» заметке — правьте
списки токенов в `notes.ts`, а не тест: эталон здесь заметка,
написанная по рубрике.

- [ ] **Шаг 6: Коммит**

```bash
git add -A
git commit -F - <<'EOF'
Оценка work note сверкой с журналом сессии

Заметка проверяется не по словарю, а по фактам: названы ли реально
запускавшиеся команды (включая безрезультатную), реально изменённые
значения, реально состоявшееся подтверждение. Штрафы за секрет
открытым текстом и за отписку.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Задача 13: Шесть измерений и вердикт

**Файлы:**
- Создать: `src/core/grading/grade.ts`
- Тест: `src/core/grading/grade.test.ts`

**Интерфейсы:**
- Потребляет: `gradeNote`, `SessionLog`, `Ticket`, `Scenario`, `WorldState`
- Отдаёт: `gradeIncident(args): Scorecard`,
  `Scorecard = { verdict: 'full'|'partial'|'fail'; points: number;
                 dimensions: DimensionScore[]; note: NoteScore;
                 objectives: ObjectiveResult[]; silentFaults: string[] }`

- [ ] **Шаг 1: Написать падающий тест**

`src/core/grading/grade.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { gradeIncident } from './grade'
import { createSession, recordCommand, recordChange, setFlag, addDangerousAction }
  from '../session/session'
import { loadScenario } from '../scenario/load'
import { apipaNoLease } from '../../scenarios/net-apipa-no-lease'

const clock = { now: () => new Date('2026-09-09T18:00:00.000Z') }

function perfectRun() {
  const { world, ticket } = loadScenario(apipaNoLease)
  const s = createSession()
  for (const c of ['ipconfig /all', 'ipconfig /renew', 'ipconfig /release',
    'ipconfig /renew', 'ping 8.8.8.8', 'nslookup internal-portal.arcline.corp']) {
    recordCommand(s, clock, 'AL-LPT-0447', c, c === 'ipconfig /renew' ? 1 : 0)
  }
  recordChange(s, clock, 'devices.AL-LPT-0447.adapters[0].ip',
    '169.254.23.11', '10.20.14.88', true)
  setFlag(s, 'identityVerified', true)
  setFlag(s, 'userConfirmed', true)
  world.devices['AL-LPT-0447']!.adapters[0]!.ip = '10.20.14.88'
  world.devices['AL-LPT-0447']!.adapters[0]!.gateway = '10.20.14.1'
  world.devices['AL-LPT-0447']!.adapters[0]!.autoconfigured = false
  ticket.resolutionCode = 'solved'
  ticket.resolutionNotes = 'Не открывались сайты. ipconfig /all показал '
    + '169.254.23.11 без шлюза. ipconfig /renew завершился ошибкой DHCP. '
    + 'После ipconfig /release повторный renew выдал 10.20.14.88. '
    + 'Заявительница подтвердила, что сайты открываются. Причина — '
    + 'недоступность DHCP-релея при загрузке.'
  return { world, ticket, session: s }
}

describe('gradeIncident — образцовое прохождение', () => {
  it('даёт полный вердикт', () => {
    const r = gradeIncident({ ...perfectRun(), scenario: apipaNoLease })
    expect(r.verdict).toBe('full')
    expect(r.points).toBeGreaterThan(40)
  })

  it('засчитывает все цели', () => {
    const r = gradeIncident({ ...perfectRun(), scenario: apipaNoLease })
    expect(r.objectives.every(o => o.met)).toBe(true)
  })
})

describe('gradeIncident — починил, но не подтвердил', () => {
  it('даёт частичный вердикт', () => {
    const run = perfectRun()
    setFlag(run.session, 'userConfirmed', false)
    run.ticket.resolutionNotes = 'Сделал release и renew, адрес стал 10.20.14.88.'
    const r = gradeIncident({ ...run, scenario: apipaNoLease })
    expect(r.verdict).toBe('partial')
  })
})

describe('gradeIncident — опасное действие', () => {
  it('обнуляет измерение полномочий', () => {
    const run = perfectRun()
    addDangerousAction(run.session, clock,
      'netsh advfirewall set allprofiles state off', 'отключение защиты')
    const r = gradeIncident({ ...run, scenario: apipaNoLease })
    const dim = r.dimensions.find(d => d.id === 'authority')!
    expect(dim.score).toBe(0)
    expect(r.verdict).not.toBe('full')
  })
})

describe('gradeIncident — тихая поломка', () => {
  it('статический адрес вместо аренды фиксируется как тихая поломка', () => {
    const run = perfectRun()
    run.world.devices['AL-LPT-0447']!.adapters[0]!.dhcpEnabled = false
    const r = gradeIncident({ ...run, scenario: apipaNoLease })
    expect(r.silentFaults.length).toBeGreaterThan(0)
  })
})
```

- [ ] **Шаг 2: Запустить тест и убедиться, что он падает**

Выполнить: `npx vitest run src/core/grading/grade.test.ts`
Ожидается: FAIL — `Failed to resolve import "./grade"`

- [ ] **Шаг 3: Реализовать**

`src/core/grading/grade.ts`:
```ts
import { gradeNote } from './notes'
import type { NoteScore } from './types'
import type { SessionLog } from '../session/types'
import type { Ticket } from '../tickets/types'
import type { Scenario } from '../scenario/types'
import type { WorldState } from '../world/types'

export type DimensionId =
  | 'ownership' | 'investigation' | 'documentation'
  | 'communication' | 'authority' | 'resolution'

export interface DimensionScore {
  id: DimensionId
  label: string
  /** 0–10 */
  score: number
  explain: string
}

export interface ObjectiveResult {
  id: string
  title: string
  met: boolean
}

export interface Scorecard {
  verdict: 'full' | 'partial' | 'fail'
  points: number
  dimensions: DimensionScore[]
  note: NoteScore
  objectives: ObjectiveResult[]
  silentFaults: string[]
}

export interface GradeArgs {
  world: WorldState
  ticket: Ticket
  session: SessionLog
  scenario: Scenario
}

function objectiveMet(
  o: Scenario['objectives'][number], session: SessionLog, ticket: Ticket,
): boolean {
  const ran = new Set(session.commands.map(c => c.cmdline.toLowerCase()))
  const cmdsOk = o.commands.length === 0
    || o.commands.every(c => ran.has(c.toLowerCase()))

  const reqOk = o.requires.every(req => {
    if (req === 'resolutionNotes') return ticket.resolutionNotes.trim().length > 0
    if (req === 'resolutionCode') return ticket.resolutionCode !== null
    return Boolean((session.flags as unknown as Record<string, boolean>)[req])
  })

  return cmdsOk && reqOk
}

/** Поломки, которые игрок создал сам и о которых не знает. */
function detectSilentFaults(world: WorldState, ticket: Ticket): string[] {
  const out: string[] = []
  const a = world.devices[ticket.device]?.adapters[0]
  if (!a) return out
  if (!a.dhcpEnabled) {
    out.push('На адаптере отключён DHCP — адрес задан вручную. '
      + 'Сеть переедет, и машина снова выпадет.')
  }
  if (a.autoconfigured) {
    out.push('Адаптер по-прежнему держит самоназначенный адрес.')
  }
  return out
}

export function gradeIncident(args: GradeArgs): Scorecard {
  const { world, ticket, session, scenario } = args

  const objectives: ObjectiveResult[] = scenario.objectives.map(o => ({
    id: o.id, title: o.title, met: objectiveMet(o, session, ticket),
  }))

  const note = gradeNote(ticket.resolutionNotes, session, ticket, scenario)
  const silentFaults = detectSilentFaults(world, ticket)

  // Владение
  const claimedBeforeActing = ticket.createdAt !== null
  const ownership = (claimedBeforeActing ? 6 : 0)
    + (ticket.status === 'completed' ? 4 : 0)

  // Расследование
  const diagnosticObjectives = scenario.objectives.filter(o => o.commands.length > 0)
  const metDiagnostic = objectives.filter(
    o => diagnosticObjectives.some(d => d.id === o.id) && o.met).length
  const investigation = diagnosticObjectives.length === 0 ? 10
    : Math.round((metDiagnostic / diagnosticObjectives.length) * 10)

  // Коммуникация
  const communication =
    (session.flags.identityVerified ? 4 : 0) +
    (session.flags.userConfirmed ? 6 : 0)

  // Полномочия
  const dangerous = session.flags.dangerousActions.length
  const codeRight = ticket.resolutionCode === scenario.expectedResolution
  const authority = dangerous > 0 ? 0 : (codeRight ? 10 : 5)

  // Качество решения
  const resolutionOk = silentFaults.length === 0 && codeRight
    && session.flags.userConfirmed
  const resolution = resolutionOk ? 10 : silentFaults.length > 0 ? 2 : 5

  const dimensions: DimensionScore[] = [
    { id: 'ownership', label: 'Владение тикетом', score: ownership,
      explain: claimedBeforeActing ? 'Тикет взят до начала работы.'
        : 'Работа началась раньше, чем тикет был взят.' },
    { id: 'investigation', label: 'Расследование', score: investigation,
      explain: `Выполнено ${metDiagnostic} из ${diagnosticObjectives.length} `
        + 'диагностических целей.' },
    { id: 'documentation', label: 'Документация', score: note.score,
      explain: `Заметка ${note.score} из 10.` },
    { id: 'communication', label: 'Коммуникация', score: communication,
      explain: session.flags.userConfirmed
        ? 'Результат подтверждён заявителем.'
        : 'Заявитель не подтвердил, что проблема ушла — '
          + 'подтверждение со своего экрана не считается.' },
    { id: 'authority', label: 'Границы полномочий', score: authority,
      explain: dangerous > 0
        ? `Зафиксировано опасных действий: ${dangerous}.`
        : codeRight ? 'Код закрытия соответствует ситуации.'
          : 'Код закрытия не соответствует тому, что произошло.' },
    { id: 'resolution', label: 'Качество решения', score: resolution,
      explain: silentFaults.length > 0
        ? 'Осталась незамеченная поломка.'
        : resolutionOk ? 'Мир приведён в целевое состояние и подтверждён.'
          : 'Решение неполное.' },
  ]

  const total = dimensions.reduce((a, d) => a + d.score, 0)   // 0–60
  const points = Math.round(total * 0.9)

  const allObjectives = objectives.every(o => o.met)
  const verdict: Scorecard['verdict'] =
    dangerous > 0 || silentFaults.length > 0 ? 'fail'
      : allObjectives && total >= 52 ? 'full'
        : total >= 25 ? 'partial' : 'fail'

  return { verdict, points, dimensions, note, objectives, silentFaults }
}
```

- [ ] **Шаг 4: Запустить тест и убедиться, что он проходит**

Выполнить: `npx vitest run src/core/grading/grade.test.ts`
Ожидается: PASS, 5 тестов

Пороги вердикта (52 и 25) подбираются так, чтобы тесты стали зелёными;
это калибровка, а не догма.

- [ ] **Шаг 5: Прогнать весь набор**

Выполнить: `npm test`
Ожидается: PASS, все тесты задач 1–13

- [ ] **Шаг 6: Коммит**

```bash
git add -A
git commit -F - <<'EOF'
Шесть измерений оценки, вердикт и тихие поломки

Всё считается из журнала и состояния мира, без модели. Опасное действие
обнуляет измерение полномочий, оставленная незамеченной поломка
(отключённый DHCP вместо полученной аренды) валит вердикт.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

Задачи 14–16 — в части 4: хранилище, оболочка интерфейса, очередь,
карточка тикета, терминал, экран разбора и сквозная проверка.
