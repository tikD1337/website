import { useGame } from '../store/useGame'
import type { Scorecard } from '../core/grading/grade'

const VERDICT: Record<Scorecard['verdict'], string> = {
  full: 'Зачтено полностью',
  partial: 'Зачтено частично',
  fail: 'Не зачтено',
}

function mark(score: number): string {
  return score >= 8 ? 'high' : score >= 4 ? 'mid' : 'low'
}

export function ScorecardView() {
  const card = useGame(s => s.scorecard)
  const scenario = useGame(s => s.scenario)
  const reset = useGame(s => s.reset)

  if (!card) {
    return (
      <div className="head">
        <h1>Разбор</h1>
        <p>Появится после закрытия инцидента.</p>
      </div>
    )
  }

  return (
    <>
      <div className="head">
        <h1>Разбор инцидента</h1>
        <p className={`verdict ${card.verdict}`}>
          <b>{VERDICT[card.verdict]}</b>
          <span>{card.points} очков</span>
        </p>
      </div>

      {card.silentFaults.length > 0 && (
        <div className="section">
          <h2>После вас осталась поломка</h2>
          {card.silentFaults.map((f, i) => (
            <p key={i} className="fault">{f}</p>
          ))}
        </div>
      )}

      <div className="section">
        <h2>Измерения</h2>
        {card.dimensions.map(d => (
          <div className="row-score" key={d.id}>
            <div>{d.label}</div>
            <div className={`mark ${mark(d.score)}`}>{d.score} / 10</div>
            <div className="note">{d.explain}</div>
          </div>
        ))}
      </div>

      <div className="section">
        <h2>Заметка, {card.note.score} из 10</h2>
        {card.note.parts.map(p => (
          <div className="row-score" key={p.id}>
            <div>{p.label}</div>
            <div className={`mark ${p.earned ? 'high' : 'low'}`}>
              {p.earned ? 'есть' : 'нет'}
            </div>
            <div className="note">{p.explain}</div>
          </div>
        ))}

        {card.note.penalties.map(p => (
          <div className="row-score" key={p.id}>
            <div>{p.label}</div>
            <div className="mark low">−{p.points}</div>
            <div />
          </div>
        ))}
      </div>

      <div className="section">
        <h2>Цели</h2>
        {card.objectives.map(o => (
          <div className="row-score" key={o.id}>
            <div>{o.title}</div>
            <div className={`mark ${o.met ? 'high' : 'low'}`}>
              {o.met ? 'закрыта' : 'нет'}
            </div>
            <div className="note">{o.why}</div>
          </div>
        ))}
      </div>

      <div className="section">
        <h2>Что это было на самом деле</h2>
        <p className="prose">{scenario.rootCause}</p>
      </div>

      <div className="bar">
        <button className="act primary" type="button" onClick={reset}>
          Пройти заново
        </button>
      </div>
    </>
  )
}
