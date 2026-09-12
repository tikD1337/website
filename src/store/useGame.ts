import { create, type StoreApi, type UseBoundStore } from 'zustand'
import { loadScenarios } from '../core/scenario/load'
import { allHold } from '../core/scenario/check'
import { applyInject } from '../core/world/world'
import { SCENARIOS, scenarioFor } from '../scenarios'
import { createQueue, claim, setStatus, resolve, findTicket } from '../core/tickets/queue'
import { createSession, setFlag, recordDialogue } from '../core/session/session'
import { createRegistry } from '../core/terminal/registry'
import { ipconfig } from '../core/terminal/commands/ipconfig'
import { ping } from '../core/terminal/commands/ping'
import { nslookup } from '../core/terminal/commands/nslookup'
import { netsh } from '../core/terminal/commands/netsh'
import { sc } from '../core/terminal/commands/sc'
import { net } from '../core/terminal/commands/net'
import { dsquery } from '../core/terminal/commands/dsquery'
import { whoami } from '../core/terminal/commands/whoami'
import { gradeIncident, type Scorecard } from '../core/grading/grade'
import {
  startService, stopService, setStartType, type OpResult,
} from '../core/device/services'
import {
  unlockAccount, resetPassword, setEnabled, addToGroup, removeFromGroup,
  grantDirectAccess, hasShareAccess, relogin,
  type AccountResult,
} from '../core/directory/accounts'
import {
  verifyIdentity as checkIdentity,
  type VerificationField, type VerificationResult,
} from '../core/directory/identity'
import { BRAND } from '../brand'
import {
  createWindows, openWindow, closeWindow, focusWindow, minimizeWindow,
  restoreWindow, toggleMaximize, moveWindow, setViewport,
  type WindowsState, type AppId,
} from './windows'
import type { Clock, WorldState } from '../core/world/types'
import type { SessionLog } from '../core/session/types'
import type { QueueState } from '../core/tickets/queue'
import type { WorkflowStatus, ResolutionCode } from '../core/tickets/types'
import type { Scenario } from '../core/scenario/types'
import type { ServiceStartType } from '../core/world/types'

export type Tool = 'queue' | 'ticket' | 'terminal' | 'directory' | 'scorecard'

export interface TerminalLine {
  kind: 'prompt' | 'output' | 'notice'
  text: string
}

export interface GameState {
  world: WorldState
  queue: QueueState
  session: SessionLog
  scenarios: Scenario[]
  activeTool: Tool
  terminalLines: TerminalLine[]
  scorecard: Scorecard | null
  /** сценарий закрытого тикета — разбор показывает его корневую причину */
  scoredScenarioId: string | null
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
  verifyRequester(field: VerificationField, answer: string): VerificationResult
  confirmWithUser(): void
  askRequesterTo(askId: string): void

  openApp(id: AppId): void
  closeApp(id: AppId): void
  focusApp(id: AppId): void
  minimizeApp(id: AppId): void
  restoreApp(id: AppId): void
  maximizeApp(id: AppId): void
  dragApp(id: AppId, x: number, y: number): void
  setDesktopSize(w: number, h: number): void

  clearTerminal(): void
  startServiceOn(name: string): OpResult
  stopServiceOn(name: string): OpResult
  setServiceStartType(name: string, type: ServiceStartType): OpResult

  unlockUser(sam: string): AccountResult
  resetUserPassword(sam: string): AccountResult
  setUserEnabled(sam: string, enabled: boolean): AccountResult
  addUserToGroup(sam: string, group: string): AccountResult
  removeUserFromGroup(sam: string, group: string): AccountResult
  grantShareAccess(sam: string, sharePath: string): AccountResult
  /** проверка доступа — только чтение, для окна общих ресурсов */
  checkShareAccess(sam: string, sharePath: string): boolean
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
  registry.register('net', net)
  registry.register('dsquery', dsquery)
  registry.register('whoami', whoami)

  const fresh = () => {
    const { world, tickets } = loadScenarios(SCENARIOS)
    return {
      world,
      queue: createQueue(tickets),
      session: createSession(),
      scenarios: SCENARIOS,
      activeTool: 'queue' as Tool,
      terminalLines: banner(),
      scorecard: null,
      scoredScenarioId: null,
      windows: createWindows(),
      now: clock.now(),
    }
  }

