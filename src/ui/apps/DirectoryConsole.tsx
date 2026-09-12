import { useState } from 'react'
import { useGame } from '../../store/useGame'
import { findUser, findGroup } from '../../core/directory/accounts'
import { userDn } from '../../core/directory/naming'
import type { WorldState } from '../../core/world/types'

/**
 * Консоль каталога.
 *
 * Живёт рядом с очередью, а не на рабочем столе удалёнки, и это не
 * оформительское решение: в инциденте с блокировкой человек не может
 * войти, подключаться некуда — консоль обязана работать без удалённого
 * сеанса.
 *
 * Кнопки вызывают те же операции, что и команда `net`. Кнопка сброса
 * пароля намеренно **не заблокирована** без сверки личности: техник
 * должен нажать её, получить пометку и увидеть её в разборе. Спрятать
 * кнопку значило бы учить, что границ нет — их просто не показывают.
 */

export interface OuRow {
  path: string
  name: string
  depth: number
}

/** Дерево подразделений, разложенное в строки: ребёнок сразу за родителем. */
export function ouRows(world: WorldState): OuRow[] {
  const out: OuRow[] = []

  const walk = (parent: string | null, depth: number) => {
    for (const ou of world.org.ous.filter(o => o.parent === parent)) {
      out.push({ path: ou.path, name: ou.name, depth })
      walk(ou.path, depth + 1)
    }
  }

  walk(null, 0)
  return out
}

export interface DirObject {
  kind: 'user' | 'group'
  id: string
  name: string
  subtitle: string
}

/**
 * Объекты, лежащие **непосредственно** в подразделении.
 *
 * Вложенные не разворачиваются: иначе из корня было бы видно всё и
 * дерево потеряло бы смысл.
 */
export function objectsIn(world: WorldState, ou: string): DirObject[] {
  const users: DirObject[] = world.org.users
    .filter(u => u.ou === ou)
    .map(u => ({
      kind: 'user' as const,
      id: u.samAccountName,
      name: u.displayName,
      subtitle: u.title,
    }))

  const groups: DirObject[] = world.org.groups
    .filter(g => g.ou === ou)
    .map(g => ({
      kind: 'group' as const,
      id: g.name,
      name: g.name,
      subtitle: g.description,
    }))

  return [...users, ...groups].sort((a, b) => a.name.localeCompare(b.name))
}

type Tab = 'general' | 'account' | 'members'

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'general', label: 'Общие' },
  { id: 'account', label: 'Учётная запись' },
  { id: 'members', label: 'Членство в группах' },
]

