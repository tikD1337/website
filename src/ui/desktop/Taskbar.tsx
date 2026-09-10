import { useGame } from '../../store/useGame'
import { APPS, type AppId } from '../../store/windows'
import { PINNED, GLYPH } from './Desktop'

/**
 * Состояние сети глазами системного трея.
 *
 * Читает тот же адаптер, что и `ipconfig`. Поэтому после успешного
 * `release` + `renew` иконка меняется сама — без единой строчки связи
 * между терминалом и треем. Это и есть проверка архитектуры: если бы
 * трей хранил своё состояние, он бы соврал.
 */
export function networkState(
  adapter: { linkUp: boolean; autoconfigured: boolean; gateway: string } | undefined,
): { label: string; tone: 'ok' | 'warn' | 'bad' } {
  if (!adapter || !adapter.linkUp) {
    return { label: 'Нет подключения', tone: 'bad' }
  }
  if (adapter.autoconfigured || adapter.gateway === '') {
    return { label: 'Без доступа к сети', tone: 'warn' }
  }
  return { label: 'Подключено', tone: 'ok' }
}

function clockText(now: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(now.getUTCHours())}:${p(now.getUTCMinutes())}`
}

export function Taskbar() {
  const windows = useGame(s => s.windows)
  const queue = useGame(s => s.queue)
  const world = useGame(s => s.world)
  const now = useGame(s => s.now)

  const openApp = useGame(s => s.openApp)
  const restoreApp = useGame(s => s.restoreApp)
  const minimizeApp = useGame(s => s.minimizeApp)

  const ticket = queue.tickets.find(t => t.number === queue.assigned)
  const adapter = ticket ? world.devices[ticket.device]?.adapters[0] : undefined
  const net = networkState(adapter)

  const openIds = new Set(windows.windows.map(w => w.id))
  const buttons = [...PINNED, ...windows.windows.map(w => w.id).filter(
    id => !PINNED.includes(id),
  )]

  function toggle(id: AppId) {
    const win = windows.windows.find(w => w.id === id)
    if (!win) return openApp(id)
    if (win.minimized) return restoreApp(id)
    minimizeApp(id)
  }

  return (
    <footer className="taskbar">
      <button type="button" className="start" aria-label="Пуск">⊞</button>

      <div className="tasks">
        {buttons.map(id => (
          <button
            key={id}
            type="button"
            className={openIds.has(id) ? 'task open' : 'task'}
            aria-label={APPS[id].title}
            title={APPS[id].title}
            onClick={() => toggle(id)}
          >
            <span aria-hidden="true">{GLYPH[id]}</span>
          </button>
        ))}
      </div>

      <div className="tray">
        <span
          className={`tray-net ${net.tone}`}
          title={`Сеть: ${net.label}`}
          aria-label={`Сеть: ${net.label}`}
        >
          ▲
        </span>
        <span className="tray-sec" title="Защита включена" aria-label="Защита включена">
          ⛨
        </span>
        <span className="tray-clock">{clockText(now)}</span>
      </div>
    </footer>
  )
}
