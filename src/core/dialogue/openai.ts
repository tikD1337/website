import { buildMessages } from './prompt'
import type { DialogueConfig, DialogueRequest } from './types'

/**
 * Клиент OpenAI-совместимого эндпоинта.
 *
 * Один на оба случая из требований: Ollama отдаёт совместимый
 * `/v1/chat/completions`, поэтому локальная модель и чужой API
 * отличаются только конфигурацией. Второго клиента не будет.
 *
 * `fetch` инжектируется, как и часы в остальном ядре: ядро не трогает
 * глобальные объекты, а тесты не трогают сеть.
 *
 * Наружу ничего не бросается. Любой отказ — сетевой, таймаут, мусор в
 * ответе, пустые `choices` — возвращается как `{ ok: false, error }`.
 * Разговор обязан продолжаться на репликах сценария; исключение,
 * дошедшее до интерфейса, обрушило бы инструмент посреди инцидента.
 */

export type FetchLike = (
  input: string,
  init?: {
    method?: string
    headers?: Record<string, string>
    body?: string
    signal?: AbortSignal
  },
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>

export type ModelResult =
  | { ok: true; text: string }
  | { ok: false; error: string }

interface ChatChoice {
  message?: { content?: unknown }
}

/** Достаёт текст из ответа, не доверяя его форме. */
function textFrom(data: unknown): string | null {
  if (typeof data !== 'object' || data === null) return null

  const choices = (data as { choices?: unknown }).choices
  if (!Array.isArray(choices) || choices.length === 0) return null

  const content = (choices[0] as ChatChoice)?.message?.content
  if (typeof content !== 'string') return null

  const text = content.trim()
  return text.length > 0 ? text : null
}

export async function askModel(
  req: DialogueRequest,
  cfg: DialogueConfig,
  doFetch: FetchLike,
): Promise<ModelResult> {
  const url = `${cfg.baseUrl.replace(/\/+$/, '')}/chat/completions`

  /*
    Таймаут обязателен: локальная модель на слабой машине думает
    минутами, и техник в это время смотрит в пустой экран. Лучше
    откатиться на реплики, чем висеть.
  */
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), cfg.timeoutMs)

  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    // Ollama ключа не требует; чужой эндпоинт требует. Один и тот же код.
    if (cfg.apiKey) headers['Authorization'] = `Bearer ${cfg.apiKey}`

    const res = await doFetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: cfg.model,
        messages: buildMessages(req),
        // Заявитель говорит коротко; длинный ответ — признак того, что
        // модель начала рассуждать вместо того, чтобы отвечать.
        max_tokens: 160,
        temperature: 0.7,
        stream: false,
      }),
      signal: ctl.signal,
    })

    if (!res.ok) {
      return { ok: false, error: `модель ответила кодом ${res.status}` }
    }

    const text = textFrom(await res.json())
    if (text === null) return { ok: false, error: 'модель вернула пустой ответ' }

    return { ok: true, text }
  } catch (e) {
    const name = (e as { name?: string } | null)?.name
    if (name === 'AbortError') {
      return { ok: false, error: `модель не ответила за ${cfg.timeoutMs} мс` }
    }
    return { ok: false, error: 'модель недоступна' }
  } finally {
    clearTimeout(timer)
  }
}
