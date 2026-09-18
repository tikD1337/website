import type { Progress } from './types'
import { validateProgress } from './validate'
import { emptyProgress } from './types'

/**
 * Проводка прогресса к IndexedDB.
 *
 * Образец — `core/dialogue/store.ts`: браузерное хранилище трогается
 * здесь, на границе ядра, и проверка доступности идёт записью, а не
 * наличием объекта. В приватном окне и в тестах (node) хранилища нет —
 * игра продолжается, прогресс живёт в памяти до перезагрузки.
 *
 * Разбор прочитанного — в `validate.ts`, чистая функция; здесь только
 * проводка. История растёт без границы, поэтому `localStorage` с его
 * пятью мегабайтами не подходит: сто прохождений — и конец.
 */

const KEY = 'helpdesk.progress.v1'

function factory(): IDBFactory | null {
  try {
    if (typeof indexedDB === 'undefined') return null
    return indexedDB
  } catch {
    return null
  }
}

function openDB(): Promise<IDBDatabase | null> {
  const f = factory()
  if (!f) return Promise.resolve(null)

  return new Promise((resolve) => {
    try {
      const req = f.open(KEY, 1)
      req.onupgradeneeded = () => {
        const db = req.result
        if (!db.objectStoreNames.contains('progress')) {
          db.createObjectStore('progress', { keyPath: 'id' })
        }
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
}

export async function loadProgress(): Promise<Progress> {
  const db = await openDB()
  if (!db) return emptyProgress()

  return new Promise((resolve) => {
    try {
      const tx = db.transaction('progress', 'readonly')
      const store = tx.objectStore('progress')
      const req = store.get('current')
      req.onsuccess = () => {
        const raw = req.result as Progress | undefined
        if (!raw) {
          resolve(emptyProgress())
          return
        }
        const errors = validateProgress(raw)
        // Мусор в хранилище — сбрасываем молча, как в dialogue.
        resolve(errors.length === 0 ? raw : emptyProgress())
      }
      req.onerror = () => resolve(emptyProgress())
    } catch {
      resolve(emptyProgress())
    }
  })
}

export async function saveProgress(progress: Progress): Promise<void> {
  const db = await openDB()
  if (!db) return

  // Не пишем мусор: проверка перед записью, а не после.
  if (validateProgress(progress).length > 0) return

  return new Promise((resolve) => {
    try {
      const tx = db.transaction('progress', 'readwrite')
      const store = tx.objectStore('progress')
      store.put({ ...progress, id: 'current' })
      tx.oncomplete = () => resolve()
      tx.onerror = () => resolve()
    } catch {
      resolve()
    }
  })
}

export async function clearProgress(): Promise<void> {
  const db = await openDB()
  if (!db) return

  return new Promise((resolve) => {
    try {
      const tx = db.transaction('progress', 'readwrite')
      const store = tx.objectStore('progress')
      store.delete('current')
      tx.oncomplete = () => resolve()
      tx.onerror = () => resolve()
    } catch {
      resolve()
    }
  })
}
