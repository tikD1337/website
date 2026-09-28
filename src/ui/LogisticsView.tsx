import { useState } from 'react'
import { useGame } from '../store/useGame'
import { SHIPMENT_TYPES, STAGES } from '../core/logistics/types'
import { KIND_LABEL, LIFECYCLE_LABEL } from '../core/world/assets'
import type { ShipResult } from '../core/logistics/ship'
import type { Asset, Shipment, ShipmentType, WorldState } from '../core/world/types'

/**
 * Логистика — оформление отправлений и их журнал.
 *
 * Этап отправления двигается по часам (стор тикает раз в секунду), здесь
 * он только показывается. Поле актива принимает любой тег, а подсказки
 * — лишь подходящие: чужой актив ввести можно, и шлюз ответит отказом —
 * граница обозначается, а не прячется.
 */

const CREATABLE = (Object.keys(SHIPMENT_TYPES) as ShipmentType[]).filter(t => t !== 'inbound')

/** Подсказки актива для типа: со склада — на стол, своё — вендору и в утилизацию. */
function suggestions(world: WorldState, type: ShipmentType, requester: string, device: string): Asset[] {
  const t = SHIPMENT_TYPES[type]
  return world.cmdb.filter(a => t.kinds.includes(a.kind) && (t.direction === 'to-desk'
    ? a.lifecycle === 'in-stock'
    : (a.owner === requester || a.attachedTo === device) && ['in-use', 'in-stock'].includes(a.lifecycle)))
}

/** До следующего этапа — «0:40»; у завершённого — пусто. */
function untilNext(s: Shipment, now: Date): string {
  const stages = STAGES[s.direction]
  if (s.stage >= stages.length - 1) return ''
  const due = Date.parse(s.createdAt)
    + stages.slice(1, s.stage + 2).reduce((sum, st) => sum + st.after * 1000, 0)
  const left = Math.max(0, Math.ceil((due - now.getTime()) / 1000))
  return `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`
}

export function LogisticsView() {
  const world = useGame(s => s.world)
  const now = useGame(s => s.now)
  const queue = useGame(s => s.queue)
  const create = useGame(s => s.createShipment)

  const ticket = queue.tickets.find(t => t.number === queue.assigned)
  const [type, setType] = useState<ShipmentType>('dock-monitor-swap')
  const [tag, setTag] = useState('')
  const [recipient, setRecipient] = useState('')
  const [result, setResult] = useState<ShipResult | null>(null)

  const toDesk = SHIPMENT_TYPES[type].direction === 'to-desk'
  const hints = ticket ? suggestions(world, type, ticket.requester, ticket.device) : []
  const journal = [...world.shipments].reverse()

  function submit() {
    setResult(create({
      type, assetTag: tag.trim().toUpperCase(),
      ...(toDesk && recipient ? { recipient } : {}),
    }))
  }

  return (
    <>
      <div className="head">
        <h1>Логистика</h1>
        <p>
          Отправка оборудования — только по взятому тикету: замена на стол заявителя,
          возврат вендору, утилизация. Статус двигается сам, по мере того как везёт курьер.
        </p>
      </div>

      <div className="section">
        <h2>Оформить отправление{ticket ? ` по ${ticket.number}` : ''}</h2>
        <div className="bar">
          <select aria-label="Тип отправления" value={type} onChange={e => { setType(e.target.value as ShipmentType); setResult(null) }}>
            {CREATABLE.map(t => <option key={t} value={t}>{SHIPMENT_TYPES[t].label}</option>)}
          </select>
          <input
            type="text"
            aria-label="Тег актива"
            placeholder="Тег актива"
            list="asset-hints"
            value={tag}
            onChange={e => setTag(e.target.value)}
          />
          <datalist id="asset-hints">
            {hints.map(a => (
              <option key={a.tag} value={a.tag}>
                {/* Исправность — правда мира, а не поле учёта: подсказка её не выдаёт. */}
                {`${KIND_LABEL[a.kind]} ${a.model}, ${LIFECYCLE_LABEL[a.lifecycle]}${a.note ? `, ${a.note}` : ''}`}
              </option>
            ))}
          </datalist>
          {/* Без тикета получателя нет: отправка по заявке, а не кому угодно. */}
          {toDesk && ticket && (
            <select aria-label="Получатель" value={recipient || ticket?.requester || ''} onChange={e => setRecipient(e.target.value)}>
              {world.org.users.filter(u => u.office).map(u => (
                <option key={u.samAccountName} value={u.samAccountName}>{u.displayName}, стол {u.office}</option>
              ))}
            </select>
          )}
          <button className="act primary" type="button" disabled={!tag.trim()} onClick={submit}>
            Оформить
          </button>
        </div>
        {hints.length > 0 && (
          <p className="sub">Подходит: {hints.map(a => a.tag).join(', ')}</p>
        )}
        {result && (result.ok
          ? <p className={result.flagged ? 'deny' : 'sub'}>
              Оформлено {result.id}.{result.flagged ? ' Записано как ошибка суждения.' : ''}
            </p>
          : <p className="deny">{result.error}</p>)}
      </div>

      <div className="section">
        <h2>Журнал отправлений</h2>
        <table className="journal">
          <thead>
            <tr><th>Номер</th><th>Тип</th><th>Актив</th><th>Куда</th><th>Тикет</th><th>Этап</th><th>До следующего</th></tr>
          </thead>
          <tbody>
            {journal.map(s => {
              const stages = STAGES[s.direction]
              const outcome = s.outcome === 'accepted' ? ' — принято по гарантии'
                : s.outcome === 'rejected' ? ' — отклонено: гарантия истекла' : ''
              return (
                <tr key={s.id}>
                  <td className="data">{s.id}<div className="sub">{s.tracking}</div></td>
                  <td>{SHIPMENT_TYPES[s.type].label}</td>
                  <td className="data">{s.assetTag}</td>
                  <td>{s.destination}</td>
                  <td className="data">{s.ticket || '—'}</td>
                  <td>
                    {s.history.at(-1)!.stage}{outcome}
                    <div className="sub">шаг {s.stage + 1} из {stages.length}</div>
                  </td>
                  <td className="data">{untilNext(s, now)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </>
  )
}
