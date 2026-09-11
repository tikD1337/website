import { useState, useEffect } from 'react'
import { useGame } from '../store/useGame'
import {
  RESOLUTION_LABELS, WORKFLOW_STATUSES, STATUS_LABELS,
  type ResolutionCode, type WorkflowStatus,
} from '../core/tickets/types'
import {
  FIELD_QUESTION, FIELD_LABEL, type VerificationField,
} from '../core/directory/identity'

const FIELDS = Object.keys(FIELD_QUESTION) as VerificationField[]

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
  const verifyRequester = useGame(s => s.verifyRequester)
  const confirmWithUser = useGame(s => s.confirmWithUser)
  const askRequesterTo = useGame(s => s.askRequesterTo)
  const scenarios = useGame(s => s.scenarios)
  const setTicketStatus = useGame(s => s.setTicketStatus)
  const setTool = useGame(s => s.setTool)

  const ticket = queue.tickets.find(t => t.number === queue.assigned)
  const [draft, setDraft] = useState('')
  const [field, setField] = useState<VerificationField>('manager')
  const [answer, setAnswer] = useState('')
  const [verifyError, setVerifyError] = useState<string | null>(null)

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
  /*
    Показываем только те просьбы, которые техник уже заслужил
    расследованием: текст просьбы — это диагноз, и до выяснения
    причины его на экране быть не должно.
  */
  const flags = session.flags as unknown as Record<string, unknown>
  const asks = (scenarios.find(sc => sc.id === ticket.scenarioId)?.asks ?? [])
    .filter(a => !a.unlockedBy || flags[a.unlockedBy] === true)

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

      {/*
        Сверка личности — настоящая проверка, а не кнопка «я подтвердил».
        Техник выбирает контрольное поле, задаёт вопрос и вводит то, что
        услышал; ответ сверяется с каталогом. Подтверждение относится к
        конкретной учётной записи и чужие менять не даёт.
      */}
      <div className="section">
        <h2>Сверка личности</h2>

        {session.flags.identityVerified
          && session.verifiedAccount === ticket.requester ? (
            <p className="sub flag-on">
              ✓ Личность подтверждена: {user?.displayName}.
            </p>
          ) : (
            <>
              <p className="prose">{FIELD_QUESTION[field]}</p>
              <div className="bar">
                <select
                  aria-label="Контрольное поле"
                  value={field}
                  onChange={e => {
                    setField(e.target.value as VerificationField)
                    setVerifyError(null)
                  }}
                >
                  {FIELDS.map(f => (
                    <option key={f} value={f}>{FIELD_LABEL[f]}</option>
                  ))}
                </select>

                <input
                  aria-label="Ответ заявителя"
                  value={answer}
                  placeholder="Что ответил заявитель"
                  onChange={e => setAnswer(e.target.value)}
                />

                <button
                  className="act"
                  type="button"
                  onClick={() => {
                    const r = verifyRequester(field, answer)
                    setVerifyError(r.ok
                      ? null
                      : (r.error ?? 'Ответ не совпал с карточкой каталога.'))
                  }}
                >
                  Сверить
                </button>
              </div>
              {verifyError && <p className="deny">{verifyError}</p>}
            </>
          )}
      </div>

      <div className="bar">
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

      {/*
        Просьбы к заявителю.

        Часть работы первой линии делается не техником: убрать старый
        пароль с телефона, выйти и войти заново. Кнопки объявляет
        сценарий — ядро не знает ни про телефоны, ни про повторные входы.
      */}
      {asks.length > 0 && (
        <div className="section">
          <h2>Попросить заявителя</h2>
          {asks.map(a => (
            <div key={a.id} className="ask">
              <p className="prose">{a.ask}</p>
              <button
                className="act"
                type="button"
                disabled={session.askedFor.includes(a.id)}
                onClick={() => askRequesterTo(a.id)}
              >
                {session.askedFor.includes(a.id) ? 'Уже попросили' : 'Попросить'}
              </button>
            </div>
          ))}
        </div>
      )}

      {ticket.communications.length > 0 && (
        <div className="section">
          <h2>Общение с заявителем</h2>
          {ticket.communications.map((c, i) => (
            <p key={i} className="prose" style={{ marginBottom: 6 }}>
              {/* реплики техника подписываются им, а не заявителем */}
              <span className="sub">
                {c.from === 'technician' ? 'Вы' : user?.displayName ?? c.from}:{' '}
              </span>
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
