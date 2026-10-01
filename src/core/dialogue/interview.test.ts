import { describe, it, expect, vi } from 'vitest'
import { createDialogue } from './port'
import { interviewMessages, interviewPrompt } from './interviewPrompt'
import { defaultConfig, type InterviewRequest } from './types'
import type { FetchLike } from './openai'
import { INTERVIEWS } from '../../interviews'
import { normalizeAnswer } from '../interview/grade'

const request = (question: string | null, over: Partial<InterviewRequest> = {}): InterviewRequest => ({
  purpose: 'react',
  interviewer: 'Марина Коваль, руководитель первой линии Arcline',
  company: ['Первая линия — шесть человек.'],
  question,
  said: 'Сначала посмотрю ipconfig.',
  history: [],
  fallback: 'Понятно.',
  ...over,
})

describe('интервьюер в разъёме диалога', () => {
  /*
    Интервьюер, знающий образцовый ответ, подсказывает его уточнением —
    как заявитель, знающий корневую причину, выдаёт диагноз. Проверяется
    по всей библиотеке треков, а не аккуратностью автора следующего.
  */
  it('промпт интервьюера не знает ответов — по всей библиотеке треков', () => {
    for (const t of INTERVIEWS) {
      for (const q of [t.intro, ...t.technical, ...t.experience]) {
        const prompt = q.prompt.replace('{тикет}', 'тикет «Нет сети»')
        // Реплика кандидата нейтральна: его собственные слова — не утечка.
        const sent = normalizeAnswer(JSON.stringify(interviewMessages(request(prompt, {
          company: t.company, interviewer: t.interviewer, said: 'Ответ кандидата.',
        }))))
        // Шаблон промпта одинаков для всех вопросов — его слова ничего не подсказывают.
        const template = interviewPrompt(request('', { company: [], interviewer: '' }))
        const open = normalizeAnswer([template, prompt, t.interviewer, ...t.company].join(' '))
        /*
          Что уже есть в открытом тексте комнаты (шаблон, вопрос, имя
          интервьюера, факты о компании), утечкой быть не может:
          «руководител» из должности интервьюера — не подсказка к сверке
          личности, а пункт «что было» повторяет сам вопрос. Секрет —
          всё остальное: образцовый ответ, уточнение, пункты с разбором
          и маркеры.
        */
        const secrets = [
          q.expected, q.followUp ?? '',
          ...q.points.flatMap(p => [p.label, p.why, ...p.markers]),
        ].filter(x => x.trim() !== '' && !open.includes(normalizeAnswer(x)))
        expect(secrets.filter(x => sent.includes(normalizeAnswer(x))), `${t.id}/${q.id}`).toEqual([])
      }
    }
  })

  it('без модели — заготовка; отказ модели — заготовка с плашкой и размыкатель', async () => {
    const scripted = createDialogue({ config: defaultConfig(), fetch: vi.fn() })
    expect(await scripted.interview(request('Вопрос?'))).toEqual({ text: 'Понятно.', source: 'scripted' })

    const fetch = vi.fn<FetchLike>(async () => ({ ok: false, status: 500, json: async () => ({}) }))
    const d = createDialogue({ config: { ...defaultConfig(), mode: 'local' }, fetch })
    expect(await d.interview(request('Вопрос?'))).toEqual({
      text: 'Понятно.', source: 'scripted', notice: 'модель ответила кодом 500. Отвечают заготовки.',
    })
    expect(await d.interview(request('Вопрос?', { fallback: 'Принято.' }))).toMatchObject({ text: 'Принято.', source: 'scripted' })
    expect(fetch, 'размыкатель: модель больше не опрашивается').toHaveBeenCalledTimes(1)

    const ok = createDialogue({
      config: { ...defaultConfig(), mode: 'local' },
      fetch: async () => ({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content: 'Хорошо, поняла вас.' } }] }) }),
    })
    expect(await ok.interview(request('Вопрос?'))).toEqual({ text: 'Хорошо, поняла вас.', source: 'model' })
  })
})
