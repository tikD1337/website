import type { InjectPatch } from '../world/world'

/**
 * Цель сценария.
 *
 * Структура снята с разбора оригинала: у каждой цели есть заголовок,
 * человекочитаемые шаги, засчитывающие её команды и объяснение «зачем».
 *
 * Ключевое наблюдение: процессные цели — подтвердить у заявителя,
 * написать заметку, выбрать код закрытия — стоят наравне с
 * техническими. Задача, решённая без них, даёт частичный балл.
 */
export interface Objective {
  id: string
  title: string
  steps: string[]
  /** команды, засчитывающие цель; пусто у процессных целей */
  commands: string[]
  /** флаги сессии или поля тикета, которые должны быть заполнены */
  requires: string[]
  why: string
}

export interface ScriptedExchange {
  ask: string
  reply: string
}

/**
 * Персона заявителя.
 *
 * `knows` — единственное, что уходит в промпт модели, когда она
 * подключена. Корневая причина не передаётся никогда: иначе собеседник
 * через три реплики поставит диагноз сам, и тренажёр превратится
 * в подсказчик.
 */
export interface Persona {
  knows: string[]
  doesntKnow: string[]
  canDoIfAsked: string[]
  /** реплики для работы без модели */
  scripted: ScriptedExchange[]
}

export interface Scenario {
  id: string
  category: string
  subcategory: string
  priority: 'P1' | 'P2' | 'P3' | 'P4'
  service: string
  summary: string
  description: string
  requester: string
  device: string
  slaResponseHours: number
  slaResolveHours: number

  /** во что сломан мир */
  inject: InjectPatch[]
  /** объяснение для разбора после закрытия — игроку заранее не показывается */
  rootCause: string
  objectives: Objective[]
  actionsToAvoid: string[]
  persona: Persona

  expectedResolution: 'solved' | 'escalate' | 'not-reproducible' | 'cancelled'
}
