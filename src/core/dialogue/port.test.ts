import { describe, it, expect, vi } from 'vitest'
import { createDialogue } from './port'
import { askModel, type FetchLike } from './openai'
import { systemPrompt, buildMessages } from './prompt'
import { briefFor } from './brief'
import { defaultConfig, type DialogueConfig, type DialogueRequest, type Turn } from './types'
import { loadScenario } from '../scenario/load'
import { SCENARIOS } from '../../scenarios'
import { identityAccountLockout } from '../../scenarios/identity-account-lockout'

const { world, ticket } = loadScenario(identityAccountLockout)
const brief = briefFor(identityAccountLockout, ticket, world)

const req = (said = 'Когда это началось?'): DialogueRequest => ({
  channel: 'call', withWhom: 'e.varga', brief, said, history: [],
})

const cfg = (over: Partial<DialogueConfig> = {}): DialogueConfig =>
  ({ ...defaultConfig(), mode: 'local', ...over })

/** Ответ модели в форме OpenAI. */
const okReply = (text: string) => ({
  ok: true,
  status: 200,
  json: async () => ({ choices: [{ message: { content: text } }] }),
})

const down = () => vi.fn(async () => { throw new Error('нет сети') })

describe('клиент модели', () => {
  it('шлёт запрос по адресу без двойного слеша, ключ — заголовком, ответ обрезан', async () => {
    const calls: Array<{ url: string; auth?: string }> = []
    const fetch: FetchLike = async (url, init) => {
      calls.push({ url, auth: init?.headers?.['Authorization'] })
      return okReply('  Сегодня утром, как пришла.\n')
    }

    const withKey = await askModel(req(), cfg({
      baseUrl: 'http://localhost:11434/v1/', apiKey: 'k-123',
    }), fetch)
    // Ollama ключа не требует — пустой заголовок не отправляем.
    await askModel(req(), cfg({ apiKey: '' }), fetch)

    expect(withKey).toEqual({ ok: true, text: 'Сегодня утром, как пришла.' })
    expect(calls[0]).toEqual({
      url: 'http://localhost:11434/v1/chat/completions', auth: 'Bearer k-123',
    })
    expect(calls[1]!.auth).toBeUndefined()
  })

  /**
   * Способы отказа перечислены поимённо: ни один не должен бросать
   * наружу. Исключение, дошедшее до интерфейса, обрушило бы инструмент
   * посреди инцидента.
   */
  it('любой отказ возвращается ошибкой, а не исключением', async () => {
    const abort = Object.assign(new Error('aborted'), { name: 'AbortError' })
    const cases: Array<[string, FetchLike, string | null]> = [
      ['код ошибки', async () => ({ ok: false, status: 500, json: async () => ({}) }),
        'модель ответила кодом 500'],
      ['нет сети', async () => { throw new TypeError('Failed to fetch') }, 'модель недоступна'],
      ['таймаут', async () => { throw abort }, null],
      ['мусор вместо JSON', async () => ({
        ok: true, status: 200, json: async () => { throw new Error('bad json') },
      }), null],
      ['пустой список', async () => ({
        ok: true, status: 200, json: async () => ({ choices: [] }),
      }), 'модель вернула пустой ответ'],
      ['ответ без текста', async () => ({
        ok: true, status: 200, json: async () => ({ choices: [{ message: {} }] }),
      }), null],
      ['одни пробелы', async () => okReply('   '), null],
    ]

    for (const [name, fetch, error] of cases) {
      const r = await askModel(req(), cfg({ timeoutMs: 50 }), fetch)
      expect(r.ok, name).toBe(false)
      if (error) expect(r.ok === false && r.error, name).toBe(error)
    }
    const timeout = await askModel(req(), cfg({ timeoutMs: 50 }), cases[2]![1])
    expect(timeout.ok === false && timeout.error).toContain('не ответила')
  })
})

