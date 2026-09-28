import { STATUS_LABEL, type KbArticle, type KbStatus, type KbType } from './types'

export type KbResult = { ok: true; article: KbArticle } | { ok: false; error: string }

/**
 * Правка статьи — новая версия.
 *
 * Прежняя версия уходит в историю целиком: заголовок, тип, текст. Правка
 * без изменений возвращает ту же статью — «Сохранить», нажатое дважды,
 * не раздувает историю пустыми версиями.
 */
export function editArticle(
  a: KbArticle, patch: { title?: string; type?: KbType; body?: string }, at: string,
): KbResult {
  const title = (patch.title ?? a.title).trim()
  const body = (patch.body ?? a.body).trim()
  const type = patch.type ?? a.type
  if (!title) return { ok: false, error: 'у статьи должен быть заголовок' }
  if (!body) return { ok: false, error: 'у статьи должен быть текст' }
  if (title === a.title && body === a.body && type === a.type) return { ok: true, article: a }

  return {
    ok: true,
    article: {
      ...a, title, body, type, version: a.version + 1, updatedAt: at,
      history: [...a.history, { version: a.version, at: a.updatedAt, title: a.title, type: a.type, body: a.body }],
    },
  }
}

/** Разрешённые переходы: черновик → опубликована → в архиве → опубликована. */
const ALLOWED: Record<KbStatus, KbStatus[]> = {
  draft: ['published'],
  published: ['retired'],
  retired: ['published'],
}

/** Статус — не версия: текст не меняется, `version` остаётся прежней. */
export function setStatus(a: KbArticle, to: KbStatus, at: string): KbResult {
  if (!ALLOWED[a.status].includes(to)) {
    return { ok: false, error: `нельзя: «${STATUS_LABEL[a.status]}» → «${STATUS_LABEL[to]}»` }
  }
  if (to === 'published' && !a.body.trim()) return { ok: false, error: 'нельзя опубликовать пустую статью' }
  return { ok: true, article: { ...a, status: to, updatedAt: at } }
}
