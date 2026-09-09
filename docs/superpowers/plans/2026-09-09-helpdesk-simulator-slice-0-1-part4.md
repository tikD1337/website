# Срезы 0–1, часть 4: хранилище, интерфейс, сквозная проверка

> Продолжение частей 1–3. Задачи 14–16. После них срез 1 закрыт:
> APIPA-тикет проходится целиком в браузере.

---

### Задача 14: Хранилище и сохранение

**Файлы:**
- Создать: `src/store/useGame.ts`
- Тест: `src/store/useGame.test.ts`

**Интерфейсы:**
- Потребляет: всё ядро
- Отдаёт: `useGame` (zustand-хранилище) с полями
  `world, queue, session, scenario, activeTool, terminalLines, scorecard`
  и действиями `start(), claimTicket(n), setTicketStatus(s), runCommand(line),
  saveResolutionNotes(text), setResolutionCode(c), resolveTicket(),
  confirmWithUser(), verifyIdentity(), reset()`

- [ ] **Шаг 1: Написать падающий тест**

`src/store/useGame.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { createGameStore } from './useGame'

let g: ReturnType<typeof createGameStore>

beforeEach(() => {
  g = createGameStore({ now: () => new Date('2026-09-09T18:00:00.000Z') })
  g.getState().start()
})

describe('хранилище', () => {
  it('стартует с тикетом в очереди и без назначенного', () => {
    expect(g.getState().queue.tickets.length).toBeGreaterThan(0)
    expect(g.getState().queue.assigned).toBeNull()
  })

  it('команда до взятия тикета отклоняется', () => {
    const num = g.getState().queue.tickets[0]!.number
    void num
    const res = g.getState().runCommand('ipconfig /all')
    expect(res.rejected).toBe(true)
    expect(g.getState().session.commands).toHaveLength(0)
  })

  it('после взятия тикета команда выполняется и попадает в вывод', () => {
    const num = g.getState().queue.tickets[0]!.number
    g.getState().claimTicket(num)
    g.getState().runCommand('ipconfig /all')
    const lines = g.getState().terminalLines
    expect(lines.some(l => l.text.includes('169.254.23.11'))).toBe(true)
    expect(g.getState().session.commands).toHaveLength(1)
  })

  it('release затем renew чинит машину', () => {
    const num = g.getState().queue.tickets[0]!.number
    g.getState().claimTicket(num)
    g.getState().runCommand('ipconfig /release')
    g.getState().runCommand('ipconfig /renew')
    const a = g.getState().world.devices['AL-LPT-0447']!.adapters[0]!
    expect(a.ip).toBe('10.20.14.88')
  })

  it('закрытие тикета выдаёт разбор', () => {
    const num = g.getState().queue.tickets[0]!.number
    const s = g.getState()
    s.claimTicket(num)
    s.runCommand('ipconfig /all')
    s.runCommand('ipconfig /release')
    s.runCommand('ipconfig /renew')
    s.confirmWithUser()
    s.saveResolutionNotes('Не открывались сайты. ipconfig /all показал 169.254.23.11 '
      + 'без шлюза. После release и renew адрес 10.20.14.88. Заявительница подтвердила.')
    s.setResolutionCode('solved')
    s.resolveTicket()
    expect(g.getState().scorecard).not.toBeNull()
    expect(g.getState().queue.assigned).toBeNull()
  })
})
```

- [ ] **Шаг 2: Запустить тест и убедиться, что он падает**

Выполнить: `npx vitest run src/store/useGame.test.ts`
Ожидается: FAIL — `Failed to resolve import "./useGame"`

- [ ] **Шаг 3: Реализовать**

