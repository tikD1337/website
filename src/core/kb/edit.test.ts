import { describe, it, expect } from 'vitest'
import { editArticle, setStatus } from './edit'
import type { KbArticle, KbStatus } from './types'

const T1 = '2026-09-28T10:00:00.000Z'
const T2 = '2026-09-28T11:00:00.000Z'

function article(over: Partial<KbArticle> = {}): KbArticle {
  return {
    id: 'KB-0001', scenarioId: 'net-apipa-no-lease', title: 'Нет сети', type: 'network',
    body: 'Сначала release, потом renew.', status: 'draft', version: 1,
    category: 'Сеть', subcategory: 'Связность', resolutionCode: 'solved',
    createdAt: T1, updatedAt: T1, sources: ['SH-1:INC1'], history: [],
    ...over,
  }
}

describe('правка статьи', () => {
  /*
    Версия — это сохранённая правка. «Сохранить» без изменений, нажатое
    дважды, не должно раздувать историю пустыми версиями.
  */
  it('правка — новая версия, прежняя в истории; без изменений версия не растёт', () => {
    const a = article()
    const r = editArticle(a, { body: 'release, затем renew; при повторе — проверить порт.' }, T2)
    expect(r).toEqual({
      ok: true,
      article: {
        ...a, body: 'release, затем renew; при повторе — проверить порт.', version: 2, updatedAt: T2,
        history: [{ version: 1, at: T1, title: 'Нет сети', type: 'network', body: 'Сначала release, потом renew.' }],
      },
    })
    const edited = (r as { article: KbArticle }).article
    const same = editArticle(edited, { body: edited.body, title: edited.title }, '2026-09-28T12:00:00.000Z')
    expect(same).toEqual({ ok: true, article: edited })
    expect((same as { article: KbArticle }).article).toBe(edited)

    expect(editArticle(a, { title: '  ' }, T2)).toEqual({ ok: false, error: 'у статьи должен быть заголовок' })
    expect(editArticle(a, { body: '\n ' }, T2)).toEqual({ ok: false, error: 'у статьи должен быть текст' })
    expect(a).toEqual(article())
  })

  it('статусы — только разрешённые переходы', () => {
    const all: KbStatus[] = ['draft', 'published', 'retired']
    const allowed = new Set(['draft>published', 'published>retired', 'retired>published'])
    for (const from of all) {
      for (const to of all) {
        const r = setStatus(article({ status: from }), to, T2)
        const key = `${from}>${to}`
        expect(r.ok, key).toBe(allowed.has(key))
        if (r.ok) expect(r.article, key).toMatchObject({ status: to, version: 1, updatedAt: T2 })
      }
    }
    expect(setStatus(article(), 'retired', T2)).toEqual({ ok: false, error: 'нельзя: «Черновик» → «В архиве»' })
  })
})
