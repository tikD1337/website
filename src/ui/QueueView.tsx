import { useGame } from '../store/useGame'
import { STATUS_LABELS } from '../core/tickets/types'

export function QueueView() {
  const queue = useGame(s => s.queue)
  const claimTicket = useGame(s => s.claimTicket)

  const open = queue.tickets.filter(t => t.status !== 'completed')
  const done = queue.tickets.length - open.length

  return (
    <>
      <div className="head">
        <h1>Очередь инцидентов</h1>
        <p>
          Открытых: {open.length}. Завершённых: {done}. Одновременно ведётся
          один инцидент — начатое доводится до конца.
        </p>
      </div>

      <table>
        <thead>
          <tr>
            <th>Номер</th>
            <th>Категория</th>
            <th>Описание</th>
            <th>Приоритет</th>
            <th>Статус</th>
            <th>Назначение</th>
          </tr>
        </thead>
        <tbody>
          {queue.tickets.map(t => {
            const closed = t.status === 'completed'
            const mine = queue.assigned === t.number
            const blocked = queue.assigned !== null && !mine

            return (
              <tr
                key={t.number}
                className={closed ? 'row done' : 'row'}
                onClick={() => { if (!closed && !blocked) claimTicket(t.number) }}
              >
                <td className="data">{t.number}</td>
                <td>
                  {t.category}
                  <div className="sub">{t.subcategory}</div>
                </td>
                <td>{t.summary}</td>
                <td>
                  <span className={`prio ${t.priority.toLowerCase()}`}>
                    {t.priority}
                  </span>
                </td>
                <td>{STATUS_LABELS[t.status]}</td>
                <td className="sub">
                  {closed
                    ? 'Завершён'
                    : mine
                      ? 'На вас'
                      : blocked
                        ? 'Сначала завершите текущий'
                        : 'Свободен, нажмите чтобы взять'}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </>
  )
}
