import { scriptedReply } from './scripted'
import { askModel, type FetchLike } from './openai'
import type {
  DialogueConfig, DialoguePort, DialogueReply, DialogueRequest,
} from './types'

/**
 * Разъём диалога с обязательной деградацией.
 *
 * Правило проверки среза: выдернуть сеть и выключить модель — тренировка
 * продолжается. Поэтому любой отказ модели здесь превращается в реплику
 * сценария с плашкой, а не в исключение и не в пустой ответ.
 *
 * Размыкатель. После первого отказа модель помечается недоступной и
 * больше не опрашивается, пока настройки не изменятся. Без него каждая
 * реплика ждала бы таймаут, а браузер копил бы в консоли отказы
 * соединения, которых мы не контролируем. Сброс — в `configure`:
 * техник поправил адрес и вправе ожидать новой попытки.
 */

export interface DialogueDeps {
  config: DialogueConfig
  fetch?: FetchLike
}

export interface Dialogue extends DialoguePort {
  /** Сменить настройки; размыкатель при этом сбрасывается. */
  configure(cfg: DialogueConfig): void
  config(): DialogueConfig
  /** Модель отключена размыкателем после отказа. */
  tripped(): boolean
  /** Проверка соединения из экрана настроек. */
  probe(): Promise<{ ok: boolean; error?: string }>
}

const PROBE: DialogueRequest = {
  channel: 'chat',
  withWhom: 'probe',
  said: 'Здравствуйте',
  history: [],
  brief: {
    displayName: 'Проверка связи',
    dept: '',
    title: '',
    complaint: 'Проверка соединения с моделью.',
    knows: ['это проверка соединения'],
    doesntKnow: [],
    canDoIfAsked: [],
    scripted: [],
    problemGone: true,
    confirmReplies: ['да', 'нет'],
  },
}

export function createDialogue(deps: DialogueDeps): Dialogue {
  let cfg = deps.config
  let broken = false

  /*
    `fetch` берётся из окружения только если его не передали. Ядро само
    глобальные объекты не трогает: в тестах `fetch` инжектируется, а в
    среде без него разъём просто работает на репликах.
  */
  const doFetch: FetchLike | undefined = deps.fetch
    ?? (typeof globalThis.fetch === 'function'
      ? (globalThis.fetch.bind(globalThis) as unknown as FetchLike)
      : undefined)

  const modelEnabled = () => cfg.mode !== 'scripted' && doFetch !== undefined

  return {
    config: () => cfg,

    configure(next) {
      /*
        Новую попытку даёт только изменение самого подключения.

        Сбрасывать размыкатель на любую правку настроек нельзя:
        переключение озвучки идёт тем же путём, и после него каждая
        реплика снова ждала бы таймаут погашенной модели.
      */
      const reconnected = next.mode !== cfg.mode
        || next.baseUrl !== cfg.baseUrl
        || next.model !== cfg.model
        || next.apiKey !== cfg.apiKey

      cfg = next
      if (reconnected) broken = false
    },

    tripped: () => broken,

    async reply(req: DialogueRequest): Promise<DialogueReply> {
      if (!modelEnabled() || broken) {
        const base = scriptedReply(req)
        return broken
          ? { ...base, notice: 'Модель недоступна — отвечают реплики сценария.' }
          : base
      }

      const r = await askModel(req, cfg, doFetch!)
      if (r.ok) return { text: r.text, source: 'model' }

      /*
        Отказ модели не прерывает разговор. Техник видит плашку с
        причиной и продолжает инцидент — тренировка важнее режима.
      */
      broken = true
      return {
        ...scriptedReply(req),
        notice: `${r.error}. Отвечают реплики сценария.`,
      }
    },

    async probe() {
      if (cfg.mode === 'scripted') {
        return { ok: false, error: 'выбран режим реплик сценария — модель не нужна' }
      }
      if (!doFetch) {
        return { ok: false, error: 'в этой среде нет fetch' }
      }

      const r = await askModel(PROBE, cfg, doFetch)
      if (r.ok) {
        // Успешная проверка снимает размыкатель: модель ожила.
        broken = false
        return { ok: true }
      }
      return { ok: false, error: r.error }
    },
  }
}
