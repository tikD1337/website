import { useState, useEffect } from 'react'
import { useGame } from '../store/useGame'
import { searchKb } from '../core/kb/search'
import { TYPE_LABEL, STATUS_LABEL, type KbStatus, type KbType } from '../core/kb/types'
import { formatDateTime } from './dates'
import { VERDICT } from './verdict'

/**
 * Документация — база знаний.
 *
 * Статьи не пишутся здесь с нуля: их приносят закрытые тикеты. Техник
 * правит черновик (каждое сохранение — версия), публикует и убирает в
 * архив. Пустая база объясняет себя — иначе пустой экран читался бы как
 * поломка.
 */

const TYPES = Object.keys(TYPE_LABEL) as KbType[]
const STATUSES = Object.keys(STATUS_LABEL) as KbStatus[]

export function KnowledgeView() {
  const kb = useGame(s => s.progress.kb)
  const records = useGame(s => s.progress.records)
  const openId = useGame(s => s.kbOpen)
  const open = useGame(s => s.openArticle)
  const edit = useGame(s => s.editArticle)
  const setStatus = useGame(s => s.setArticleStatus)

  const [query, setQuery] = useState('')
  const [type, setType] = useState<KbType | ''>('')
  const [status, setStatusFilter] = useState<KbStatus | ''>('')
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState({ title: '', type: 'sop' as KbType, body: '' })
  const [message, setMessage] = useState<{ text: string; bad: boolean } | null>(null)

  const article = kb.find(a => a.id === openId)
  useEffect(() => { setEditing(false); setMessage(null) }, [openId])

  const rows = searchKb(kb, { query, ...(type ? { type } : {}), ...(status ? { status } : {}) })

  function startEdit() {
    if (!article) return
    setDraft({ title: article.title, type: article.type, body: article.body })
    setEditing(true)
    setMessage(null)
  }

  function save() {
    if (!article) return
    const r = edit(article.id, draft)
    if (!r.ok) { setMessage({ text: r.error, bad: true }); return }
    setEditing(false)
    setMessage({ text: r.article.version === article.version ? 'Изменений нет.' : `Сохранено: версия ${r.article.version}.`, bad: false })
  }

  function move(to: KbStatus) {
    if (!article) return
    const r = setStatus(article.id, to)
    setMessage(r.ok ? { text: `Статус: ${STATUS_LABEL[to].toLowerCase()}.`, bad: false } : { text: r.error, bad: true })
  }

  /*
    Источник статьи — прохождение. Номер тикета выводится из сценария и
    у повторов одинаков: без даты и вердикта два источника читались на
    снимке как дубль одной строки.
  */
  const sourceText = (id: string) => {
    const r = records.find(x => x.id === id)
    return r ? `${r.number}, ${formatDateTime(r.at)}, ${VERDICT[r.card.verdict].toLowerCase()}` : id
  }

  return (
    <>
      <div className="head">
        <h1>Документация</h1>
        <p>База знаний из ваших закрытых тикетов: заметка о решении становится черновиком статьи.</p>
      </div>

      {kb.length === 0 ? (
        <p className="prose">
          Статей пока нет. Они появятся из закрытых тикетов: заметка о решении станет черновиком,
          который можно поправить и опубликовать.
        </p>
      ) : (
        <>
          <div className="bar">
            <input
              type="text"
              aria-label="Поиск по базе знаний"
              placeholder="Поиск по заголовку и тексту"
              value={query}
              onChange={e => setQuery(e.target.value)}
            />
            <select aria-label="Тип статьи" value={type} onChange={e => setType(e.target.value as KbType | '')}>
              <option value="">Все типы</option>
              {TYPES.map(t => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
            </select>
            <select aria-label="Статус статьи" value={status} onChange={e => setStatusFilter(e.target.value as KbStatus | '')}>
              <option value="">Все статусы</option>
              {STATUSES.map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
            </select>
          </div>

          <table className="kb-list">
            <thead>
              <tr><th>Номер</th><th>Заголовок</th><th>Тип</th><th>Статус</th><th>Версия</th><th>Источников</th></tr>
            </thead>
            <tbody>
              {rows.map(a => (
                <tr key={a.id} className={openId === a.id ? 'row sel' : 'row'} onClick={() => open(a.id)}>
                  <td className="data">{a.id}</td>
                  <td>{a.title}</td>
                  <td>{TYPE_LABEL[a.type]}</td>
                  <td>{STATUS_LABEL[a.status]}</td>
                  <td className="data">{a.version}</td>
                  <td className="data">{a.sources.length}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && <p className="sub" style={{ marginTop: 10 }}>Ничего не нашлось.</p>}
        </>
      )}

      {article && (
        <div className="section">
          {!editing ? (
            <>
              <h2>{article.title}</h2>
              <dl className="kv">
                <dt>Номер</dt><dd className="data">{article.id}</dd>
                <dt>Тип</dt><dd>{TYPE_LABEL[article.type]}</dd>
                <dt>Статус</dt><dd>{STATUS_LABEL[article.status]}</dd>
                <dt>Версия</dt><dd className="data">{article.version}, {formatDateTime(article.updatedAt)}</dd>
                <dt>Категория</dt><dd>{article.category} › {article.subcategory}</dd>
                <dt>Из тикетов</dt><dd>{article.sources.map(id => <div key={id}>{sourceText(id)}</div>)}</dd>
              </dl>
              <p className="prose kb-body">{article.body}</p>

              <div className="bar">
                <button className="act" type="button" onClick={startEdit}>Править</button>
                {article.status !== 'published' && (
                  <button className="act" type="button" onClick={() => move('published')}>
                    {article.status === 'retired' ? 'Вернуть из архива' : 'Опубликовать'}
                  </button>
                )}
                {article.status === 'published' && (
                  <button className="act" type="button" onClick={() => move('retired')}>В архив</button>
                )}
              </div>
            </>
          ) : (
            <>
              <h2>Правка {article.id}</h2>
              <div className="bar">
                <input
                  type="text"
                  aria-label="Заголовок статьи"
                  className="kb-title"
                  value={draft.title}
                  onChange={e => setDraft({ ...draft, title: e.target.value })}
                />
                <select aria-label="Тип статьи при правке" value={draft.type} onChange={e => setDraft({ ...draft, type: e.target.value as KbType })}>
                  {TYPES.map(t => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
                </select>
              </div>
              <textarea
                aria-label="Текст статьи"
                value={draft.body}
                onChange={e => setDraft({ ...draft, body: e.target.value })}
              />
              <div className="bar">
                <button className="act primary" type="button" onClick={save}>Сохранить</button>
                <button className="act" type="button" onClick={() => setEditing(false)}>Отмена</button>
              </div>
            </>
          )}

          {message && <p className={message.bad ? 'deny' : 'sub'}>{message.text}</p>}

          {article.history.length > 0 && (
            <div className="kb-history">
              <h3>Прежние версии</h3>
              {[...article.history].reverse().map(v => (
                <details key={v.version}>
                  <summary>Версия {v.version}, {formatDateTime(v.at)}: {v.title}</summary>
                  <p className="prose kb-body">{v.body}</p>
                </details>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  )
}
