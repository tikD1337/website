import { useState, useEffect, useRef } from 'react'
import { useGame } from '../store/useGame'
import { speak, speechAvailable } from './speech/speak'
import { listenOnce, listenAvailable, type Listener } from './speech/listen'
import type { DialogueChannel } from '../core/session/types'
import type { OrgUser } from '../core/world/types'

/**
 * Связь: телефон, чат и почта.
 *
 * Три канала — один инструмент, потому что разговор один. Переписка
 * живёт в `ticket.communications`, собственного состояния у инструмента
 * нет: то же правило, по которому окна удалёнки не хранят своё
 * состояние отдельно от мира.
 *
 * Диалер показывает весь справочник, а не одного заявителя. Позвонить
 * коллеге — приём первой линии («а у вас так же?»), и оценка за него
 * начисляет балл за выясненный масштаб.
 */

const CHANNELS: Array<{ id: DialogueChannel; label: string; verb: string }> = [
  { id: 'call', label: 'Звонок', verb: 'Сказать' },
  { id: 'chat', label: 'Чат', verb: 'Отправить' },
  { id: 'mail', label: 'Почта', verb: 'Отправить' },
]

/** Свой обратный номер — его называют, когда перезванивают. */
const HELPDESK_NUMBER = '+1 (512) 555-0100'

