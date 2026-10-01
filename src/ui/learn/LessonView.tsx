import { useState } from 'react'
import { useGame, type PracticeResult } from '../../store/useGame'
import { checkPath, courseState } from '../../core/learning/state'
import { rightAnswer } from '../../core/learning/answer'
import type { Answer, Block, Check, Course, Lesson, Section } from '../../core/learning/types'
import { VERDICT } from '../verdict'
import { formatDateTime } from '../dates'

/** Абзац курса: `код` в обратных кавычках — моноширинно. */
export function Rich({ text }: { text: string }) {
  const parts = text.split('`')
  return <>{parts.map((part, i) => (i % 2 === 1 ? <code key={i}>{part}</code> : part))}</>
}

function Blocks({ blocks }: { blocks: Block[] }) {
  return (
    <div className="lesson-body">
      {blocks.map((b, i) => {
        if (b.kind === 'code') return <pre key={i} className="lesson-code">{b.text}</pre>
        if (b.kind === 'list') {
          return <ul key={i} className="prose">{b.items.map((item, j) => <li key={j}><Rich text={item} /></li>)}</ul>
        }
        return <p key={i} className="prose"><Rich text={b.text} /></p>
      })}
    </div>
  )
}

/** Поле ответа: варианты — радиокнопками, текст — строкой ввода. */
export function AnswerInput({ check, name, value, onChange, onSubmit }: {
  check: Check
  name: string
  value: Answer | undefined
  onChange: (a: Answer) => void
  onSubmit?: () => void
}) {
  if (check.kind === 'choice') {
    return (
      <div className="options" role="radiogroup" aria-label={check.prompt}>
        {check.options.map((o, i) => (
          <label key={i} className="option">
            <input type="radio" name={name} checked={value === i} onChange={() => onChange(i)} />
            <span><Rich text={o.text} /></span>
          </label>
        ))}
      </div>
    )
  }
  return (
    <input
      type="text"
      className="answer-text"
      aria-label={check.prompt}
      spellCheck={false}
      autoComplete="off"
      value={typeof value === 'string' ? value : ''}
      onChange={e => onChange(e.target.value)}
      onKeyDown={e => { if (e.key === 'Enter' && onSubmit) onSubmit() }}
    />
  )
}

/** Данный ответ словами — чтобы разбор неверного было с чем сопоставить. */
export function answerText(check: Check, a: Answer | undefined): string {
  if (a === undefined || a === '') return 'нет ответа'
  if (check.kind === 'choice') return typeof a === 'number' ? check.options[a]?.text ?? 'нет ответа' : 'нет ответа'
  return String(a)
}


function CheckItem({ check, path, done, onAnswer }: {
  check: Check
  path: string
  done: boolean
  onAnswer: (a: Answer) => { correct: boolean; why: string | null } | null
}) {
  const [answer, setAnswer] = useState<Answer | undefined>(undefined)
  const [result, setResult] = useState<{ correct: boolean; why: string | null } | null>(null)

  const submit = () => {
    if (answer === undefined || answer === '') return
    setResult(onAnswer(answer))
  }

  /*
    Пройденная проверка показывает верный ответ и больше не спрашивает:
    урок остаётся конспектом. Найдено на снимке: после «Верно» варианты
    и «Проверить» оставались активными, будто вопрос ещё открыт.
  */
  if (done && (!result || result.correct)) {
    const right = rightAnswer(check)
    return (
      <div className="check">
        <p className="prose check-prompt"><Rich text={check.prompt} /></p>
        <p className="check-verdict">
          <b className="ok">{result ? 'Верно:' : 'Отвечено верно:'}</b> <Rich text={right.text} />
        </p>
        <p className="prose check-why"><Rich text={right.why} /></p>
      </div>
    )
  }

  return (
    <div className="check">
      <p className="prose check-prompt"><Rich text={check.prompt} /></p>
      <AnswerInput
        check={check}
        name={path}
        value={answer}
        onChange={a => { setAnswer(a); setResult(null) }}
        onSubmit={submit}
      />
      <div className="bar">
        <button className="act" type="button" disabled={answer === undefined || answer === ''} onClick={submit}>
          Проверить
        </button>
      </div>
      {result && (
        <>
          <p className="check-verdict">
            {result.correct ? <b className="ok">Верно.</b> : <b className="bad">Неверно.</b>}
            {!result.correct && !result.why && ' Не тот ответ — попробуйте ещё раз.'}
          </p>
          {result.why && <p className="prose check-why"><Rich text={result.why} /></p>}
        </>
      )}
    </div>
  )
}

