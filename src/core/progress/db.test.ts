import { describe, it, expect, afterEach } from 'vitest'
import { loadProgress } from './db'

/**
 * Загрузка обязана завершиться при любом содержимом хранилища.
 *
 * Дефект, ради которого написаны эти тесты, выглядел так: испорченная
 * запись роняла проверку, исключение возникало внутри колбэка
 * `onsuccess`, куда окружающий `try/catch` уже не дотягивался, и
 * промис не разрешался никогда. Снаружи это читалось как вечное
 * «Загружается…» на экранах истории и профиля — весь прогресс
 * терялся из-за одной битой записи.
 *
 * Поэтому проверяется не «правильно ли разобрано», а более простое и
 * более важное: загрузка **завершается**.
 */

/** Подставная IndexedDB, отдающая то, что попросили. */
function fakeIDB(stored: unknown): IDBFactory {
  const request = (result: unknown) => {
    const req: Record<string, unknown> = { result }
    // Колбэк вешают синхронно после вызова — отвечаем следующим тиком.
    queueMicrotask(() => {
      const onsuccess = req['onsuccess'] as (() => void) | null
      if (onsuccess) onsuccess()
    })
    return req
  }

  return {
    open() {
      const db = {
        objectStoreNames: { contains: () => true },
        transaction: () => ({
          objectStore: () => ({ get: () => request(stored) }),
        }),
      }
      return request(db) as unknown as IDBOpenDBRequest
    },
  } as unknown as IDBFactory
}

const original = (globalThis as { indexedDB?: IDBFactory }).indexedDB

afterEach(() => {
  ;(globalThis as { indexedDB?: IDBFactory }).indexedDB = original
})

/** Ждём загрузку, но не дольше разумного: зависание — это тоже провал. */
async function settles(): Promise<unknown> {
  return Promise.race([
    loadProgress(),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('загрузка не завершилась')), 1000)),
  ])
}

describe('чтение испорченного хранилища', () => {
  const cases: Array<[string, unknown]> = [
    ['версия есть, записей нет', { version: 1 }],
    ['записи не массив', { version: 1, records: 'нет' }],
    ['запись — null', { version: 1, records: [null] }],
    ['чужая версия', { version: 99, records: [] }],
    ['вместо объекта строка', 'мусор'],
  ]

  for (const [name, stored] of cases) {
    it(`${name} — загрузка завершается пустым прогрессом`, async () => {
      ;(globalThis as { indexedDB?: IDBFactory }).indexedDB = fakeIDB(stored)
      await expect(settles()).resolves.toEqual({ version: 1, records: [] })
    })
  }

  /*
    Последний рубеж. Даже если проверка когда-нибудь снова начнёт
    бросать — а поводов у неё будет ровно столько же, сколько форм у
    чужих данных, — загрузка обязана завершиться.
  */
  it('исключение внутри колбэка не подвешивает загрузку', async () => {
    const bomb = {}
    Object.defineProperty(bomb, 'version', {
      get() { throw new Error('поле-бомба') },
      enumerable: true,
    })
    ;(globalThis as { indexedDB?: IDBFactory }).indexedDB = fakeIDB(bomb)

    await expect(settles()).resolves.toEqual({ version: 1, records: [] })
  })
})
