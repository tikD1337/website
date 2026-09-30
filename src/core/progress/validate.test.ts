import { describe, it, expect } from 'vitest'
import { validateProgress, normalizeProgress } from './validate'
import type { Progress, TicketRecord } from './types'

function rec(over: Partial<TicketRecord> = {}): TicketRecord {
  return {
    id: 'SH-1:INC-001', shiftId: 'SH-1', at: '2026-09-13T10:00:00.000Z',
    weekKey: '2026-W37', number: 'INC-001', scenarioId: 's', summary: '',
    category: '', subcategory: '', priority: 'P3', requester: 'u', device: 'd',
    resolutionCode: 'solved', resolutionNotes: '',
    card: {
      verdict: 'partial', points: 40, dimensions: [], objectives: [],
      note: { score: 0, parts: [], penalties: [] }, silentFaults: [],
    },
    ...over,
  }
}

function progress(records: TicketRecord[]): Progress {
  return { version: 1, records, kb: [], learning: { checks: [], quizzes: [] } }
}

const codes = (raw: unknown) => validateProgress(raw as never).map(e => e.code)

describe('разбор прочитанного из хранилища', () => {
  it('валидный прогресс, в том числе пустой, ошибок не даёт', () => {
    expect(validateProgress(progress([rec()]))).toEqual([])
    expect(validateProgress(progress([]))).toEqual([])
  })

  it('называет, что именно испорчено', () => {
    // Чужая версия схемы — одна ошибка и сразу: следующая не станет молча читать чужое.
    expect(codes({ version: 2, records: [] })).toEqual(['bad_version'])

    const noNumber = rec()
    delete (noNumber as Partial<TicketRecord>).number
    expect(codes(progress([noNumber]))).toContain('missing_number')
    expect(codes(progress([rec({ id: 'SH-1:ROGUE' })]))).toContain('bad_id')

    const noPoints = rec()
    ;(noPoints.card as Partial<typeof noPoints.card>).points = undefined as never
    expect(codes(progress([noPoints]))).toContain('bad_points')
  })

  /**
   * Прочитанное из хранилища — не `Progress`, пока не проверено.
   *
   * Его могла записать прошлая версия, повредить прерванное обновление,
   * подменить кто угодно из консоли. Проверка обязана пережить любую
   * форму: исключение возникает внутри колбэка запроса, внешний
   * `try/catch` его не ловит, и загрузка повисает навсегда.
   */
  it('переживает любую форму мусора и не бросает', () => {
    const junk: unknown[] = [
      null, 'мусор', [], { junk: true },
      { version: 1 }, { version: 1, records: 'нет' }, { version: 1, records: null },
      { version: 1, records: [null] }, { version: 1, records: ['мусор'] },
      { version: 1, records: [{ ...rec(), card: null }] },
    ]
    for (const raw of junk) {
      expect(() => validateProgress(raw as never), JSON.stringify(raw)).not.toThrow()
      expect(codes(raw).length, JSON.stringify(raw)).toBeGreaterThan(0)
    }
  })

  it('прогресс прошлого формата без статей читается; битая статья — ошибка', () => {
    const old = { version: 1, records: [rec()] }
    expect(validateProgress(old)).toEqual([])
    expect(normalizeProgress(old as Progress)).toEqual({ ...old, kb: [], learning: { checks: [], quizzes: [] } })

    const article = {
      id: 'KB-0001', scenarioId: 's', title: 'Нет сети', type: 'network', body: 'текст',
      status: 'draft', version: 1, category: '', subcategory: '', resolutionCode: 'solved',
      createdAt: '', updatedAt: '', sources: [], history: [],
    }
    expect(codes({ ...old, kb: [article] })).toEqual([])
    expect(codes({ ...old, kb: 'x' })).toEqual(['bad_kb'])
    expect(codes({ ...old, kb: [{ ...article, title: '' }] })).toEqual(['bad_article'])
    expect(codes({ ...old, kb: [{ ...article, status: 'lost' }] })).toEqual(['bad_article'])
    expect(codes({ ...old, kb: [null] })).toEqual(['bad_article'])

    /*
      Регрессия из обзора среза 6В: проверка смотрела только, что
      `sources` и `history` — массивы. `sources: [{}]` проходил и ронял
      «Документацию» (объект не рисуется текстом), `history: [null]` —
      на `v.version`; статья без даты правки показывала «NaN.NaN.NaN».
    */
    const version = { version: 1, at: '2026-09-28T10:00:00.000Z', title: 'Было', type: 'sop', body: 'текст' }
    expect(codes({ ...old, kb: [{ ...article, sources: ['SH-1:INC1'], history: [version] }] }), 'целая').toEqual([])
    const broken: Array<[string, object]> = [
      ['источник не строка', { sources: [{}] }],
      ['версия null', { history: [null] }],
      ['версия без номера', { history: [{ ...version, version: '1' }] }],
      ['версия без текста', { history: [{ ...version, body: undefined }] }],
      ['версия чужого типа', { history: [{ ...version, type: 'wiki' }] }],
      ['без даты правки', { updatedAt: undefined }],
      ['без категории', { category: 7 }],
      ['без кода закрытия', { resolutionCode: '' }],
    ]
    for (const [name, patch] of broken) {
      expect(codes({ ...old, kb: [{ ...article, ...patch }] }), name).toEqual(['bad_article'])
    }
  })

  it('обучение: прошлый формат читается, битое — ошибка', () => {
    const old = { version: 1, records: [], kb: [] }
    expect(validateProgress(old)).toEqual([])
    expect(normalizeProgress(old as unknown as Progress).learning).toEqual({ checks: [], quizzes: [] })

    const quiz = { id: 'first-line/network', attempts: 1, best: 5, total: 5, passedAt: '2026-09-30T10:00:00.000Z' }
    expect(codes({ ...old, learning: { checks: ['c/s/l/k'], quizzes: [quiz, { ...quiz, passedAt: null }] } }), 'целое').toEqual([])

    const broken: Array<[string, unknown]> = [
      ['не объект', 'x'],
      ['проверки не массив', { checks: 'c/s/l/k', quizzes: [] }],
      ['проверка не строка', { checks: [1], quizzes: [] }],
      ['квизы не массив', { checks: [], quizzes: {} }],
      ['квиз без id', { checks: [], quizzes: [{ ...quiz, id: 7 }] }],
      ['попытки не число', { checks: [], quizzes: [{ ...quiz, attempts: '1' }] }],
      ['лучший не число', { checks: [], quizzes: [{ ...quiz, best: null }] }],
      ['всего не число', { checks: [], quizzes: [{ ...quiz, total: undefined }] }],
      ['дата сдачи не строка', { checks: [], quizzes: [{ ...quiz, passedAt: 5 }] }],
      ['квиз null', { checks: [], quizzes: [null] }],
    ]
    for (const [name, learning] of broken) {
      expect(codes({ ...old, learning }), name).toEqual(['bad_learning'])
    }
  })
})
