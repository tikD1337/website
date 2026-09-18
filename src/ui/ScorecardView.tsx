import { useGame } from '../store/useGame'
import { withPlural } from './plural'
import { scenarioFor } from '../scenarios'
import { VERDICT, mark } from './verdict'
import { formatDateTime } from './dates'
import type { Scorecard } from '../core/grading/grade'

/**
 * Тело разбора: всё, что рисуется из `Scorecard`, независимо от того,
 * чей это разбор — свежий или из истории.
 *
 * Одно и то же описание экрана не должно существовать в двух местах:
 * запись истории несёт `Scorecard` целиком, и рендерится он здесь же.
 */
function CardBody({ card }: { card: Scorecard }) {
  return (
    <>
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
    </>
  )
}

export function ScorecardView() {
  const card = useGame(s => s.scorecard)
  const scoredId = useGame(s => s.scoredScenarioId)
  const viewing = useGame(s => s.viewing)
  const closeViewing = useGame(s => s.closeViewing)
  const setTool = useGame(s => s.setTool)
  const reset = useGame(s => s.reset)

  // Разбор из истории подменяет свежий: это то же самое прохождение,
  // открытое задним числом, а не второй экран.
  const shown = viewing ? viewing.card : card
  const scenarioId = viewing ? viewing.scenarioId : scoredId

  if (!shown) {
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
        <h1>{viewing ? `Разбор прохождения ${viewing.number}` : 'Разбор инцидента'}</h1>
        {viewing && (
          <p className="sub">
            {formatDateTime(viewing.at)} · {viewing.requester} · {viewing.device}
          </p>
        )}
        <p className={`verdict ${shown.verdict}`}>
          <b>{VERDICT[shown.verdict]}</b>
          <span>{withPlural(shown.points, 'очко', 'очка', 'очков')}</span>
        </p>
      </div>

      <CardBody card={shown} />

      {viewing && (
        <div className="section">
          <h2>Заметка к тикету</h2>
          <p className="prose">{viewing.resolutionNotes || '—'}</p>
        </div>
      )}

      <div className="section">
        <h2>Что это было на самом деле</h2>
        <p className="prose">{scenarioId ? scenarioFor(scenarioId).rootCause : ''}</p>
      </div>

      <div className="bar">
        {viewing ? (
          <button
            className="act"
            type="button"
            onClick={() => { closeViewing(); setTool('history') }}
          >
            Назад к истории
          </button>
        ) : (
          <button className="act primary" type="button" onClick={reset}>
            Пройти заново
          </button>
        )}
      </div>
    </>
  )
}
