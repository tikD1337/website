import { useState } from 'react'
import { useGame } from '../../store/useGame'
import type { EventLevel, EventLogName } from '../../core/world/types'

const LOGS: EventLogName[] = ['System', 'Application', 'Security']

const LEVEL_LABEL: Record<EventLevel, string> = {
  information: 'Сведения',
  warning: 'Предупреждение',
  error: 'Ошибка',
  critical: 'Критическая',
}

/** Уровень — суждение о серьёзности, поэтому цвет здесь уместен. */
const LEVEL_CLASS: Record<EventLevel, string> = {
  information: '',
  warning: 'warn',
  error: 'bad',
  critical: 'bad',
}

function time(iso: string): string {
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getUTCDate())}.${p(d.getUTCMonth() + 1)}.${d.getUTCFullYear()} `
    + `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`
}

/**
 * Просмотр событий.
 *
 * Читает `device.eventLog` напрямую — тот самый журнал, куда пишут
 * операции над службами. Поэтому остановка службы здесь видна сразу,
 * и здесь же видно, что случилось до прихода техника.
 */
export function EventViewer() {
  const queue = useGame(s => s.queue)
  const world = useGame(s => s.world)

  const [log, setLog] = useState<EventLogName>('System')
  const [selected, setSelected] = useState<number | null>(null)

  const ticket = queue.tickets.find(t => t.number === queue.assigned)
  const device = ticket ? world.devices[ticket.device] : undefined

  if (!device) return <div className="stub">Нет подключения к машине.</div>

  // Свежие записи сверху — техник смотрит на то, что случилось последним.
  const entries = device.eventLog
    .map((e, i) => ({ ...e, i }))
    .filter(e => e.log === log)
    .reverse()

  const current = entries.find(e => e.i === selected)

  return (
    <div className="app-split">
      <nav className="app-rail" aria-label="Журналы">
        {LOGS.map(name => {
          const count = device.eventLog.filter(e => e.log === name).length
          return (
            <button
              key={name}
              type="button"
              aria-current={log === name}
              onClick={() => { setLog(name); setSelected(null) }}
            >
              {name}
              <span className="count">{count}</span>
            </button>
          )
        })}
      </nav>

      <div className="app-main">
        <table>
          <thead>
            <tr>
              <th>Уровень</th>
              <th>Время</th>
              <th>Источник</th>
              <th>Код</th>
            </tr>
          </thead>
          <tbody>
            {entries.map(e => (
              <tr
                key={e.i}
                className={selected === e.i ? 'row sel' : 'row'}
                onClick={() => setSelected(e.i)}
              >
                <td className={LEVEL_CLASS[e.level]}>{LEVEL_LABEL[e.level]}</td>
                <td className="data">{time(e.at)}</td>
                <td>{e.source}</td>
                <td className="data">{e.eventId}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {entries.length === 0 && (
          <p className="sub" style={{ padding: '10px 0' }}>Записей нет.</p>
        )}

        {current && (
          <div className="app-detail">
            <p className="prose">{current.message}</p>
            <p className="sub">
              {current.source} · код {current.eventId} · {time(current.at)}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