describe('разъём диалога', () => {
  it('в режиме реплик модель не опрашивается и fetch не нужен', async () => {
    const fetch = vi.fn()
    const r = await createDialogue({ config: defaultConfig(), fetch: fetch as never }).reply(req())
    expect(fetch).not.toHaveBeenCalled()
    expect(r.source).toBe('scripted')
    expect(r.notice).toBeUndefined()
    expect((await createDialogue({ config: defaultConfig() }).reply(req())).source)
      .toBe('scripted')
  })

  it('исправная модель ведёт разговор сама', async () => {
    const d = createDialogue({ config: cfg(), fetch: async () => okReply('Утром, как пришла.') })
    expect(await d.reply(req())).toEqual({ text: 'Утром, как пришла.', source: 'model' })
  })

  /*
    Размыкатель: без него каждая реплика ждёт таймаут, а консоль
    браузера наполняется отказами соединения, которые мы не
    контролируем. Тренировка продолжается на репликах сценария — связно,
    с плашкой и без исключений.
  */
  it('отказ модели даёт реплику сценария с плашкой и отключает модель', async () => {
    const fetch = down()
    const d = createDialogue({ config: cfg(), fetch: fetch as never })

    const first = await d.reply(req())
    const second = await d.reply(req('Вы недавно меняли пароль?'))
    await d.reply(req('А сейчас?'))

    expect(first.source).toBe('scripted')
    expect(first.text).toContain('Сегодня утром')
    expect(first.notice).toContain('недоступна')
    expect(second.text).toContain('на прошлой неделе')
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(d.tripped()).toBe(true)
  })

  /*
    Размыкатель сбрасывает только смена адреса или режима. Найдено
    разбором кода: он сбрасывался на любую правку настроек, а
    переключение озвучки идёт тем же путём — и после него каждая
    реплика снова ждала таймаут погашенной модели.
  */
  it('размыкатель сбрасывают адрес и режим, но не озвучка', async () => {
    let fail = true
    const fetch = vi.fn(async () => {
      if (fail) throw new Error('нет сети')
      return okReply('Теперь отвечаю.')
    })
    const d = createDialogue({ config: cfg(), fetch: fetch as never })
    await d.reply(req())

    d.configure(cfg({ speak: true }))
    expect(d.tripped()).toBe(true)
    await d.reply(req())
    expect(fetch).toHaveBeenCalledTimes(1)

    d.configure(cfg({ mode: 'endpoint' }))
    expect(d.tripped()).toBe(false)
    await d.reply(req())
    expect(d.tripped()).toBe(true)

    // Каждое поле подключения по отдельности даёт новую попытку.
    for (const change of [
      { mode: 'endpoint' }, { baseUrl: 'http://localhost:1234/v1' }, { model: 'other' }, { apiKey: 'k-2' },
    ] as const) {
      d.configure(cfg())
      await d.reply(req())
      expect(d.tripped(), JSON.stringify(change)).toBe(true)
      d.configure(cfg(change))
      expect(d.tripped(), JSON.stringify(change)).toBe(false)
    }

    fail = false
    d.configure(cfg({ baseUrl: 'http://localhost:1234/v1' }))
    expect(d.tripped()).toBe(false)
    expect((await d.reply(req())).source).toBe('model')
  })

  /*
    Испорченная реплика — не то же самое, что отказ модели. Модель жива,
    просто эту фразу показывать нельзя: соскользнула на китайский или
    заговорила голосом ассистента. Отключать её из-за одной случайности
    значит лишать техника живого собеседника на ровном месте.
  */
  it('негодный ответ заменяется репликой, но модель спрашивают снова', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(okReply('细节决定成败'))
      .mockResolvedValueOnce(okReply('Сегодня утром, как пришла.'))
    const d = createDialogue({ config: cfg(), fetch: fetch as never })

    const bad = await d.reply(req())
    expect(bad.source).toBe('scripted')
    expect(bad.notice).toContain('не по-русски')
    expect(d.tripped()).toBe(false)

    expect(await d.reply(req('Что на экране?')))
      .toEqual({ text: 'Сегодня утром, как пришла.', source: 'model' })
  })

  /**
   * Проверка результата отвечается миром даже при исправной модели.
   *
   * Найдено живой проверкой на Ollama: блокировку сняли, а модель
   * твердила «сообщение об ошибке осталось то же самое» — тянула жалобу
   * по инерции из истории. На экране выходило «всё ещё заблокирована»
   * рядом с галочкой «заявитель подтвердил».
   */
  it('«попробуйте сейчас» отвечает мир, а не модель', async () => {
    const fetch = vi.fn(async () => okReply('Да, спасибо, всё прекрасно работает!'))
    const d = createDialogue({ config: cfg(), fetch: fetch as never })

    const fixed = await d.reply({
      ...req('Попробуйте войти сейчас'), brief: { ...brief, problemGone: true },
    })
    const broken = await d.reply(req('Проверьте, получилось?'))

    expect(fetch).not.toHaveBeenCalled()
    expect(fixed).toMatchObject({ source: 'scripted', text: expect.stringContaining('пустило') })
    expect(broken.text).toContain('то же самое')
  })
})

