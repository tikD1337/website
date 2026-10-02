import { describe, it, expect } from 'vitest'
import { INTERVIEWS } from '.'
import { SCENARIOS } from '../scenarios'
import { validateInterviews } from '../core/interview/validate'
import { normalizeAnswer } from '../core/interview/grade'

describe('треки интервью', () => {
  it('треки проходят загрузчик', () => {
    expect(() => validateInterviews(INTERVIEWS, SCENARIOS.map(s => s.id))).not.toThrow()
    const [track] = INTERVIEWS
    expect([track!.technical.length, track!.experience.length, track!.faq.length, track!.perInterview]).toEqual([10, 11, 8, 5])
    // Вопрос об опыте есть по каждому сценарию библиотеки.
    expect(track!.experience.filter(q => q.scenario).map(q => q.scenario).sort()).toEqual(SCENARIOS.map(s => s.id).sort())
  })

  /*
    Маркер, который стоит в самом вопросе, засчитывал бы пункт за
    пересказ вопроса: «запустите — и всё?» — «запущу» уже был бы ответом.
  */
  it('маркеры не повторяют слов самого вопроса', () => {
    for (const t of INTERVIEWS) {
      for (const q of [t.intro, ...t.technical, ...t.experience]) {
        const prompt = normalizeAnswer(q.prompt)
        for (const p of q.points) {
          expect(p.markers.filter(m => prompt.includes(normalizeAnswer(m))), `${q.id}/${p.id}`).toEqual([])
        }
      }
    }
  })
})
