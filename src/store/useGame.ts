import { create, type StoreApi, type UseBoundStore } from 'zustand'
import { loadScenario } from '../core/scenario/load'
import { apipaNoLease } from '../scenarios/net-apipa-no-lease'
import { createQueue, claim, setStatus, resolve, findTicket } from '../core/tickets/queue'
import { createSession, setFlag, recordDialogue } from '../core/session/session'
import { createRegistry } from '../core/terminal/registry'
import { ipconfig } from '../core/terminal/commands/ipconfig'
import { ping } from '../core/terminal/commands/ping'
import { nslookup } from '../core/terminal/commands/nslookup'
import { netsh } from '../core/terminal/commands/netsh'
import { sc } from '../core/terminal/commands/sc'
import { gradeIncident, type Scorecard } from '../core/grading/grade'
import {
  startService, stopService, setStartType, type OpResult,
} from '../core/device/services'
import { BRAND } from '../brand'
import {
  createWindows, openWindow, closeWindow, focusWindow, minimizeWindow,
  restoreWindow, toggleMaximize, moveWindow, type WindowsState, type AppId,
} from './windows'
import type { Clock, WorldState } from '../core/world/types'
import type { SessionLog } from '../core/session/types'
import type { QueueState } from '../core/tickets/queue'
import type { WorkflowStatus, ResolutionCode } from '../core/tickets/types'
import type { Scenario } from '../core/scenario/types'
import type { ServiceStartType } from '../core/world/types'

export type Tool = 'queue' | 'ticket' | 'terminal' | 'scorecard'

export interface TerminalLine {
  kind: 'prompt' | 'output' | 'notice'
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
  windows: WindowsState
  /** время симуляции — часы трея берут его отсюда, а не из Date.now() */
  now: Date

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

  openApp(id: AppId): void
  closeApp(id: AppId): void
  focusApp(id: AppId): void
  minimizeApp(id: AppId): void
  restoreApp(id: AppId): void
  maximizeApp(id: AppId): void
  dragApp(id: AppId, x: number, y: number): void

  clearTerminal(): void
  startServiceOn(name: string): OpResult
  stopServiceOn(name: string): OpResult
  setServiceStartType(name: string, type: ServiceStartType): OpResult
}

const banner = (): TerminalLine[] => [
  { kind: 'output', text: `${BRAND.os} [Version ${BRAND.osVersion}]` },
  { kind: 'output', text: `(c) ${BRAND.company}. All rights reserved.` },
  { kind: 'output', text: '' },
]

