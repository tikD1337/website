import { create, type StoreApi, type UseBoundStore } from 'zustand'
import { applyInject, createWorld } from '../core/world/world'
import {
  createQueue, claim, setStatus, resolve, findTicket, park, resume,
} from '../core/tickets/queue'
import { createShipment as ship, type ShipmentInput, type ShipResult } from '../core/logistics/ship'
import { advanceShipments } from '../core/logistics/advance'
import { STAGES } from '../core/logistics/types'
import { draftFrom } from '../core/kb/draft'
import { editArticle as editKb, setStatus as setKbStatus, type KbResult } from '../core/kb/edit'
import { mergeKb } from '../core/kb/search'
import { COURSES } from '../courses'
import { checkAnswer, gradeQuiz, type QuizGrade } from '../core/learning/answer'
import {
  courseState, recordCheck, recordQuiz, mergeLearning, checkPath, quizPath,
} from '../core/learning/state'
import type { Answer, Course, Learning } from '../core/learning/types'
import { INTERVIEWS } from '../interviews'
import {
  startInterview as beginInterview, answer as answerQuestion, say, askInterviewer as askQuestion,
  faqReply, reaction, finishQuestions, questionText, type Solved,
} from '../core/interview/flow'
import { gradeInterview } from '../core/interview/grade'
import type { InterviewRecord, InterviewRun, InterviewTrack } from '../core/interview/types'
import type { KbArticle, KbStatus, KbType } from '../core/kb/types'
import {
  createQueueGenerator, fillQueue, planFill, SHIFT_WINDOW,
} from '../core/tickets/generate'
import {
  settle, chain, all, isThenable, messageOf,
  type Capsule, type Catalog, type ContentPort, type MaybePromise,
} from '../content/port'
// Временно, до сетевого разъёма (задача 9): контент ещё едет в бандле.
import { createContentService } from '../content/server/service'
import { LIBRARY } from '../content/server/library'
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
import type { Scorecard } from '../core/grading/grade'
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
import { HANDOFF_REPLY } from '../core/dialogue/scripted'
import { newCli, promptOf, runSwitch, type CliState } from '../core/switchcli/cli'
import {
  setAccessVlan, setPortAdmin, setDescription, saveConfig as saveSwitch, setHelper,
  type InfraResult,
} from '../core/infra/switchops'
import { restartServerService } from '../core/infra/serverops'
import { loadConfig, saveConfig } from '../core/dialogue/store'
import type { DialogueConfig } from '../core/dialogue/types'
import type { Turn } from '../core/dialogue/types'
import type { Clock, WorldState } from '../core/world/types'
import type { SessionLog, DialogueChannel } from '../core/session/types'
import type { QueueState } from '../core/tickets/queue'
import type { WorkflowStatus, ResolutionCode } from '../core/tickets/types'
import type { ServiceStartType } from '../core/world/types'
import type { Progress, TicketRecord } from '../core/progress/types'
import { emptyProgress } from '../core/progress/types'
import { recordOf } from '../core/progress/record'
import {
  loadProgress, saveProgress, clearProgress,
} from '../core/progress/db'

export type Tool =
  | 'queue' | 'ticket' | 'terminal' | 'directory' | 'serverroom' | 'assets' | 'logistics' | 'kb' | 'comms'
  | 'settings' | 'scorecard' | 'history' | 'profile' | 'courses' | 'interview'

/** Где остановился ученик: курс, секция, урок или квиз секции. */
export interface LearnAt {
  course: string
  section?: string
  lesson?: string
  quiz?: true
}

export type AnswerResult = { ok: true; correct: boolean; why: string | null } | { ok: false; error: string }
export type QuizSubmit = { ok: true; grade: QuizGrade } | { ok: false; error: string }
export type PracticeResult =
  | { status: 'opened' }
  | { status: 'blocked'; error: string }
  /** тикета в окне нет; новая смена забудет отложенные тикеты `lost` */
  | { status: 'needs-new-shift'; lost: string[] }

export interface TerminalLine {
  kind: 'prompt' | 'output' | 'notice'
  text: string
}

/** Консоль одного коммутатора: режим, вывод и строка ввода. */
export interface SwitchConsole {
  cli: CliState
  lines: TerminalLine[]
  /** что вернуть в строку ввода — после `?` консоль возвращает набранное */
  draft: string
}

/**
 * Инцидент тикета, ждущего поставку: всё, что начато по нему, до
 * повторного взятия. Журнал принадлежит инциденту и после перерыва.
 */
export interface ParkedIncident {
  session: SessionLog
  terminalLines: TerminalLine[]
  consoles: Record<string, SwitchConsole>
  windows: WindowsState
}

export interface GameState {
  world: WorldState
  queue: QueueState
  session: SessionLog
  /** каталог с сервера: карточки сценариев, оглавления курсов, треки; null — ещё не пришёл */
  catalog: Catalog | null
  /**
   * Смена и пополнение очереди приходят с сервера (срез 8А).
   *
   * `error` называется словами (`contentError`) и чинится «Повторить»:
   * молча пустая очередь читалась бы как поломка тренажёра.
   */
  contentStatus: 'loading' | 'ready' | 'error'
  contentError: string | null
  /**
   * Тексты просьб, открытых расследованием в этом инциденте, по id.
   *
   * Принадлежат инциденту, как и журнал: в новом инциденте флаги
   * сброшены, и текст, полученный раньше, был бы диагнозом на кнопке
   * до расследования.
   */
  askTexts: Record<string, string>
  /** оценка закрытия ушла на сервер и ещё не вернулась — второе закрытие не уходит */
  grading: boolean
  /** почему действие по тикету не прошло: сервер недоступен, подпись не принята */
  ticketNotice: string | null
  activeTool: Tool
  terminalLines: TerminalLine[]
  /**
   * Открытые консоли коммутаторов, по имени.
   *
   * Принадлежат инциденту, как и терминал машины: новый тикет — новые
   * сеансы. Режим `enable`, оставшийся от прошлого инцидента, был бы
   * тем же протеканием, что и журнал.
   */
  consoles: Record<string, SwitchConsole>
  /** инциденты тикетов «Ждём поставку», по номеру тикета */
  parked: Record<string, ParkedIncident>
  /** что сделало последнее закрытие с базой знаний — для строки в разборе */
  lastDraft: { id: string; created: boolean } | null
  /** статья, открытая в «Документации» */
  kbOpen: string | null
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

