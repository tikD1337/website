import { useRef, type ReactNode, type PointerEvent, type KeyboardEvent } from 'react'
import { useGame } from '../../store/useGame'
import type { WindowState } from '../../store/windows'

/**
 * Окно рабочего стола.
 *
 * Перетаскивание на указателях, а не на мыши: так работает и с тачпадом,
 * и с сенсорным экраном, и не нужен глобальный слушатель — указатель
 * захватывается заголовком до отпускания.
 */
export function Window({ win, children }: { win: WindowState; children: ReactNode }) {
  const focusApp = useGame(s => s.focusApp)
  const closeApp = useGame(s => s.closeApp)
  const minimizeApp = useGame(s => s.minimizeApp)
  const maximizeApp = useGame(s => s.maximizeApp)
  const dragApp = useGame(s => s.dragApp)

  const grab = useRef<{ dx: number; dy: number } | null>(null)

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    focusApp(win.id)
    if (win.maximized) return
    grab.current = { dx: e.clientX - win.x, dy: e.clientY - win.y }
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    if (!grab.current) return
    dragApp(win.id, e.clientX - grab.current.dx, e.clientY - grab.current.dy)
  }

  function onPointerUp(e: PointerEvent<HTMLDivElement>) {
    grab.current = null
    e.currentTarget.releasePointerCapture(e.pointerId)
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Escape') {
      e.stopPropagation()
      closeApp(win.id)
    }
  }

  const style = win.maximized
    ? { left: 0, top: 0, width: '100%', height: '100%', zIndex: win.z }
    : { left: win.x, top: win.y, width: win.w, height: win.h, zIndex: win.z }

  return (
    <section
      className="win"
      style={style}
      role="dialog"
      aria-label={win.title}
      tabIndex={-1}
      onKeyDown={onKeyDown}
      onPointerDown={() => focusApp(win.id)}
    >
      <header
        className="win-bar"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onDoubleClick={() => maximizeApp(win.id)}
      >
        <span className="win-title">{win.title}</span>

        <div className="win-buttons">
          <button
            type="button"
            aria-label={`Свернуть ${win.title}`}
            onClick={() => minimizeApp(win.id)}
          >
            &#x2500;
          </button>
          <button
            type="button"
            aria-label={win.maximized ? `Восстановить ${win.title}` : `Развернуть ${win.title}`}
            onClick={() => maximizeApp(win.id)}
          >
            &#x25a1;
          </button>
          <button
            type="button"
            className="win-close"
            aria-label={`Закрыть ${win.title}`}
            onClick={() => closeApp(win.id)}
          >
            &#x2715;
          </button>
        </div>
      </header>

      <div className="win-body">{children}</div>
    </section>
  )
}
