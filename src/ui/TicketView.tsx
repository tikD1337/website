import { useState, useEffect } from 'react'
import { useGame } from '../store/useGame'
import {
  RESOLUTION_LABELS, WORKFLOW_STATUSES, STATUS_LABELS,
  type ResolutionCode, type WorkflowStatus,
} from '../core/tickets/types'

const NOTE_HINT = [
  'Симптом словами заявителя.',
  'Что проверили и что это исключило — включая проверку, которая ничего не дала.',
  'Какое одно изменение внесли, с конкретным значением.',
  'Чем подтвердили.',
  'Что нужно знать следующему.',
].join('\n')

export function TicketView() {
  const queue = useGame(s => s.queue)
  const world = useGame(s => s.world)
  const session = useGame(s => s.session)

  const saveNotes = useGame(s => s.saveResolutionNotes)
  const setCode = useGame(s => s.setResolutionCode)
  const resolveTicket = useGame(s => s.resolveTicket)
  const verifyIdentity = useGame(s => s.verifyIdentity)
  const confirmWithUser = useGame(s => s.confirmWithUser)
  const setTicketStatus = useGame(s => s.setTicketStatus)
  const setTool = useGame(s => s.setTool)

  const ticket = queue.tickets.find(t => t.number === queue.assigned)
  const [draft, setDraft] = useState('')

  useEffect(() => {
    setDraft(ticket?.resolutionNotes ?? '')
  }, [ticket?.number])

  if (!ticket) {
    return (
      <div className="head">
        <h1>Тикет не взят</h1>
        <p>Откройте очередь и возьмите инцидент в работу.</p>
      </div>
    )
  }

  const user = world.org.users.find(u => u.samAccountName === ticket.requester)
  const canResolve = ticket.resolutionCode !== null

  return (
    <>
      <div className="head">
        <h1>{ticket.number} — {ticket.summary}</h1>
        <p>
          {ticket.category} › {ticket.subcategory}. {ticket.assignmentGroup}.
          Отклик за {ticket.slaResponseHours} ч, решение за {ticket.slaResolveHours} ч.
        </p>
      </div>

      <div className="section">
        <h2>Обращение</h2>
        <p className="prose">{ticket.description}</p>
        <p className="sub" style={{ marginTop: 6 }}>
          {user?.displayName}, {user?.title}, {user?.dept}
        </p>
      </div>

      <div className="bar">
        <button className="act" type="button" onClick={verifyIdentity}
          disabled={session.flags.identityVerified}>
          {session.flags.identityVerified
            ? 'Личность подтверждена'
            : 'Подтвердить личность'}
        </button>

        <button className="act" type="button" onClick={confirmWithUser}>
          Позвонить заявителю
        </button>

        <button className="act" type="button" onClick={() => setTool('terminal')}>
          Подключиться к машине
        </button>

        <select
          aria-label="Рабочий статус"
          value={WORKFLOW_STATUSES.includes(ticket.status as WorkflowStatus)
            ? ticket.status
            : 'assigned'}
          onChange={e => setTicketStatus(e.target.value as WorkflowStatus)}
        >
          {WORKFLOW_STATUSES.map(s => (
            <option key={s} value={s}>{STATUS_LABELS[s]}</option>
          ))}
        </select>
      </div>

      {ticket.communications.length > 0 && (
        <div className="section">
          <h2>Общение с заявителем</h2>
          {ticket.communications.map((c, i) => (
            <p key={i} className="prose" style={{ marginBottom: 6 }}>
              <span className="sub">{user?.displayName ?? c.from}: </span>
              {c.text}
            </p>
          ))}
        </div>
      )}

      <div className="section">
        <h2>Заметка о решении, её увидит заявитель</h2>
        <textarea
          aria-label="Заметка о решении"
          value={draft}
          placeholder={NOTE_HINT}
          onChange={e => setDraft(e.target.value)}
          onBlur={() => saveNotes(draft)}
        />
      </div>

      <div className="bar">
        <select
          aria-label="Код закрытия"
          value={ticket.resolutionCode ?? ''}
          onChange={e => setCode(e.target.value as ResolutionCode)}
        >
          <option value="" disabled>Выберите код закрытия</option>
          {(Object.keys(RESOLUTION_LABELS) as ResolutionCode[]).map(k => (
            <option key={k} value={k}>{RESOLUTION_LABELS[k]}</option>
          ))}
        </select>

        <button
          className="act primary"
          type="button"
          disabled={!canResolve}
          onClick={() => { saveNotes(draft); resolveTicket() }}
        >
          Закрыть тикет
        </button>
      </div>

      <p className="sub">
        Рабочий статус сам по себе тикет не закрывает — нужен код закрытия.
      </p>
    </>
  )
}
