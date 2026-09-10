import { setPath } from './path'
import { seedWorld } from './seed'
import type { WorldState } from './types'

/** Один патч состояния мира: «что» и «во что». */
export interface InjectPatch {
  path: string
  value: unknown
}

/** Свежий исправный мир. */
export function createWorld(): WorldState {
  return seedWorld()
}

/** Глубокая копия — нужна, чтобы откатить прохождение без перезагрузки. */
export function cloneWorld(w: WorldState): WorldState {
  return structuredClone(w)
}

/**
 * Применяет инъекцию сценария: ломает мир по списку путей.
 *
 * Порядок патчей значения не имеет — каждый адресуется независимо.
 * Ошибка в пути бросает исключение (см. `setPath`), поэтому опечатка
 * в сценарии обнаруживается сразу, а не превращается в поломку,
 * которую игрок никогда не найдёт.
 */
export function applyInject(w: WorldState, patches: InjectPatch[]): void {
  for (const p of patches) setPath(w, p.path, p.value)
}
