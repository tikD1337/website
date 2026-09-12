import { defaultConfig, type DialogueConfig, type DialogueMode } from './types'

/**
 * Сохранение настроек собеседника.
 *
 * Режим, адрес и модель переживают перезагрузку — иначе каждый запуск
 * начинался бы с ввода адреса Ollama заново. **Ключ не сохраняется
 * никогда**: он живёт в памяти страницы до закрытия вкладки, и штатный
 * способ — прокси dev-сервера, который читает ключ из локального файла
 * вне репозитория.
 *
 * Это единственное место во всём проекте, которое трогает
 * `localStorage`, и лежит оно на границе ядра сознательно: `WorldState`
 * и журнал сессии в браузерное хранилище не попадают — прогресс придёт
 * в срезе 5 и будет отдельным решением.
 */

const KEY = 'helpdesk.dialogue.v1'

const MODES: DialogueMode[] = ['scripted', 'local', 'endpoint']

/** Доступно ли хранилище: в приватном окне и в тестах — нет. */
function storage(): Storage | null {
  try {
    if (typeof localStorage === 'undefined') return null
    // Проверка записью: в приватном режиме обращение бросает.
    localStorage.setItem(`${KEY}.probe`, '1')
    localStorage.removeItem(`${KEY}.probe`)
    return localStorage
  } catch {
    return null
  }
}

export function loadConfig(): DialogueConfig {
  const base = defaultConfig()
  const s = storage()
  if (!s) return base

  try {
    const raw = s.getItem(KEY)
    if (!raw) return base

    const saved = JSON.parse(raw) as Partial<DialogueConfig>

    /*
      Каждое поле проверяется по отдельности: в хранилище мог остаться
      мусор от прежней версии или от чужой правки, и падать при старте
      из-за этого нельзя.
    */
    return {
      ...base,
      mode: MODES.includes(saved.mode as DialogueMode)
        ? saved.mode as DialogueMode
        : base.mode,
      baseUrl: typeof saved.baseUrl === 'string' && saved.baseUrl
        ? saved.baseUrl
        : base.baseUrl,
      model: typeof saved.model === 'string' && saved.model
        ? saved.model
        : base.model,
      speak: typeof saved.speak === 'boolean' ? saved.speak : base.speak,
      // Ключ не восстанавливается: его там и не было.
      apiKey: '',
    }
  } catch {
    return base
  }
}

export function saveConfig(cfg: DialogueConfig): void {
  const s = storage()
  if (!s) return

  try {
    // Ключ намеренно не попадает в запись.
    s.setItem(KEY, JSON.stringify({
      mode: cfg.mode,
      baseUrl: cfg.baseUrl,
      model: cfg.model,
      speak: cfg.speak,
    }))
  } catch {
    /*
      Молча. Переполненное или запрещённое хранилище — не повод рушить
      настройку: она продолжит работать до закрытия вкладки.
    */
  }
}
