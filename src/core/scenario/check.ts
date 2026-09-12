import { getPath } from '../world/path'
import type { SilentFaultCheck } from './types'

/**
 * Проверка условия сценария.
 *
 * Одна семантика для двух вопросов: «заявитель считает, что
 * заработало» (`fixedWhen`) и «техник оставил после себя поломку»
 * (`silentFaultChecks`). Раньше вычисление было продублировано в сторе
 * и в оценке — две копии разошлись бы на первом новом предикате.
 */

/** Выполнено ли условие в этом мире. */
export function checkHolds(world: unknown, check: SilentFaultCheck): boolean {
  if (check.anyOf) return check.anyOf.some(c => checkHolds(world, c))

  const value = getPath(world, check.path)

  /*
    Нерабочий путь — опечатка, и молчать о ней нельзя.

    `undefined !== null` истинно, поэтому опечатка в проверке на тихую
    поломку срабатывала на любом прохождении, включая безупречное:
    вердикт fail без всякой вины техника. Зеркально с `equals` —
    сценарий становился непроходимым, заявитель не подтверждал
    никогда. Ни одно осмысленное условие не ждёт `undefined`, поэтому
    различать «нет пути» и «значение undefined» не нужно.
  */
  if (value === undefined) {
    throw new Error(`условие ссылается на несуществующий путь: ${check.path}`)
  }

  if ('equals' in check) return value === check.equals
  if ('notEquals' in check) return value !== check.notEquals
  if ('contains' in check) {
    return Array.isArray(value) && value.includes(check.contains)
  }

  /*
    Условие без предиката — опечатка в сценарии. Молчаливое «не
    выполнено» сделало бы сценарий нерешаемым без всякого следа,
    поэтому падаем громко, как и `setPath` на неверном пути.
  */
  throw new Error(`условие без предиката: ${check.path}`)
}

export function allHold(world: unknown, checks: SilentFaultCheck[]): boolean {
  return checks.every(c => checkHolds(world, c))
}
