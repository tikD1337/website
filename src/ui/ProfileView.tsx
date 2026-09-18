import { useGame } from '../store/useGame'
import { profileFor } from '../core/progress/profile'
import { countersOf, pointsInWeek } from '../core/progress/counters'
import { rankFor, weekKey } from '../core/progress/points'
import { verdictSpread, bestByScenario, shiftPoints } from '../core/progress/compare'
import { VERDICT } from './verdict'
import { withPlural } from './plural'

/**
 * Профиль и сравнение с собой.
 *
 * Лидерборда нет: играет один человек, сравнивать его не с кем.
 * Вместо чужих мест в таблице — он сам месяц назад, и для тренировки
 * это полезнее: видно, стало лучше или хуже и на каком сценарии.
 */
export function ProfileView() {
  const records = useGame(s => s.progress.records)
  const loaded = useGame(s => s.progressLoaded)
  const shiftId = useGame(s => s.shiftId)
  const now = useGame(s => s.now)

  if (!loaded) {
    return (
      <div className="head">
        <h1>Профиль</h1>
        <p>Загружается…</p>
      </div>
    )
  }

  const profile = profileFor(records)
  const counters = countersOf(records)
  const rank = rankFor(counters.totalPoints)
  const spread = verdictSpread(records)
  const scenarios = bestByScenario(records)
  const thisShift = shiftPoints(records, shiftId)
  const thisWeek = pointsInWeek(records, weekKey(now))

  if (records.length === 0) {
    return (
      <>
        <div className="head">
          <h1>Профиль</h1>
          <p>
            Средний балл по шести измерениям, счётчики и сравнение с собой
            прошлым. Появятся, как только будет что сравнивать.
          </p>
        </div>

        <div className="section">
          <h2>Ранг</h2>
          <p>
            <b>{rank.current.title}</b> — пока ни одного очка.
            {rank.next && ` До ранга «${rank.next.title}» — ${rank.toNext}.`}
          </p>
        </div>

        <div className="section">
          <h2>Пока пусто</h2>
          <p>
            Закройте инцидент — здесь появится средний балл по каждому
            измерению, отметка того, что проседает, и сравнение нынешних
            прохождений с прежними.
          </p>
        </div>
      </>
    )
  }

  return (
    <>
      <div className="head">
        <h1>Профиль</h1>
        <p>
          Средний балл по шести измерениям за последние{' '}
          {withPlural(profile.sample, 'прохождение', 'прохождения', 'прохождений')}
          {' '}— и что из этого проседает. Это и есть ответ на вопрос, что качать.
        </p>
      </div>

      <div className="section">
        <h2>Ранг</h2>
        <p className="rank">
          <b>{rank.current.title}</b>
          <span>{withPlural(counters.totalPoints, 'очко', 'очка', 'очков')} всего</span>
        </p>
        {rank.next && (
          <p className="sub">
            До ранга «{rank.next.title}» — {rank.toNext}.
          </p>
        )}
        {!rank.next && (
          <p className="sub">Выше этого ранга лестница не идёт.</p>
        )}
      </div>

      <div className="section">
        <h2>Счёт</h2>
        <div className="row-score">
          <div>За эту смену</div>
          <div className="mark">{thisShift}</div>
          <div className="note">
            Смена начинается заново при перезагрузке — прогресс при этом цел.
          </div>
        </div>
        <div className="row-score">
          <div>За неделю</div>
          <div className="mark">{thisWeek}</div>
          <div className="note">Накопленное и недельное — разные числа.</div>
        </div>
        <div className="row-score">
          <div>Всего</div>
          <div className="mark">{counters.totalPoints}</div>
          <div className="note">За все прохождения, что помнит тренажёр.</div>
        </div>
      </div>

      <div className="section">
        <h2>Измерения</h2>
        {profile.dimensions.map(d => (
          <div className="row-score" key={d.id}>
            <div>{d.label}</div>
            <div className={`mark ${d.average >= 8 ? 'high' : d.average >= 4 ? 'mid' : 'low'}`}>
              {d.average.toFixed(1)}
            </div>
            <div className="note">
              {profile.weakest?.id === d.id
                ? 'Проседает сильнее прочего — с этого и начинать.'
                : ''}
            </div>
          </div>
        ))}
      </div>

      <div className="section">
        <h2>Счётчики</h2>
        <div className="row-score">
          <div>Закрыто прохождений</div>
          <div className="mark">{counters.closed}</div>
          <div className="note">
            {VERDICT.full.toLowerCase()} — {spread.full},{' '}
            {VERDICT.partial.toLowerCase()} — {spread.partial},{' '}
            {VERDICT.fail.toLowerCase()} — {spread.fail}.
          </div>
        </div>
        <div className="row-score">
          <div>Серия без единой ошибки</div>
          <div className="mark">{counters.streak}</div>
          <div className="note">Лучшая за всё время — {counters.bestStreak}.</div>
        </div>
        <div className="row-score">
          <div>Тихих поломок</div>
          <div className={`mark ${counters.silentFaults > 0 ? 'low' : 'high'}`}>
            {counters.silentFaults}
          </div>
          <div className="note">
            {counters.silentFaults === 0
              ? 'Ни разу не оставили после себя сломанного.'
              : `В ${withPlural(counters.ticketsWithFaults,
                  'прохождении', 'прохождениях', 'прохождениях')} `
                + `из ${counters.closed} после вас оставалось сломанное `
                + '— и вы об этом не знали.'}
          </div>
        </div>
      </div>

      {/*
        Сравнение с собой. Лучшее против последнего — обе величины
        сразу: один «лучший» скрыл бы просадку.
      */}
      <div className="section">
        <h2>Сравнение с собой</h2>
        <table>
          <thead>
            <tr>
              <th>Сценарий</th>
              <th>Проходов</th>
              <th>Лучшее</th>
              <th>Последнее</th>
              <th>Разница</th>
            </tr>
          </thead>
          <tbody>
            {scenarios.map(s => (
              <tr key={s.scenarioId} className={s.delta < 0 ? 'weak' : undefined}>
                <td>
                  {s.summary}
                  <div className="sub">{VERDICT[s.lastVerdict]} в последний раз</div>
                </td>
                <td className="data">{s.attempts}</td>
                <td className="data">{s.best}</td>
                <td className="data">{s.last}</td>
                <td className={`data ${s.delta < 0 ? 'drop' : ''}`}>
                  {s.delta === 0
                    ? (s.attempts === 1 ? '—' : 'лучшее')
                    : `−${Math.abs(s.delta)}`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="sub">
          Разница — последнее прохождение минус лучшее. «Лучшее» значит,
          что последний раз и был лучшим; отрицательное число — просели.
        </p>
      </div>
    </>
  )
}
