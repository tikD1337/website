import { create, type StoreApi, type UseBoundStore } from 'zustand'
import { loadScenarios } from '../core/scenario/load'
import { allHold } from '../core/scenario/check'
import { applyInject } from '../core/world/world'
import { SCENARIOS, scenarioFor } from '../scenarios'
import {
  createQueue, claim, setStatus, resolve, findTicket,
} from '../core/tickets/queue'
import {
  createQueueGenerator, fillQueue, SHIFT_WINDOW,
} from '../core/tickets/generate'
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
import { createDialogue, type Dialogue } from '../core/dialogue/port'
import { briefFor, contactBrief } from '../core/dialogue/brief'
import { detectIntent } from '../core/dialogue/intent'
import { loadConfig, saveConfig } from '../core/dialogue/store'
import type { DialogueConfig } from '../core/dialogue/types'
import type { Turn } from '../core/dialogue/types'
import type { Clock, WorldState } from '../core/world/types'
import type { SessionLog, DialogueChannel } from '../core/session/types'
import type { QueueState } from '../core/tickets/queue'
import type { WorkflowStatus, ResolutionCode } from '../core/tickets/types'
import type { Scenario } from '../core/scenario/types'
import type { ServiceStartType } from '../core/world/types'
import type { Progress, TicketRecord } from '../core/progress/types'
import { emptyProgress } from '../core/progress/types'
import { recordOf } from '../core/progress/record'
import {
  loadProgress, saveProgress, clearProgress,
} from '../core/progress/db'

export type Tool =
  | 'queue' | 'ticket' | 'terminal' | 'directory' | 'comms'
  | 'settings' | 'scorecard' | 'history' | 'profile'

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
  /** время симуляции — часы трея берут его отссюда, а не из Date.now() */
  now: Date

  /** канал общения: звонок, чат или почта */
  channel: DialogueChannel
  /** с кем сейчас разговор; null — никому не звонили */
  talkingTo: string | null
  /** реплика отправлена, ответ ещё не пришёл — модель может думать долго */
  waitingReply: boolean
  /**
   * Почему ответ пришёл не от модели.
   *
   * Плашка обязательна: молчаливая подмена источника учила бы, что
   * модель работает, когда она отключилась.
   */
  dialogueNotice: string | null
  dialogueConfig: DialogueConfig
  /** результат последней проверки соединения из экрана настроек */
  probeResult: { ok: boolean; error?: string } | null

  /**
   * Прогресс, переживший перезагрузку.
   *
   * История прохождений, из которой выводятся очки, ранг, счётчики и
   * профиль. Загружается из IndexedDB асинхронно при старте; до
   * загрузки — пуст, и экран профиля это переживает.
   */
  progress: Progress
  /** гидратация из хранилища закончилась — счётчики можно показывать */
  progressLoaded: boolean
  /** id текущей смены; переживает reset, чтобы закрытия нумеровались */
  shiftId: string
  /** разбор чужого прохождения, открытого из истории; null — свой */
  viewing: TicketRecord | null
  /**
   * Пул кончился: новых тикетов в этой смене не будет.
   *
   * Отдельный флаг, а не пустая очередь: «тикетов нет» и «тикетов
   * больше не будет» — разные состояния, и второе обязано быть
   * названо словами. Молчаливо опустевшая очередь читается как
   * поломка.
   */
  shiftExhausted: boolean

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

  setChannel(c: DialogueChannel): void
  /** снять трубку: выбрать собеседника из справочника */
  callTo(sam: string): void
  hangUp(): void
  /** сказать реплику и получить ответ */
  say(text: string): Promise<void>
  setDialogueConfig(cfg: DialogueConfig): void
  probeModel(): Promise<void>

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
  /** техник открыл карточку объекта в консоли — это тоже проверка */
  inspectObject(kind: 'user' | 'group', id: string): void
  /** проверка доступа — только чтение, для окна общих ресурсов */
  checkShareAccess(sam: string, sharePath: string): boolean

  /** скрыть тикет из очереди: экземпляр вернётся в пул, штрафа нет */
  hideTicket(number: string): void
  /** открыть разбор чужого прохождения из истории */
  viewRecord(r: TicketRecord): void
  /** закрыть чужой разбор, вернуться к своему */
  closeViewing(): void
  /** стереть прогресс: необратимо, живёт в настройках, а не в reset */
  wipeProgress(): void
}

