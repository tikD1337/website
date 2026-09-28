import type { Progress, TicketRecord } from './types'

export interface ValidationError {
  code: string
  message: string
  record?: TicketRecord
}

/**
 * Проверка прочитанного из хранилища.
 *
 * Принимает `unknown`, и это главное в модуле: прочитанное из
 * IndexedDB не является `Progress` до тех пор, пока не проверено. Его
 * могла записать прошлая версия, повредить прерванное обновление или
 * подменить кто угодно через консоль браузера — типы TypeScript до
 * границы хранилища не достают.
 *
 * **Не бросает исключений ни на какой вход.** Это не вкусовщина:
 * проверка вызывается внутри колбэка запроса IndexedDB, куда внешний
 * `try/catch` не дотягивается. Брошенное отсюда исключение оставляло
 * промис загрузки неразрешённым навсегда, и экраны истории и профиля
 * навсегда застревали в «Загружается…» — из-за одной испорченной
 * записи терялся весь прогресс.
 */
export function validateProgress(raw: unknown): ValidationError[] {
  const errors: ValidationError[] = []

  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return [{ code: 'bad_shape', message: 'прочитано не похоже на прогресс' }]
  }

  const progress = raw as { version?: unknown; records?: unknown; kb?: unknown }

  if (progress.version !== 1) {
    errors.push({
      code: 'bad_version',
      message: `неподдерживаемая версия хранилища: ${String(progress.version)}`,
    })
    return errors
  }

  if (!Array.isArray(progress.records)) {
    return [{ code: 'bad_records', message: 'список прохождений не массив' }]
  }

  for (const entry of progress.records) {
    if (typeof entry !== 'object' || entry === null) {
      errors.push({ code: 'bad_record', message: 'запись не объект' })
      continue
    }
    const r = entry as TicketRecord

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

  /*
    База знаний (срез 6В). Её отсутствие — прошлый формат, а не порча:
    `normalizeProgress` достроит пустой список. Присутствие — проверяется
    так же строго, как история.
  */
  if (progress.kb !== undefined) {
    if (!Array.isArray(progress.kb)) {
      errors.push({ code: 'bad_kb', message: 'база знаний не массив' })
    } else {
      for (const entry of progress.kb) {
        if (!isArticle(entry)) errors.push({ code: 'bad_article', message: 'испорченная статья базы знаний' })
      }
    }
  }

  return errors
}

const KB_TYPES = ['sop', 'runbook', 'network', 'ad', 'known-issue', 'vendor', 'diagnostics']
const KB_STATUSES = ['draft', 'published', 'retired']

const isString = (v: unknown): v is string => typeof v === 'string'

/*
  Статья проверяется до последнего поля, которое читает интерфейс:
  «массив» без проверки элементов пропускал `sources: [{}]` и
  `history: [null]`, и «Документация» падала на рендере.
*/
function isVersion(raw: unknown): boolean {
  if (typeof raw !== 'object' || raw === null) return false
  const v = raw as Record<string, unknown>
  return typeof v['version'] === 'number'
    && isString(v['at']) && isString(v['title']) && isString(v['body'])
    && KB_TYPES.includes(v['type'] as string)
}

function isArticle(raw: unknown): boolean {
  if (typeof raw !== 'object' || raw === null) return false
  const a = raw as Record<string, unknown>
  return isString(a['id']) && a['id'] !== ''
    && isString(a['scenarioId']) && a['scenarioId'] !== ''
    && isString(a['title']) && a['title'] !== ''
    && isString(a['body'])
    && KB_TYPES.includes(a['type'] as string)
    && KB_STATUSES.includes(a['status'] as string)
    && typeof a['version'] === 'number' && a['version'] >= 1
    && isString(a['category']) && isString(a['subcategory'])
    && isString(a['resolutionCode']) && a['resolutionCode'] !== ''
    && isString(a['createdAt']) && isString(a['updatedAt'])
    && Array.isArray(a['sources']) && a['sources'].every(isString)
    && Array.isArray(a['history']) && a['history'].every(isVersion)
}

/** Проверенный прогресс прошлого формата получает пустую базу знаний. */
export function normalizeProgress(p: Progress): Progress {
  return { ...p, kb: Array.isArray(p.kb) ? p.kb : [] }
}