`src/store/useGame.ts`:
```ts
import { create, type StoreApi, type UseBoundStore } from 'zustand'
import { loadScenario } from '../core/scenario/load'
import { apipaNoLease } from '../scenarios/net-apipa-no-lease'
import { createQueue, claim, setStatus, resolve } from '../core/tickets/queue'
import { createSession, setFlag, recordDialogue } from '../core/session/session'
import { createRegistry } from '../core/terminal/registry'
import { ipconfig } from '../core/terminal/commands/ipconfig'
import { ping } from '../core/terminal/commands/ping'
import { nslookup } from '../core/terminal/commands/nslookup'
import { netsh } from '../core/terminal/commands/netsh'
import { gradeIncident, type Scorecard } from '../core/grading/grade'
import { BRAND } from '../brand'
import type { Clock, WorldState } from '../core/world/types'
import type { SessionLog } from '../core/session/types'
import type { QueueState } from '../core/tickets/queue'
import type { WorkflowStatus, ResolutionCode } from '../core/tickets/types'
import type { Scenario } from '../core/scenario/types'

export type Tool = 'queue' | 'ticket' | 'terminal' | 'scorecard'

export interface TerminalLine {
  kind: 'prompt' | 'output'
  text: string
}

export interface GameState {
  world: WorldState
  queue: QueueState
  session: SessionLog
  scenario: Scenario
  activeTool: Tool
  terminalLines: TerminalLine[]
  scorecard: Scorecard | null

  start(): void
  reset(): void
  setTool(t: Tool): void
  claimTicket(number: string): void
  setTicketStatus(s: WorkflowStatus): void
  runCommand(line: string): { rejected: boolean }
  saveResolutionNotes(text: string): void
  setResolutionCode(code: ResolutionCode): void
  resolveTicket(): void
  verifyIdentity(): void
  confirmWithUser(): void
}

const BANNER = [
  `${BRAND.os} [Version ${BRAND.osVersion}]`,
  `(c) ${BRAND.company}. All rights reserved.`,
  '',
]

export function createGameStore(clock: Clock): UseBoundStore<StoreApi<GameState>> {
  const registry = createRegistry()
  registry.register('ipconfig', ipconfig)
  registry.register('ping', ping)
  registry.register('nslookup', nslookup)
  registry.register('netsh', netsh)

  return create<GameState>((set, get) => ({
    world: loadScenario(apipaNoLease).world,
    queue: createQueue([]),
    session: createSession(),
    scenario: apipaNoLease,
    activeTool: 'queue',
    terminalLines: BANNER.map(text => ({ kind: 'output' as const, text })),
    scorecard: null,

    start() {
      const { world, ticket } = loadScenario(apipaNoLease)
      set({
        world,
        queue: createQueue([ticket]),
        session: createSession(),
        scenario: apipaNoLease,
        activeTool: 'queue',
        terminalLines: BANNER.map(text => ({ kind: 'output' as const, text })),
        scorecard: null,
      })
    },

    reset() { get().start() },

    setTool(t) { set({ activeTool: t }) },

    claimTicket(number) {
      const q = get().queue
      claim(q, number, clock)
      set({ queue: { ...q }, activeTool: 'ticket' })
    },

    setTicketStatus(s) {
      const q = get().queue
      if (!q.assigned) return
      setStatus(q, q.assigned, s)
      set({ queue: { ...q } })
    },

    runCommand(line) {
      const st = get()
      const assigned = st.queue.assigned
      const push = (lines: TerminalLine[]) =>
        set({ terminalLines: [...st.terminalLines, ...lines] })

      if (!assigned) {
        push([
          { kind: 'prompt', text: `C:\\Users\\Technician>${line}` },
          { kind: 'output', text: 'Нет активного инцидента. '
            + 'Удалённый доступ разрешён только к машине с открытым тикетом.' },
        ])
        return { rejected: true }
      }

      const ticket = st.queue.tickets.find(t => t.number === assigned)!
      const res = registry.run(line, {
        world: st.world, session: st.session, clock, device: ticket.device,
      })

      push([
        { kind: 'prompt', text: `C:\\Users\\Technician>${line}` },
        ...(res.stdout ? res.stdout.split(/\r?\n/)
          .map(text => ({ kind: 'output' as const, text })) : []),
      ])
      set({ world: { ...st.world }, session: { ...st.session } })
      return { rejected: false }
    },

    saveResolutionNotes(text) {
      const q = get().queue
      if (!q.assigned) return
      const t = q.tickets.find(x => x.number === q.assigned)!
      t.resolutionNotes = text
      set({ queue: { ...q } })
    },

    setResolutionCode(code) {
      const q = get().queue
      if (!q.assigned) return
      const t = q.tickets.find(x => x.number === q.assigned)!
      t.resolutionCode = code
      set({ queue: { ...q } })
    },

    verifyIdentity() {
      const s = get().session
      setFlag(s, 'identityVerified', true)
      set({ session: { ...s } })
    },

    confirmWithUser() {
      const st = get()
      const assigned = st.queue.assigned
      if (!assigned) return
      const ticket = st.queue.tickets.find(t => t.number === assigned)!
      const a = st.world.devices[ticket.device]?.adapters[0]
      const fixed = Boolean(a && !a.autoconfigured && a.gateway !== '')

      // Заявитель сообщает то, что видит сам, а не состояние мира.
      const reply = fixed
        ? 'Сейчас... да, открылось! Спасибо большое.'
        : 'Нет, у меня всё так же — страница не грузится.'

      recordDialogue(st.session, clock, 'call', ticket.requester, 'requester', reply)
      if (fixed) setFlag(st.session, 'userConfirmed', true)
      ticket.communications.push({
        at: clock.now().toISOString(), channel: 'call',
        from: ticket.requester, text: reply,
      })
      set({ session: { ...st.session }, queue: { ...st.queue } })
    },

    resolveTicket() {
      const st = get()
      const assigned = st.queue.assigned
      if (!assigned) return
      const ticket = st.queue.tickets.find(t => t.number === assigned)!
      if (!ticket.resolutionCode) return

      const scorecard = gradeIncident({
        world: st.world, ticket, session: st.session, scenario: st.scenario,
      })
      resolve(st.queue, assigned, ticket.resolutionCode, clock)
      set({ queue: { ...st.queue }, scorecard, activeTool: 'scorecard' })
    },
  }))
}

export const useGame = createGameStore({ now: () => new Date() })
```

