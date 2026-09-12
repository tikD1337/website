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

describe('клиент модели: успех', () => {
  it('возвращает текст ответа', async () => {
    const fetch: FetchLike = async () => okReply('Сегодня утром, как пришла.')
    const r = await askModel(req(), cfg(), fetch)
    expect(r).toEqual({ ok: true, text: 'Сегодня утром, как пришла.' })
  })

  it('обрезает пробелы', async () => {
    const fetch: FetchLike = async () => okReply('  Утром.\n')
    const r = await askModel(req(), cfg(), fetch)
    expect(r.ok && r.text).toBe('Утром.')
  })

  it('шлёт запрос на /chat/completions без двойного слеша', async () => {
    let url = ''
    const fetch: FetchLike = async u => { url = u; return okReply('да') }
    await askModel(req(), cfg({ baseUrl: 'http://localhost:11434/v1/' }), fetch)
    expect(url).toBe('http://localhost:11434/v1/chat/completions')
  })

  it('ключ уходит заголовком, когда он задан', async () => {
    let headers: Record<string, string> = {}
    const fetch: FetchLike = async (_u, init) => {
      headers = init?.headers ?? {}
      return okReply('да')
    }
    await askModel(req(), cfg({ apiKey: 'k-123' }), fetch)
    expect(headers['Authorization']).toBe('Bearer k-123')
  })

  /* Ollama ключа не требует — пустой заголовок не отправляем. */
  it('без ключа заголовка авторизации нет', async () => {
    let headers: Record<string, string> = {}
    const fetch: FetchLike = async (_u, init) => {
      headers = init?.headers ?? {}
      return okReply('да')
    }
    await askModel(req(), cfg({ apiKey: '' }), fetch)
    expect(headers['Authorization']).toBeUndefined()
  })
})

/**
 * Способы отказа перечислены поимённо: ни один не должен бросать
 * наружу. Исключение, дошедшее до интерфейса, обрушило бы инструмент
 * посреди инцидента.
 */
describe('клиент модели: отказы', () => {
  it('код ошибки сервера', async () => {
    const fetch: FetchLike = async () => ({
      ok: false, status: 500, json: async () => ({}),
    })
    const r = await askModel(req(), cfg(), fetch)
    expect(r).toEqual({ ok: false, error: 'модель ответила кодом 500' })
  })

  it('сеть недоступна', async () => {
    const fetch: FetchLike = async () => { throw new TypeError('Failed to fetch') }
    const r = await askModel(req(), cfg(), fetch)
    expect(r.ok).toBe(false)
    expect(r.ok === false && r.error).toBe('модель недоступна')
  })

  it('таймаут', async () => {
    const fetch: FetchLike = async () => {
      const e = new Error('aborted')
      e.name = 'AbortError'
      throw e
    }
    const r = await askModel(req(), cfg({ timeoutMs: 50 }), fetch)
    expect(r.ok === false && r.error).toContain('не ответила')
  })

  it('мусор вместо JSON', async () => {
    const fetch: FetchLike = async () => ({
      ok: true, status: 200, json: async () => { throw new Error('bad json') },
    })
    const r = await askModel(req(), cfg(), fetch)
    expect(r.ok).toBe(false)
  })

  it('пустой список ответов', async () => {
    const fetch: FetchLike = async () => ({
      ok: true, status: 200, json: async () => ({ choices: [] }),
    })
    const r = await askModel(req(), cfg(), fetch)
    expect(r.ok === false && r.error).toBe('модель вернула пустой ответ')
  })

  it('ответ без текста', async () => {
    const fetch: FetchLike = async () => ({
      ok: true, status: 200, json: async () => ({ choices: [{ message: {} }] }),
    })
    const r = await askModel(req(), cfg(), fetch)
    expect(r.ok).toBe(false)
  })

  it('пустая строка считается пустым ответом', async () => {
    const fetch: FetchLike = async () => okReply('   ')
    const r = await askModel(req(), cfg(), fetch)
    expect(r.ok).toBe(false)
  })
})

