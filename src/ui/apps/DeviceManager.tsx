import { useGame } from '../../store/useGame'

/**
 * Диспетчер устройств.
 *
 * В срезе 2 — только чтение: показывает драйверы и коды проблем.
 * Обновление и откат драйвера появятся вместе со сценарием, которому
 * они понадобятся.
 */
export function DeviceManager() {
  const queue = useGame(s => s.queue)
  const world = useGame(s => s.world)

  const ticket = queue.tickets.find(t => t.number === queue.assigned)
  const device = ticket ? world.devices[ticket.device] : undefined

  if (!device) return <div className="stub">Нет подключения к машине.</div>

  return (
    <div className="app-main">
      <p className="sub" style={{ marginBottom: 10 }}>{device.hostname}</p>

      <table>
        <thead>
          <tr>
            <th>Устройство</th>
            <th>Поставщик</th>
            <th>Версия</th>
            <th>Состояние</th>
          </tr>
        </thead>
        <tbody>
          {device.drivers.map(d => (
            <tr key={d.device}>
              <td>
                {d.device}
                {d.problemText && <div className="sub bad">{d.problemText}</div>}
              </td>
              <td>{d.provider}</td>
              <td className="data">{d.version}</td>
              <td className={d.status === 'ok' ? 'ok' : 'bad'}>
                {d.status === 'ok'
                  ? 'Работает нормально'
                  : `Код ${d.problemCode ?? '?'}`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="sub" style={{ marginTop: 14 }}>Диски</p>
      <table>
        <thead>
          <tr>
            <th>Том</th>
            <th>Метка</th>
            <th>Свободно</th>
            <th>Состояние</th>
          </tr>
        </thead>
        <tbody>
          {device.disks.map(d => {
            const pct = Math.round((d.freeGb / d.totalGb) * 100)
            return (
              <tr key={d.letter}>
                <td className="data">{d.letter}:</td>
                <td>{d.label}</td>
                <td className="data">
                  {d.freeGb} / {d.totalGb} ГБ
                  <span className={pct < 10 ? ' bad' : ''}> ({pct}%)</span>
                </td>
                <td className={d.health === 'healthy' ? 'ok' : 'warn'}>
                  {d.health === 'healthy' ? 'Исправен' : 'Требует внимания'}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
