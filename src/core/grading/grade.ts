import { gradeNote } from './notes'
import type { NoteScore } from './types'
import type { SessionLog } from '../session/types'
import type { Ticket } from '../tickets/types'
import type { Scenario, Objective } from '../scenario/types'
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

function objectiveMet(o: Objective, session: SessionLog, ticket: Ticket): boolean {
  const ran = new Set(session.commands.map(c => c.cmdline.toLowerCase().trim()))
  const commandsOk = o.commands.every(c => ran.has(c.toLowerCase().trim()))

  const requiresOk = o.requires.every(req => {
    if (req === 'resolutionNotes') return ticket.resolutionNotes.trim().length > 0
    if (req === 'resolutionCode') return ticket.resolutionCode !== null
    const flags = session.flags as unknown as Record<string, unknown>
    return flags[req] === true
  })

  return commandsOk && requiresOk
}

/**
 * Поломки, оставленные самим игроком.
 *
 * Это самая недобрая и самая полезная часть оценки: интернет работает,
 * заявитель доволен, тикет закрыт — а мина заложена. В оригинале это
 * отдельная метрика, и не зря.
 */
function detectSilentFaults(world: WorldState, ticket: Ticket): string[] {
  const out: string[] = []
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
    met: objectiveMet(o, session, ticket),
    why: o.why,
  }))

  const note = gradeNote(ticket.resolutionNotes, session, ticket, scenario)
  const silentFaults = detectSilentFaults(world, ticket)

  const dangerous = session.flags.dangerousActions.length
  const codeRight = ticket.resolutionCode === scenario.expectedResolution

  // Владение: взят до начала работы и доведён до закрытия.
  const claimedBeforeActing = ticket.createdAt !== null
  const closed = ticket.status === 'completed'
  const ownership = (claimedBeforeActing ? 6 : 0) + (closed ? 4 : 0)

  // Расследование: доля диагностических целей, закрытых командами.
  const diagnostic = scenario.objectives.filter(o => o.commands.length > 0)
  const metDiagnostic = objectives.filter(
    o => diagnostic.some(d => d.id === o.id) && o.met).length
  const investigation = diagnostic.length === 0
    ? 10
    : Math.round((metDiagnostic / diagnostic.length) * 10)

  // Коммуникация: личность до изменений, подтверждение — от заявителя.
  const communication = (session.flags.identityVerified ? 4 : 0)
    + (session.flags.userConfirmed ? 6 : 0)

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
        + 'диагностических целей.',
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
        : 'Заявитель не подтвердил, что проблема ушла. Работающий у вас '
          + 'экран этого не доказывает.',
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
