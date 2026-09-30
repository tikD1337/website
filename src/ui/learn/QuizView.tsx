import { useState } from 'react'
import { useGame } from '../../store/useGame'
import { courseState, quizPath } from '../../core/learning/state'
import type { QuizGrade } from '../../core/learning/answer'
import type { Answer, Course, Section } from '../../core/learning/types'
import { AnswerInput, Rich, answerText, rightAnswer } from './LessonView'

/**
 * Квиз секции: все вопросы разом, «Сдать», итог с разбором.
 *
 * Несданный квиз объясняет только неверные ответы и не называет
 * верных — иначе пересдача превратилась бы в переписывание с экрана.
 * Сданный показывает и верные ответы: теперь это конспект.
 */
export function QuizView({ course, section }: { course: Course; section: Section }) {
  const learning = useGame(s => s.progress.learning)
  const submitQuiz = useGame(s => s.submitQuiz)
  const open = useGame(s => s.openLearn)

  const [answers, setAnswers] = useState<Record<string, Answer>>({})
  const [grade, setGrade] = useState<QuizGrade | null>(null)
  const [error, setError] = useState<string | null>(null)

  const state = courseState(course, learning)
  const status = state.sections.find(x => x.id === section.id)!.quiz
  const result = learning.quizzes.find(q => q.id === quizPath(course.id, section.id))
  const next = course.sections[course.sections.indexOf(section) + 1]
  const answered = section.quiz.every(q => answers[q.id] !== undefined && answers[q.id] !== '')
  const need = Math.ceil(section.quiz.length * 0.8)

  const submit = () => {
    const r = submitQuiz(course.id, section.id, answers)
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
          {section.quiz.length} вопросов; чтобы сдать, нужно {need} верных.
          {result?.passedAt ? ' Квиз уже сдан — можно пройти ещё раз.' : ''}
        </p>
      </div>

      {status === 'locked' ? (
        <p className="prose">Квиз откроется, когда будут пройдены все уроки секции.</p>
      ) : (
        <>
          <ol className="quiz">
            {section.quiz.map(q => {
              const item = grade?.items.find(i => i.id === q.id)
              return (
                <li key={q.id} className="check">
                  <p className="prose check-prompt"><Rich text={q.prompt} /></p>
                  {grade ? (
                    <>
                      <p className="check-verdict">
                        {item?.correct ? <b className="ok">Верно.</b> : <b className="bad">Неверно.</b>}
                        {!item?.correct && <> Ваш ответ: <Rich text={answerText(q, answers[q.id])} />.</>}
                        {grade.passed && !item?.correct && <> Верный: <Rich text={rightAnswer(q).text} />.</>}
                      </p>
                      {item?.why && <p className="prose check-why"><Rich text={item.why} /></p>}
                      {grade.passed && !item?.correct && <p className="prose check-why"><Rich text={rightAnswer(q).why} /></p>}
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
              <button className="act primary" type="button" disabled={!answered} onClick={submit}>Сдать</button>
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
