import { describe, it, expect } from 'vitest'
import {
  courseState, emptyLearning, recordCheck, recordQuiz, mergeLearning, checkPath, quizPath,
} from './state'
import type { Check, Course, Learning } from './types'
import type { QuizGrade } from './answer'

const k = (id: string): Check => ({
  id, kind: 'choice', prompt: '?',
  options: [{ text: 'да', correct: true, why: 'так' }, { text: 'нет', why: 'не так' }],
})

/** Две секции по два урока; у первого урока две проверки. */
const course: Course = {
  id: 'c', title: 'Курс', summary: '',
  sections: [
    { id: 's1', title: 'Первая', quiz: [k('q1')], lessons: [
      { id: 'l1', title: 'Урок 1', body: [], checks: [k('a'), k('b')] },
      { id: 'l2', title: 'Урок 2', body: [], checks: [k('a')] },
    ] },
    { id: 's2', title: 'Вторая', quiz: [k('q1')], lessons: [
      { id: 'l1', title: 'Урок 1', body: [], checks: [k('a')] },
      { id: 'l2', title: 'Урок 2', body: [], checks: [k('a')] },
    ] },
  ],
}

const grade = (score: number, total = 5): QuizGrade =>
  ({ score, total, passed: score * 5 >= total * 4, items: [] })

/** Компактный вид статусов: `секция[уроки]квиз`. */
const view = (l: Learning) => courseState(course, l).sections
  .map(s => `${s.status}[${s.lessons.map(x => x.status).join(',')}]${s.quiz}`)

describe('статусы курса', () => {
  it('открытие идёт цепочкой: урок за уроком, квиз после уроков, секция после квиза', () => {
    let l = emptyLearning()
    expect(view(l)).toEqual(['open[open,locked]locked', 'locked[locked,locked]locked'])

    l = recordCheck(l, checkPath('c', 's1', 'l1', 'a'))
    expect(view(l), 'одна проверка из двух').toEqual(['open[open,locked]locked', 'locked[locked,locked]locked'])

    l = recordCheck(l, checkPath('c', 's1', 'l1', 'b'))
    expect(view(l), 'урок 1 пройден').toEqual(['open[done,open]locked', 'locked[locked,locked]locked'])

    l = recordCheck(l, checkPath('c', 's1', 'l2', 'a'))
    expect(view(l), 'уроки секции пройдены').toEqual(['open[done,done]open', 'locked[locked,locked]locked'])

    l = recordQuiz(l, quizPath('c', 's1'), grade(5), '2026-09-30T10:00:00.000Z')
    expect(view(l), 'квиз сдан').toEqual(['open[done,done]passed', 'open[open,locked]locked'])
    expect(courseState(course, l)).toMatchObject({
      done: false, doneAt: null, lessonsDone: 2, lessonsTotal: 4, quizzesPassed: 1, quizzesTotal: 2,
    })

    l = recordCheck(l, checkPath('c', 's2', 'l1', 'a'))
    l = recordCheck(l, checkPath('c', 's2', 'l2', 'a'))
    l = recordQuiz(l, quizPath('c', 's2'), grade(4), '2026-09-30T11:00:00.000Z')
    expect(courseState(course, l)).toMatchObject({
      done: true, doneAt: '2026-09-30T11:00:00.000Z', lessonsDone: 4, quizzesPassed: 2,
    })
  })

  it('несданная попытка пишется, секцию не открывает', () => {
    let l = emptyLearning()
    for (const [lesson, check] of [['l1', 'a'], ['l1', 'b'], ['l2', 'a']] as const) {
      l = recordCheck(l, checkPath('c', 's1', lesson, check))
    }
    l = recordQuiz(l, 'c/s1', grade(3), '2026-09-30T10:00:00.000Z')
    expect(l.quizzes).toEqual([{ id: 'c/s1', attempts: 1, best: 3, total: 5, passedAt: null }])
    expect(view(l)[1]).toBe('locked[locked,locked]locked')

    l = recordQuiz(l, 'c/s1', grade(5), '2026-09-30T10:05:00.000Z')
    l = recordQuiz(l, 'c/s1', grade(4), '2026-09-30T10:09:00.000Z')
    expect(l.quizzes).toEqual([{ id: 'c/s1', attempts: 3, best: 5, total: 5, passedAt: '2026-09-30T10:05:00.000Z' }])
  })

  it('прогресс прошлой редакции курса: лишнее игнорируется, новая проверка переоткрывает урок', () => {
    // В прошлой редакции у урока l2 была проверка `old`, и урок был пройден.
    const l: Learning = {
      checks: ['c/s1/l1/a', 'c/s1/l1/b', 'c/s1/l2/old', 'c/s9/l1/a'],
      quizzes: [{ id: 'c/s9', attempts: 1, best: 5, total: 5, passedAt: '2026-09-01T00:00:00.000Z' }],
    }
    expect(view(l)).toEqual(['open[done,open]locked', 'locked[locked,locked]locked'])
    expect(courseState(course, l)).toMatchObject({ lessonsDone: 1, quizzesPassed: 0 })
  })

  it('повторный верный ответ не дублируется; слияние — объединение и лучшее из попыток', () => {
    const once = recordCheck(emptyLearning(), 'c/s1/l1/a')
    expect(recordCheck(once, 'c/s1/l1/a').checks).toEqual(['c/s1/l1/a'])

    const loaded: Learning = {
      checks: ['c/s1/l1/a', 'c/s1/l1/b'],
      quizzes: [{ id: 'c/s1', attempts: 2, best: 3, total: 5, passedAt: null }],
    }
    const inMemory: Learning = {
      checks: ['c/s1/l1/b', 'c/s1/l2/a'],
      quizzes: [
        { id: 'c/s1', attempts: 1, best: 5, total: 5, passedAt: '2026-09-30T12:00:00.000Z' },
        { id: 'c/s2', attempts: 1, best: 2, total: 5, passedAt: null },
      ],
    }
    const before = structuredClone({ loaded, inMemory })
    expect(mergeLearning(loaded, inMemory)).toEqual({
      checks: ['c/s1/l1/a', 'c/s1/l1/b', 'c/s1/l2/a'],
      quizzes: [
        { id: 'c/s1', attempts: 3, best: 5, total: 5, passedAt: '2026-09-30T12:00:00.000Z' },
        { id: 'c/s2', attempts: 1, best: 2, total: 5, passedAt: null },
      ],
    })
    expect({ loaded, inMemory }, 'вход не изменён').toEqual(before)

    const both = mergeLearning(
      { checks: [], quizzes: [{ id: 'q', attempts: 1, best: 5, total: 5, passedAt: '2026-09-02T00:00:00.000Z' }] },
      { checks: [], quizzes: [{ id: 'q', attempts: 1, best: 4, total: 5, passedAt: '2026-09-01T00:00:00.000Z' }] },
    )
    expect(both.quizzes[0]!.passedAt, 'дата сдачи — более ранняя').toBe('2026-09-01T00:00:00.000Z')
  })
})
