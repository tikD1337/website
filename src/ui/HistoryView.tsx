import { useGame } from '../store/useGame'
import { VERDICT } from './verdict'
import { formatDateTime } from './dates'

/**
 * История прохождений.
 *
 * Список — то, что было закрыто, а не то, что было брошено: незакрытые
 * тикеты прошлых смен сюда не попадают, потому что смена закончилась,
 * мир не сохранён и тикета больше нет. Строка открывает разбор именно
 * того прохождения — запись несёт `Scorecard` целиком.
 */
export function HistoryView() {
  const records = useGame(s => s.progress.records)
  const loaded = useGame(s => s.progressLoaded)
  const viewRecord = useGame(s => s.viewRecord)

  if (!loaded) {
    return (
      <div className="head">
        <h1>История</h1>
        <p>Загружается…</p>
      </div>
    )
  }

  if (records.length === 0) {
    return (
      <div className="head">
        <h1>История</h1>
        <p>
          Пока пусто. Здесь будут закрытые тикеты — каждый со своим
          разбором, который можно открыть и после перезагрузки.
        </p>
      </div>
    )
  }

  // Свежие сверху: история читается с конца, как журнал.
  const rows = [...records].reverse()

  return (
    <>
      <div className="head">
        <h1>История</h1>
        <p>
          Все закрытые тикеты. Строка открывает разбор того прохождения —
          с оценкой, целями и заметкой, как в момент закрытия.
        </p>
      </div>

      <table>
        <thead>
          <tr>
            <th>Когда</th>
            <th>Номер</th>
            <th>Описание</th>
            <th>Машина</th>
            <th>Вердикт</th>
            <th>Очки</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.id} className="row" onClick={() => viewRecord(r)}>
              <td className="data">{formatDateTime(r.at)}</td>
              <td className="data">{r.number}</td>
              <td>
                {r.summary}
                {r.card.silentFaults.length > 0 && (
                  <div className="sub fault-mark">
                    после вас осталась поломка
                  </div>
                )}
              </td>
              <td className="data">{r.device}</td>
              <td>
                <span className={`verdict-word ${r.card.verdict}`}>
                  {VERDICT[r.card.verdict]}
                </span>
              </td>
              <td className="data">{r.card.points}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )
}
