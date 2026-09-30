import { describe, it, expect } from 'vitest'
import { validateInterviews } from './validate'
import type { InterviewTrack, Question } from './types'

const point = { id: 'p', label: 'пункт', markers: ['маркер'], why: 'почему' }
const q = (id: string, stage: Question['stage'], extra: Partial<Question> = {}): Question =>
  ({ id, stage, prompt: '?', expected: 'ответ', points: [{ ...point }], ...extra })

const good = (): InterviewTrack => ({
  id: 'tr', title: 'Трек', summary: '', interviewer: 'И', greeting: 'Здравствуйте', yourQuestions: '?',
  company: [], faq: [],
  intro: q('intro', 'intro'),
  technical: [q('t1', 'technical'), q('t2', 'technical')],
  perInterview: 2,
  experience: [q('e1', 'experience', { scenario: 'net-apipa-no-lease' }), q('e-any', 'experience')],
})

describe('загрузчик треков интервью', () => {
  it('исправный трек проходит', () => {
    expect(() => validateInterviews([good()], ['net-apipa-no-lease'])).not.toThrow()
  })

  it('испорченный трек падает с адресом и причиной', () => {
    const cases: Array<[string, (t: InterviewTrack) => unknown, string]> = [
      ['два вопроса с одним id', t => t.technical.push(q('t1', 'technical')), 'интервью tr/t1: повторяется id'],
      ['вопрос без пунктов', t => { t.technical[0]!.points = [] }, 'интервью tr/t1: у вопроса нет пунктов'],
      ['пункт без маркеров', t => { t.technical[0]!.points[0]!.markers = [' '] }, 'интервью tr/t1: у пункта нет маркеров'],
      ['пункт без разбора', t => { t.intro.points[0]!.why = '' }, 'интервью tr/intro: у пункта нет разбора'],
      ['без образцового ответа', t => { t.experience[1]!.expected = '  ' }, 'интервью tr/e-any: нет образцового ответа'],
      ['сценарий мимо библиотеки', t => { t.experience[0]!.scenario = 'net-typo' }, 'интервью tr/e1: неизвестный сценарий net-typo'],
      ['нет общего вопроса об опыте', t => { t.experience.pop() }, 'интервью tr: нет общего вопроса об опыте'],
      ['пул меньше интервью', t => { t.perInterview = 3 }, 'интервью tr: в пуле меньше вопросов, чем в интервью'],
    ]
    for (const [name, spoil, message] of cases) {
      const t = good()
      spoil(t)
      expect(() => validateInterviews([t], ['net-apipa-no-lease']), name).toThrow(message)
    }
  })
})