  reset(): void
  setTool(t: Tool): void
  claimTicket(number: string): void
  setTicketStatus(s: WorkflowStatus): void
  runCommand(line: string): { rejected: boolean }
  saveResolutionNotes(text: string): void
  setResolutionCode(code: ResolutionCode): void
  resolveTicket(): MaybePromise<void>
  verifyRequester(field: VerificationField, answer: string): VerificationResult
  confirmWithUser(): MaybePromise<void>
  askRequesterTo(askId: string): MaybePromise<void>
  /** тексты просьб, открытых расследованием, — с сервера; уже полученные не просятся */
  loadAskTexts(): MaybePromise<void>
  /** повторить то, что не пришло с сервера: смену или пополнение очереди */
  retryContent(): MaybePromise<void>

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
  inspectObject(kind: 'user' | 'group' | 'device' | 'port' | 'svi' | 'asset', id: string): void

  /** Часы: двигают отправления и время на экране. Интерфейс зовёт раз в секунду. */
  tick(): void
  /** Оформить отправление по взятому тикету. */
  createShipment(input: ShipmentInput): ShipResult
  /** «Ждём поставку»: отпустить слот, запарковать инцидент. */
  waitForShipment(): { ok: boolean; error?: string }

  /** Правка статьи базы знаний — новая версия. */
  editArticle(id: string, patch: { title?: string; type?: KbType; body?: string }): KbResult
  setArticleStatus(id: string, status: KbStatus): KbResult
  /** Открыть статью в «Документации»; при взятом тикете — отметить осмотренной. */
  openArticle(id: string): void

  /** Открыть сеанс консоли коммутатора, если он ещё не открыт. */
  openConsole(device: string): void
  /** Строка в консоли коммутатора; смотреть можно всегда, менять — по тикету. */
  runSwitchCommand(device: string, line: string): void
  /** Ретрансляция на интерфейсе VLAN ядра — кнопка есть, но это всегда отказ. */
  setSviHelper(sw: string, vlan: number, ip: string, add: boolean): InfraResult
  setPortVlan(sw: string, port: string, vlan: number): InfraResult
  setPortEnabled(sw: string, port: string, up: boolean): InfraResult
  setPortDescription(sw: string, port: string, text: string): InfraResult
  saveSwitchConfig(sw: string): InfraResult
  restartServerService(server: string, service: string): InfraResult
  /** Сказать заявителю, что заявка передана дальше и кому. */
  informRequester(): void
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

  /** библиотека курсов — проверена загрузчиком при создании стора */
  courses: Course[]
  /** где остановился ученик; переживает смену и переход к тикету */
  learnAt: LearnAt | null
  openLearn(at: LearnAt | null): void
  answerCheck(course: string, section: string, lesson: string, check: string, answer: Answer): AnswerResult
  submitQuiz(course: string, section: string, answers: Record<string, Answer>): QuizSubmit
  /**
   * Урок открывает свой тикет по правилам очереди: свой — открыть,
   * чужой в работе — отказ, в окне смены — взять, иначе — новая смена,
   * но только с подтверждением (`newShift`).
   */
  practice(scenarioId: string, newShift?: boolean): MaybePromise<PracticeResult>

  /** треки интервью — проверены загрузчиком при создании стора */
  tracks: InterviewTrack[]
  /**
   * Идущее интервью. От очереди, мира и `session` не зависит и их не
   * трогает; незаконченное не сохраняется — как незакрытый тикет.
   */
  interview: InterviewRun | null
  /** интервьюер «думает» — модель отвечает; новый ответ не принимается */
  interviewBusy: boolean
  /** почему ответил не модель, а заготовка */
  interviewNotice: string | null
  /** какой разбор интервью открыт */
  interviewOpen: string | null
  startInterview(track: string): { ok: true } | { ok: false; error: string }
  answerInterview(text: string): Promise<void>
  askInterviewer(text: string): Promise<void>
  finishInterview(): InterviewRecord | null
  abandonInterview(): void
  openInterview(id: string | null): void
}

/** Вход на коммутатор по SSH — так начинается любой сеанс консоли. */
const switchBanner = (): TerminalLine[] => [
  { kind: 'output', text: '' },
  { kind: 'output', text: 'User Access Verification' },
  { kind: 'output', text: '' },
  { kind: 'output', text: 'Username: helpdesk' },
  { kind: 'output', text: 'Password: ' },
  { kind: 'output', text: '' },
]

const banner = (): TerminalLine[] => [
  { kind: 'output', text: `${BRAND.os} [Version ${BRAND.osVersion}]` },
  { kind: 'output', text: `(c) ${BRAND.company}. All rights reserved.` },
  { kind: 'output', text: '' },
]

