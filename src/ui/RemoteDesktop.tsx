import { useEffect, useRef } from 'react'
import { useGame } from '../store/useGame'
import { Desktop } from './desktop/Desktop'
import { WindowManager } from './desktop/WindowManager'
import { Taskbar } from './desktop/Taskbar'

/**
 * Удалённый рабочий стол.
 *
 * Раньше здесь было текстовое поле терминала. Теперь — симуляция
 * рабочего места: иконки, окна, панель задач, трей. Терминал стал
 * одним из окон и ничего при этом не потерял.
 */
export function RemoteDesktop() {
  const queue = useGame(s => s.queue)
  const setDesktopSize = useGame(s => s.setDesktopSize)
  const ticket = queue.tickets.find(t => t.number === queue.assigned)
  const rdp = useRef<HTMLDivElement>(null)

  /*
    Рабочий стол сообщает оконному менеджеру свой размер.

    Без этого окна открывались по константам и вылезали за край —
    ровно то, что показала первая визуальная проверка. Пересчёт
    на изменение размера окна браузера тоже нужен: иначе после
    сужения окна станут недоступны.
  */
  useEffect(() => {
    const el = rdp.current
    if (!el) return

    const measure = () => setDesktopSize(el.clientWidth, el.clientHeight)
    measure()

    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [setDesktopSize, ticket?.number])

  if (!ticket) {
    return (
      <div className="head">
        <h1>Удалённый рабочий стол</h1>
        <p>
          Подключение доступно только к машине с открытым инцидентом.
          Возьмите тикет в очереди.
        </p>
      </div>
    )
  }

  return (
    <>
      <div className="head">
        <h1>Удалённый рабочий стол</h1>
        <p>{ticket.device}, рабочее место: {ticket.requester}</p>
      </div>

      <div className="rdp" ref={rdp}>
        <Desktop />
        <WindowManager />
        <Taskbar />
      </div>
    </>
  )
}