  return create<GameState>((set, get) => {
    /**
     * Общая обвязка операций над каталогом.
     *
     * Каталог меняется только по взятому тикету — то же правило, что
     * у машины: изменение без инцидента некому объяснить и нечем
     * оправдать. Читать каталог при этом можно всегда.
     */
    const directoryOp = (
      _sam: string,
      run: (world: WorldState, session: SessionLog) => AccountResult,
    ): AccountResult => {
      const st = get()
      if (!st.queue.assigned) return { ok: false, error: 'нет активного инцидента' }

      const r = run(st.world, st.session)
      set({ world: { ...st.world }, session: { ...st.session } })
      return r
    }

    return {
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

    /**
     * Сверка личности заявителя.
     *
     * Не кнопка «я подтвердил»: техник выбирает контрольное поле,
     * вводит услышанный ответ, и он сверяется с каталогом. Раньше
     * здесь поднимался голый флаг — шлюз считал непроверенным любого,
     * потому что не знал, **кого** сверяли.
     */
    verifyRequester(field, answer) {
      const st = get()
      if (!st.queue.assigned) {
        return { ok: false, expected: '', error: 'нет активного инцидента' }
      }

      const ticket = findTicket(st.queue, st.queue.assigned)
      const r = checkIdentity(st.world, ticket.requester, field, answer, st.session, clock)
      set({ session: { ...st.session } })
      return r
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
      const scenario = scenarioFor(ticket.scenarioId)

      // Заявитель судит по своей проблеме: условия задаёт сценарий.
      const worksNow = allHold(st.world, scenario.fixedWhen)

      const [good, bad] = scenario.confirmReplies
      const reply = worksNow ? good! : bad!

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

    /**
     * Попросить заявителя что-то сделать.
     *
     * Часть работы первой линии делается не техником: убрать старый
     * пароль с телефона, выйти и войти заново. Мир меняет заявитель,
     * поэтому запись идёт в `askedFor`, а не в журнал изменений —
     * оценке важно, догадался ли техник попросить.
     */
    askRequesterTo(askId) {
      const st = get()
      if (!st.queue.assigned) return

      const ticket = findTicket(st.queue, st.queue.assigned)
      const scenario = scenarioFor(ticket.scenarioId)
      const ask = scenario.asks?.find(a => a.id === askId)
      if (!ask) return

      // Просьба, не открытая расследованием, недоступна и из кода:
      // интерфейс лишь не показывает её, а правило живёт здесь.
      if (ask.unlockedBy) {
        const flags = st.session.flags as unknown as Record<string, unknown>
        if (flags[ask.unlockedBy] !== true) return
      }

      applyInject(st.world, ask.effect)
      if (ask.relogin) relogin(st.world, ask.relogin, clock)

      recordDialogue(st.session, clock, 'call', ticket.requester, 'technician', ask.ask)
      recordDialogue(st.session, clock, 'call', ticket.requester, 'requester', ask.reply)

      if (!st.session.askedFor.includes(askId)) st.session.askedFor.push(askId)

      const at = clock.now().toISOString()
      ticket.communications.push(
        { at, channel: 'call', from: 'technician', text: ask.ask },
        { at, channel: 'call', from: ticket.requester, text: ask.reply },
      )

      set({
        world: { ...st.world },
        session: { ...st.session },
        queue: { ...st.queue },
      })
    },

    openApp(id) {
      const st = get()
      openWindow(st.windows, id)

      // Открытие просмотра событий — само по себе действие техника:
      // именно оно отличает «запустил службу» от «разобрался».
      if (id === 'eventvwr' && !st.session.flags.eventLogRead) {
        setFlag(st.session, 'eventLogRead', true)
        set({ windows: { ...st.windows }, session: { ...st.session } })
        return
      }

      set({ windows: { ...st.windows } })
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

    setDesktopSize(w, h) {
      const st = get().windows
      if (st.viewport.w === w && st.viewport.h === h) return
      setViewport(st, w, h)
      set({ windows: { ...st } })
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

    /**
     * Операции над учётными записями из консоли каталога.
     *
     * Вызывают те же функции, что и команда `net`: консоль и команда —
     * оба представления, операция одна. Изменения каталога, как и
     * изменения машины, делаются только по взятому тикету.
     */
    unlockUser(sam) {
      return directoryOp(sam, (world, session) =>
        unlockAccount(world, sam, session, clock))
    },

    resetUserPassword(sam) {
      return directoryOp(sam, (world, session) =>
        resetPassword(world, sam, session, clock))
    },

    setUserEnabled(sam, enabled) {
      return directoryOp(sam, (world, session) =>
        setEnabled(world, sam, enabled, session, clock))
    },

    addUserToGroup(sam, group) {
      return directoryOp(sam, (world, session) =>
        addToGroup(world, sam, group, session, clock))
    },

    removeUserFromGroup(sam, group) {
      return directoryOp(sam, (world, session) =>
        removeFromGroup(world, sam, group, session, clock))
    },

    /**
     * Выдать доступ лично, минуя группу.
     *
     * Обходной путь, оставленный доступным намеренно: он работает сразу
     * и потому выглядит удачным решением. Цена отложенная — аномалия
     * при разборе прав и та же проблема у следующего сотрудника отдела.
     */
    grantShareAccess(sam, sharePath) {
      return directoryOp(sam, (world, session) =>
        grantDirectAccess(world, sam, sharePath, session, clock))
    },

    checkShareAccess(sam, sharePath) {
      return hasShareAccess(get().world, sam, sharePath)
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
        scenario: scenarioFor(ticket.scenarioId),
      })

      set({
        queue: { ...st.queue },
        scorecard,
        scoredScenarioId: ticket.scenarioId,
        activeTool: 'scorecard',
      })
    },
    }
  })
}

export const useGame = createGameStore({ now: () => new Date() })
