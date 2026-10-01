import { useEffect, useState } from 'react'
import { useGame } from '../../store/useGame'
import { courseState, quizPath } from '../../core/learning/state'
import type { QuizGrade } from '../../core/learning/answer'
import type { Answer } from '../../core/learning/types'
import type { CourseOutline } from '../../content/port'
import { AnswerInput, Rich, answerText, type OutlineSection } from './LessonView'

/**
 * Квиз секции: все вопросы разом, «Сдать», итог с разбором.
 *
 * Несданный квиз объясняет только неверные ответы и не называет
 * верных — иначе пересдача превратилась бы в переписывание с экрана.
 * Сданный показывает и верные ответы: теперь это конспект.
 */
export function QuizView({ course, section }: { course: CourseOutline; section: OutlineSection }) {
  const learning = useGame(s => s.progress.learning)
  const submitQuiz = useGame(s => s.submitQuiz)
  const open = useGame(s => s.openLearn)
  const loadQuiz = useGame(s => s.loadQuiz)
  const quiz = useGame(s => s.quizzes[`${course.id}/${section.id}`])
  const [busy, setBusy] = useState(false)

  const [answers, setAnswers] = useState<Record<string, Answer>>({})
  const [grade, setGrade] = useState<QuizGrade | null>(null)
  const [error, setError] = useState<string | null>(null)

  const state = courseState(course, learning)
  const status = state.sections.find(x => x.id === section.id)!.quiz
  const result = learning.quizzes.find(q => q.id === quizPath(course.id, section.id))
  const next = course.sections[course.sections.indexOf(section) + 1]
  const questions = quiz?.questions ?? []
  const answered = questions.length > 0 && questions.every(q => answers[q.id] !== undefined && answers[q.id] !== '')
  const need = Math.ceil(section.quizSize * 0.8)

  // Вопросы приходят с сервера при открытии, без ответов; закрытый квиз не грузится.
  useEffect(() => {
    if (status !== 'locked') void loadQuiz(course.id, section.id)
  }, [course.id, section.id, status, loadQuiz])

  const submit = async () => {
    setBusy(true)
    const r = await submitQuiz(course.id, section.id, answers)
    setBusy(false)
    if (r.ok) { setGrade(r.grade); setError(null) } else setError(r.error)
  }
  const retake = () => { setAnswers({}); setGrade(null) }

  return (
    <>
      <div className="bar">
        <button className="act" type="button" onClick={() => open({ course: course.id })}>К курсу</button>
      </div>
      <div className="head">
        <h1>Квиз: {section.title}</h1>
        <p>
          {section.quizSize} вопросов; чтобы сдать, нужно {need} верных.
          {result?.passedAt ? ' Квиз уже сдан — можно пройти ещё раз.' : ''}
        </p>
      </div>

      {status === 'locked' ? (
        <p className="prose">Квиз откроется, когда будут пройдены все уроки секции.</p>
      ) : !quiz ? (
        <p className="sub">Загрузка квиза…</p>
      ) : (
        <>
          <ol className="quiz">
            {questions.map(q => {
              const item = grade?.items.find(i => i.id === q.id)
              return (
                <li key={q.id} className="check">
                  <p className="prose check-prompt"><Rich text={q.prompt} /></p>
                  {grade ? (
                    <>
                      <p className="check-verdict">
                        {item?.correct ? <b className="ok">Верно.</b> : <b className="bad">Неверно.</b>}
                        {!item?.correct && <> Ваш ответ: <Rich text={answerText(q, answers[q.id])} />.</>}
                        {item?.right && <> Верный: <Rich text={item.right.text} />.</>}
                      </p>
                      {item?.why && <p className="prose check-why"><Rich text={item.why} /></p>}
                      {item?.right && <p className="prose check-why"><Rich text={item.right.why} /></p>}
                    </>
                  ) : (
                    <AnswerInput
                      check={q}
                      name={`quiz-${q.id}`}
                      value={answers[q.id]}
                      onChange={a => setAnswers({ ...answers, [q.id]: a })}
                    />
                  )}
                </li>
              )
            })}
          </ol>

          {grade && (
            <p className={`quiz-result ${grade.passed ? 'ok' : 'bad'}`}>
              {grade.score} из {grade.total} — {grade.passed ? 'сдан.' : `не сдан: нужно ${need}.`}
            </p>
          )}

          <div className="bar">
            {!grade && (
              <button className="act primary" type="button" disabled={!answered || busy} onClick={() => void submit()}>
                {busy ? 'Проверка…' : 'Сдать'}
              </button>
            )}
            {grade && !grade.passed && (
              <button className="act primary" type="button" onClick={retake}>Пересдать</button>
            )}
            {grade?.passed && next && (
              <button className="act primary" type="button"
                onClick={() => open({ course: course.id, section: next.id, lesson: next.lessons[0]!.id })}>
                Следующая секция
              </button>
            )}
          </div>
          {!grade && !answered && <p className="sub">Ответьте на все вопросы, чтобы сдать.</p>}
          {error && <p className="deny">{error}</p>}
        </>
      )}
    </>
  )
}