export function createGameStore(clock: Clock): UseBoundStore<StoreApi<GameState>> {
  const registry = createRegistry()
  registry.register('ipconfig', ipconfig)
  registry.register('ping', ping)
  registry.register('nslookup', nslookup)
  registry.register('netsh', netsh)
  registry.register('sc', sc)

  const fresh = () => {
    const { world, ticket } = loadScenario(apipaNoLease)
    return {
      world,
      queue: createQueue([ticket]),
      session: createSession(),
      scenario: apipaNoLease,
      activeTool: 'queue' as Tool,
      terminalLines: banner(),
      scorecard: null,
      windows: createWindows(),
      now: clock.now(),
    }
  }

  return create<GameState>((set, get) => ({
    ...fresh(),

    start() {
      set(fresh())
    },

    reset() {
      set(fresh())
    },

    setTool(t) {
      set({ activeTool: t })
    },

    claimTicket(number) {
      const q = get().queue
      claim(q, number, clock)
      set({ queue: { ...q }, activeTool: 'ticket' })
    },

    setTicketStatus(status) {
      const q = get().queue
      if (!q.assigned) return
      setStatus(q, q.assigned, status)
      set({ queue: { ...q } })
    },

    runCommand(line) {
      const st = get()
      const assigned = st.queue.assigned

      const push = (lines: TerminalLine[]) =>
        set({ terminalLines: [...get().terminalLines, ...lines] })

      /**
       * Граница доступа, вшитая в инструмент: удалённый доступ возможен
       * только к машине с открытым инцидентом. Порыться в чужих
       * компьютерах нельзя — так же, как на настоящей работе.
       */
      if (!assigned) {
        push([
          { kind: 'prompt', text: `C:\\Users\\Technician>${line}` },
          {
            kind: 'notice',
            text: 'Нет активного инцидента. Удалённый доступ разрешён только '
              + 'к машине с открытым тикетом.',
          },
        ])
        return { rejected: true }
      }

      const ticket = findTicket(st.queue, assigned)
      const res = registry.run(line, {
        world: st.world,
        session: st.session,
        clock,
        device: ticket.device,
      })

      push([
        { kind: 'prompt', text: `C:\\Users\\Technician>${line}` },
        ...(res.stdout
          ? res.stdout.split(/\r?\n/).map(text => ({ kind: 'output' as const, text }))
          : []),
      ])

      set({ world: { ...st.world }, session: { ...st.session } })
      return { rejected: false }
    },

    saveResolutionNotes(text) {
      const q = get().queue
      if (!q.assigned) return
      findTicket(q, q.assigned).resolutionNotes = text
      set({ queue: { ...q } })
    },

    setResolutionCode(code) {
      const q = get().queue
      if (!q.assigned) return
      findTicket(q, q.assigned).resolutionCode = code
      set({ queue: { ...q } })
    },

    verifyIdentity() {
      const s = get().session
      setFlag(s, 'identityVerified', true)
      set({ session: { ...s } })
    },

    /**
     * Заявитель сообщает то, что видит со своей стороны, а не состояние
     * мира. Он не оракул: если машина не починена, он так и скажет —
     * и подтверждения не будет, сколько ни звони.
     */
    confirmWithUser() {
      const st = get()
      const assigned = st.queue.assigned
      if (!assigned) return

      const ticket = findTicket(st.queue, assigned)
      const a = st.world.devices[ticket.device]?.adapters[0]
      const worksNow = Boolean(a && !a.autoconfigured && a.gateway !== '' && a.linkUp)

      const reply = worksNow
        ? 'Сейчас проверю… да, открылось! Спасибо большое.'
        : 'Нет, у меня всё так же — страница не грузится.'

      recordDialogue(st.session, clock, 'call', ticket.requester, 'requester', reply)
      if (worksNow) setFlag(st.session, 'userConfirmed', true)

      ticket.communications.push({
        at: clock.now().toISOString(),
        channel: 'call',
        from: ticket.requester,
        text: reply,
      })

      set({ session: { ...st.session }, queue: { ...st.queue } })
    },

    openApp(id) {
      const w = get().windows
      openWindow(w, id)
      set({ windows: { ...w } })
    },

    closeApp(id) {
      const w = get().windows
      closeWindow(w, id)
      set({ windows: { ...w } })
    },

    focusApp(id) {
      const w = get().windows
      focusWindow(w, id)
      set({ windows: { ...w } })
    },

    minimizeApp(id) {
      const w = get().windows
      minimizeWindow(w, id)
      set({ windows: { ...w } })
    },

    restoreApp(id) {
      const w = get().windows
      restoreWindow(w, id)
      set({ windows: { ...w } })
    },

    maximizeApp(id) {
      const w = get().windows
      toggleMaximize(w, id)
      set({ windows: { ...w } })
    },

    dragApp(id, x, y) {
      const w = get().windows
      moveWindow(w, id, x, y)
      set({ windows: { ...w } })
    },

    clearTerminal() {
      set({ terminalLines: [] })
    },

    /**
     * Операции над службами из окна «Службы».
     *
     * Вызывают ровно те же функции, что и команда sc: окно и команда —
     * оба представления, операция одна.
     */
    startServiceOn(name) {
      const st = get()
      if (!st.queue.assigned) return { ok: false, error: 'нет активного инцидента' }
      const ticket = findTicket(st.queue, st.queue.assigned)
      const r = startService(st.world, ticket.device, name, st.session, clock)
      set({ world: { ...st.world }, session: { ...st.session } })
      return r
    },

    stopServiceOn(name) {
      const st = get()
      if (!st.queue.assigned) return { ok: false, error: 'нет активного инцидента' }
      const ticket = findTicket(st.queue, st.queue.assigned)
      const r = stopService(st.world, ticket.device, name, st.session, clock)
      set({ world: { ...st.world }, session: { ...st.session } })
      return r
    },

    setServiceStartType(name, type) {
      const st = get()
      if (!st.queue.assigned) return { ok: false, error: 'нет активного инцидента' }
      const ticket = findTicket(st.queue, st.queue.assigned)
      const r = setStartType(st.world, ticket.device, name, type, st.session, clock)
      set({ world: { ...st.world }, session: { ...st.session } })
      return r
    },

    resolveTicket() {
      const st = get()
      const assigned = st.queue.assigned
      if (!assigned) return

      const ticket = findTicket(st.queue, assigned)
      // Код закрытия обязателен: статус сам по себе тикет не закрывает.
      if (!ticket.resolutionCode) return

      /*
        Закрываем до оценки, а не после.

        Оценка смотрит на итоговое состояние: доведён ли тикет до конца —
        одно из шести измерений. Если считать раньше закрытия, статус
        ещё «назначен», и владение недобирает баллы при безупречном
        прохождении.
      */
      resolve(st.queue, assigned, ticket.resolutionCode)

      const scorecard = gradeIncident({
        world: st.world,
        ticket,
        session: st.session,
        scenario: st.scenario,
      })

      set({ queue: { ...st.queue }, scorecard, activeTool: 'scorecard' })
    },
  }))
}

export const useGame = createGameStore({ now: () => new Date() })
