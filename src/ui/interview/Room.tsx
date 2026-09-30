import { useEffect, useRef, useState } from 'react'
import { useGame } from '../../store/useGame'
import { speak } from '../speech/speak'
import { listenOnce, listenAvailable, type Listener } from '../speech/listen'
import type { InterviewRun, InterviewTrack } from '../../core/interview/types'

/** Этапы по порядку: это последовательность, поэтому номера. */
function Stages({ track, run }: { track: InterviewTrack; run: InterviewRun }) {
  const technicalDone = Math.max(0, Math.min(run.index - 1, track.perInterview))
  const steps: Array<{ id: InterviewRun['stage']; label: string }> = [
    { id: 'intro', label: 'Знакомство' },
    { id: 'technical', label: run.stage === 'technical' ? `Рабочие ситуации, ${technicalDone + 1} из ${track.perInterview}` : 'Рабочие ситуации' },
    { id: 'experience', label: 'Ваш опыт' },
    { id: 'questions', label: 'Ваши вопросы' },
    { id: 'done', label: 'Вердикт' },
  ]
  const current = steps.findIndex(s => s.id === run.stage)
  return (
    <ol className="stages" aria-label="Этапы интервью">
      {steps.map((s, i) => (
        <li key={s.id} className={i === current ? 'current' : i < current ? 'passed' : undefined}
          aria-current={i === current ? 'step' : undefined}>
          {s.label}
        </li>
      ))}
    </ol>
  )
}

export function Room({ track, run }: { track: InterviewTrack; run: InterviewRun }) {
  const busy = useGame(s => s.interviewBusy)
  const notice = useGame(s => s.interviewNotice)
  const config = useGame(s => s.dialogueConfig)
  const answerInterview = useGame(s => s.answerInterview)
  const askInterviewer = useGame(s => s.askInterviewer)
  const finishInterview = useGame(s => s.finishInterview)
  const abandon = useGame(s => s.abandonInterview)

  const [draft, setDraft] = useState('')
  const [confirmAbandon, setConfirmAbandon] = useState(false)
  const [listening, setListening] = useState(false)
  const listener = useRef<Listener | null>(null)
  const feed = useRef<HTMLDivElement>(null)
  const spoken = useRef(run.transcript.length)

  const asking = run.stage === 'questions'
  // Имя без должности: в ленте реплика подписывается человеком, а не титулом.
  const name = track.interviewer.split(',')[0]!

  useEffect(() => {
    const el = feed.current
    if (el) el.scrollTop = el.scrollHeight
  }, [run.transcript.length, busy])

  // Озвучивается только новое сказанное интервьюером — и только при включённой озвучке.
  useEffect(() => {
    const fresh = run.transcript.slice(spoken.current).filter(l => l.speaker === 'interviewer')
    if (config.speak && fresh.length) speak(fresh.map(l => l.text).join(' '))
    spoken.current = run.transcript.length
  }, [run.transcript.length, config.speak])

  useEffect(() => () => listener.current?.stop(), [])

  const send = () => {
    const text = draft.trim()
    if (!text || busy) return
    setDraft('')
    void (asking ? askInterviewer(text) : answerInterview(text))
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
    if (l) { listener.current = l; setListening(true) }
  }

  return (
    <>
      <div className="head">
        <h1>{track.title}</h1>
        <p>Собеседует {track.interviewer}.</p>
      </div>

      <Stages track={track} run={run} />

      <div className="feed interview-feed" ref={feed} aria-label="Ход интервью">
        {run.transcript.map((l, i) => (
          <div key={i} className={l.speaker === 'candidate' ? 'line mine' : 'line'}>
            <span className="who">{l.speaker === 'candidate' ? 'Вы' : name}</span>
            <span className="what">{l.text}</span>
          </div>
        ))}
        {busy && (
          <div className="line">
            <span className="who">{name}</span>
            <span className="what sub">…</span>
          </div>
        )}
      </div>

      {/* Плашка деградации: молчаливая подмена источника учила бы, что модель работает. */}
      {notice && <p className="sub degraded">{notice}</p>}

      <textarea
        className="answer-box"
        aria-label={asking ? 'Ваш вопрос' : 'Ваш ответ'}
        value={draft}
        placeholder={asking ? 'Что вы хотите узнать о работе' : 'Ваш ответ. Ctrl+Enter — отправить'}
        onChange={e => setDraft(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); send() } }}
      />
      <div className="bar">
        <button className="act primary" type="button" disabled={busy || !draft.trim()} onClick={send}>
          {asking ? 'Спросить' : 'Ответить'}
        </button>
        {listenAvailable() && (
          <button className="act" type="button" aria-pressed={listening} onClick={toggleMic} title="Продиктовать">
            {listening ? 'Слушаю…' : 'Микрофон'}
          </button>
        )}
        {asking && (
          <button className="act" type="button" disabled={busy} onClick={() => finishInterview()}>
            Вопросов больше нет
          </button>
        )}
        {/* Безопасное действие — на месте нажатой кнопки и с фокусом. */}
        {!confirmAbandon ? (
          <button className="act" type="button" onClick={() => setConfirmAbandon(true)}>Прервать интервью</button>
        ) : (
          <>
            <button className="act" type="button" autoFocus onClick={() => setConfirmAbandon(false)}>Продолжить</button>
            <button className="act" type="button" onClick={abandon}>Прервать без записи</button>
          </>
        )}
      </div>
      {asking && run.asked.length === 0 && (
        <p className="sub">Задайте хотя бы один вопрос: интервьюер ценит вопросы кандидата.</p>
      )}
    </>
  )
}
