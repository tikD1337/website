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

const KEY = 'helpdesk.dialogue.v1'

describe('настройки модели', () => {
  /*
    Значения намеренно отличаются от умолчаний по каждому полю: иначе
    тест не отличает «загрузили сохранённое» от «вернули умолчание».
    Ключ — не сохраняется: секрет в localStorage переживает закрытие
    браузера и уезжает в бэкапы профиля; штатный путь — прокси
    dev-сервера с ключом из файла вне репозитория.
  */
  it('режим, адрес, модель и озвучка переживают перезагрузку, а ключ — нет', () => {
    expect('gemma2:9b').not.toBe(defaultConfig().model)
    saveConfig({
      ...defaultConfig(), mode: 'endpoint', baseUrl: '/api/llm', model: 'gemma2:9b',
      speak: true, apiKey: 'sk-секрет-123',
    })

    expect(loadConfig()).toMatchObject({
      mode: 'endpoint', baseUrl: '/api/llm', model: 'gemma2:9b', speak: true, apiKey: '',
    })
    expect([...fake.data.values()].join(' ')).not.toContain('sk-секрет-123')
  })

  it('мусор в хранилище даёт умолчания по каждому испорченному полю', () => {
    expect(loadConfig()).toEqual(defaultConfig())

    fake.data.set(KEY, '{это не json')
    expect(loadConfig()).toEqual(defaultConfig())

    fake.data.set(KEY, JSON.stringify({ mode: 'телепатия', baseUrl: '', model: 42, speak: 'да' }))
    expect(loadConfig()).toEqual(defaultConfig())
  })

  /* Приватное окно и переполненное хранилище — штатные состояния. */
  it('недоступное или запрещённое хранилище не бросает и даёт умолчания', () => {
    install({ data: new Map(), throwOnWrite: true })
    expect(() => saveConfig(defaultConfig())).not.toThrow()
    expect(loadConfig()).toEqual(defaultConfig())

    install(null)
    expect(() => saveConfig(defaultConfig())).not.toThrow()
    expect(loadConfig()).toEqual(defaultConfig())
  })
})