export function CommsView() {
  const queue = useGame(s => s.queue)
  const world = useGame(s => s.world)
  const session = useGame(s => s.session)
  const channel = useGame(s => s.channel)
  const talkingTo = useGame(s => s.talkingTo)
  const waiting = useGame(s => s.waitingReply)
  const notice = useGame(s => s.dialogueNotice)
  const config = useGame(s => s.dialogueConfig)

  const setChannel = useGame(s => s.setChannel)
  const callTo = useGame(s => s.callTo)
  const hangUp = useGame(s => s.hangUp)
  const say = useGame(s => s.say)

  const [draft, setDraft] = useState('')
  const [listening, setListening] = useState(false)
  const listener = useRef<Listener | null>(null)
  const feed = useRef<HTMLDivElement>(null)
  const spoken = useRef(0)

  const ticket = queue.tickets.find(t => t.number === queue.assigned)

  const thread = ticket
    ? ticket.communications.filter(c => c.with === talkingTo)
    : []

  // Лента прокручивается к свежей реплике — как любой мессенджер.
  useEffect(() => {
    const el = feed.current
    if (el) el.scrollTop = el.scrollHeight
  }, [thread.length, waiting])

  /*
    Озвучивается только новая реплика собеседника, и только когда
    озвучка включена. Счётчик нужен, чтобы перерисовка компонента не
    заставляла синтез повторять уже сказанное.
  */
  useEffect(() => {
    if (!config.speak || thread.length <= spoken.current) {
      spoken.current = thread.length
      return
    }
    const last = thread.at(-1)
    if (last && last.from !== 'technician') speak(last.text)
    spoken.current = thread.length
  }, [thread.length, config.speak])

  useEffect(() => () => listener.current?.stop(), [])

  if (!ticket) {
    return (
      <div className="head">
        <h1>Связь</h1>
        <p>
          Разговор ведётся по инциденту. Возьмите тикет в очереди — тогда
          станут доступны телефон, чат и почта, а всё сказанное попадёт
          в переписку тикета.
        </p>
      </div>
    )
  }

  const requester = world.org.users.find(u => u.samAccountName === ticket.requester)

  /*
    Порядок справочника: заявитель первым, остальные по имени. Учётки
    без телефона не показываются — служебным записям не звонят.
  */
  const others = world.org.users
    .filter(u => u.samAccountName !== ticket.requester && u.phone)
    .sort((a, b) => a.displayName.localeCompare(b.displayName))

  const partner = world.org.users.find(u => u.samAccountName === talkingTo)
  const verb = CHANNELS.find(c => c.id === channel)!.verb

  const send = () => {
    const text = draft.trim()
    if (!text || waiting) return
    setDraft('')
    void say(text)
  }

  const toggleMic = () => {
    if (listening) {
      listener.current?.stop()
      listener.current = null
      setListening(false)
      return
    }

    const l = listenOnce(
      text => setDraft(d => (d ? `${d} ${text}` : text)),
      () => { setListening(false); listener.current = null },
    )
    if (l) {
      listener.current = l
      setListening(true)
    }
  }

  const Row = ({ u, isRequester }: { u: OrgUser; isRequester: boolean }) => (
    <button
      type="button"
      className="dial-row"
      aria-current={talkingTo === u.samAccountName}
      onClick={() => callTo(u.samAccountName)}
    >
      <span className="dial-name">{u.displayName}</span>
      <span className="sub">
        {isRequester ? 'заявитель' : u.dept}
      </span>
      <span className="sub data">{u.phone}</span>
    </button>
  )

  return (
    <>
      <div className="head">
        <h1>Связь</h1>
        <p>
          Инцидент {ticket.number}. Ваш обратный номер: {HELPDESK_NUMBER} —
          назовите его, если попросят перезвонить.
        </p>
      </div>

      <div className="comms">
        <div className="dialer">
          <h3>Справочник</h3>
          {requester && <Row u={requester} isRequester />}
          {others.length > 0 && <div className="dial-sep">Остальные</div>}
          {others.map(u => <Row key={u.samAccountName} u={u} isRequester={false} />)}
        </div>

        <div className="thread">
          <div className="bar">
            {CHANNELS.map(c => (
              <button
                key={c.id}
                className="act"
                type="button"
                aria-current={channel === c.id}
                onClick={() => setChannel(c.id)}
              >
                {c.label}
              </button>
            ))}

            {talkingTo && (
              <button className="act" type="button" onClick={hangUp}>
                {channel === 'call' ? 'Положить трубку' : 'Закрыть переписку'}
              </button>
            )}
          </div>

          {!talkingTo ? (
            <p className="sub">
              Выберите собеседника в справочнике. Заявителю — по его
              инциденту; коллеге можно позвонить, чтобы выяснить, у него
              ли то же самое.
            </p>
          ) : (
            <>
              <div className="thread-head">
                <b>{partner?.displayName ?? talkingTo}</b>
                <span className="sub">
                  {partner?.title}{partner?.dept ? `, ${partner.dept}` : ''}
                </span>
              </div>

              <div className="feed" ref={feed} aria-label="Лента разговора">
                {thread.length === 0 && (
                  <p className="sub">
                    {channel === 'call'
                      ? 'Гудки. Собеседник взял трубку — поздоровайтесь.'
                      : 'Переписка пуста. Напишите первым.'}
                  </p>
                )}

                {thread.map((c, i) => (
                  <div
                    key={i}
                    className={c.from === 'technician' ? 'line mine' : 'line'}
                  >
                    <span className="who">
                      {c.from === 'technician'
                        ? 'Вы'
                        : partner?.displayName ?? c.from}
                    </span>
                    <span className="what">{c.text}</span>
                  </div>
                ))}

                {waiting && (
                  <div className="line">
                    <span className="who">
                      {partner?.displayName ?? talkingTo}
                    </span>
                    <span className="what sub">…</span>
                  </div>
                )}
              </div>

              {/*
                Плашка деградации. Молчаливая подмена источника учила бы,
                что модель работает, когда она отключилась.
              */}
              {notice && <p className="sub degraded">{notice}</p>}

              <div className="bar">
                <input
                  type="text"
                  aria-label="Что сказать"
                  value={draft}
                  placeholder={channel === 'call'
                    ? 'Что вы говорите собеседнику'
                    : 'Текст сообщения'}
                  onChange={e => setDraft(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') send() }}
                />

                {listenAvailable() && (
                  <button
                    className="act"
                    type="button"
                    aria-pressed={listening}
                    onClick={toggleMic}
                    title="Продиктовать"
                  >
                    {listening ? 'Слушаю…' : 'Микрофон'}
                  </button>
                )}

                <button
                  className="act primary"
                  type="button"
                  disabled={waiting || !draft.trim()}
                  onClick={send}
                >
                  {verb}
                </button>
              </div>

              {!speechAvailable() && config.speak && (
                <p className="sub">
                  Синтез речи в этом браузере недоступен — реплики только
                  текстом.
                </p>
              )}
            </>
          )}
        </div>
      </div>

      <p className="sub" style={{ marginTop: 14 }}>
        Сказанное попадает в переписку тикета и в журнал сессии: разбор
        смотрит, выходили ли вы на связь до того, как менять что-либо, и
        выяснили ли масштаб.
        {session.flags.scopeChecked && ' Масштаб выяснен.'}
      </p>
    </>
  )
}