const banner = (): TerminalLine[] => [
  { kind: 'output', text: `${BRAND.os} [Version ${BRAND.osVersion}]` },
  { kind: 'output', text: `(c) ${BRAND.company}. All rights reserved.` },
  { kind: 'output', text: '' },
]

export function createGameStore(
  clock: Clock,
  dialogueDeps?: { fetch?: Parameters<typeof createDialogue>[0]['fetch'] },
  shiftWindow = SHIFT_WINDOW,
): UseBoundStore<StoreApi<GameState>> {
  const registry = createRegistry()
  registry.register('ipconfig', ipconfig)
  registry.register('ping', ping)
  registry.register('nslookup', nslookup)
  registry.register('netsh', netsh)
  registry.register('sc', sc)
  registry.register('net', net)
  registry.register('dsquery', dsquery)
  registry.register('whoami', whoami)

  /*
    Разъём диалога создаётся один раз на стор и переживает сброс мира:
    настройки модели — состояние инструмента техника, а не инцидента.
    Перезапуск тренировки не должен сбрасывать адрес Ollama.
  */
  const dialogue: Dialogue = createDialogue({
    config: loadConfig(),
    ...(dialogueDeps?.fetch ? { fetch: dialogueDeps.fetch } : {}),
  })

  /*
    Генератор очереди — окно смены, а не вся библиотека. Создаётся один
    раз на стор и переживает reset: пул и закрытые тикеты — состояние
    смены, а reset начинает новую смену с тем же генератором. Прогресс
    (история прохождений) сюда не попадает — он переживает смену.
  */
  const generator = createQueueGenerator(SCENARIOS.map(s => s.id), shiftWindow)
  let shiftCounter = 0

  const fresh = () => {
    const { world } = loadScenarios(SCENARIOS)
    shiftCounter++
    /*
      Смена помечается временем начала, а не одним лишь счётчиком.

      Счётчик живёт в памяти стора и после перезагрузки начинается
      заново, поэтому первая смена нового запуска называлась бы `SH-1`
      — как и первая смена прошлого. Идентификатор записи строится из
      смены и номера тикета, и второе прохождение того же сценария
      сталкивалось бы с первым: одинаковый id в истории, один ключ на
      две строки. Время берётся из инжектируемых часов, как и везде.
    */
    const stamp = clock.now().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)
    const shiftId = `SH-${stamp}-${shiftCounter}`
    generator.tickets = []
    generator.pool = SCENARIOS.map(s => s.id)
    generator.exhausted = false
    fillQueue(generator, SCENARIOS)
    return {
      world,
      queue: createQueue(generator.tickets),
      session: createSession(),
      scenarios: SCENARIOS,
      activeTool: 'queue' as Tool,
      terminalLines: banner(),
      scorecard: null,
      scoredScenarioId: null,
      windows: createWindows(),
      now: clock.now(),
      channel: 'call' as DialogueChannel,
      talkingTo: null,
      waitingReply: false,
      dialogueNotice: null,
      dialogueConfig: dialogue.config(),
      probeResult: null,
      shiftId,
      viewing: null,
      shiftExhausted: generator.exhausted,
      progress: emptyProgress(),
      progressLoaded: false,
    }
  }

  /*
    Прогресс — состояние смены, а не инцидента. Загружается один раз
    при старте, до первого действия: хранилище асинхронное, и первый
    кадр рисуется без прогресса. Счётчики в рейле не показываются, пока
    не загружены; экран профиля это переживает.
  */
  let progressLoaded = false
  let progressPromise: Promise<void> | null = null
  function hydrateProgress(
    set: (p: Partial<GameState>) => void,
    get: () => GameState,
  ): void {
    if (progressLoaded || progressPromise) return

    /*
      Загруженное дописывается перед накопленным, а не заменяет его.

      Присвоение затирало бы прохождение, закрытое до конца гидратации.
      Случай не умозрительный: в приватном окне хранилище отвечает
      отказом, и ветка `catch` подставляла бы пустой прогресс поверх
      уже записанного. Загруженные записи старше по определению —
      отсюда порядок.
    */
    const merge = (loaded: Progress) => {
      progressLoaded = true
      progressPromise = null
      const inMemory = get().progress.records
      set({
        progress: { ...loaded, records: [...loaded.records, ...inMemory] },
        progressLoaded: true,
      })
    }

    progressPromise = loadProgress()
      .then(merge)
      .catch(() => merge(emptyProgress()))
  }

  const store = create<GameState>((set, get) => {
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

    /*
      `start` и `reset` делают одно и то же — начинают смену, — и
      различаются только тем, кто зовёт: первый вызывается явно,
      второй кнопкой «Пройти заново». Прогресс не трогает ни тот, ни
      другой: он переживает смену, и загружается один раз при создании
      стора, ниже.
    */
    start() {
      const { progress, progressLoaded } = get()
      set({ ...fresh(), progress, progressLoaded })
    },

    reset() {
      const { progress, progressLoaded } = get()
      set({ ...fresh(), progress, progressLoaded })
    },

    setTool(t) {
      set({ activeTool: t })
    },

    claimTicket(number) {
      const st = get()
      const q = st.queue

      /*
        Возврат к своему же тикету — не новый инцидент.

        По строке очереди кликают и чтобы вернуться к начатому. Раньше
        это проходило через `claim` и сбрасывало рабочий статус:
        поставил «ждём пользователя», заглянул в очередь, вернулся — и
        снова «назначен». Журнал при этом стирать тем более нельзя,
        иначе клик по своей же строке уничтожал бы всю работу.
      */
      if (q.assigned === number) {
        set({ activeTool: 'ticket', viewing: null })
        return
      }

      claim(q, number, clock)

      /*
        Новый инцидент — новый журнал.

        `session` есть вход для всей оценки, и относится он к
        инциденту, а не к смене. Пока смена состояла из одного тикета,
        разницы не было; теперь их несколько подряд, и подтверждение,
        полученное у одного заявителя, засчитывалось следующему — как
        и сверка личности, и чужие команды, и чужие опасные действия.

        Вместе с журналом заканчивается и всё, что было открыто по
        прошлому инциденту: разговор шёл с другим человеком, окна и
        вывод терминала — с другой машины. Мир при этом общий
        намеренно: последствия работы переживают инцидент, иначе тихие
        поломки перестали бы быть тихими.
      */
      set({
        queue: { ...q },
        activeTool: 'ticket',
        session: createSession(),
        terminalLines: banner(),
        windows: createWindows(),
        channel: 'call',
        talkingTo: null,
        waitingReply: false,
        dialogueNotice: null,
        viewing: null,
      })
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

      /*
        Вопрос техника записывается наравне с ответом.

        Раньше кнопка писала только реплику заявителя, и в переписке
        выходило, что человек заговорил сам с собой. С появлением
        разговора это стало и враньём в разборе: флаг «связались до
        изменений» поднимается репликой техника, и звонивший кнопкой
        читал «на связь до начала работы вы не выходили».
      */
      const question = 'Проверьте, пожалуйста, всё ли теперь работает.'

      recordDialogue(st.session, clock, 'call', ticket.requester, 'technician', question)
      recordDialogue(st.session, clock, 'call', ticket.requester, 'requester', reply)
      if (worksNow) setFlag(st.session, 'userConfirmed', true)

      const at = clock.now().toISOString()
      ticket.communications.push(
        {
          at, channel: 'call', from: 'technician',
          with: ticket.requester, text: question,
        },
        {
          at, channel: 'call', from: ticket.requester,
          with: ticket.requester, text: reply,
        },
      )

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

      /*
        Заявитель сообщает то, что видит. Просьба могла быть выполнена
        честно и всё равно не помочь — например, войти заново, когда
        в группу так и не добавили. Условие то же, по которому он
        подтверждает результат по телефону.
      */
      const helped = ask.replyIfBroken === undefined
        || allHold(st.world, scenario.fixedWhen)
      const reply = helped ? ask.reply : ask.replyIfBroken!

      recordDialogue(st.session, clock, st.channel, ticket.requester, 'technician', ask.ask)
      recordDialogue(st.session, clock, st.channel, ticket.requester, 'requester', reply)

      if (!st.session.askedFor.includes(askId)) st.session.askedFor.push(askId)

      const at = clock.now().toISOString()
      ticket.communications.push(
        {
          at, channel: st.channel, from: 'technician',
          with: ticket.requester, text: ask.ask,
        },
        {
          at, channel: st.channel, from: ticket.requester,
          with: ticket.requester, text: reply,
        },
      )

      set({
        world: { ...st.world },
        session: { ...st.session },
        queue: { ...st.queue },
      })
    },

    setChannel(c) {
      set({ channel: c })
    },

    /**
     * Позвонить, написать в чат или отправить письмо.
     *
     * Собеседник выбирается из справочника: звонить можно любому, и это
     * не декорация — «спросите у коллеги, у него так же?» есть приём
     * первой линии, за который оценка начисляет балл за масштаб.
     */
    callTo(sam) {
      set({ talkingTo: sam, dialogueNotice: null })
    },

    hangUp() {
      set({ talkingTo: null, dialogueNotice: null })
    },

    /**
     * Сказать реплику и получить ответ.
     *
     * Собеседник отвечает через разъём: реплики сценария, локальная
     * модель или свой эндпоинт — для стора это одно и то же. Отказ
     * модели сюда не долетает: разъём возвращает реплику сценария с
     * плашкой, и разговор продолжается.
     */
    async say(text) {
      const trimmed = text.trim()
      if (!trimmed) return

      const st = get()
      const assigned = st.queue.assigned
      /*
        Разговор требует взятого тикета — то же правило, что у удалёнки
        и у изменений каталога. Звонить в рабочее время по чужим
        инцидентам первая линия не ходит.
      */
      if (!assigned) return

      const withWhom = st.talkingTo
      if (!withWhom) return

      const ticket = findTicket(st.queue, assigned)
      const scenario = scenarioFor(ticket.scenarioId)
      const isRequester = withWhom === ticket.requester

      const brief = isRequester
        ? briefFor(scenario, ticket, st.world)
        : contactBrief(st.world, withWhom)

      // История именно этого разговора: реплики другим собеседникам
      // в контекст не идут.
      const history: Turn[] = st.session.dialogue
        .filter(d => d.with === withWhom)
        .map(d => ({ speaker: d.speaker, text: d.text }))

      const at = clock.now().toISOString()
      recordDialogue(st.session, clock, st.channel, withWhom, 'technician', trimmed)
      ticket.communications.push({
        at, channel: st.channel, from: 'technician', with: withWhom, text: trimmed,
      })

      /*
        Выяснение масштаба — измеряемое действие, а не болтовня:
        «у коллег так же?» отличает сломанный компьютер от сломанной
        системы. Флаг объявлен в срезе 0 и до появления разговора
        поднять его было нечем.
      */
      if (detectIntent(trimmed) === 'scope') {
        setFlag(st.session, 'scopeChecked', true)
      }

      set({
        session: { ...st.session },
        queue: { ...st.queue },
        waitingReply: true,
        dialogueNotice: null,
      })

      const r = await dialogue.reply({
        channel: st.channel,
        withWhom,
        brief,
        said: trimmed,
        history,
      })

      const after = get()

      /*
        За время ответа модели могло произойти что угодно: техник сменил
        собеседника, закрыл тикет, начал прохождение заново. Ответ,
        пришедший в изменившийся мир, отбрасывается целиком.

        Проверка `assigned` ловит закрытый тикет. Иначе реплика
        дописалась бы в переписку уже закрытого инцидента, а
        `userConfirmed` мог подняться задним числом: разбор на экране
        говорит «заявитель не подтвердил», а журнал сессии утверждает
        обратное.

        Сравнение самого объекта тикета ловит сброс: `reset` собирает
        очередь заново, и реплика из брошенного прохождения дописалась
        бы в свежее — тот же род дефекта, что инъекция, делившаяся
        ссылкой со сценарием. Обычные действия (окно, команда) тикет не
        пересоздают, поэтому ложных срабатываний нет.
      */
      const ticketNow = after.queue.tickets.find(t => t.number === assigned)

      const stale = after.talkingTo !== withWhom
        || after.queue.assigned !== assigned
        || ticketNow !== ticket

      if (stale || !ticketNow) {
        set({ waitingReply: false })
        return
      }
      const replyAt = clock.now().toISOString()

      recordDialogue(after.session, clock, after.channel, withWhom, 'requester', r.text)
      ticketNow.communications.push({
        at: replyAt, channel: after.channel, from: withWhom,
        with: withWhom, text: r.text,
      })

      /*
        Подтверждение засчитывается по состоянию мира, а не по словам:
        модель может сказать «спасибо, работает» из вежливости, и
        принимать это за подтверждение значило бы сделать её оракулом.
        Заявитель подтверждает только то, что действительно починено,
        и только про свой инцидент.
      */
      if (isRequester
        && detectIntent(trimmed) === 'retry'
        && allHold(after.world, scenario.fixedWhen)) {
        setFlag(after.session, 'userConfirmed', true)
      }

      set({
        session: { ...after.session },
        queue: { ...after.queue },
        waitingReply: false,
        dialogueNotice: r.notice ?? null,
      })
    },

    setDialogueConfig(cfg) {
      dialogue.configure(cfg)
      // Режим, адрес и модель переживают перезагрузку; ключ — нет.
      saveConfig(cfg)
      set({ dialogueConfig: cfg, probeResult: null, dialogueNotice: null })
    },

    async probeModel() {
      const r = await dialogue.probe()
      set({ probeResult: r })
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

    /**
     * Открытая карточка — доказательство наравне с командой.
     *
     * Иначе расследование, проведённое мышью, не засчитывается вовсе:
     * техник смотрит членство в консоли, а разбор говорит «закрыто 0
     * из 2 диагностических целей».
     */
    inspectObject(kind, id) {
      const st = get()
      const key = `${kind}:${id}`.toLowerCase()
      if (st.session.inspected.includes(key)) return
      st.session.inspected.push(key)
      set({ session: { ...st.session } })
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

      fillQueue(generator, SCENARIOS)

      /*
        Единственная точка записи прохождения: после оценки, после
        закрытия.

        История правится синхронно, а в IndexedDB уезжает следом. Не
        наоборот: пока идёт `await`, стор отвечает старым `progress`, и
        второе закрытие, прочитав его, затёрло бы первую запись. Сама
        запись при этом не блокирует интерфейс, а её отказ ничего не
        ломает — история уже в памяти, потеряется лишь то, что не
        переживёт перезагрузку.
      */
      const record = recordOf({
        card: scorecard,
        ticket,
        shiftId: st.shiftId,
        clock,
      })
      const progress = {
        ...st.progress,
        records: [...st.progress.records, record],
      }

      set({
        queue: createQueue(generator.tickets),
        scorecard,
        scoredScenarioId: ticket.scenarioId,
        activeTool: 'scorecard',
        progress,
        shiftExhausted: generator.exhausted,
        // Свой разбор вытесняет чужой: иначе экран покажет прошлое.
        viewing: null,
      })

      void saveProgress(progress).catch(() => {
        // Хранилище недоступно — тренировка продолжается.
      })
    },

    hideTicket(number) {
      const st = get()
      const q = { ...st.queue }
      const t = findTicket(q, number)
      if (t.status === 'completed') return
      // Возвращаем в пул — без штрафа, это отложенное дело.
      generator.pool.push(t.scenarioId)
      generator.tickets = q.tickets.filter(x => x.number !== number)
      fillQueue(generator, SCENARIOS)

      /*
        Скрыли чужой тикет — текущий остаётся на вас.

        `createQueue` всегда отдаёт пустое назначение, и пересборка
        очереди снимала инцидент, которого никто не трогал: техник
        убирал лишнюю строку из списка и обнаруживал, что удалёнка
        закрылась, а начатое дело больше не числится за ним.
      */
      const hidMine = q.assigned === number
      const queue = createQueue(generator.tickets)
      if (!hidMine) queue.assigned = q.assigned

      const next = { queue, shiftExhausted: generator.exhausted }
      if (hidMine) set({ ...next, activeTool: 'queue' })
      else set(next)
    },

    viewRecord(r: TicketRecord) {
      set({ viewing: r, activeTool: 'scorecard' })
    },

    closeViewing() {
      set({ viewing: null })
    },

    async wipeProgress() {
      try {
        await clearProgress()
        set({ progress: emptyProgress() })
      } catch {
        set({ progress: emptyProgress() })
      }
    },
    }
  })

  /*
    Гидратация — при создании стора, а не в `start`.

    Найдено визуальной проверкой: интерфейс `start` не вызывает вовсе,
    смену собирает сам инициализатор, — и экраны истории и профиля
    показывали «Загружается…» вечно. Тесты этого не видели: каждый звал
    `start` руками.
  */
  hydrateProgress(store.setState, store.getState)

  return store
}

export const useGame = createGameStore({ now: () => new Date() })
