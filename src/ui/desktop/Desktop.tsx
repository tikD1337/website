import { useGame } from '../../store/useGame'
import { APPS, type AppId } from '../../store/windows'

/** Иконки на рабочем столе — в том порядке, в каком они там лежат. */
const DESKTOP: AppId[] = ['explorer', 'browser', 'cmd', 'settings', 'eventvwr', 'services']

/** Закреплённые на панели задач. */
const PINNED: AppId[] = ['explorer', 'browser', 'cmd', 'eventvwr', 'services', 'devmgmt']

const GLYPH: Record<AppId, string> = {
  explorer: '🗀',
  browser: '◎',
  cmd: '>_',
  settings: '⚙',
  eventvwr: '☰',
  services: '⚙',
  devmgmt: '⌸',
}

export function Desktop() {
  const openApp = useGame(s => s.openApp)

  return (
    <div className="desktop-icons">
      {DESKTOP.map(id => (
        <button
          key={id}
          type="button"
          className="desk-icon"
          onDoubleClick={() => openApp(id)}
          onKeyDown={e => { if (e.key === 'Enter') openApp(id) }}
        >
          <span className="glyph" aria-hidden="true">{GLYPH[id]}</span>
          <span>{APPS[id].title}</span>
        </button>
      ))}
    </div>
  )
}

export { PINNED, GLYPH }
