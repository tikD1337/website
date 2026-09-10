import { useState } from 'react'
import { useGame } from '../../store/useGame'
import type { ServiceStartType, ServiceStatus } from '../../core/world/types'

const STATUS_LABEL: Record<ServiceStatus, string> = {
  running: 'Выполняется',
  stopped: 'Остановлена',
  paused: 'Приостановлена',
}

const START_LABEL: Record<ServiceStartType, string> = {
  auto: 'Автоматически',
  manual: 'Вручную',
  disabled: 'Отключена',
}

const START_TYPES: ServiceStartType[] = ['auto', 'manual', 'disabled']

/**
 * Окно «Службы».
 *
 * Кнопки вызывают те же операции, что и команда sc — иначе остановка
 * мышью и `sc stop` разошлись бы. Кнопка останова защитной службы
 * намеренно **не спрятана**: техник должен нажать её и получить отказ,
 * иначе он не узнает, где проходит граница.
 */
export function ServicesApp() {
  const queue = useGame(s => s.queue)
  const world = useGame(s => s.world)
  const startSvc = useGame(s => s.startServiceOn)
  const stopSvc = useGame(s => s.stopServiceOn)
  const setStart = useGame(s => s.setServiceStartType)

  const [selected, setSelected] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const ticket = queue.tickets.find(t => t.number === queue.assigned)
  const device = ticket ? world.devices[ticket.device] : undefined

  if (!device) return <div className="stub">Нет подключения к машине.</div>

  const current = device.services.find(s => s.name === selected)

  function act(fn: () => { ok: boolean; error?: string }) {
    const r = fn()
    setMessage(r.ok ? null : (r.error ?? 'Отказано'))
  }

  return (
    <div className="app-main">
      <table>
        <thead>
          <tr>
            <th>Имя</th>
            <th>Состояние</th>
            <th>Тип запуска</th>
          </tr>
        </thead>
        <tbody>
          {device.services.map(s => (
            <tr
              key={s.name}
              className={selected === s.name ? 'row sel' : 'row'}
              onClick={() => { setSelected(s.name); setMessage(null) }}
            >
              <td>
                {s.displayName}
                <div className="sub data">{s.name}</div>
              </td>
              <td className={s.status === 'running' ? 'ok' : undefined}>
                {STATUS_LABEL[s.status]}
              </td>
              <td className={s.startType === 'disabled' ? 'warn' : undefined}>
                {START_LABEL[s.startType]}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {current && (
        <div className="app-detail">
          <div className="bar">
            <button
              className="act"
              type="button"
              disabled={current.status === 'running'}
              onClick={() => act(() => startSvc(current.name))}
            >
              Запустить
            </button>

            <button
              className="act"
              type="button"
              disabled={current.status === 'stopped'}
              onClick={() => act(() => stopSvc(current.name))}
            >
              Остановить
            </button>

            <select
              aria-label="Тип запуска"
              value={current.startType}
              onChange={e => act(() =>
                setStart(current.name, e.target.value as ServiceStartType))}
            >
              {START_TYPES.map(t => (
                <option key={t} value={t}>{START_LABEL[t]}</option>
              ))}
            </select>
          </div>

          {message && <p className="deny">{message}</p>}

          {current.dependsOn.length > 0 && (
            <p className="sub">
              Зависит от: {current.dependsOn.join(', ')}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
