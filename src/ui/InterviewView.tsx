import { useGame } from '../store/useGame'
import { VERDICT_LABEL } from '../core/interview/types'
import { Room } from './interview/Room'
import { Debrief, VERDICT_TONE } from './interview/Debrief'
import { formatDateTime } from './dates'

/**
 * Интервью: начало и история попыток → комната → разбор.
 *
 * От очереди и мира интервью не зависит: собеседование — не смена.
 * Незаконченное не сохраняется, как незакрытый тикет, — поэтому и
 * прервать его можно только с подтверждением.
 */
export function InterviewView() {
  const tracks = useGame(s => s.tracks)
  const run = useGame(s => s.interview)
  const openId = useGame(s => s.interviewOpen)
  const records = useGame(s => s.progress.interviews)
  const start = useGame(s => s.startInterview)
  const open = useGame(s => s.openInterview)

  if (run) {
    const track = tracks.find(t => t.id === run.track)
    if (track) return <Room track={track} run={run} />
  }
  const opened = records.find(r => r.id === openId)
  if (opened) return <Debrief record={opened} track={tracks.find(t => t.id === opened.track)} />

  const percent = (x: number) => `${Math.round(x * 100)} %`

  return (
    <>
      <div className="head">
        <h1>Интервью</h1>
        <p>
          Собеседование на первую линию: объяснить вслух то, что вы делаете на тикетах. Оценка — по
          пунктам, которые должны прозвучать в ответе; разбор покажет пропущенное и образцовый ответ.
        </p>
      </div>

      {tracks.map(t => (
        <div className="section" key={t.id}>
          <h2>{t.title}</h2>
          <p className="prose">{t.summary}</p>
          <ol className="stages static">
            <li>Знакомство</li>
            <li>Рабочие ситуации, {t.perInterview}</li>
            <li>Ваш опыт — про тикет, который вы закрывали</li>
            <li>Ваши вопросы</li>
            <li>Вердикт и разбор</li>
          </ol>
          <div className="bar">
            <button className="act primary" type="button" onClick={() => start(t.id)}>Начать интервью</button>
          </div>
        </div>
      ))}

      <div className="section">
        <h2>Прошлые попытки</h2>
        {records.length === 0 ? (
          <p className="sub">Попыток пока нет.</p>
        ) : (
          <table className="interviews">
            <thead><tr><th>Когда</th><th>Вердикт</th><th>Ситуации</th><th>Опыт</th><th>Вопросов</th></tr></thead>
            <tbody>
              {[...records].reverse().map(r => (
                <tr key={r.id} className="row" onClick={() => open(r.id)}>
                  <td className="data">{formatDateTime(r.at)}</td>
                  <td><span className={`verdict-word ${VERDICT_TONE[r.result.verdict]}`}>{VERDICT_LABEL[r.result.verdict]}</span></td>
                  <td className="data">{percent(r.result.technical)}</td>
                  <td className="data">{percent(r.result.experience)}</td>
                  <td className="data">{r.result.questionsAsked}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  )
}
