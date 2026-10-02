import { Fragment, useEffect, useRef, useState } from 'react'
import { useGame } from '../store/useGame'
import { STATUS_LABELS } from '../core/tickets/types'
import { withPlural } from './plural'
import { networkObserved } from '../core/session/observed'
import { linkOf } from '../core/network/link'
import type { Adapter } from '../core/world/types'

/**
 * Сеть машины в карточке — то же, что показал ipconfig: без линка
 * адреса нет, и карточка не должна рисовать его под номером тикета.
 */
export function railNetwork(adapter: Adapter, link: boolean): Array<[string, string]> {
  if (!link) return [['Сеть', 'Media disconnected']]
  return [
    ['Адрес', adapter.ip], ['Маска', adapter.mask],
    ['Шлюз', adapter.gateway || '—'], ['DNS', adapter.dns.join(', ') || '—'],
  ]
}

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
  const machine = world.devices[ticket.device]
  const adapter = machine?.adapters[0]
  const flags = session.flags
  // Сеть в карточке — после того, как техник её посмотрел: адрес 169.254
  // под номером тикета решал развилку сценария без единой команды.
  const netSeen = networkObserved(session, ticket.device)

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
          <dt>Тег</dt>
          <dd className="data">{machine?.assetTag ?? '—'}</dd>
          <dt>Модель</dt>
          <dd>{machine ? `${machine.vendor} ${machine.model}` : '—'}</dd>
          {netSeen && adapter && railNetwork(adapter, linkOf(world, ticket.device)).map(([label, value]) => (
            <Fragment key={label}>
              <dt>{label}</dt>
              <Data value={value} />
            </Fragment>
          ))}
        </dl>
        {!netSeen && (
          <p className="sub">Сетевые настройки ещё не смотрели.</p>
        )}
      </div>

      <div className="rail-block">
        <h3>Сделано</h3>
        <div className="tally">
          <span>{withPlural(session.commands.length, 'команда', 'команды', 'команд')}</span>
          <span>{withPlural(session.changes.length, 'изменение', 'изменения', 'изменений')}</span>
          <span className={flags.identityVerified ? 'flag-on' : undefined}>
            {flags.identityVerified ? '✓' : '—'} личность подтверждена
          </span>
          <span className={flags.userConfirmed ? 'flag-on' : undefined}>
            {flags.userConfirmed ? '✓' : '—'} заявитель подтвердил
          </span>
          {/*
            Только после того, как случилось: постоянная строка
            «— предупреждён о передаче» подсказывала бы, что тикет
            ждёт эскалации.
          */}
          {flags.userInformed && <span className="flag-on">✓ заявитель предупреждён о передаче</span>}
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