export function DirectoryConsole() {
  const world = useGame(s => s.world)
  const session = useGame(s => s.session)

  const unlock = useGame(s => s.unlockUser)
  const reset = useGame(s => s.resetUserPassword)
  const setEnabled = useGame(s => s.setUserEnabled)
  const addGroup = useGame(s => s.addUserToGroup)
  const removeGroup = useGame(s => s.removeUserFromGroup)
  const inspect = useGame(s => s.inspectObject)

  const [ou, setOu] = useState('OU=Sales,OU=Employees,OU=Corp')
  const [selected, setSelected] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('general')
  const [message, setMessage] = useState<{ text: string; bad: boolean } | null>(null)

  const rows = ouRows(world)
  const objects = objectsIn(world, ou)
  const user = selected ? findUser(world, selected) : undefined
  const group = selected && !user ? findGroup(world, selected) : undefined

  function act(fn: () => { ok: boolean; error?: string; flagged?: boolean }) {
    const r = fn()
    if (!r.ok) {
      setMessage({ text: r.error ?? 'Отказано', bad: true })
      return
    }
    setMessage(r.flagged
      ? {
          text: 'Выполнено без подтверждённой личности — записано как '
            + 'инцидент безопасности.',
          bad: true,
        }
      : { text: 'Выполнено.', bad: false })
  }

  const verifiedHere = Boolean(user)
    && session.flags.identityVerified
    && session.verifiedAccount?.toLowerCase() === user!.samAccountName.toLowerCase()

  return (
    <div className="dir">
      <div className="dir-tree">
        {rows.map(r => (
          <button
            key={r.path}
            type="button"
            aria-current={ou === r.path}
            style={{ paddingLeft: 6 + r.depth * 12 }}
            onClick={() => { setOu(r.path); setSelected(null); setMessage(null) }}
          >
            {r.name}
          </button>
        ))}
      </div>

      <div className="dir-body">
        <table>
          <thead>
            <tr>
              <th>Имя</th>
              <th>Тип</th>
              <th>Описание</th>
            </tr>
          </thead>
          <tbody>
            {objects.map(o => (
              <tr
                key={o.kind + o.id}
                className={selected === o.id ? 'row sel' : 'row'}
                onClick={() => {
                  setSelected(o.id)
                  setMessage(null)
                  // Открытая карточка — такая же проверка, как команда.
                  inspect(o.kind, o.id)
                }}
              >
                <td>{o.name}</td>
                <td className="sub">
                  {o.kind === 'user' ? 'Пользователь' : 'Группа безопасности'}
                </td>
                <td className="sub">{o.subtitle}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {objects.length === 0 && (
          <p className="sub" style={{ marginTop: 10 }}>Подразделение пусто.</p>
        )}

        {user && (
          <div className="app-detail">
            <div className="dir-tabs">
              {TABS.map(t => (
                <button
                  key={t.id}
                  type="button"
                  aria-current={tab === t.id}
                  onClick={() => setTab(t.id)}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {tab === 'general' && (
              <dl className="kv">
                <dt>Полное имя</dt><dd>{user.displayName}</dd>
                <dt>Должность</dt><dd>{user.title}</dd>
                <dt>Отдел</dt><dd>{user.dept}</dd>
                <dt>Руководитель</dt><dd>{user.manager || '—'}</dd>
                <dt>Кабинет</dt><dd>{user.office || '—'}</dd>
                <dt>Телефон</dt><dd className="data">{user.phone || '—'}</dd>
                <dt>Почта</dt><dd className="data">{user.email}</dd>
                <dt>Рабочая станция</dt><dd className="data">{user.primaryDevice}</dd>
                <dt>Различающееся имя</dt>
                <dd className="data">{userDn(world, user)}</dd>
              </dl>
            )}

            {tab === 'account' && (
              <>
                <dl className="kv">
                  <dt>Учётная запись</dt>
                  <dd className={user.enabled ? undefined : 'flag-bad'}>
                    {user.enabled ? 'Включена' : 'Отключена'}
                  </dd>
                  <dt>Блокировка</dt>
                  <dd className={user.lockedOut ? 'flag-bad' : undefined}>
                    {user.lockedOut ? 'Заблокирована' : 'Нет'}
                  </dd>
                  <dt>Неудачных входов</dt>
                  <dd className="data">{user.badPwdCount}</dd>
                  <dt>Пароль изменён</dt>
                  <dd className="data">{user.pwdLastSet.slice(0, 16).replace('T', ' ')}</dd>
                  <dt>Последний вход</dt>
                  <dd className="data">{user.lastLogon.slice(0, 16).replace('T', ' ')}</dd>
                  <dt>Срок пароля</dt>
                  <dd className={user.pwdExpired ? 'flag-bad' : undefined}>
                    {user.pwdExpired ? 'Истёк' : 'Не истёк'}
                  </dd>
                </dl>

                <div className="bar">
                  <button
                    className="act"
                    type="button"
                    disabled={!user.lockedOut}
                    onClick={() => act(() => unlock(user.samAccountName))}
                  >
                    Разблокировать
                  </button>

                  <button
                    className="act"
                    type="button"
                    onClick={() => act(() => reset(user.samAccountName))}
                  >
                    Сбросить пароль
                  </button>

                  <button
                    className="act"
                    type="button"
                    onClick={() => act(() =>
                      setEnabled(user.samAccountName, !user.enabled))}
                  >
                    {user.enabled ? 'Отключить' : 'Включить'}
                  </button>
                </div>

                {!verifiedHere && (
                  <p className="sub">
                    Личность этого человека не подтверждена. Изменение пройдёт,
                    но будет записано как инцидент безопасности.
                  </p>
                )}
              </>
            )}

            {tab === 'members' && (
              <>
                <ul className="dir-groups">
                  {user.groups.map(g => (
                    <li key={g}>
                      <span>{g}</span>
                      <button
                        className="act"
                        type="button"
                        onClick={() => act(() =>
                          removeGroup(user.samAccountName, g))}
                      >
                        Исключить
                      </button>
                    </li>
                  ))}
                </ul>

                <div className="bar">
                  <select
                    aria-label="Добавить в группу"
                    value=""
                    onChange={e => {
                      if (e.target.value) {
                        act(() => addGroup(user.samAccountName, e.target.value))
                      }
                    }}
                  >
                    <option value="" disabled>Добавить в группу</option>
                    {world.org.groups
                      .filter(g => !user.groups.includes(g.name))
                      .map(g => (
                        <option key={g.name} value={g.name}>{g.displayName}</option>
                      ))}
                  </select>
                </div>
              </>
            )}

            {message && (
              <p className={message.bad ? 'deny' : 'sub'}>{message.text}</p>
            )}
          </div>
        )}

        {group && (
          <div className="app-detail">
            <dl className="kv">
              <dt>Группа</dt><dd>{group.displayName}</dd>
              <dt>Имя</dt><dd className="data">{group.name}</dd>
              <dt>Описание</dt><dd>{group.description}</dd>
              <dt>Участников</dt><dd className="data">{group.members.length}</dd>
              {group.grantsAccessTo.length > 0 && (
                <>
                  <dt>Даёт доступ к</dt>
                  <dd className="data">{group.grantsAccessTo.join(', ')}</dd>
                </>
              )}
            </dl>

            {group.protected && (
              <p className="deny">
                Привилегированная группа. Первая линия не выдаёт
                административных прав — состав меняет вторая линия по заявке.
              </p>
            )}

            <ul className="dir-groups">
              {group.members.map(m => (
                <li key={m}><span>{findUser(world, m)?.displayName ?? m}</span></li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}
