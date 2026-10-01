import { useGame } from '../store/useGame'
import { courseState, quizPath, type CourseState } from '../core/learning/state'
import type { Course } from '../core/learning/types'
import { LessonView } from './learn/LessonView'
import { QuizView } from './learn/QuizView'

/**
 * Курсы: список → курс → урок или квиз.
 *
 * Где остановился ученик, помнит стор (`learnAt`), а не компонент:
 * урок ведёт на тикет, и вернувшийся из тикета попадает обратно в
 * тот же урок. Закрытое показано словом, а не спрятано: граница
 * обозначается, а не прячется.
 */
export function CoursesView() {
  const courses = useGame(s => s.courses)
  const at = useGame(s => s.learnAt)

  const course = at ? courses.find(c => c.id === at.course) : undefined
  const section = course && at?.section ? course.sections.find(x => x.id === at.section) : undefined
  const lesson = section && at?.lesson ? section.lessons.find(x => x.id === at.lesson) : undefined

  if (course && section && lesson) return <LessonView key={`${section.id}/${lesson.id}`} course={course} section={section} lesson={lesson} />
  if (course && section && at?.quiz) return <QuizView key={section.id} course={course} section={section} />
  if (course) return <CourseOverview course={course} />
  return <CourseList />
}

const progressLine = (st: CourseState) => `уроков ${st.lessonsDone} из ${st.lessonsTotal}, квизов ${st.quizzesPassed} из ${st.quizzesTotal}`

function CourseList() {
  const courses = useGame(s => s.courses)
  const learning = useGame(s => s.progress.learning)
  const open = useGame(s => s.openLearn)

  return (
    <>
      <div className="head">
        <h1>Курсы</h1>
        <p>
          Уроки с проверками и тикетами для практики. Следующий урок открывается пройденным
          предыдущим, следующая секция — сданным квизом.
        </p>
      </div>
      <table className="courses">
        <thead><tr><th>Курс</th><th>Прогресс</th><th>Статус</th></tr></thead>
        <tbody>
          {courses.map(c => {
            const st = courseState(c, learning)
            return (
              <tr key={c.id} className="row" onClick={() => open({ course: c.id })}>
                <td>{c.title}<div className="sub">{c.summary}</div></td>
                <td>{progressLine(st)}</td>
                <td>{st.done ? <span className="ok">пройден</span> : st.lessonsDone > 0 ? 'начат' : 'не начат'}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </>
  )
}

function CourseOverview({ course }: { course: Course }) {
  const learning = useGame(s => s.progress.learning)
  const open = useGame(s => s.openLearn)
  const st = courseState(course, learning)

  return (
    <>
      <div className="bar">
        <button className="act" type="button" onClick={() => open(null)}>Все курсы</button>
      </div>
      <div className="head">
        <h1>{course.title}</h1>
        <p>{course.summary}</p>
        <p className="sub">{st.done ? 'Курс пройден.' : `Пройдено: ${progressLine(st)}.`}</p>
      </div>

      {course.sections.map((section, si) => {
        const s = st.sections[si]!
        const prev = course.sections[si - 1]
        const quiz = learning.quizzes.find(q => q.id === quizPath(course.id, section.id))
        return (
          <div className="section" key={section.id}>
            <h2>Секция {si + 1}. {section.title}</h2>
            {s.status === 'locked' && prev && (
              <p className="sub" style={{ marginBottom: 8 }}>Закрыта — сдайте квиз секции «{prev.title}».</p>
            )}
            <table className="lessons">
              <tbody>
                {section.lessons.map((lesson, li) => {
                  const status = s.lessons[li]!.status
                  const clickable = status !== 'locked'
                  return (
                    <tr
                      key={lesson.id}
                      className={clickable ? 'row' : 'locked'}
                      onClick={clickable ? () => open({ course: course.id, section: section.id, lesson: lesson.id }) : undefined}
                    >
                      <td className="num">{li + 1}</td>
                      <td>{lesson.title}</td>
                      <td className="state">
                        {status === 'done' ? <span className="ok">пройден</span> : status === 'open' ? 'открыт' : 'закрыт'}
                      </td>
                    </tr>
                  )
                })}
                <tr
                  className={s.quiz !== 'locked' ? 'row' : 'locked'}
                  onClick={s.quiz !== 'locked' ? () => open({ course: course.id, section: section.id, quiz: true }) : undefined}
                >
                  <td className="num" />
                  <td>Квиз секции</td>
                  <td className="state">
                    {s.quiz === 'passed'
                      ? <span className="ok">сдан, {quiz!.best} из {quiz!.total}</span>
                      : s.quiz === 'locked'
                        ? 'закрыт'
                        : quiz
                          ? <span className="bad">не сдан, лучший {quiz.best} из {quiz.total}</span>
                          : 'открыт'}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )
      })}
    </>
  )
}