describe('режим реплик сценария', () => {
  it('модель не опрашивается вовсе', async () => {
    const fetch = vi.fn()
    const d = createDialogue({ config: defaultConfig(), fetch: fetch as never })
    const r = await d.reply(req())
    expect(fetch).not.toHaveBeenCalled()
    expect(r.source).toBe('scripted')
    expect(r.notice).toBeUndefined()
  })

  it('работает без fetch в окружении вообще', async () => {
    const d = createDialogue({ config: defaultConfig() })
    const r = await d.reply(req())
    expect(r.source).toBe('scripted')
  })
})

describe('деградация', () => {
  it('модель ответила — источник модель', async () => {
    const fetch: FetchLike = async () => okReply('Утром, как пришла.')
    const d = createDialogue({ config: cfg(), fetch })
    const r = await d.reply(req())
    expect(r).toEqual({ text: 'Утром, как пришла.', source: 'model' })
  })

  it('модель отказала — приходит реплика сценария с плашкой', async () => {
    const fetch: FetchLike = async () => { throw new Error('нет сети') }
    const d = createDialogue({ config: cfg(), fetch })
    const r = await d.reply(req())

    expect(r.source).toBe('scripted')
    expect(r.text).toContain('Сегодня утром')
    expect(r.notice).toContain('недоступна')
  })

  it('отказ модели не бросает исключение', async () => {
    const fetch: FetchLike = async () => { throw new Error('bang') }
    const d = createDialogue({ config: cfg(), fetch })
    await expect(d.reply(req())).resolves.toBeTruthy()
  })

  /*
    Размыкатель: без него каждая реплика ждёт таймаут, а консоль
    браузера наполняется отказами соединения, которые мы не
    контролируем. Проверка среза требует продолжения тренировки — и
    молчаливой консоли тоже.
  */
  it('после отказа модель больше не опрашивается', async () => {
    const fetch = vi.fn(async () => { throw new Error('нет сети') })
    const d = createDialogue({ config: cfg(), fetch: fetch as never })

    await d.reply(req())
    await d.reply(req('Что на экране?'))
    await d.reply(req('А сейчас?'))

    expect(fetch).toHaveBeenCalledTimes(1)
    expect(d.tripped()).toBe(true)
  })

  it('разговор после отказа продолжается связно', async () => {
    const fetch: FetchLike = async () => { throw new Error('нет сети') }
    const d = createDialogue({ config: cfg(), fetch })

    await d.reply(req())
    const second = await d.reply(req('Вы недавно меняли пароль?'))
    expect(second.text).toContain('на прошлой неделе')
  })

  it('смена настроек даёт модели новую попытку', async () => {
    let fail = true
    const fetch = vi.fn(async () => {
      if (fail) throw new Error('нет сети')
      return okReply('Теперь отвечаю.')
    })
    const d = createDialogue({ config: cfg(), fetch: fetch as never })

    await d.reply(req())
    expect(d.tripped()).toBe(true)

    fail = false
    d.configure(cfg({ baseUrl: 'http://localhost:1234/v1' }))
    expect(d.tripped()).toBe(false)

    const r = await d.reply(req())
    expect(r.source).toBe('model')
  })
})

describe('проверка соединения', () => {
  it('успех', async () => {
    const fetch: FetchLike = async () => okReply('Здравствуйте.')
    const d = createDialogue({ config: cfg(), fetch })
    expect(await d.probe()).toEqual({ ok: true })
  })

  it('отказ объясняется словами', async () => {
    const fetch: FetchLike = async () => ({
      ok: false, status: 404, json: async () => ({}),
    })
    const d = createDialogue({ config: cfg(), fetch })
    const r = await d.probe()
    expect(r.ok).toBe(false)
    expect(r.error).toContain('404')
  })

  it('в режиме реплик проверять нечего', async () => {
    const d = createDialogue({ config: defaultConfig(), fetch: (async () => {
      throw new Error('не должно вызываться')
    }) as never })
    const r = await d.probe()
    expect(r.ok).toBe(false)
    expect(r.error).toContain('реплик сценария')
  })

  it('успешная проверка снимает размыкатель', async () => {
    let fail = true
    const fetch: FetchLike = async () => {
      if (fail) throw new Error('нет сети')
      return okReply('Здравствуйте.')
    }
    const d = createDialogue({ config: cfg(), fetch })

    await d.reply(req())
    expect(d.tripped()).toBe(true)

    fail = false
    expect(await d.probe()).toEqual({ ok: true })
    expect(d.tripped()).toBe(false)
  })

  /* Проверка соединения — тоже разговор, и разгадку она не несёт. */
  it('запрос проверки не содержит данных сценария', async () => {
    let body = ''
    const fetch: FetchLike = async (_u, init) => {
      body = init?.body ?? ''
      return okReply('ок')
    }
    const d = createDialogue({ config: cfg(), fetch })
    await d.probe()

    for (const s of SCENARIOS) expect(body).not.toContain(s.rootCause)
  })
})