export function createGameStore(
  clock: Clock,
  dialogueDeps?: { fetch?: Parameters<typeof createDialogue>[0]['fetch'] },
  shiftWindow = SHIFT_WINDOW,
  /** библиотека сценариев; подменяется в тестах, которым нужен свой сценарий */
  /** разъём контента: сервис в тестах, сеть в приложении (задача 9) */
  content: ContentPort = createContentService({ ...LIBRARY, sign: s => s, now: () => Date.now() }),
  courses: Course[] = COURSES,
  tracks: InterviewTrack[] = INTERVIEWS,
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
  const generator = createQueueGenerator([], shiftWindow)
  let shiftCounter = 0

  /*
    Контент приходит с сервера (срез 8А): каталог — один раз на стор,
    капсула — по тикету, когда он входит в окно смены. Капсула нужна и
    после: в ней подпись, без которой сервер не ответит про этот тикет.
    Библиотеки у браузера нет — её проверяет сервер при запуске.
  */
  let catalog: Catalog | null = null
  const capsules = new Map<string, Capsule>()
  const capsuleOf = (id: string): Capsule => {
    const c = capsules.get(id)
    if (!c) throw new Error(`нет капсулы тикета: ${id}`)
    return c
  }
  /** Смена, которую грузим сейчас: ответ, пришедший для прежней, отбрасывается. */
  let liveShift = ''
  /** Что повторит «Повторить»: упавшую загрузку смены или пополнение очереди. */
  let retry: (() => MaybePromise<void>) | null = null
  /** Загрузка новой смены — практика урока ждёт её, чтобы взять свой тикет. */
  let pendingShift: Promise<void> | null = null
  const STALE = Symbol('устарело')
  /** set и get стора — для ответов, пришедших после инициализатора */
  let api: { set: (p: Partial<GameState>) => void; get: () => GameState } | null = null

  const loadCatalog = (): MaybePromise<Catalog> => catalog ?? chain(content.catalog(), c => (catalog = c))

  /**
   * План окна → капсулы входящих → наполнение.
   *
   * Мир ломается, только когда пришли капсулы всех входящих: сбой на
   * полпути оставляет пул и очередь прежними. План пересчитывается после
   * каждого ответа — пока капсулы шли, окно могло измениться.
   */
  const fillFrom = (worldOf: () => WorldState, shiftId: string): MaybePromise<void> => {
    const metas = catalog!.scenarios
    const missing = planFill(generator, metas).filter(id => !capsules.has(id))
    if (missing.length === 0) {
      fillQueue(generator, metas, worldOf(), id => capsuleOf(id).inject)
      return
    }
    return chain(all(missing.map(id => content.capsule(id))), list => {
      if (liveShift !== shiftId) throw STALE
      for (const c of list) capsules.set(c.scenarioId, c)
      return fillFrom(worldOf, shiftId)
    })
  }

  /** Смена с сервера; результат — что положить в стор, `null` — смена уже другая. */
  const loadShift = (
    worldOf: () => WorldState, shiftId: string, first?: string,
  ): MaybePromise<Partial<GameState> | null> => settle<void, Partial<GameState> | null>(
    () => chain(loadCatalog(), cat => {
      if (liveShift !== shiftId) throw STALE
      generator.pool = cat.scenarios.map(x => x.id)
      if (first) generator.pool = [first, ...generator.pool.filter(id => id !== first)]
      return fillFrom(worldOf, shiftId)
    }),
    () => ({
      catalog, queue: createQueue(generator.tickets), shiftExhausted: generator.exhausted,
      contentStatus: 'ready' as const, contentError: null,
    }),
    e => {
      if (e === STALE) return null
      retry = () => chain(loadShift(worldOf, shiftId, first), applyShift(worldOf, shiftId))
      return { catalog, contentStatus: 'error' as const, contentError: messageOf(e) }
    },
  )

  /** Ответ для своей смены кладётся в стор; для прежней — отбрасывается. */
  const applyShift = (worldOf: () => WorldState, shiftId: string) => (p: Partial<GameState> | null) => {
    if (p && liveShift === shiftId) api!.set({ ...p, world: { ...worldOf() } })
  }

  /** Пополнение окна после закрытия или скрытия; сбой называется словами и повторяется. */
  const refill = (): MaybePromise<void> => {
    const { set, get } = api!
    const shiftId = liveShift
    return settle(
      () => fillFrom(() => get().world, shiftId),
      () => {
        if (liveShift !== shiftId) return
        const st = get()
        const queue = createQueue(generator.tickets)
        queue.assigned = st.queue.assigned
        set({ world: { ...st.world }, queue, shiftExhausted: generator.exhausted, contentStatus: 'ready', contentError: null })
      },
      e => {
        if (e === STALE || liveShift !== shiftId) return
        retry = refill
        set({ contentStatus: 'error', contentError: messageOf(e) })
      },
    )
  }

  /** `first` — сценарий, который новая смена ставит первым в пул: так урок открывает свою практику. */
  const fresh = (first?: string) => {
    /*
      Мир начинается исправным и ломается по мере того, как тикеты
      входят в окно смены, — см. `fillQueue`. Сценарий, ждущий в пуле,
      машину не трогает.
    */
    const world = createWorld()
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
    liveShift = shiftId
    retry = null
    generator.tickets = []
    generator.pool = []
    generator.exhausted = false
    generator.injected = []
    capsules.clear()
    const base = {
      world,
      queue: createQueue([]),
      session: createSession(),
      catalog,
      contentStatus: 'loading' as GameState['contentStatus'],
      contentError: null as string | null,
      askTexts: {},
      grading: false,
      ticketNotice: null as string | null,
      activeTool: 'queue' as Tool,
      terminalLines: banner(),
      consoles: {},
      parked: {},
      lastDraft: null,
      kbOpen: null,
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
      shiftExhausted: false,
      progress: emptyProgress(),
      progressLoaded: false,
    }
    /*
      Мир этой смены: пока стор не собран — тот, что создан здесь; после —
      тот, что лежит в сторе (действия кладут туда его копии).
    */
    const worldOf = () => {
      const st = api?.get()
      return st && st.shiftId === shiftId ? st.world : world
    }
    const loaded = loadShift(worldOf, shiftId, first)
    if (isThenable(loaded)) {
      pendingShift = loaded.then(applyShift(worldOf, shiftId))
      return base
    }
    pendingShift = null
    return { ...base, ...(loaded ?? {}) }
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
      const inMemory = get().progress
      set({
        progress: {
          ...loaded,
          records: [...loaded.records, ...inMemory.records],
          // Черновик мог появиться до конца загрузки: слияние не повторит номер.
          kb: mergeKb(loaded.kb, inMemory.kb),
          // Ответы, данные до конца загрузки, не теряются.
          learning: mergeLearning(loaded.learning, inMemory.learning),
          // Интервью, законченное до конца загрузки, дописывается после загруженных.
          interviews: [
            ...loaded.interviews,
            ...inMemory.interviews.filter(r => !loaded.interviews.some(x => x.id === r.id)),
          ],
        },
        progressLoaded: true,
      })
    }

    progressPromise = loadProgress()
      .then(merge)
      .catch(() => merge(emptyProgress()))
  }

  const store = create<GameState>((set, get) => {
    api = { set, get }
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

    /**
     * Обвязка операций серверной: то же правило, что у каталога, —
     * менять можно только по взятому тикету.
     */
    const infraOp = (run: (world: WorldState, session: SessionLog) => InfraResult): InfraResult => {
      const st = get()
      if (!st.queue.assigned) return { ok: false, error: 'нет активного инцидента' }
      const r = run(st.world, st.session)
      set({ world: { ...st.world }, session: { ...st.session } })
      return r
    }

    /** Статья правится в памяти сразу, хранилище получает её следом. */
    const commitArticle = (article: KbArticle) => {
      const st = get()
      const progress = { ...st.progress, kb: st.progress.kb.map(x => (x.id === article.id ? article : x)) }
      set({ progress })
      void saveProgress(progress).catch(() => {
        // Хранилище недоступно — база живёт в памяти до перезагрузки.
      })
    }

    /** Обучение правится синхронно, хранилище получает его следом. */
    const commitLearning = (learning: Learning) => {
      const progress = { ...get().progress, learning }
      set({ progress })
      void saveProgress(progress).catch(() => {
        // Хранилище недоступно — прогресс обучения живёт в памяти до перезагрузки.
      })
    }

    const findCourse = (id: string) => get().courses.find(c => c.id === id)

    return {
    ...fresh(),
    courses,
    learnAt: null,
    tracks,
    interview: null,
    interviewBusy: false,
    interviewNotice: null,
    interviewOpen: null,

    /*
      Новая смена по кнопке «Пройти заново». Первую смену собирает
      инициализатор стора — отдельного `start()` нет: интерфейс его не
      вызывал никогда, а звали его только тесты, и дефект, повешенный на
      него, зелёными тестами не ловился. Прогресс смена не трогает: он
      её переживает и загружается один раз при создании стора, ниже.
    */
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
      const claimed = findTicket(q, number)
      const { [number]: parkedHere, ...restParked } = st.parked

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
        /*
          Тикет, ждавший поставку, возвращается со своим инцидентом:
          журнал, вывод и консоли — те, что были до перерыва. Иначе
          всё, что техник выяснил до отправки, пропадало бы из оценки.
        */
        ...(parkedHere ?? {
          // Журнал знает свой инцидент: по нему шлюз решает, чей порт в области тикета.
          session: createSession({
            number, device: claimed.device, requester: claimed.requester,
          }),
          terminalLines: banner(),
          consoles: {},
          windows: createWindows(),
        }),
        parked: restParked,
        lastDraft: null,
        ticketNotice: null,
        askTexts: {},
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
      const capsule = capsuleOf(ticket.scenarioId)

      // Заявитель судит по своей проблеме: условия починки знает сервер.
      return settle(() => content.problemGone(capsule, st.world), worksNow => {
        const now = get()
        // Пока сервер отвечал, тикет могли закрыть или начать смену заново.
        if (now.queue.assigned !== assigned || now.queue.tickets.find(t => t.number === assigned) !== ticket) return

        const [good, bad] = capsule.confirmReplies
        const reply = worksNow ? good : bad

        /*
          Вопрос техника записывается наравне с ответом.

          Раньше кнопка писала только реплику заявителя, и в переписке
          выходило, что человек заговорил сам с собой. С появлением
          разговора это стало и враньём в разборе: флаг «связались до
          изменений» поднимается репликой техника, и звонивший кнопкой
          читал «на связь до начала работы вы не выходили».
        */
        const question = 'Проверьте, пожалуйста, всё ли теперь работает.'

        recordDialogue(now.session, clock, 'call', ticket.requester, 'technician', question)
        recordDialogue(now.session, clock, 'call', ticket.requester, 'requester', reply)
        if (worksNow) setFlag(now.session, 'userConfirmed', true)

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

        set({ session: { ...now.session }, queue: { ...now.queue }, ticketNotice: null })
      }, e => set({ ticketNotice: messageOf(e) }))
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
      const assigned = st.queue.assigned
      if (!assigned) return

      const ticket = findTicket(st.queue, assigned)
      const capsule = capsuleOf(ticket.scenarioId)
      const ask = capsule.asks.find(a => a.id === askId)
      if (!ask) return

      // Просьба, не открытая расследованием, недоступна и из кода:
      // интерфейс лишь не показывает её, а правило живёт здесь.
      const flags = st.session.flags as unknown as Record<string, unknown>
      if (ask.unlockedBy && flags[ask.unlockedBy] !== true) return

      /*
        Заявитель сообщает то, что видит. Просьба могла быть выполнена
        честно и всё равно не помочь — например, войти заново, когда
        в группу так и не добавили. Ответ считает сервер по тому же
        условию, по которому заявитель подтверждает результат по телефону;
        эффект просьбы браузер применяет к своему миру сам.
      */
      return settle(() => content.ask(capsule, askId, st.world, { ...flags }), r => {
        const now = get()
        if (!r || now.queue.assigned !== assigned || now.queue.tickets.find(t => t.number === assigned) !== ticket) return

        applyInject(now.world, r.effect)
        if (r.relogin) relogin(now.world, r.relogin, clock)

        recordDialogue(now.session, clock, now.channel, ticket.requester, 'technician', r.ask)
        recordDialogue(now.session, clock, now.channel, ticket.requester, 'requester', r.reply)

        if (!now.session.askedFor.includes(askId)) now.session.askedFor.push(askId)

        const at = clock.now().toISOString()
        ticket.communications.push(
          {
            at, channel: now.channel, from: 'technician',
            with: ticket.requester, text: r.ask,
          },
          {
            at, channel: now.channel, from: ticket.requester,
            with: ticket.requester, text: r.reply,
          },
        )

        set({
          world: { ...now.world },
          session: { ...now.session },
          queue: { ...now.queue },
          ticketNotice: null,
        })
      }, e => set({ ticketNotice: messageOf(e) }))
    },

    loadAskTexts() {
      const st = get()
      const assigned = st.queue.assigned
      if (!assigned) return
      const ticket = findTicket(st.queue, assigned)
      const capsule = capsuleOf(ticket.scenarioId)
      const flags = st.session.flags as unknown as Record<string, unknown>
      const open = capsule.asks.filter(a => !a.unlockedBy || flags[a.unlockedBy] === true)
      // Все открытые тексты уже здесь — сервер не спрашиваем.
      if (open.every(a => a.id in st.askTexts)) return
      const session = st.session

      return settle(() => content.askTexts(capsule, { ...flags }), texts => {
        const now = get()
        // Ответ для прежнего инцидента в новый не попадает.
        if (now.queue.assigned !== assigned || now.session.flags !== session.flags) return
        set({ askTexts: { ...now.askTexts, ...texts } })
      }, e => set({ ticketNotice: messageOf(e) }))
    },

    retryContent() {
      const again = retry
      retry = null
      if (!again) return
      set({ contentStatus: 'loading', contentError: null })
      return again()
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
      const capsule = capsuleOf(ticket.scenarioId)
      const isRequester = withWhom === ticket.requester

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
      const intent = detectIntent(trimmed)
      if (intent === 'scope') setFlag(st.session, 'scopeChecked', true)
      // Сказать о передаче словами — то же, что кнопкой «Сообщить о передаче».
      if (intent === 'handoff') setFlag(st.session, 'userInformed', true)

      set({
        session: { ...st.session },
        queue: { ...st.queue },
        waitingReply: true,
        dialogueNotice: null,
      })

      /*
        Заявитель судит по своей проблеме, а условия починки знает сервер
        (срез 8А): сводка ждёт его ответа. Сбой — реплика без ответа и
        плашка, как отказ модели, а не падение. Ждётся только настоящий
        промис: синхронный разъём не сдвигает запрос к модели ни на такт.
      */
      let brief
      try {
        if (isRequester) {
          const gone = content.problemGone(capsule, st.world)
          brief = briefFor(capsule, ticket, st.world, isThenable(gone) ? await gone : gone)
        } else {
          brief = contactBrief(st.world, withWhom)
        }
      } catch (e) {
        set({ waitingReply: false, ticketNotice: messageOf(e) })
        return
      }

      const r = await dialogue.reply({
        channel: st.channel,
        withWhom,
        brief,
        said: trimmed,
        history,
      })

      let after = get()

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

      /*
        Подтверждение засчитывается по состоянию мира, а не по словам:
        модель может сказать «спасибо, работает» из вежливости, и
        принимать это за подтверждение значило бы сделать её оракулом.
        Заявитель подтверждает только то, что действительно починено,
        и только про свой инцидент. Мир — после ответа: пока модель
        думала, техник мог починить; условия починки знает сервер.
      */
      let confirmed = false
      if (isRequester && detectIntent(trimmed) === 'retry') {
        try {
          const gone = content.problemGone(capsule, get().world)
          confirmed = isThenable(gone) ? await gone : gone
        } catch (e) {
          set({ ticketNotice: messageOf(e) })
        }
        const later = get()
        if (later.queue.assigned !== assigned || later.talkingTo !== withWhom
          || later.queue.tickets.find(t => t.number === assigned) !== ticket) {
          set({ waitingReply: false })
          return
        }
        after = later
      }
      const replyAt = clock.now().toISOString()

      recordDialogue(after.session, clock, after.channel, withWhom, 'requester', r.text)
      ticketNow.communications.push({
        at: replyAt, channel: after.channel, from: withWhom,
        with: withWhom, text: r.text,
      })

      if (confirmed) setFlag(after.session, 'userConfirmed', true)

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

      /*
        Открытое окно — доказательство, как открытая карточка: цель
        «посмотреть диспетчер устройств» закрывается записью
        `gui:app:devmgmt`. Без взятого тикета журнал черновой — писать
        некуда.
      */
      const key = `app:${id}`
      if (st.queue.assigned && !st.session.inspected.includes(key)) st.session.inspected.push(key)

      // Открытие просмотра событий — само по себе действие техника:
      // именно оно отличает «запустил службу» от «разобрался».
      if (id === 'eventvwr' && !st.session.flags.eventLogRead) {
        setFlag(st.session, 'eventLogRead', true)
      }

      set({ windows: { ...st.windows }, session: { ...st.session } })
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

    openConsole(device) {
      const st = get()
      if (st.consoles[device]) return
      set({ consoles: { ...st.consoles, [device]: { cli: newCli(device), lines: switchBanner(), draft: '' } } })
    },

    runSwitchCommand(device, line) {
      const st = get()
      const open = st.consoles[device] ?? { cli: newCli(device), lines: switchBanner(), draft: '' }

      /*
        Без взятого тикета консоль работает на черновом журнале без
        инцидента: смотреть можно, шлюз любое изменение отклонит, а
        журнал закрытого инцидента не пополнится чужими командами.
      */
      const session = st.queue.assigned ? st.session : createSession()
      const r = runSwitch(line, open.cli, { world: st.world, session, clock, device })

      const lines: TerminalLine[] = [
        ...open.lines,
        { kind: 'prompt', text: `${promptOf(open.cli)}${line}` },
        ...(r.stdout ? r.stdout.split(/\r?\n/).map(text => ({ kind: 'output' as const, text })) : []),
      ]
      set({
        world: { ...st.world },
        session: { ...st.session },
        consoles: { ...st.consoles, [device]: { cli: r.state, lines, draft: r.prefill ?? '' } },
      })
    },

    setPortVlan(sw, port, vlan) {
      return infraOp((world, session) => setAccessVlan(world, sw, port, vlan, session, clock))
    },

    setPortEnabled(sw, port, up) {
      return infraOp((world, session) => setPortAdmin(world, sw, port, up, session, clock))
    },

    setPortDescription(sw, port, text) {
      return infraOp((world, session) => setDescription(world, sw, port, text, session, clock))
    },

    saveSwitchConfig(sw) {
      return infraOp((world, session) => saveSwitch(world, sw, session, clock))
    },

    setSviHelper(sw, vlan, ip, add) {
      return infraOp((world, session) => setHelper(world, sw, vlan, ip, add, session, clock))
    },

    restartServerService(server, service) {
      return infraOp((world, session) => restartServerService(world, server, service, session, clock))
    },

    /**
     * Сообщить заявителю о передаче.
     *
     * Для эскалации это то же, что подтверждение для починки: человек
     * без сети должен знать, что заявка ушла, кому и чего ждать.
     */
    informRequester() {
      const st = get()
      const assigned = st.queue.assigned
      if (!assigned) return

      const ticket = findTicket(st.queue, assigned)
      const said = 'Передаю вашу заявку сетевой группе — это настройка сетевого оборудования, '
        + 'у меня нет к ней доступа. Сообщу, когда починят.'

      recordDialogue(st.session, clock, 'call', ticket.requester, 'technician', said)
      recordDialogue(st.session, clock, 'call', ticket.requester, 'requester', HANDOFF_REPLY)
      setFlag(st.session, 'userInformed', true)

      const at = clock.now().toISOString()
      ticket.communications.push(
        { at, channel: 'call', from: 'technician', with: ticket.requester, text: said },
        { at, channel: 'call', from: ticket.requester, with: ticket.requester, text: HANDOFF_REPLY },
      )
      set({ session: { ...st.session }, queue: { ...st.queue } })
    },

    tick() {
      const st = get()
      const now = clock.now()
      const events = advanceShipments(st.world, now)
      if (events.length === 0) {
        set({ now })
        return
      }

      /*
        Доставка по тикету дописывает рабочую заметку и возвращает
        ждущий тикет в работу. Закрытый тикет из окна смены уже ушёл —
        его доставка просто меняет учёт.
      */
      const q = st.queue
      for (const e of events) {
        if (!e.final || e.direction !== 'to-desk' || !e.ticket) continue
        const t = q.tickets.find(x => x.number === e.ticket)
        const sh = st.world.shipments.find(x => x.id === e.id)
        if (!t || !sh) continue
        const line = `${sh.history.at(-1)!.at.slice(11, 16)} Отправление ${e.id} доставлено: ${sh.destination}.`
        t.workNotes = t.workNotes ? `${t.workNotes}\n${line}` : line
        resume(q, e.ticket)
      }
      set({ now, world: { ...st.world }, queue: { ...q } })
    },

    createShipment(input) {
      const st = get()
      if (!st.queue.assigned) return { ok: false, error: 'нет активного инцидента' }
      const r = ship(st.world, input, st.session, clock)
      set({ world: { ...st.world }, session: { ...st.session } })
      return r
    },

    waitForShipment() {
      const st = get()
      const number = st.queue.assigned
      if (!number) return { ok: false, error: 'нет активного инцидента' }

      // Правило живёт здесь, а не в кнопке: ждать можно только то, что едет.
      const last = STAGES['to-desk'].length - 1
      const enRoute = st.world.shipments.some(x =>
        x.ticket === number && x.direction === 'to-desk' && x.stage < last)
      if (!enRoute) return { ok: false, error: 'по тикету нет отправления в пути — ждать нечего' }

      park(st.queue, number)
      set({
        queue: { ...st.queue },
        parked: {
          ...st.parked,
          [number]: {
            session: st.session, terminalLines: st.terminalLines,
            consoles: st.consoles, windows: st.windows,
          },
        },
        session: createSession(),
        terminalLines: banner(),
        consoles: {},
        windows: createWindows(),
        channel: 'call',
        talkingTo: null,
        waitingReply: false,
        dialogueNotice: null,
        activeTool: 'queue',
      })
      return { ok: true }
    },

    editArticle(id, patch) {
      const a = get().progress.kb.find(x => x.id === id)
      if (!a) return { ok: false, error: `статья ${id} не найдена` }
      const r = editKb(a, patch, clock.now().toISOString())
      if (r.ok && r.article !== a) commitArticle(r.article)
      return r
    },

    setArticleStatus(id, status) {
      const a = get().progress.kb.find(x => x.id === id)
      if (!a) return { ok: false, error: `статья ${id} не найдена` }
      const r = setKbStatus(a, status, clock.now().toISOString())
      if (r.ok) commitArticle(r.article)
      return r
    },

    openArticle(id) {
      const st = get()
      /*
        Заглянуть в базу — законный приём, и разбор это покажет. Без
        взятого тикета журнал принадлежит закрытому инциденту — писать в
        него нельзя.
      */
      const key = `kb:${id.toLowerCase()}`
      if (st.queue.assigned && !st.session.inspected.includes(key)) {
        st.session.inspected.push(key)
        set({ session: { ...st.session } })
      }
      set({ kbOpen: id, activeTool: 'kb' })
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
      // Оценка уже на сервере: второе нажатие не уходит и не пишет вторую запись.
      if (st.grading) return
      const code = ticket.resolutionCode

      /*
        Закрываем до оценки, а не после.

        Оценка смотрит на итоговое состояние: доведён ли тикет до конца —
        одно из шести измерений. Если считать раньше закрытия, статус
        ещё «назначен», и владение недобирает баллы при безупречном
        прохождении. Закрывается копия: оценку считает сервер (срез 8А),
        и пока она не пришла, настоящий тикет остаётся открытым — сбой
        связи не должен терять работу.
      */
      const draft = structuredClone(st.queue)
      resolve(draft, assigned, code)
      const closed = findTicket(draft, assigned)
      const capsule = capsuleOf(ticket.scenarioId)
      set({ grading: true, ticketNotice: null })

      return settle(() => content.grade(capsule, { world: st.world, ticket: closed, session: st.session }), r => {
        const now = get()
        // Пока сервер считал, могли начать смену заново: оценка той смены сюда не пишется.
        if (now.shiftId !== st.shiftId || now.queue.assigned !== assigned
          || now.queue.tickets.find(t => t.number === assigned) !== ticket) {
          if (now.shiftId === st.shiftId) set({ grading: false })
          return
        }
        resolve(now.queue, assigned, code)
        const scorecard = r.scorecard

        /*
          Вторая линия чинит после передачи — после оценки, чтобы разбор
          видел мир таким, каким его оставил техник, и до наполнения
          очереди, чтобы следующий тикет пришёл в починенный мир.
        */
        if (code === 'escalate') applyInject(now.world, r.onEscalate)

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
          shiftId: now.shiftId,
          clock,
        })
        /*
          Заметка закрытого тикета становится черновиком статьи — в том же
          `set`, что и запись прохождения: база знаний — часть прогресса и
          живёт по его правилу «сначала память, потом хранилище».
        */
        const kbDraft = draftFrom(now.progress.kb, record)
        const progress = {
          ...now.progress,
          records: [...now.progress.records, record],
          kb: kbDraft.kb,
        }

        // Закрытый тикет покидает окно; новый придёт пополнением с сервера.
        generator.tickets = generator.tickets.filter(t => t.status !== 'completed')
        set({
          world: { ...now.world },
          queue: createQueue(generator.tickets),
          scorecard,
          scoredScenarioId: ticket.scenarioId,
          activeTool: 'scorecard',
          progress,
          lastDraft: kbDraft.id ? { id: kbDraft.id, created: kbDraft.created } : null,
          // Свой разбор вытесняет чужой: иначе экран покажет прошлое.
          viewing: null,
          grading: false,
          ticketNotice: null,
        })

        void saveProgress(progress).catch(() => {
          // Хранилище недоступно — тренировка продолжается.
        })

        return refill()
      }, e => set({ grading: false, ticketNotice: messageOf(e) }))
    },

    hideTicket(number) {
      const st = get()
      const q = { ...st.queue }
      const t = findTicket(q, number)
      if (t.status === 'completed') return
      // Возвращаем в пул — без штрафа, это отложенное дело.
      generator.pool.push(t.scenarioId)
      generator.tickets = q.tickets.filter(x => x.number !== number)

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

      // Номер тикета выводится из сценария: вернувшийся экземпляр не должен найти чужую парковку.
      const { [number]: _dropped, ...parked } = st.parked
      const next = {
        world: { ...st.world },
        queue,
        parked,
        shiftExhausted: generator.exhausted,
      }
      if (hidMine) set({ ...next, activeTool: 'queue' })
      else set(next)
      // Окно пополнится с сервера: капсула входящего тикета ещё не у нас.
      void refill()
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

    openLearn(at) {
      set({ learnAt: at, activeTool: 'courses' })
    },

    answerCheck(courseId, sectionId, lessonId, checkId, answer) {
      const course = findCourse(courseId)
      if (!course) return { ok: false, error: 'курс не найден' }
      const section = course.sections.find(x => x.id === sectionId)
      const lesson = section?.lessons.find(x => x.id === lessonId)
      const check = lesson?.checks.find(x => x.id === checkId)
      if (!section || !lesson || !check) return { ok: false, error: 'урок не найден' }

      // Правило живёт здесь, а не в кнопке: спрятанная кнопка защищает только от мыши.
      const learning = get().progress.learning
      const status = courseState(course, learning).sections
        .find(x => x.id === section.id)!.lessons.find(x => x.id === lesson.id)!.status
      if (status === 'locked') return { ok: false, error: 'урок закрыт' }

      const verdict = checkAnswer(check, answer)
      if (verdict.correct) {
        const next = recordCheck(learning, checkPath(course.id, section.id, lesson.id, check.id))
        if (next !== learning) commitLearning(next)
      }
      return { ok: true, ...verdict }
    },

    submitQuiz(courseId, sectionId, answers) {
      const course = findCourse(courseId)
      if (!course) return { ok: false, error: 'курс не найден' }
      const section = course.sections.find(x => x.id === sectionId)
      if (!section) return { ok: false, error: 'квиз не найден' }

      const learning = get().progress.learning
      const status = courseState(course, learning).sections.find(x => x.id === section.id)!.quiz
      if (status === 'locked') return { ok: false, error: 'квиз закрыт' }

      const grade = gradeQuiz(section.quiz, answers)
      commitLearning(recordQuiz(learning, quizPath(course.id, section.id), grade, clock.now().toISOString()))
      return { ok: true, grade }
    },

    practice(scenarioId, newShift = false) {
      const st = get()
      if (!st.catalog?.scenarios.some(sc => sc.id === scenarioId)) return { status: 'blocked', error: 'сценарий не найден' }

      const inWindow = st.queue.tickets.find(t => t.scenarioId === scenarioId && t.status !== 'completed')
      if (inWindow && st.queue.assigned === inWindow.number) {
        st.claimTicket(inWindow.number)
        return { status: 'opened' }
      }
      // Урок — не чёрный ход мимо правила «один в работе».
      if (st.queue.assigned) return { status: 'blocked', error: 'сначала завершите текущий тикет' }
      if (inWindow) {
        st.claimTicket(inWindow.number)
        return { status: 'opened' }
      }

      /*
        Тикета этого сценария в окне нет. Вставить его сверх окна значило
        бы нарушить окно смены; честный путь — новая смена с ним первым.
        Она необратима: отложенные тикеты («Ждём поставку») забудутся, и
        об этом говорится до подтверждения, а не после.
      */
      if (!newShift) {
        const lost = st.queue.tickets.filter(t => t.status === 'pending-shipment').map(t => t.number)
        return { status: 'needs-new-shift', lost }
      }
      const { progress, progressLoaded } = st
      set({ ...fresh(scenarioId), progress, progressLoaded })
      // Новая смена грузится с сервера: свой тикет берётся, когда она пришла.
      return chain(pendingShift ?? undefined, (): PracticeResult => {
        const ticket = get().queue.tickets.find(t => t.scenarioId === scenarioId)
        if (!ticket) return { status: 'blocked', error: get().contentError ?? 'тикет не вошёл в новую смену' }
        get().claimTicket(ticket.number)
        return { status: 'opened' }
      })
    },

    startInterview(trackId) {
      const track = get().tracks.find(t => t.id === trackId)
      if (!track) return { ok: false, error: 'трек интервью не найден' }
      const { records, interviews } = get().progress
      /*
        Вопрос об опыте — про тикет, который вы закрывали. Провал сюда не
        идёт: спрашивать «как вы нашли причину» про тикет, где причину не
        нашли, значит подсказывать, что это был провал.
      */
      const solved: Solved[] = []
      for (const r of records) {
        if (r.card.verdict !== 'fail' && !solved.some(x => x.scenarioId === r.scenarioId)) {
          solved.push({ scenarioId: r.scenarioId, summary: r.summary })
        }
      }
      const attempt = interviews.filter(r => r.track === track.id).length
      set({
        interview: beginInterview(track, attempt, solved),
        interviewBusy: false,
        interviewNotice: null,
        interviewOpen: null,
        activeTool: 'interview',
      })
      return { ok: true }
    },

    async answerInterview(text) {
      const st = get()
      const run = st.interview
      const said = text.trim()
      // Пустой ответ и ответ поверх раздумий интервьюера не записываются.
      if (!run || st.interviewBusy || !said || run.stage === 'questions' || run.stage === 'done') return
      const track = st.tracks.find(t => t.id === run.track)!
      const question = questionText(track, run, run.plan[run.index]!)
      const { run: heard, next } = answerQuestion(track, run, said)
      set({ interview: heard, interviewBusy: true, interviewNotice: null })

      const candidateTurns = heard.transcript.filter(l => l.speaker === 'candidate').length
      const r = await dialogue.interview({
        purpose: 'react', interviewer: track.interviewer, company: track.company,
        question, said, history: run.transcript, fallback: reaction(candidateTurns - 1),
      })

      /*
        Пока модель думала, интервью могли бросить или начать заново.
        Ответ, пришедший в изменившийся мир, отбрасывается: иначе реакция
        из брошенного интервью дописалась бы в новое.
      */
      if (get().interview !== heard) return
      let after = say(heard, r.text)
      if (next) after = say(after, next)
      set({ interview: after, interviewBusy: false, interviewNotice: r.notice ?? null })
    },

    async askInterviewer(text) {
      const st = get()
      const run = st.interview
      const said = text.trim()
      if (!run || st.interviewBusy || !said || run.stage !== 'questions') return
      const track = st.tracks.find(t => t.id === run.track)!
      const asked = askQuestion(run, said)
      set({ interview: asked, interviewBusy: true, interviewNotice: null })

      const r = await dialogue.interview({
        purpose: 'answer', interviewer: track.interviewer, company: track.company,
        question: null, said, history: run.transcript, fallback: faqReply(track, said),
      })
      if (get().interview !== asked) return
      set({ interview: say(asked, r.text), interviewBusy: false, interviewNotice: r.notice ?? null })
    },

    finishInterview() {
      const st = get()
      const run = st.interview
      if (!run || st.interviewBusy || run.stage !== 'questions') return null
      const track = st.tracks.find(t => t.id === run.track)!
      const at = clock.now().toISOString()
      const record: InterviewRecord = {
        id: `${track.id}:${at}`, track: track.id, at, attempt: run.attempt,
        result: gradeInterview(track, finishQuestions(run)),
      }
      // Прогресс правится синхронно, хранилище получает его следом.
      const progress = { ...st.progress, interviews: [...st.progress.interviews, record] }
      set({ progress, interview: null, interviewOpen: record.id, activeTool: 'interview' })
      void saveProgress(progress).catch(() => {
        // Хранилище недоступно — запись живёт в памяти до перезагрузки.
      })
      return record
    },

    abandonInterview() {
      set({ interview: null, interviewBusy: false, interviewNotice: null })
    },

    openInterview(id) {
      set({ interviewOpen: id, activeTool: 'interview' })
    },
    }
  })

  /*
    Гидратация — при создании стора, а не в `start`, которого больше нет.

    Найдено визуальной проверкой: интерфейс `start` не вызывал вовсе,
    смену собирает сам инициализатор, — и экраны истории и профиля
    показывали «Загружается…» вечно. Тесты этого не видели: каждый звал
    `start` руками.
  */
  hydrateProgress(store.setState, store.getState)

  return store
}

export const useGame = createGameStore({ now: () => new Date() })
