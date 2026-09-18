import { useGame } from '../store/useGame'
import { STATUS_LABELS } from '../core/tickets/types'
import { closedInShift } from '../core/progress/compare'

export function QueueView() {
  const queue = useGame(s => s.queue)
  const claimTicket = useGame(s => s.claimTicket)
  const exhausted = useGame(s => s.shiftExhausted)
  const records = useGame(s => s.progress.records)
  const shiftId = useGame(s => s.shiftId)

  const open = queue.tickets.filter(t => t.status !== 'completed')
  /*
    Завершённые считаются по истории, а не по очереди.

    Очередь — окно смены, и закрытый тикет из него уходит, освобождая
    место следующему. Пока это считалось вычитанием из очереди, счётчик
    показывал ноль независимо от того, сколько инцидентов закрыто.
  */
  const done = closedInShift(records, shiftId)

  return (
    <>
      <div className="head">
        <h1>Очередь инцидентов</h1>
        <p>
          Открытых: {open.length}. Завершённых за смену: {done}. Одновременно
          ведётся один инцидент — начатое доводится до конца.
        </p>
      </div>

      {/*
        Пустая очередь обязана объяснить себя.

        «Тикетов нет» и «тикетов больше не будет» — разные состояния.
        Молчаливо опустевшая таблица читается как поломка тренажёра, а
        не как конец смены.
      */}
      {exhausted && (
        <div className="section">
          <h2>Смена окончена</h2>
          <p className="prose">
            Инциденты кончились: все сценарии этой смены пройдены. Разбор
            каждого остался в истории, а «Пройти заново» на экране разбора
            начнёт новую смену — прогресс при этом сохранится.
          </p>
        </div>
      )}

      {queue.tickets.length > 0 && (
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
      )}
    </>
  )
}
