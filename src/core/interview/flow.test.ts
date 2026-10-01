import { describe, it, expect } from 'vitest'
import {
  startInterview, answer, say, askInterviewer, faqReply, finishQuestions, questionText, FAQ_FALLBACK,
} from './flow'
import { gradeInterview } from './grade'
import type { InterviewTrack, Question } from './types'

const point = (id: string, marker: string) => ({ id, label: id, markers: [marker], why: `нужно ${id}` })
const tq = (id: string): Question => ({
  id, stage: 'technical', prompt: `Вопрос ${id}?`, expected: `Ответ ${id}.`,
  points: [point(`${id}-a`, `${id}альфа`), point(`${id}-b`, `${id}бета`)],
  followUp: `Уточните ${id}.`,
})

const track: InterviewTrack = {
  id: 'tr', title: 'Трек', summary: '', interviewer: 'Интервьюер',
  greeting: 'Здравствуйте.', yourQuestions: 'Ваши вопросы?', company: ['смены по восемь часов'],
  intro: { id: 'intro', stage: 'intro', prompt: 'О себе?', expected: 'О себе.', points: [point('why', 'люблю')] },
  technical: ['t1', 't2', 't3', 't4'].map(tq),
  perInterview: 2,
  experience: [
    { id: 'exp-a', stage: 'experience', scenario: 'a', prompt: 'Расскажите про {тикет}.', expected: 'A.', points: [point('cause', 'причин')] },
    { id: 'exp-b', stage: 'experience', scenario: 'b', prompt: 'Расскажите про {тикет}.', expected: 'B.', points: [point('cause', 'причин')] },
    { id: 'exp-any', stage: 'experience', prompt: 'Трудный случай?', expected: 'Любой.', points: [point('cause', 'причин')] },
  ],
  faq: [{ ask: 'Какой график смен?', reply: 'Смены по восемь часов.' }],
}

describe('ход интервью', () => {
  it('план по кругу и опыт из истории', () => {
    const plan = (attempt: number, solved: Array<{ scenarioId: string; summary: string }>) =>
      startInterview(track, attempt, solved).plan
    expect(plan(0, []), 'попытка 0').toEqual(['intro', 't1', 't2', 'exp-any'])
    expect(plan(1, []), 'попытка 1').toEqual(['intro', 't3', 't4', 'exp-any'])
    expect(plan(2, []), 'попытка 2 — по кругу').toEqual(['intro', 't1', 't2', 'exp-any'])

    const run = startInterview(track, 0, [{ scenarioId: 'b', summary: 'Нет сети' }])
    expect(run.plan.at(-1)).toBe('exp-b')
    expect(questionText(track, run, 'exp-b')).toBe('Расскажите про тикет «Нет сети».')
    expect(run.transcript).toEqual([
      { speaker: 'interviewer', text: 'Здравствуйте.' },
      { speaker: 'interviewer', text: 'О себе?' },
    ])
    expect(run.stage).toBe('intro')
  })

  it('уточнение один раз и только при недоборе', () => {
    let run = startInterview(track, 0, [])
    let r = answer(track, run, 'люблю людей')
    expect(r.next, 'полный ответ — следующий вопрос').toBe('Вопрос t1?')
    run = say(r.run, r.next!)

    r = answer(track, run, 'не знаю')
    expect(r.next, 'пусто — уточнение').toBe('Уточните t1.')
    run = say(r.run, r.next!)
    r = answer(track, run, 't1альфа')
    expect(r.next, 'второй недобор — дальше, без второго уточнения').toBe('Вопрос t2?')
    run = say(r.run, r.next!)

    r = answer(track, run, 't2альфа')
    expect(r.next, 'половина пунктов — без уточнения').toBe('Трудный случай?')
    expect(r.run.stage).toBe('experience')
    expect(r.run.answers['t1']).toEqual(['не знаю', 't1альфа'])
  })

  it('после опыта — ваши вопросы, заготовка или нейтральный ответ, затем вердикт', () => {
    let run = startInterview(track, 0, [])
    for (const text of ['люблю', 't1альфа t1бета', 't2альфа t2бета']) {
      const r = answer(track, run, text)
      run = say(r.run, r.next!)
    }
    const last = answer(track, run, 'причина была в порту')
    expect(last.next).toBe('Ваши вопросы?')
    run = say(last.run, last.next!)
    expect(run.stage).toBe('questions')

    expect(faqReply(track, 'А какой у вас график смен?')).toBe('Смены по восемь часов.')
    expect(faqReply(track, 'Сколько стоит обед?')).toBe(FAQ_FALLBACK)
    run = askInterviewer(run, 'А какой у вас график смен?')
    expect(run.asked).toEqual(['А какой у вас график смен?'])

    run = finishQuestions(run)
    expect(run.stage).toBe('done')
    const result = gradeInterview(track, run)
    expect(result).toMatchObject({ verdict: 'hire', intro: 1, technical: 1, experience: 1, questionsAsked: 1 })
    expect(result.items.map(i => [i.id, i.covered, i.missing])).toEqual([
      ['intro', ['why'], []],
      ['t1', ['t1-a', 't1-b'], []],
      ['t2', ['t2-a', 't2-b'], []],
      ['exp-any', ['cause'], []],
    ])
    expect(result.items[3]).toMatchObject({ prompt: 'Трудный случай?', expected: 'Любой.', answers: ['причина была в порту'] })
  })
})
