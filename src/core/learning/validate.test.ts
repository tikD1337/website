import { describe, it, expect } from 'vitest'
import { validateCourses } from './validate'
import type { Course } from './types'

const good = (): Course => ({
  id: 'c', title: 'Курс', summary: '',
  sections: [{
    id: 's', title: 'Секция',
    lessons: [{
      id: 'l', title: 'Урок', body: [{ kind: 'p', text: 'текст' }], practice: 'net-apipa-no-lease',
      checks: [
        { id: 'a', kind: 'choice', prompt: '?', options: [
          { text: 'да', correct: true, why: 'так' },
          { text: 'нет', why: 'не так' },
        ] },
        { id: 'b', kind: 'text', prompt: '?', accept: ['ipconfig /release'], why: 'так' },
      ],
    }],
    quiz: [{ id: 'q', kind: 'text', prompt: '?', accept: ['да'], why: 'так' }],
  }],
})

const scenarios = ['net-apipa-no-lease']

describe('загрузчик курсов', () => {
  it('исправный курс проходит', () => {
    expect(() => validateCourses([good()], scenarios)).not.toThrow()
  })

  it('испорченный курс падает с адресом и причиной', () => {
    const cases: Array<[string, (c: Course) => unknown, string]> = [
      ['два курса с одним id', c => c, 'курс c: повторяется id'],
      ['две секции с одним id', c => c.sections.push(structuredClone(c.sections[0]!)), 'курс c/s: повторяется id'],
      ['два урока с одним id', c => c.sections[0]!.lessons.push(structuredClone(c.sections[0]!.lessons[0]!)), 'курс c/s/l: повторяется id'],
      ['две проверки с одним id', c => c.sections[0]!.lessons[0]!.checks.push(structuredClone(c.sections[0]!.lessons[0]!.checks[0]!)), 'курс c/s/l/a: повторяется id'],
      ['нет верного варианта', c => { const k = c.sections[0]!.lessons[0]!.checks[0]!; if (k.kind === 'choice') delete k.options[0]!.correct }, 'курс c/s/l/a: нет верного варианта'],
      ['два верных', c => { const k = c.sections[0]!.lessons[0]!.checks[0]!; if (k.kind === 'choice') k.options[1]!.correct = true }, 'курс c/s/l/a: верных вариантов больше одного'],
      ['один вариант', c => { const k = c.sections[0]!.lessons[0]!.checks[0]!; if (k.kind === 'choice') k.options.pop() }, 'курс c/s/l/a: меньше двух вариантов'],
      ['вариант без разбора', c => { const k = c.sections[0]!.lessons[0]!.checks[0]!; if (k.kind === 'choice') k.options[1]!.why = '  ' }, 'курс c/s/l/a: у варианта нет разбора'],
      ['текст без ответов', c => { const k = c.sections[0]!.lessons[0]!.checks[1]!; if (k.kind === 'text') k.accept = [] }, 'курс c/s/l/b: нет допустимых ответов'],
      ['урок без проверок', c => { c.sections[0]!.lessons[0]!.checks = [] }, 'курс c/s/l: у урока нет проверок'],
      ['секция без уроков', c => { c.sections[0]!.lessons = [] }, 'курс c/s: у секции нет уроков'],
      ['квиз без вопросов', c => { c.sections[0]!.quiz = [] }, 'курс c/s: у квиза нет вопросов'],
      ['практика мимо библиотеки', c => { c.sections[0]!.lessons[0]!.practice = 'net-typo' }, 'курс c/s/l: практика ссылается на неизвестный сценарий net-typo'],
      ['вопрос квиза без разбора', c => { c.sections[0]!.quiz = [{ id: 'q', kind: 'text', prompt: '?', accept: ['да'], why: '' }] }, 'курс c/s/q: у ответа нет разбора'],
    ]
    for (const [name, spoil, message] of cases) {
      const c = good()
      spoil(c)
      const courses = name === 'два курса с одним id' ? [c, good()] : [c]
      expect(() => validateCourses(courses, scenarios), name).toThrow(message)
    }
  })
})
