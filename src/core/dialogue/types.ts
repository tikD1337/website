/**
 * Разъём диалога.
 *
 * Собеседник в тренажёре бывает трёх сортов: реплики сценария, локальная
 * модель, свой эндпоинт. Для всего остального кода это одно и то же —
 * функция, которой дают реплику техника и которая возвращает ответ.
 *
 * Интерфейс асинхронный с самого начала, хотя реализация «сценарий»
 * отвечает мгновенно. Иначе подключение модели пришлось бы проводить
 * через все места вызова, а их к концу среза десяток.
 */

import type { DialogueChannel } from '../session/types'

/** Одна реплика в истории разговора. */
export interface Turn {
  speaker: 'technician' | 'requester'
  text: string
}

/**
 * Что собеседник знает о себе и о своей проблеме.
 *
 * Это **единственное**, что уходит в промпт модели. Корневая причина,
 * цели сценария, тексты просьб и ловушки сюда не попадают никогда:
 * модель, знающая разгадку, выдаёт диагноз через три реплики, и
 * тренажёр превращается в подсказчик.
 *
 * Собирается в `brief.ts`, проверяется тестом на утечку по всем
 * сценариям библиотеки.
 */
export interface PersonaBrief {
  displayName: string
  dept: string
  title: string
  /** обращение словами самого заявителя — текст тикета */
  complaint: string
  knows: string[]
  doesntKnow: string[]
  canDoIfAsked: string[]
  /** заготовленные пары «вопрос — ответ» для работы без модели */
  scripted: Array<{ ask: string; reply: string }>
  /**
   * Проблема ушла с точки зрения заявителя.
   *
   * Вычислено по `fixedWhen` сценария — заявитель судит по своей
   * проблеме, а не по состоянию мира вообще. Модели передаётся тоже:
   * без этого она подтверждала бы починку, которой не было, или
   * жаловалась на решённое.
   */
  problemGone: boolean
  /** что сказать про результат: [когда заработало, когда нет] */
  confirmReplies: [string, string]
  /**
   * Собеседник — не заявитель по тикету, а коллега из справочника.
   *
   * Диалер показывает весь каталог, значит позвонить можно любому.
   * Коллега отвечает по своей карточке и про чужую проблему ничего
   * не знает — и не должен делать вид, что знает.
   */
  bystander?: boolean
}

export interface DialogueRequest {
  channel: DialogueChannel
  /** samAccountName собеседника */
  withWhom: string
  brief: PersonaBrief
  /** что сказал техник */
  said: string
  /** предыдущие реплики, старые первыми */
  history: Turn[]
}

/**
 * Ответ собеседника.
 *
 * `source` лежит в ответе, а не в конфигурации, потому что меняется на
 * ходу: модель отвалилась посреди разговора — реплика пришла от
 * сценария, и интерфейс обязан показать это плашкой, а не делать вид,
 * что ничего не произошло.
 */
export interface DialogueReply {
  text: string
  source: 'scripted' | 'model'
  /** почему источник не тот, который выбран в настройках */
  notice?: string
}

export interface DialoguePort {
  reply(req: DialogueRequest): Promise<DialogueReply>
}

/** Режим работы разъёма — то, что переключается в настройках. */
export type DialogueMode = 'scripted' | 'local' | 'endpoint'

export interface DialogueConfig {
  mode: DialogueMode
  /** адрес OpenAI-совместимого эндпоинта */
  baseUrl: string
  model: string
  /**
   * Ключ.
   *
   * Живёт только в памяти страницы и не сохраняется никуда: штатный
   * способ — прокси dev-сервера, который подставляет ключ из локального
   * конфига вне репозитория.
   */
  apiKey: string
  timeoutMs: number
  /** озвучивать ответы собеседника */
  speak: boolean
}

export const LOCAL_MODEL_URL = 'http://localhost:11434/v1'
export const PROXY_URL = '/api/llm'

export function defaultConfig(): DialogueConfig {
  return {
    mode: 'scripted',
    baseUrl: LOCAL_MODEL_URL,
    model: 'llama3.1:8b',
    apiKey: '',
    timeoutMs: 20_000,
    speak: false,
  }
}
