import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { loadConfig, saveConfig } from './store'
import { defaultConfig } from './types'

/**
 * Хранилище настроек. Главное требование — **ключ не сохраняется**:
 * секрет в localStorage переживает закрытие браузера и уезжает в
 * бэкапы профиля, а штатный способ — прокси с локальным конфигом.
 */

interface FakeStore {
  data: Map<string, string>
  throwOnWrite?: boolean
}

function install(fake: FakeStore | null) {
  const g = globalThis as unknown as { localStorage?: unknown }

  if (!fake) {
    delete g.localStorage
    return
  }

  g.localStorage = {
    getItem: (k: string) => fake.data.get(k) ?? null,
    setItem: (k: string, v: string) => {
      if (fake.throwOnWrite) throw new Error('QuotaExceeded')
      fake.data.set(k, v)
    },
    removeItem: (k: string) => { fake.data.delete(k) },
    clear: () => fake.data.clear(),
    key: () => null,
    length: 0,
  }
}

let fake: FakeStore

beforeEach(() => {
  fake = { data: new Map() }
  install(fake)
})

afterEach(() => install(null))

describe('настройки переживают перезагрузку', () => {
  /*
    Значения намеренно отличаются от умолчаний по каждому полю: иначе
    тест не отличает «загрузили сохранённое» от «вернули умолчание» и
    проходит даже со сломанной загрузкой.
  */
  it('режим, адрес и модель сохраняются', () => {
    const other = 'gemma2:9b'
    expect(other).not.toBe(defaultConfig().model)

    saveConfig({
      ...defaultConfig(),
      mode: 'endpoint',
      baseUrl: '/api/llm',
      model: other,
    })

    const loaded = loadConfig()
    expect(loaded.mode).toBe('endpoint')
    expect(loaded.baseUrl).toBe('/api/llm')
    expect(loaded.model).toBe(other)
  })

  it('выбор озвучки сохраняется', () => {
    saveConfig({ ...defaultConfig(), speak: true })
    expect(loadConfig().speak).toBe(true)
  })

  /*
    Ключ в localStorage переживает закрытие браузера и уезжает в
    бэкапы профиля. Штатный способ — прокси dev-сервера, который берёт
    ключ из файла вне репозитория.
  */
  it('ключ не сохраняется', () => {
    saveConfig({ ...defaultConfig(), mode: 'endpoint', apiKey: 'sk-секрет-123' })

    const raw = [...fake.data.values()].join(' ')
    expect(raw).not.toContain('sk-секрет-123')
    expect(loadConfig().apiKey).toBe('')
  })
})

describe('стойкость к мусору в хранилище', () => {
  it('пустое хранилище даёт настройки по умолчанию', () => {
    expect(loadConfig()).toEqual(defaultConfig())
  })

  it('неразборный JSON не валит загрузку', () => {
    fake.data.set('helpdesk.dialogue.v1', '{это не json')
    expect(loadConfig()).toEqual(defaultConfig())
  })

  it('неизвестный режим отбрасывается', () => {
    fake.data.set('helpdesk.dialogue.v1', JSON.stringify({ mode: 'телепатия' }))
    expect(loadConfig().mode).toBe('scripted')
  })

  it('пустой адрес заменяется значением по умолчанию', () => {
    fake.data.set('helpdesk.dialogue.v1', JSON.stringify({ baseUrl: '' }))
    expect(loadConfig().baseUrl).toBe(defaultConfig().baseUrl)
  })

  it('поле неверного типа отбрасывается', () => {
    fake.data.set('helpdesk.dialogue.v1', JSON.stringify({ model: 42, speak: 'да' }))
    const loaded = loadConfig()
    expect(loaded.model).toBe(defaultConfig().model)
    expect(loaded.speak).toBe(false)
  })
})

describe('недоступное хранилище', () => {
  it('без localStorage загрузка даёт значения по умолчанию', () => {
    install(null)
    expect(loadConfig()).toEqual(defaultConfig())
  })

  it('без localStorage запись не бросает', () => {
    install(null)
    expect(() => saveConfig(defaultConfig())).not.toThrow()
  })

  /* Приватное окно и переполненное хранилище — штатные состояния. */
  it('запрещённая запись не бросает', () => {
    install({ data: new Map(), throwOnWrite: true })
    expect(() => saveConfig(defaultConfig())).not.toThrow()
  })

  it('запрещённая запись не мешает загрузке', () => {
    install({ data: new Map(), throwOnWrite: true })
    expect(loadConfig()).toEqual(defaultConfig())
  })
})
