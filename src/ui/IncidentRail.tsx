import { useEffect, useRef, useState } from 'react'
import { useGame } from '../store/useGame'
import { STATUS_LABELS } from '../core/tickets/types'

/**
 * Значение, которое подсвечивается один раз, когда изменилось.
 *
 * Это единственное движение во всём интерфейсе, и оно отвечает на
 * действие техника: запустил release — увидел, как адрес пропал.
 * Связность инструментов, показанная глазами, а не описанная словами.
 */
function Data({ value }: { value: string }) {
  const prev = useRef(value)
  const [pulse, setPulse] = useState(0)

  useEffect(() => {
    if (prev.current !== value) {
      prev.current = value
      setPulse(p => p + 1)
    }
  }, [value])

  return (
    <dd className={pulse ? 'data changed' : 'data'} key={pulse}>
      {value}
    </dd>
  )
}

export function IncidentRail() {
  const queue = useGame(s => s.queue)
  const world = useGame(s => s.world)
  const session = useGame(s => s.session)

  const ticket = queue.tickets.find(t => t.number === queue.assigned)

  if (!ticket) {
    return (
      <aside className="rail">
        <p className="rail-empty">
          Инцидент не взят. Откройте очередь и возьмите тикет — без этого
          удалённый доступ закрыт, как и на настоящей работе.
        </p>
      </aside>
    )
  }

  const user = world.org.users.find(u => u.samAccountName === ticket.requester)
  const adapter = world.devices[ticket.device]?.adapters[0]
  const flags = session.flags

  return (
    <aside className="rail" aria-label="Текущий инцидент">
      <h2>{ticket.number}</h2>
      <p className="summary">{ticket.summary}</p>

      <dl className="kv">
        <dt>Приоритет</dt>
        <dd>
          <span className={`prio ${ticket.priority.toLowerCase()}`}>
            {ticket.priority}
          </span>
        </dd>
        <dt>Статус</dt>
        <dd>{STATUS_LABELS[ticket.status]}</dd>
        <dt>Срок</dt>
        <dd>{ticket.slaResolveHours} ч</dd>
      </dl>

      <div className="rail-block">
        <h3>Заявитель</h3>
        <dl className="kv">
          <dt>Имя</dt>
          <dd>{user?.displayName ?? ticket.requester}</dd>
          <dt>Отдел</dt>
          <dd>{user?.dept ?? '—'}</dd>
          <dt>Телефон</dt>
          <dd className="data">{user?.phone ?? '—'}</dd>
        </dl>
      </div>

      <div className="rail-block">
        <h3>Машина</h3>
        <dl className="kv">
          <dt>Имя</dt>
          <Data value={ticket.device} />
          <dt>Адрес</dt>
          <Data value={adapter?.ip ?? '—'} />
          <dt>Маска</dt>
          <Data value={adapter?.mask ?? '—'} />
          <dt>Шлюз</dt>
          <Data value={adapter?.gateway || '—'} />
          <dt>DNS</dt>
          <Data value={adapter?.dns.join(', ') || '—'} />
        </dl>
      </div>

      <div className="rail-block">
        <h3>Сделано</h3>
        <div className="tally">
          <span>Команд: {session.commands.length}</span>
          <span>Изменений: {session.changes.length}</span>
          <span className={flags.identityVerified ? 'flag-on' : undefined}>
            {flags.identityVerified ? '✓' : '—'} личность подтверждена
          </span>
          <span className={flags.userConfirmed ? 'flag-on' : undefined}>
            {flags.userConfirmed ? '✓' : '—'} заявитель подтвердил
          </span>
          {flags.dangerousActions.length > 0 && (
            <span className="flag-bad">
              ✕ опасных действий: {flags.dangerousActions.length}
            </span>
          )}
        </div>
      </div>
    </aside>
  )
}