describe('проверка соединения', () => {
  it('успех снимает размыкатель, отказ объясняется словами', async () => {
    let status = 0
    const fetch: FetchLike = async () => {
      if (status === 0) throw new Error('нет сети')
      if (status === 404) return { ok: false, status: 404, json: async () => ({}) }
      return okReply('Здравствуйте.')
    }
    const d = createDialogue({ config: cfg(), fetch })
    await d.reply(req())
    expect(d.tripped()).toBe(true)

    status = 404
    const failed = await d.probe()
    expect(failed.ok).toBe(false)
    expect(failed.error).toContain('404')

    status = 200
    expect(await d.probe()).toEqual({ ok: true })
    expect(d.tripped()).toBe(false)
  })

  it('в режиме реплик проверять нечего', async () => {
    const fetch = vi.fn()
    const r = await createDialogue({ config: defaultConfig(), fetch: fetch as never }).probe()
    expect(fetch).not.toHaveBeenCalled()
    expect(r.ok).toBe(false)
    expect(r.error).toContain('реплик сценария')
  })

  /* Проверка соединения — тоже разговор, и разгадку она не несёт. */
  it('запрос проверки не содержит данных сценария', async () => {
    let body = ''
    const fetch: FetchLike = async (_u, init) => {
      body = init?.body ?? ''
      return okReply('ок')
    }
    await createDialogue({ config: cfg(), fetch }).probe()
    expect(body).not.toBe('')
    for (const s of SCENARIOS) expect(body).not.toContain(s.rootCause)
  })
})

/**
 * Промпт — самое опасное место среза: здесь решается, что модель узнаёт.
 * Проверяется по всей библиотеке, а не на одном примере.
 */
describe('промпт', () => {
  it('не содержит ни причины, ни целей, ни текстов просьб ни одного сценария', () => {
    for (const s of SCENARIOS) {
      const { world: w, ticket: t } = loadScenario(s)
      const text = systemPrompt({
        channel: 'call', withWhom: s.requester, brief: briefFor(s, t, w),
        said: 'Здравствуйте', history: [],
      })
      expect(text, s.id).not.toContain(s.rootCause)
      for (const o of s.objectives) expect(text, s.id).not.toContain(o.title)
      for (const a of s.asks ?? []) expect(text, s.id).not.toContain(a.ask)
    }
  })

  it('передаёт состояние проблемы, роль и канал, но не диагноз', () => {
    const broken = systemPrompt(req())
    expect(broken).toContain('не ставь диагноз')
    expect(broken).toContain('ВСЁ ЕЩЁ ЕСТЬ')
    expect(broken).not.toContain('lockedOut')

    expect(systemPrompt({ ...req(), brief: { ...brief, problemGone: true } }))
      .toContain('БОЛЬШЕ НЕ')
    expect(systemPrompt({ ...req(), brief: { ...brief, bystander: true } }))
      .toContain('НЕ тот человек')
    expect(systemPrompt({ ...req(), channel: 'mail' })).toContain('письмо')
    expect(systemPrompt({ ...req(), channel: 'chat' })).toContain('чат')
  })

  it('сообщения: система первой, история по ролям, длинная обрезается', () => {
    const short = buildMessages({
      ...req('и что теперь?'),
      history: [
        { speaker: 'technician', text: 'Здравствуйте' },
        { speaker: 'requester', text: 'Здравствуйте, не могу войти' },
      ],
    })
    expect(short.map(m => m.role)).toEqual(['system', 'user', 'assistant', 'user'])
    expect(short.slice(1)).toEqual([
      { role: 'user', content: 'Здравствуйте' },
      { role: 'assistant', content: 'Здравствуйте, не могу войти' },
      { role: 'user', content: 'и что теперь?' },
    ])

    const history: Turn[] = Array.from({ length: 40 }, (_, i) => ({
      speaker: i % 2 === 0 ? 'technician' : 'requester',
      text: `реплика ${i}`,
    }))
    const long = buildMessages({ ...req(), history })
    expect(long.length).toBeLessThanOrEqual(14)
    expect(long.at(-2)!.content).toBe('реплика 39')
  })
})
