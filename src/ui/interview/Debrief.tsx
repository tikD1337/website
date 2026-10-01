import { useGame } from '../../store/useGame'
import { VERDICT_LABEL, type InterviewRecord, type Verdict } from '../../core/interview/types'
import type { TrackMeta } from '../../content/port'
import { formatDateTime } from '../dates'

/** Вердикт интервью — теми же классами суждения, что и вердикт тикета. */
export const VERDICT_TONE: Record<Verdict, 'full' | 'partial' | 'fail'> = { hire: 'full', maybe: 'partial', no: 'fail' }

const percent = (x: number) => `${Math.round(x * 100)} %`

/**
 * Разбор интервью: что прозвучало, чего не хватило, какого ответа ждали.
 * Названия пунктов и их разбор приходят в результате (срез 8А): трек с
 * пунктами живёт на сервере. Запись прошлого формата их не несёт —
 * пункт показывается своим id.
 */
export function Debrief({ record, track }: { record: InterviewRecord; track: TrackMeta | undefined }) {
  const open = useGame(s => s.openInterview)
  const start = useGame(s => s.startInterview)
  const r = record.result
  const itemOf = (qid: string) => r.items.find(x => x.id === qid)
  const pointOf = (qid: string, pid: string) => itemOf(qid)?.points?.find(p => p.id === pid)
  /** Пункты в порядке вопроса, а не «сначала прозвучавшие»: так разбор читается как чек-лист. */
  const pointOrder = (qid: string, ids: string[]) => {
    const order = itemOf(qid)?.points?.map(p => p.id) ?? []
    return [...ids].sort((a, b) => (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99))
  }
  const technical = r.items.filter(i => i.stage === 'technical')

  return (
    <>
      <div className="bar">
        <button className="act" type="button" onClick={() => open(null)}>К интервью</button>
      </div>
      <div className="head">
        <h1>Разбор интервью</h1>
        <p className="sub">{track?.title ?? record.track}, {formatDateTime(record.at)}</p>
        <p className={`verdict ${VERDICT_TONE[r.verdict]}`}><b>{VERDICT_LABEL[r.verdict]}</b></p>
      </div>

      <div className="section">
        <h2>По этапам</h2>
        <div className="row-score"><div>Знакомство</div><div className="mark">{percent(r.intro)}</div><div className="note" /></div>
        <div className="row-score">
          <div>Рабочие ситуации</div><div className="mark">{percent(r.technical)}</div>
          <div className="note">Среднее по {technical.length} вопросам; нужно 70 %, чтобы рекомендовать.</div>
        </div>
        <div className="row-score">
          <div>Ваш опыт</div><div className="mark">{percent(r.experience)}</div>
          <div className="note">Нужно 50 %.</div>
        </div>
        <div className="row-score">
          <div>Ваши вопросы</div><div className="mark">{r.questionsAsked}</div>
          <div className="note">{r.questionsAsked === 0 ? 'Вопросов не было — без них «рекомендован» не бывает.' : 'Интервьюер ценит вопросы кандидата.'}</div>
        </div>
      </div>

      {r.items.map((item, n) => (
        <div className="section" key={item.id}>
          <h2>Вопрос {n + 1}</h2>
          <p className="prose check-prompt">{item.prompt}</p>
          {item.answers.map((a, i) => (
            <p className="prose" key={i}><span className="sub">{i === 0 ? 'Ваш ответ: ' : 'На уточнение: '}</span>{a}</p>
          ))}
          {item.answers.length === 0 && <p className="sub">Ответа не было.</p>}
          <div className="points">
            {pointOrder(item.id, [...item.covered, ...item.missing]).map(pid => {
              const p = pointOf(item.id, pid)
              const heard = item.covered.includes(pid)
              return (
                <div className="row-score" key={pid}>
                  <div>{p?.label ?? pid}</div>
                  <div className={`mark ${heard ? 'high' : 'low'}`}>{heard ? 'прозвучало' : 'нет'}</div>
                  <div className="note">{heard ? '' : p?.why ?? ''}</div>
                </div>
              )
            })}
          </div>
          <p className="prose expected"><span className="sub">Какого ответа ждали: </span>{item.expected}</p>
        </div>
      ))}

      <div className="bar">
        <button className="act primary" type="button" onClick={() => void start(record.track)}>Пройти ещё раз</button>
      </div>
    </>
  )
}