- [ ] **Шаг 4: Запустить тест и убедиться, что он проходит**

Выполнить: `npx vitest run src/store/useGame.test.ts`
Ожидается: PASS, 5 тестов

- [ ] **Шаг 5: Коммит**

```bash
git add -A
git commit -F - <<'EOF'
Хранилище игры поверх ядра

zustand-обёртка: очередь, мир, журнал, терминал, разбор. Команда без
взятого тикета отклоняется. Заявитель при подтверждении сообщает то,
что видит сам, а не состояние мира.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Задача 15: Оболочка, очередь и карточка тикета

**Файлы:**
- Создать: `src/main.tsx`, `src/styles.css`, `src/ui/App.tsx`,
  `src/ui/Shell.tsx`, `src/ui/IncidentRail.tsx`, `src/ui/QueueView.tsx`,
  `src/ui/TicketView.tsx`

**Интерфейсы:**
- Потребляет: `useGame`
- Отдаёт: React-компоненты; точка входа `main.tsx`

- [ ] **Шаг 1: Стили**

`src/styles.css`:
```css
:root {
  --bg: #0e1116; --panel: #161b22; --line: #262d36;
  --text: #d7dde5; --dim: #8b96a5; --accent: #4b9fd5;
  --ok: #46a758; --warn: #d29922; --bad: #d4483f;
  --mono: ui-monospace, "Cascadia Mono", Consolas, monospace;
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--text);
  font: 13px/1.5 system-ui, sans-serif; }
.shell { display: grid; grid-template-columns: 200px 320px 1fr; height: 100vh; }
.nav, .rail { background: var(--panel); border-right: 1px solid var(--line);
  overflow-y: auto; padding: 12px; }
.nav button { display: block; width: 100%; text-align: left; background: none;
  border: 0; color: var(--dim); padding: 7px 9px; border-radius: 5px;
  cursor: pointer; font: inherit; }
