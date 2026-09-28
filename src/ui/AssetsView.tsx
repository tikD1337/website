import { useState } from 'react'
import { useGame } from '../store/useGame'
import { KIND_LABEL, LIFECYCLE_LABEL, warrantyActive } from '../core/world/assets'
import { SHIPMENT_TYPES } from '../core/logistics/types'
import type { Asset } from '../core/world/types'

/**
 * Активы — учёт оборудования.
 *
 * Только чтение: запись учёта — факт, и меняют её операции логистики, а
 * не рука техника. Открытая карточка засчитывается как проверка — ради
 * неё сюда и приходят: чьё это, где стоит, на гарантии ли.
 */

type Filter = 'all' | 'computers' | 'peripherals' | 'network' | 'stock'

const FILTERS: Array<{ id: Filter; label: string; test: (a: Asset) => boolean }> = [
  { id: 'all', label: 'Все', test: () => true },
  { id: 'computers', label: 'Компьютеры', test: a => a.kind === 'laptop' || a.kind === 'desktop' },
  {
    id: 'peripherals', label: 'Периферия',
    test: a => ['dock', 'monitor', 'headset', 'phone', 'cable-kit'].includes(a.kind),
  },
  { id: 'network', label: 'Сеть и серверы', test: a => ['switch', 'router', 'server', 'printer'].includes(a.kind) },
  { id: 'stock', label: 'Склад', test: a => a.lifecycle === 'in-stock' },
]

export function AssetsView() {
  const world = useGame(s => s.world)
  const now = useGame(s => s.now)
  const inspect = useGame(s => s.inspectObject)

  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')
  const [picked, setPicked] = useState<string | null>(null)

  const nameOf = (sam: string) => world.org.users.find(u => u.samAccountName === sam)?.displayName ?? sam
  const q = query.trim().toLowerCase()
  const rows = world.cmdb
    .filter(FILTERS.find(f => f.id === filter)!.test)
    .filter(a => !q || [a.tag, a.model, a.vendor, a.owner, nameOf(a.owner), a.hostname]
      .some(x => x.toLowerCase().includes(q)))
  const asset = world.cmdb.find(a => a.tag === picked)
  const moves = asset ? world.shipments.filter(x => x.assetTag === asset.tag) : []

  function pick(tag: string) {
    setPicked(tag)
    // Открытая карточка — такая же проверка, как команда.
    inspect('asset', tag)
  }

  return (
    <>
      <div className="head">
        <h1>Активы</h1>
        <p>Учёт оборудования: чьё, где стоит, в каком состоянии и до какого числа на гарантии.</p>
      </div>

      <div className="bar">
        {FILTERS.map(f => (
          <button
            key={f.id}
            className="act"
            type="button"
            aria-current={filter === f.id}
            onClick={() => setFilter(f.id)}
          >
            {f.label}
          </button>
        ))}
        <input
          type="text"
          aria-label="Поиск по тегу, модели, владельцу"
          placeholder="Тег, модель или владелец"
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
      </div>

      <table>
        <thead>
          <tr><th>Тег</th><th>Вид</th><th>Модель</th><th>Владелец</th><th>Учёт</th><th>Место</th><th>Гарантия до</th></tr>
        </thead>
        <tbody>
          {rows.map(a => (
            <tr key={a.tag} className={picked === a.tag ? 'row sel' : 'row'} onClick={() => pick(a.tag)}>
              <td className="data">{a.tag}</td>
              <td>{KIND_LABEL[a.kind]}</td>
              <td>{a.vendor} {a.model}</td>
              <td>{a.owner ? nameOf(a.owner) : '—'}</td>
              <td>{LIFECYCLE_LABEL[a.lifecycle]}</td>
              <td>{a.location}</td>
              <td className="data">
                {a.warrantyUntil}{warrantyActive(a, now) ? '' : ' (истекла)'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && <p className="sub" style={{ marginTop: 10 }}>Ничего не нашлось.</p>}

      {asset && (
        <div className="app-detail">
          <dl className="kv">
            <dt>Тег</dt><dd className="data">{asset.tag}</dd>
            <dt>Вид</dt><dd>{KIND_LABEL[asset.kind]}</dd>
            <dt>Модель</dt><dd>{asset.vendor} {asset.model}</dd>
            <dt>Серийный номер</dt><dd className="data">{asset.serial}</dd>
            <dt>Владелец</dt><dd>{asset.owner ? `${nameOf(asset.owner)} (${asset.owner})` : '—'}</dd>
            <dt>Учёт</dt><dd>{LIFECYCLE_LABEL[asset.lifecycle]}</dd>
            <dt>Место</dt><dd>{asset.location}</dd>
            {asset.hostname && <><dt>Имя в сети</dt><dd className="data">{asset.hostname}</dd></>}
            {asset.attachedTo && <><dt>Подключён к</dt><dd className="data">{asset.attachedTo}</dd></>}
            <dt>Куплен</dt><dd className="data">{asset.purchased}</dd>
            <dt>Гарантия до</dt>
            <dd className="data">
              {asset.warrantyUntil} — {warrantyActive(asset, now) ? 'действует' : 'истекла'}
            </dd>
            {asset.note && <><dt>Отметка</dt><dd>{asset.note}</dd></>}
          </dl>

          {moves.length > 0 && (
            <ul className="dir-groups">
              {moves.map(x => (
                <li key={x.id}>
                  <span className="data">{x.id}</span>
                  <span>{SHIPMENT_TYPES[x.type].label}: {x.history.at(-1)!.stage}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </>
  )
}