/** Урок открывает свой тикет по правилам очереди; новая смена — только с подтверждением. */
function Practice({ scenarioId }: { scenarioId: string }) {
  const scenario = useGame(s => s.catalog?.scenarios.find(x => x.id === scenarioId))
  const records = useGame(s => s.progress.records)
  const practice = useGame(s => s.practice)
  const [result, setResult] = useState<PracticeResult | null>(null)

  if (!scenario) return null
  const last = records.filter(r => r.scenarioId === scenarioId).at(-1)

  return (
    <div className="section">
      <h2>Практика</h2>
      <p className="prose">Тикет: «{scenario.summary}».</p>
      <p className="sub practice-last">
        {last
          ? <>Последний раз: <span className={`verdict-word ${last.card.verdict}`}>{VERDICT[last.card.verdict]}</span>, {formatDateTime(last.at)}.</>
          : 'Этот тикет вы ещё не проходили.'}
      </p>

      {result?.status === 'needs-new-shift' ? (
        <>
          <p className="prose">
            В этой смене такого тикета нет. Новая смена начнётся с него
            {result.lost.length > 0
              ? <>; отложенные тикеты {result.lost.join(', ')} («Ждём поставку») не вернутся.</>
              : '.'}
          </p>
          {/* Безопасное действие — на месте нажатой кнопки и с фокусом: двойной клик по инерции не начнёт смену. */}
          <div className="bar">
            <button className="act" type="button" autoFocus onClick={() => setResult(null)}>Отмена</button>
            <button className="act primary" type="button" onClick={async () => setResult(await practice(scenarioId, true))}>
              Начать новую смену
            </button>
          </div>
        </>
      ) : (
        <div className="bar">
          <button className="act primary" type="button" onClick={async () => setResult(await practice(scenarioId))}>
            Взять тикет
          </button>
        </div>
      )}
      {result?.status === 'blocked' && <p className="deny">{result.error}</p>}
    </div>
  )
}

export function LessonView({ course, section, lesson }: { course: Course; section: Section; lesson: Lesson }) {
  const learning = useGame(s => s.progress.learning)
  const answerCheck = useGame(s => s.answerCheck)
  const open = useGame(s => s.openLearn)

  const state = courseState(course, learning)
  const sectionState = state.sections.find(x => x.id === section.id)!
  const index = section.lessons.indexOf(lesson)
  const status = sectionState.lessons[index]!.status
  const next = section.lessons[index + 1]

  return (
    <>
      <div className="bar">
        <button className="act" type="button" onClick={() => open({ course: course.id })}>К курсу</button>
      </div>
      <div className="head">
        <h1>{lesson.title}</h1>
        <p>{course.title} › {section.title}, урок {index + 1} из {section.lessons.length}.</p>
      </div>

      {status === 'locked' ? (
        <p className="prose">Урок откроется, когда будет пройден предыдущий.</p>
      ) : (
        <>
          <Blocks blocks={lesson.body} />

          <div className="section">
            <h2>Проверки</h2>
            {lesson.checks.map(c => {
              const path = checkPath(course.id, section.id, lesson.id, c.id)
              return (
                <CheckItem
                  key={path}
                  check={c}
                  path={path}
                  done={learning.checks.includes(path)}
                  onAnswer={a => {
                    const r = answerCheck(course.id, section.id, lesson.id, c.id, a)
                    return r.ok ? { correct: r.correct, why: r.why } : { correct: false, why: r.error }
                  }}
                />
              )
            })}
          </div>

          {lesson.practice && <Practice scenarioId={lesson.practice} />}

          {status === 'done' && (
            <div className="bar">
              {next
                ? <button className="act primary" type="button" onClick={() => open({ course: course.id, section: section.id, lesson: next.id })}>Следующий урок</button>
                : <button className="act primary" type="button" onClick={() => open({ course: course.id, section: section.id, quiz: true })}>К квизу секции</button>}
            </div>
          )}
        </>
      )}
    </>
  )
}

