import { gradeNote } from './notes'
import type { NoteScore } from './types'
import type { SessionLog } from '../session/types'
import type { Ticket } from '../tickets/types'
import type { Scenario, Objective } from '../scenario/types'
import { checkHolds, allHold } from '../scenario/check'
import type { WorldState } from '../world/types'

/**
 * Оценка инцидента по шести измерениям.
 *
 * Все шесть считаются из журнала сессии и состояния мира — языковая
 * модель здесь не участвует и не нужна. Мы знаем, что произошло, и
 * этого достаточно.
 */

export type DimensionId =
  | 'ownership'
  | 'investigation'
  | 'documentation'
  | 'communication'
  | 'authority'
  | 'resolution'

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
  why: string
}

export interface Scorecard {
  verdict: 'full' | 'partial' | 'fail'
  points: number
  dimensions: DimensionScore[]
  note: NoteScore
  objectives: ObjectiveResult[]
  /** поломки, которые игрок создал сам и о которых не знает */
  silentFaults: string[]
}

export interface GradeArgs {
  world: WorldState
  ticket: Ticket
  session: SessionLog
  scenario: Scenario
}

function objectiveMet(
  o: Objective, session: SessionLog, ticket: Ticket, world: WorldState,
): boolean {
  /*
    Доказательства из списка `commands` — это «или», а не «и».

    К одному выводу ведут разные пути: `net user` в терминале и
    карточка в консоли отвечают на один вопрос. Требовать их все
    значит наказывать за выбор инструмента. Запись вида
    `gui:user:n.haruna` засчитывается открытой карточкой — так работа
    мышью перестаёт быть невидимой для оценки.
  */
  const ran = new Set(session.commands.map(c => c.cmdline.toLowerCase().trim()))
  const seen = new Set(session.inspected.map(x => x.toLowerCase()))

  const evidenceOk = o.commands.length === 0 || o.commands.some(c => {
    const key = c.toLowerCase().trim()
    return key.startsWith('gui:')
      ? seen.has(key.slice(4))
      : ran.has(key)
  })

  /*
    Состояние мира — доказательство для целей, которые делаются и
    мышью, и командой: «снять блокировку», «добавить в группу»,
    «вернуть тип запуска». До этого у них не было ни команд, ни
    флагов, и `[].every()` засчитывал их всегда — разбор утверждал,
    что техник сделал то, чего он не делал. Загрузчик теперь не
    пропускает цель вообще без доказательств.
  */
  const stateOk = allHold(world, o.state ?? [])

  const requiresOk = o.requires.every(req => {
    if (req === 'resolutionNotes') return ticket.resolutionNotes.trim().length > 0
    if (req === 'resolutionCode') return ticket.resolutionCode !== null

    /*
      Просьба к заявителю: «askedFor:clear-phone».

      Отдельно от флагов, потому что мир менял не техник. Цель считается
      закрытой, если он догадался попросить — а это и есть то, что
      отличает «снял симптом» от «устранил причину».
    */
    if (req.startsWith('askedFor:')) {
      return session.askedFor.includes(req.slice('askedFor:'.length))
    }

    const flags = session.flags as unknown as Record<string, unknown>
    return flags[req] === true
  })

  return evidenceOk && requiresOk && stateOk
}

/**
 * Поломки, оставленные самим игроком.
 *
 * Это самая недобрая и самая полезная часть оценки: интернет работает,
 * заявитель доволен, тикет закрыт — а мина заложена. В оригинале это
 * отдельная метрика, и не зря.
 */
function detectSilentFaults(
  world: WorldState, ticket: Ticket, scenario: Scenario,
): string[] {
  const out: string[] = []

  // Ловушки, объявленные сценарием: «починил, но оставил след».
  for (const check of scenario.silentFaultChecks ?? []) {
    if (checkHolds(world, check)) out.push(check.message)
  }

  const a = world.devices[ticket.device]?.adapters[0]
  if (!a) return out

  if (!a.dhcpEnabled) {
    out.push(
      'На адаптере отключён DHCP — адрес задан вручную. Сейчас работает, '
      + 'но при смене адресации в сети машина снова выпадет, и следующий '
      + 'техник не поймёт почему.',
    )
  }

  if (a.autoconfigured) {
    out.push(
      'Адаптер по-прежнему удерживает самоназначенный адрес — исходная '
      + 'проблема не устранена.',
    )
  }

  return out
}