.nav button[aria-current="true"] { background: #1f2630; color: var(--text); }
.main { overflow-y: auto; padding: 18px 22px; }
h1 { font-size: 15px; margin: 0 0 4px; }
.sub { color: var(--dim); font-size: 12px; margin-bottom: 16px; }
table { width: 100%; border-collapse: collapse; font-size: 12px; }
th { text-align: left; color: var(--dim); font-weight: 500;
  border-bottom: 1px solid var(--line); padding: 6px 8px; }
td { padding: 8px; border-bottom: 1px solid var(--line); }
tr[data-clickable] { cursor: pointer; }
tr[data-clickable]:hover { background: #1a212b; }
.kv { display: grid; grid-template-columns: 150px 1fr; gap: 5px 12px;
  font-size: 12px; }
.kv dt { color: var(--dim); }
.kv dd { margin: 0; }
.term { background: #000; color: #ccc; font-family: var(--mono); font-size: 12.5px;
  padding: 10px; height: calc(100vh - 190px); overflow-y: auto;
  white-space: pre-wrap; }
.term input { background: none; border: 0; color: inherit; font: inherit;
  width: 90%; outline: none; }
button.act { background: #1f2630; color: var(--text); border: 1px solid var(--line);
  border-radius: 5px; padding: 6px 11px; cursor: pointer; font: inherit; }
button.act:hover { border-color: var(--accent); }
textarea { width: 100%; min-height: 130px; background: #0b0e13; color: var(--text);
  border: 1px solid var(--line); border-radius: 5px; padding: 9px;
  font: inherit; resize: vertical; }
select { background: #0b0e13; color: var(--text); border: 1px solid var(--line);
  border-radius: 5px; padding: 5px 7px; font: inherit; }
.bar { display: flex; gap: 8px; align-items: center; margin: 10px 0; }
.dim-row { display: grid; grid-template-columns: 190px 60px 1fr; gap: 8px;
  padding: 6px 0; border-bottom: 1px solid var(--line); font-size: 12px; }
.ok { color: var(--ok); } .bad { color: var(--bad); } .warn { color: var(--warn); }
```

- [ ] **Шаг 2: Точка входа**

`src/main.tsx`:
```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './ui/App'
import './styles.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode><App /></StrictMode>,
)
```

`src/ui/App.tsx`:
```tsx
import { useEffect } from 'react'
import { useGame } from '../store/useGame'
import { Shell } from './Shell'

export function App() {
  const start = useGame(s => s.start)
  useEffect(() => { start() }, [start])
  return <Shell />
}
```

- [ ] **Шаг 3: Оболочка и левая панель контекста**

`src/ui/Shell.tsx`:
```tsx
import { useGame, type Tool } from '../store/useGame'
import { IncidentRail } from './IncidentRail'
import { QueueView } from './QueueView'
import { TicketView } from './TicketView'
import { TerminalView } from './TerminalView'
import { ScorecardView } from './ScorecardView'
import { BRAND } from '../brand'

const TOOLS: Array<{ id: Tool; label: string }> = [
  { id: 'queue', label: 'Очередь' },
  { id: 'ticket', label: 'Тикет' },
  { id: 'terminal', label: 'Удалёнка' },
  { id: 'scorecard', label: 'Разбор' },
]

export function Shell() {
  const tool = useGame(s => s.activeTool)
  const setTool = useGame(s => s.setTool)

  return (
    <div className="shell">
      <nav className="nav">
        <div style={{ fontWeight: 600, marginBottom: 2 }}>Служба поддержки</div>
        <div style={{ color: 'var(--dim)', fontSize: 11, marginBottom: 14 }}>
          Первая линия · {BRAND.domain}
        </div>
        {TOOLS.map(t => (
          <button key={t.id} aria-current={tool === t.id}
            onClick={() => setTool(t.id)}>{t.label}</button>
        ))}
      </nav>

      <IncidentRail />

      <main className="main">
        {tool === 'queue' && <QueueView />}
        {tool === 'ticket' && <TicketView />}
        {tool === 'terminal' && <TerminalView />}
        {tool === 'scorecard' && <ScorecardView />}
      </main>
    </div>
  )
}
```

`src/ui/IncidentRail.tsx`:
```tsx
import { useGame } from '../store/useGame'

/** Постоянный контекст инцидента — виден из любого инструмента. */
export function IncidentRail() {
  const queue = useGame(s => s.queue)
  const world = useGame(s => s.world)
  const session = useGame(s => s.session)

  const ticket = queue.tickets.find(t => t.number === queue.assigned)

  if (!ticket) {
    return (
      <aside className="rail">
        <div style={{ color: 'var(--dim)' }}>
          Инцидент не взят. Откройте очередь и возьмите тикет —
          без этого удалённый доступ закрыт.
        </div>
      </aside>
    )
  }

  const user = world.org.users.find(u => u.samAccountName === ticket.requester)
  const device = world.devices[ticket.device]
  const adapter = device?.adapters[0]

  return (
    <aside className="rail">
      <div style={{ fontWeight: 600 }}>{ticket.number}</div>
      <div className="sub">{ticket.summary}</div>

      <dl className="kv">
        <dt>Заявитель</dt><dd>{user?.displayName ?? ticket.requester}</dd>
        <dt>Отдел</dt><dd>{user?.dept}</dd>
        <dt>Телефон</dt><dd>{user?.phone}</dd>
        <dt>Машина</dt><dd>{ticket.device}</dd>
        <dt>Адрес</dt><dd>{adapter?.ip}</dd>
        <dt>Шлюз</dt><dd>{adapter?.gateway || '—'}</dd>
        <dt>Статус</dt><dd>{ticket.status}</dd>
      </dl>

      <div className="sub" style={{ marginTop: 14 }}>Сделано</div>
      <div style={{ fontSize: 11, color: 'var(--dim)' }}>
        Команд: {session.commands.length} · изменений: {session.changes.length}
        {session.flags.identityVerified && ' · личность подтверждена'}
        {session.flags.userConfirmed && ' · заявитель подтвердил'}
        {session.flags.dangerousActions.length > 0 && (
          <span className="bad"> · опасных действий:{' '}
            {session.flags.dangerousActions.length}</span>
        )}
      </div>
    </aside>
  )
}
```

- [ ] **Шаг 4: Очередь**

`src/ui/QueueView.tsx`:
```tsx
import { useGame } from '../store/useGame'

export function QueueView() {
  const queue = useGame(s => s.queue)
  const claimTicket = useGame(s => s.claimTicket)

  return (
    <>
      <h1>Служба поддержки — инциденты</h1>
      <div className="sub">
        Открытых: {queue.tickets.filter(t => t.status !== 'completed').length} ·
        одновременно можно вести только один тикет
      </div>

      <table>
        <thead>
          <tr>
            <th>Номер</th><th>Категория</th><th>Описание</th>
            <th>Приоритет</th><th>Статус</th><th>Назначение</th>
          </tr>
        </thead>
        <tbody>
          {queue.tickets.map(t => (
            <tr key={t.number} data-clickable
              onClick={() => { if (t.status !== 'completed') claimTicket(t.number) }}>
              <td>{t.number}</td>
              <td>{t.category}<br />
                <span style={{ color: 'var(--dim)' }}>{t.subcategory}</span></td>
              <td>{t.summary}</td>
              <td>{t.priority}</td>
              <td>{t.status}</td>
              <td>{queue.assigned === t.number ? 'На вас'
                : queue.assigned ? 'Сначала завершите текущий' : 'Свободен — взять'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )
}
```

- [ ] **Шаг 5: Карточка тикета**

`src/ui/TicketView.tsx`:
```tsx
import { useState, useEffect } from 'react'
import { useGame } from '../store/useGame'
import { RESOLUTION_LABELS, type ResolutionCode } from '../core/tickets/types'

export function TicketView() {
  const queue = useGame(s => s.queue)
  const ticket = queue.tickets.find(t => t.number === queue.assigned)

  const saveNotes = useGame(s => s.saveResolutionNotes)
  const setCode = useGame(s => s.setResolutionCode)
  const resolveTicket = useGame(s => s.resolveTicket)
  const verifyIdentity = useGame(s => s.verifyIdentity)
  const confirmWithUser = useGame(s => s.confirmWithUser)
  const setStatusFn = useGame(s => s.setTicketStatus)

  const [draft, setDraft] = useState('')
  useEffect(() => { setDraft(ticket?.resolutionNotes ?? '') }, [ticket?.number])

  if (!ticket) return <div className="sub">Тикет не взят.</div>

  return (
    <>
      <h1>{ticket.number} — {ticket.summary}</h1>
      <div className="sub">
        {ticket.category} › {ticket.subcategory} · {ticket.assignmentGroup}
      </div>

      <dl className="kv" style={{ marginBottom: 18 }}>
        <dt>Служба</dt><dd>{ticket.service}</dd>
        <dt>Приоритет</dt><dd>{ticket.priority}</dd>
        <dt>Срок отклика</dt><dd>{ticket.slaResponseHours} ч</dd>
        <dt>Срок решения</dt><dd>{ticket.slaResolveHours} ч</dd>
      </dl>

      <h2 style={{ fontSize: 12, color: 'var(--dim)' }}>ОПИСАНИЕ ЗАЯВИТЕЛЯ</h2>
      <p>{ticket.description}</p>

      <div className="bar">
        <button className="act" onClick={verifyIdentity}>Подтвердить личность</button>
        <button className="act" onClick={confirmWithUser}>Позвонить и уточнить</button>
        <select value={ticket.status}
          onChange={e => setStatusFn(e.target.value as never)}>
          <option value="assigned">Назначен</option>
          <option value="in-progress">В работе</option>
          <option value="pending-user">Ждём пользователя</option>
        </select>
      </div>

      {ticket.communications.length > 0 && (
        <>
          <h2 style={{ fontSize: 12, color: 'var(--dim)' }}>ОБЩЕНИЕ С ЗАЯВИТЕЛЕМ</h2>
          {ticket.communications.map((c, i) => (
            <p key={i} style={{ fontSize: 12 }}>
              <span style={{ color: 'var(--dim)' }}>
                {c.channel.toUpperCase()} · {c.from} · </span>{c.text}
            </p>
          ))}
        </>
      )}

      <h2 style={{ fontSize: 12, color: 'var(--dim)' }}>
        ЗАМЕТКА О РЕШЕНИИ (видна заявителю)
      </h2>
      <textarea value={draft} onChange={e => setDraft(e.target.value)}
        onBlur={() => saveNotes(draft)}
        placeholder={'Симптом словами заявителя · что проверили и что это исключило · '
          + 'какое одно изменение внесли · чем подтвердили · что нужно следующему'} />

      <div className="bar">
        <select value={ticket.resolutionCode ?? ''}
          onChange={e => setCode(e.target.value as ResolutionCode)}>
          <option value="" disabled>Код закрытия…</option>
          {Object.entries(RESOLUTION_LABELS).map(([k, v]) =>
            <option key={k} value={k}>{v}</option>)}
        </select>
        <button className="act" onClick={() => { saveNotes(draft); resolveTicket() }}>
          Закрыть тикет
        </button>
      </div>
      <div className="sub">
        Рабочий статус сам по себе тикет не закрывает — нужен код закрытия.
      </div>
    </>
  )
}
```

- [ ] **Шаг 6: Проверить сборку**

Выполнить: `npm run dev`, открыть в браузере, убедиться, что очередь
показывает один тикет, он берётся кликом, левая панель заполняется.
Затем `npm test` — все тесты по-прежнему зелёные.

- [ ] **Шаг 7: Коммит**

```bash
git add -A
git commit -F - <<'EOF'
Оболочка, очередь и карточка тикета

Три колонки: инструменты, постоянный контекст инцидента, активный
инструмент. Контекст тикета невозможно потерять при переключении.
Карточка несёт обе заметки, рабочий статус и код закрытия раздельно.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Задача 16: Терминал, разбор и сквозная проверка

**Файлы:**
- Создать: `src/ui/TerminalView.tsx`, `src/ui/ScorecardView.tsx`
- Тест: `src/e2e.test.ts`

- [ ] **Шаг 1: Написать сквозной тест**

`src/e2e.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { createGameStore } from './store/useGame'

const clock = { now: () => new Date('2026-09-09T18:00:00.000Z') }

describe('APIPA-инцидент от начала до конца', () => {
  it('образцовое прохождение даёт полный вердикт', () => {
    const g = createGameStore(clock)
    const s = () => g.getState()
    s().start()

    const num = s().queue.tickets[0]!.number
    s().claimTicket(num)
    s().verifyIdentity()

    s().runCommand('ipconfig /all')
    s().runCommand('ipconfig /renew')      // падает — так и задумано
    s().runCommand('ipconfig /release')
    s().runCommand('ipconfig /renew')      // проходит
    s().runCommand('ping 8.8.8.8')
    s().runCommand('nslookup internal-portal.arcline.corp')
    s().confirmWithUser()

    s().saveResolutionNotes(
      'Priya Raman сообщила, что не открываются сайты, локальные программы '
      + 'работают. ipconfig /all показал 169.254.23.11 без шлюза и DNS — это '
      + 'исключило настройки DNS. ipconfig /renew завершился ошибкой DHCP. '
      + 'После ipconfig /release повторный renew выдал 10.20.14.88. '
      + 'Проверено: ping 8.8.8.8 отвечает, заявительница подтвердила. '
      + 'Причина — недоступность DHCP-релея при загрузке.')
    s().setResolutionCode('solved')
    s().resolveTicket()

    const card = s().scorecard!
    expect(card).not.toBeNull()
    expect(card.verdict).toBe('full')
    expect(card.objectives.every(o => o.met)).toBe(true)
  })

  it('починил, но не перезвонил — частичный вердикт', () => {
    const g = createGameStore(clock)
    const s = () => g.getState()
    s().start()
    const num = s().queue.tickets[0]!.number
    s().claimTicket(num)
    s().runCommand('ipconfig /all')
    s().runCommand('ipconfig /release')
    s().runCommand('ipconfig /renew')
    s().saveResolutionNotes('Сделал release и renew, адрес стал 10.20.14.88.')
    s().setResolutionCode('solved')
    s().resolveTicket()

    expect(s().scorecard!.verdict).toBe('partial')
    expect(s().scorecard!.dimensions.find(d => d.id === 'communication')!.score)
      .toBeLessThan(10)
  })

  it('попытка отключить фаервол валит вердикт', () => {
    const g = createGameStore(clock)
    const s = () => g.getState()
    s().start()
    s().claimTicket(s().queue.tickets[0]!.number)
    s().runCommand('netsh advfirewall set allprofiles state off')
    s().runCommand('ipconfig /release')
    s().runCommand('ipconfig /renew')
    s().confirmWithUser()
    s().saveResolutionNotes('Починил, адрес 10.20.14.88, заявительница подтвердила.')
    s().setResolutionCode('solved')
    s().resolveTicket()

    expect(s().scorecard!.verdict).toBe('fail')
    expect(s().scorecard!.dimensions.find(d => d.id === 'authority')!.score).toBe(0)
  })
})
```

- [ ] **Шаг 2: Запустить и убедиться, что падает**

Выполнить: `npx vitest run src/e2e.test.ts`
Ожидается: FAIL — компонентов ещё нет либо вердикты не совпали

- [ ] **Шаг 3: Терминал**

`src/ui/TerminalView.tsx`:
```tsx
import { useState, useRef, useEffect } from 'react'
import { useGame } from '../store/useGame'

export function TerminalView() {
  const lines = useGame(s => s.terminalLines)
  const runCommand = useGame(s => s.runCommand)
  const queue = useGame(s => s.queue)
  const [input, setInput] = useState('')
  const [history, setHistory] = useState<string[]>([])
  const [histIdx, setHistIdx] = useState(-1)
  const bottom = useRef<HTMLDivElement>(null)

  useEffect(() => { bottom.current?.scrollIntoView() }, [lines.length])

  const ticket = queue.tickets.find(t => t.number === queue.assigned)

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!input.trim()) return
    runCommand(input)
    setHistory(h => [input, ...h])
    setHistIdx(-1)
    setInput('')
  }

  function onKey(e: React.KeyboardEvent) {
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      const i = Math.min(histIdx + 1, history.length - 1)
      if (i >= 0) { setHistIdx(i); setInput(history[i] ?? '') }
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      const i = histIdx - 1
      setHistIdx(i)
      setInput(i >= 0 ? history[i] ?? '' : '')
    }
  }

  return (
    <>
      <h1>Удалённый рабочий стол</h1>
      <div className="sub">
        {ticket ? `${ticket.device} · ${ticket.requester}`
          : 'Доступ только к машине с открытым тикетом'}
      </div>

      <div className="term">
        {lines.map((l, i) => (
          <div key={i} style={{ color: l.kind === 'prompt' ? '#eee' : undefined }}>
            {l.text}
          </div>
        ))}
        <form onSubmit={submit}>
          <span>{'C:\\Users\\Technician>'}</span>
          <input aria-label="Ввод команды" value={input} autoFocus
            onKeyDown={onKey} onChange={e => setInput(e.target.value)} />
        </form>
        <div ref={bottom} />
      </div>
    </>
  )
}
```

- [ ] **Шаг 4: Экран разбора**

`src/ui/ScorecardView.tsx`:
```tsx
import { useGame } from '../store/useGame'

const VERDICT: Record<string, { text: string; cls: string }> = {
  full: { text: 'Полностью', cls: 'ok' },
  partial: { text: 'Частично', cls: 'warn' },
  fail: { text: 'Не засчитано', cls: 'bad' },
}

export function ScorecardView() {
  const card = useGame(s => s.scorecard)
  const reset = useGame(s => s.reset)

  if (!card) return <div className="sub">Разбор появится после закрытия тикета.</div>
  const v = VERDICT[card.verdict]!

  return (
    <>
      <h1>Разбор инцидента</h1>
      <div className="sub">
        <span className={v.cls}>{v.text}</span> · {card.points} очков
      </div>

      <h2 style={{ fontSize: 12, color: 'var(--dim)' }}>ИЗМЕРЕНИЯ</h2>
      {card.dimensions.map(d => (
        <div className="dim-row" key={d.id}>
          <div>{d.label}</div>
          <div className={d.score >= 8 ? 'ok' : d.score >= 4 ? 'warn' : 'bad'}>
            {d.score} / 10
          </div>
          <div style={{ color: 'var(--dim)' }}>{d.explain}</div>
        </div>
      ))}

      <h2 style={{ fontSize: 12, color: 'var(--dim)', marginTop: 20 }}>
        ЗАМЕТКА — {card.note.score} ИЗ 10
      </h2>
      {card.note.parts.map(p => (
        <div className="dim-row" key={p.id}>
          <div>{p.label}</div>
          <div className={p.earned ? 'ok' : 'bad'}>{p.earned ? 'есть' : 'нет'}</div>
          <div style={{ color: 'var(--dim)' }}>{p.explain}</div>
        </div>
      ))}
      {card.note.penalties.map(p => (
        <div className="dim-row" key={p.id}>
          <div className="bad">{p.label}</div>
          <div className="bad">−{p.points}</div><div />
        </div>
      ))}

      <h2 style={{ fontSize: 12, color: 'var(--dim)', marginTop: 20 }}>ЦЕЛИ</h2>
      {card.objectives.map(o => (
        <div className="dim-row" key={o.id}>
          <div>{o.title}</div>
          <div className={o.met ? 'ok' : 'bad'}>{o.met ? '✓' : '—'}</div><div />
        </div>
      ))}

      {card.silentFaults.length > 0 && (
        <>
          <h2 style={{ fontSize: 12 }} className="bad">ТИХИЕ ПОЛОМКИ</h2>
          {card.silentFaults.map((f, i) =>
            <p key={i} className="bad" style={{ fontSize: 12 }}>{f}</p>)}
        </>
      )}

      <div className="bar" style={{ marginTop: 20 }}>
        <button className="act" onClick={reset}>Пройти заново</button>
      </div>
    </>
  )
}
```

- [ ] **Шаг 5: Прогнать всё**

Выполнить: `npm test`
Ожидается: PASS, все тесты, включая три сквозных

Если сквозные вердикты не сходятся — калибруйте пороги в `grade.ts`
(значения 52 и 25), а не тесты: сценарии в тесте описывают желаемое
поведение тренажёра.

- [ ] **Шаг 6: Проверить в браузере**

Выполнить: `npm run dev`

Пройти вручную: взять тикет → удалёнка → `ipconfig /all` → увидеть
`169.254.23.11` → `ipconfig /renew` → увидеть ошибку DHCP →
`ipconfig /release` → `ipconfig /renew` → увидеть успех →
`ping 8.8.8.8` → вернуться в тикет → «Позвонить и уточнить» →
написать заметку → выбрать код → закрыть → увидеть разбор.

- [ ] **Шаг 7: Коммит**

```bash
git add -A
git commit -F - <<'EOF'
Терминал, экран разбора и сквозные тесты

Срез 1 закрыт: APIPA-инцидент проходится целиком в браузере. Три
сквозных теста фиксируют образцовое прохождение, «починил но не
перезвонил» и попытку отключить защиту.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

## Самопроверка плана

**Покрытие спеки срезами 0–1.** Состояние мира — задачи 2–3. Журнал
сессии — 4. Команды как чистые функции — 5–8. Шлюз полномочий — 9.
Сценарий с целями — 10. Модель тикета и правило одного тикета — 11.
Оценка заметки сверкой с журналом — 12. Шесть измерений, вердикт,
тихие поломки — 13. Две панели и постоянный контекст — 15. Терминал
и разбор — 16.

**Отложено сознательно** (срезы 2+): рабочий стол с окнами, каталог,
серверная, активы, логистика, база знаний, курсы, интервью,
голосовой контур, прогрессия и лидерборд.

**Согласованность имён.** `CommandHandler`, `CommandContext`,
`CommandResult` — задача 6, используются в 7–9. `InjectPatch` — 3,
используется в 10. `Ticket` — 11, используется в 10, 12, 13.
`NoteScore` — 12, используется в 13. `Scorecard` — 13, используется в 14, 16.
