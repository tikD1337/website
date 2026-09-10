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
import { gradeIncident, type Scorecard } from '../core/grading/grade'
import { BRAND } from '../brand'
import type { Clock, WorldState } from '../core/world/types'
import type { SessionLog } from '../core/session/types'
import type { QueueState } from '../core/tickets/queue'
import type { WorkflowStatus, ResolutionCode } from '../core/tickets/types'
import type { Scenario } from '../core/scenario/types'

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

    resolveTicket() {
      const st = get()
      const assigned = st.queue.assigned
      if (!assigned) return

      const ticket = findTicket(st.queue, assigned)
      // Код закрытия обязателен: статус сам по себе тикет не закрывает.
      if (!ticket.resolutionCode) return

      const scorecard = gradeIncident({
        world: st.world,
        ticket,
        session: st.session,
        scenario: st.scenario,
      })

      resolve(st.queue, assigned, ticket.resolutionCode)
      set({ queue: { ...st.queue }, scorecard, activeTool: 'scorecard' })
    },
  }))
}

export const useGame = createGameStore({ now: () => new Date() })
