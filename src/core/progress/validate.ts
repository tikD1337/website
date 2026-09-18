import type { Progress, TicketRecord } from './types'

export interface ValidationError {
  code: string
  message: string
  record?: TicketRecord
}

export function validateProgress(progress: Progress): ValidationError[] {
  const errors: ValidationError[] = []

  if (progress.version !== 1) {
    errors.push({
      code: 'bad_version',
      message: `неподдерживаемая версия хранилища: ${progress.version}`,
    })
    return errors
  }

  for (const r of progress.records) {
    if (!r.id) errors.push({ code: 'missing_id', message: 'запись без id', record: r })
    if (!r.shiftId) errors.push({ code: 'missing_shiftId', message: 'запись без shiftId', record: r })
    if (!r.at) errors.push({ code: 'missing_at', message: 'запись без даты', record: r })
    if (!r.weekKey) errors.push({ code: 'missing_weekKey', message: 'запись без weekKey', record: r })
    if (!r.number) errors.push({ code: 'missing_number', message: 'запись без номера тикета', record: r })
    if (!r.scenarioId) errors.push({ code: 'missing_scenarioId', message: 'запись без scenarioId', record: r })
    if (!r.resolutionCode) errors.push({ code: 'missing_resolutionCode', message: 'запись без кода закрытия', record: r })

    if (!r.card || typeof r.card !== 'object') {
      errors.push({ code: 'bad_card', message: 'запись без карточки', record: r })
    } else {
      const c = r.card
      if (typeof c.points !== 'number') errors.push({ code: 'bad_points', message: 'карточка без очков', record: r })
      if (!Array.isArray(c.dimensions)) errors.push({ code: 'bad_dimensions', message: 'карточка без измерений', record: r })
      if (!Array.isArray(c.silentFaults)) errors.push({ code: 'bad_silentFaults', message: 'карточка без silentFaults', record: r })
    }

    // Детерминированный id
    const expectedId = `${r.shiftId}:${r.number}`
    if (r.id !== expectedId) {
      errors.push({ code: 'bad_id', message: `id ${r.id} не соответствует shiftId:${r.number}`, record: r })
    }
  }

  return errors
}