/**
 * Промпт — самое опасное место среза: здесь решается, что модель узнаёт.
 * Проверяем по всем сценариям, а не на одном примере.
 */
describe('промпт', () => {
  it('не содержит корневой причины ни одного сценария', () => {
    const { world: w, tickets } = (() => {
      const loaded = SCENARIOS.map(s => loadScenario(s))
      return {
        world: loaded[0]!.world,
        tickets: loaded.map(l => l.ticket),
      }
    })()

    for (const [i, s] of SCENARIOS.entries()) {
      const b = briefFor(s, tickets[i]!, i === 0 ? w : loadScenario(s).world)
      const text = systemPrompt({
        channel: 'call', withWhom: s.requester, brief: b,
        said: 'Здравствуйте', history: [],
      })
      expect(text).not.toContain(s.rootCause)
      for (const o of s.objectives) expect(text).not.toContain(o.title)
      for (const a of s.asks ?? []) expect(text).not.toContain(a.ask)
    }
  })

  it('запрещает ставить диагноз', () => {
    const text = systemPrompt(req())
    expect(text).toContain('не ставь диагноз')
  })

  it('сообщает состояние проблемы, но не её причину', () => {
    const text = systemPrompt(req())
    expect(text).toContain('ВСЁ ЕЩЁ ЕСТЬ')
    expect(text).not.toContain('lockedOut')
  })

  it('после починки говорит, что проблема ушла', () => {
    const text = systemPrompt({ ...req(), brief: { ...brief, problemGone: true } })
    expect(text).toContain('БОЛЬШЕ НЕ')
  })

  it('коллеге объясняет, что он не заявитель', () => {
    const text = systemPrompt({
      ...req(),
      brief: { ...brief, bystander: true },
    })
    expect(text).toContain('НЕ тот человек')
  })

  it('канал задаёт стиль', () => {
    expect(systemPrompt({ ...req(), channel: 'mail' })).toContain('письмо')
    expect(systemPrompt({ ...req(), channel: 'chat' })).toContain('чат')
  })
})

describe('сборка сообщений', () => {
  it('первым идёт системное сообщение, последним — реплика техника', () => {
    const m = buildMessages(req('Попробуйте войти'))
    expect(m[0]!.role).toBe('system')
    expect(m.at(-1)).toEqual({ role: 'user', content: 'Попробуйте войти' })
  })

  it('история раскладывается по ролям', () => {
    const m = buildMessages({
      ...req('и что теперь?'),
      history: [
        { speaker: 'technician', text: 'Здравствуйте' },
        { speaker: 'requester', text: 'Здравствуйте, не могу войти' },
      ],
    })
    expect(m[1]).toEqual({ role: 'user', content: 'Здравствуйте' })
    expect(m[2]!.role).toBe('assistant')
  })

  it('длинная история обрезается', () => {
    const history: Turn[] = Array.from({ length: 40 }, (_, i) => ({
      speaker: i % 2 === 0 ? 'technician' : 'requester',
      text: `реплика ${i}`,
    }))
    const m = buildMessages({ ...req(), history })
    expect(m.length).toBeLessThanOrEqual(14)
    expect(m.at(-2)!.content).toBe('реплика 39')
  })
})