export function gradeIncident(args: GradeArgs): Scorecard {
  const { world, ticket, session, scenario } = args

  const objectives: ObjectiveResult[] = scenario.objectives.map(o => ({
    id: o.id,
    title: o.title,
    met: objectiveMet(o, session, ticket, world),
    why: o.why,
  }))

  const note = gradeNote(ticket.resolutionNotes, session, ticket, scenario)
  const silentFaults = detectSilentFaults(world, ticket, scenario)

  const dangerous = session.flags.dangerousActions.length
  const codeRight = ticket.resolutionCode === scenario.expectedResolution

  // Владение: взят до начала работы и доведён до закрытия.
  const claimedBeforeActing = ticket.createdAt !== null
  const closed = ticket.status === 'completed'
  const ownership = (claimedBeforeActing ? 6 : 0) + (closed ? 4 : 0)

  /*
    Расследование: доля диагностических целей плюс выясненный масштаб.

    Масштаб — надбавка с потолком, а не слагаемое: «у коллег так же?»
    отличает сломанный компьютер от сломанной системы и стоит балла,
    но безупречное прохождение и без него остаётся на десятке. Потолок
    сохраняет прежний максимум измерения, поэтому четыре пройденных
    сценария не съезжают от появления надбавки.
  */
  const diagnostic = scenario.objectives.filter(o => o.commands.length > 0)
  const metDiagnostic = objectives.filter(
    o => diagnostic.some(d => d.id === o.id) && o.met).length
  const investigationBase = diagnostic.length === 0
    ? 10
    : Math.round((metDiagnostic / diagnostic.length) * 10)

  /*
    Надбавка не дотягивает до максимума.

    Простой потолок `min(10, base + 2)` давал десятку при четырёх
    закрытых целях из пяти: разбор писал «закрыто 4 из 5» и тут же
    ставил 10 из 10. Измерение противоречило собственному объяснению,
    а выясненный масштаб маскировал недоделанное расследование.

    Десятка — только за полное расследование; надбавка поощряет
    масштаб, но выше девяти при неполной базе не поднимает.
  */
  const investigation = investigationBase === 10
    ? 10
    : Math.min(9, investigationBase + (session.flags.scopeChecked ? 2 : 0))

  /*
    Коммуникация: личность до изменений, подтверждение — от заявителя,
    и связь прежде действия. Третье слагаемое тоже надбавка с потолком:
    техник, который позвонил и предупредил, добирает балл, а тот, кто
    сделал всё остальное идеально, десятку не теряет.
  */
  const communication = Math.min(10, (session.flags.identityVerified ? 4 : 0)
    + (session.flags.userConfirmed ? 6 : 0)
    + (session.flags.announcedBeforeActing ? 2 : 0))

  // Полномочия: опасное действие обнуляет измерение целиком.
  const authority = dangerous > 0 ? 0 : codeRight ? 10 : 5

  // Качество решения.
  const resolutionOk = silentFaults.length === 0 && codeRight && session.flags.userConfirmed
  const resolution = silentFaults.length > 0 ? 2 : resolutionOk ? 10 : 5

  const dimensions: DimensionScore[] = [
    {
      id: 'ownership',
      label: 'Владение тикетом',
      score: ownership,
      explain: !claimedBeforeActing
        ? 'Работа началась раньше, чем тикет был взят в работу.'
        : closed
          ? 'Тикет взят до начала работы и доведён до закрытия.'
          : 'Тикет взят вовремя, но не доведён до закрытия.',
    },
    {
      id: 'investigation',
      label: 'Расследование',
      score: investigation,
      explain: `Закрыто ${metDiagnostic} из ${diagnostic.length} `
        + 'диагностических целей.'
        + (session.flags.scopeChecked
          ? ' Масштаб выяснен: спросили, у кого ещё так же.'
          : ' Масштаб не выяснен — один это компьютер или весь отдел,'
            + ' осталось неизвестным.'),
    },
    {
      id: 'documentation',
      label: 'Документация',
      score: note.score,
      explain: `Заметка оценена в ${note.score} из 10 — разбор по частям ниже.`,
    },
    {
      id: 'communication',
      label: 'Коммуникация',
      score: communication,
      explain: session.flags.userConfirmed
        ? 'Личность подтверждена, результат подтверждён заявителем.'
        : session.flags.announcedBeforeActing
          ? 'Заявитель не подтвердил, что проблема ушла. Работающий у вас '
            + 'экран этого не доказывает.'
          : 'Заявитель не подтвердил, что проблема ушла, — работающий у вас '
            + 'экран этого не доказывает, — и на связь до начала работы вы '
            + 'не выходили.',
    },
    {
      id: 'authority',
      label: 'Границы полномочий',
      score: authority,
      explain: dangerous > 0
        ? `Зафиксировано опасных действий: ${dangerous}. Отключение защиты `
          + 'не является обходным путём.'
        : codeRight
          ? 'Код закрытия соответствует тому, что произошло.'
          : 'Код закрытия не соответствует тому, что произошло на самом деле.',
    },
    {
      id: 'resolution',
      label: 'Качество решения',
      score: resolution,
      explain: silentFaults.length > 0
        ? 'После вас осталась незамеченная поломка.'
        : resolutionOk
          ? 'Мир приведён в целевое состояние и подтверждён заявителем.'
          : 'Решение неполное.',
    },
  ]

  const total = dimensions.reduce((a, d) => a + d.score, 0)   // 0–60
  const points = Math.round(total * 0.9)

  const allObjectivesMet = objectives.every(o => o.met)

  const verdict: Scorecard['verdict'] =
    dangerous > 0 || silentFaults.length > 0
      ? 'fail'
      : allObjectivesMet && total >= 52
        ? 'full'
        : total >= 25
          ? 'partial'
          : 'fail'

  return { verdict, points, dimensions, note, objectives, silentFaults }
}
