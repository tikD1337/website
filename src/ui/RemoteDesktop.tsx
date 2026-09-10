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
  const ticket = queue.tickets.find(t => t.number === queue.assigned)

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

      <div className="rdp">
        <Desktop />
        <WindowManager />
        <Taskbar />
      </div>
    </>
  )
}
