import { useState } from 'react'
import { useGame } from '../store/useGame'
import { portStatus } from '../core/network/link'
import { dhcpRequestsLastHour } from '../core/network/dhcp'
import { learnedMac } from '../core/switchcli/show'
import { longName } from '../core/infra/switchops'
import { PortGrid, STATUS_WORD } from './infra/PortGrid'
import { SwitchConsole } from './infra/SwitchConsole'
import type { DeviceHealth, NetSwitch, WorldState } from '../core/world/types'
import type { InfraResult } from '../core/infra/switchops'

/**
 * Серверная: оборудование сети и серверы.
 *
 * Карточка устройства, порта и интерфейса VLAN — доказательство наравне
 * с командой: открыв её, техник посмотрел, и оценка это видит. Кнопки
 * вызывают те же операции, что и консоль; то, что первой линии не
 * принадлежит, нажимается и получает отказ — граница обозначается, а не
 * прячется.
 */

type Kind = 'switch' | 'router' | 'server' | 'printer'
type Tab = 'general' | 'health' | 'ports' | 'svi' | 'console' | 'diag'

interface Picked { kind: Kind; host: string }

const TAB_LABEL: Record<Tab, string> = {
  general: 'Общее',
  health: 'Здоровье',
  ports: 'Порты',
  svi: 'Интерфейсы VLAN',
  console: 'Консоль',
  diag: 'Диагностика',
}

function tabsFor(world: WorldState, p: Picked): Tab[] {
  if (p.kind === 'switch') {
    const sw = world.network.switches.find(s => s.hostname === p.host)!
    return sw.vlanInterfaces.length > 0
      ? ['general', 'health', 'ports', 'svi', 'console']
      : ['general', 'health', 'ports', 'console']
  }
  if (p.kind === 'server') return ['general', 'health', 'diag']
  if (p.kind === 'router') return ['general', 'health']
  return ['general']
}

const stamp = (iso: string) => iso.slice(0, 16).replace('T', ' ')

function Health({ h }: { h: DeviceHealth }) {
  return (
    <dl className="kv">
      <dt>Процессор</dt><dd className="data">{h.cpu}%</dd>
      <dt>Память</dt><dd className="data">{h.memory}%</dd>
      <dt>Температура</dt><dd className="data">{h.temperature} °C</dd>
      <dt>Блок питания</dt>
      <dd className={h.psu === 'ok' ? undefined : 'flag-bad'}>{h.psu === 'ok' ? 'Исправен' : 'Отказ'}</dd>
      <dt>Работает с</dt><dd className="data">{stamp(h.since)}</dd>
    </dl>
  )
}

function Outcome({ r }: { r: InfraResult | null }) {
  if (!r) return null
  if (r.ok) return <p className="sub">{r.alreadyInState ? 'Уже в этом состоянии.' : 'Выполнено.'}</p>
  return <p className="deny">{r.error}</p>
}

function Ports({ world, sw }: { world: WorldState; sw: NetSwitch }) {
  const inspect = useGame(s => s.inspectObject)
  const setVlan = useGame(s => s.setPortVlan)
  const setEnabled = useGame(s => s.setPortEnabled)
  const setDescription = useGame(s => s.setPortDescription)
  const save = useGame(s => s.saveSwitchConfig)

  const [picked, setPicked] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [result, setResult] = useState<InfraResult | null>(null)

  const port = sw.ports.find(p => p.name === picked)
  const unsaved = sw.ports.some(p =>
    p.saved.accessVlan !== p.accessVlan || p.saved.adminUp !== p.adminUp
    || p.saved.description !== p.description)

  function pick(name: string) {
    setPicked(name)
    setResult(null)
    setDraft(sw.ports.find(p => p.name === name)!.description)
    // Открытая карточка порта — такая же проверка, как show в консоли.
    inspect('port', `${sw.hostname}/${name}`)
  }

  const status = port ? portStatus(world, port) : null
  const mac = port ? learnedMac(world, port) : null
  const vlanName = (id: number) => sw.vlans.find(v => v.id === id)?.name ?? ''

  return (
    <>
      <PortGrid world={world} sw={sw} selected={picked} onSelect={pick} />

      <div className="bar">
        <button className="act" type="button" onClick={() => setResult(save(sw.hostname))}>
          Сохранить конфигурацию
        </button>
        {unsaved && <span className="sub">Есть изменения, не записанные в стартовую конфигурацию.</span>}
      </div>

      {!port && <p className="sub">Выберите порт на панели.</p>}

      {port && status && (
        <div className="app-detail">
          <dl className="kv">
            <dt>Порт</dt><dd className="data">{longName(port.name)}</dd>
            <dt>Описание</dt><dd>{port.description || '—'}</dd>
            <dt>Состояние</dt><dd>{STATUS_WORD[status]}</dd>
            <dt>Режим</dt><dd>{port.mode === 'trunk' ? 'Магистраль' : 'Доступ'}</dd>
            {port.mode === 'access' && (
              <><dt>VLAN</dt><dd className="data">{port.accessVlan} {vlanName(port.accessVlan)}</dd></>
            )}
            <dt>MAC на порту</dt><dd className="data">{mac ?? '—'}</dd>
            {port.saved.accessVlan !== port.accessVlan && (
              <><dt>В стартовой</dt><dd className="data">VLAN {port.saved.accessVlan}</dd></>
            )}
          </dl>

          <div className="bar">
            {port.mode === 'access' && (
              <select
                aria-label="VLAN доступа"
                value={port.accessVlan}
                onChange={e => setResult(setVlan(sw.hostname, port.name, Number(e.target.value)))}
              >
                {sw.vlans.map(v => (
                  <option key={v.id} value={v.id}>VLAN {v.id} {v.name}</option>
                ))}
              </select>
            )}
            <button
              className="act"
              type="button"
              onClick={() => setResult(setEnabled(sw.hostname, port.name, !port.adminUp))}
            >
              {port.adminUp ? 'Выключить' : 'Включить'}
            </button>
          </div>

          <div className="bar">
            <input
              type="text"
              aria-label="Описание порта"
              value={draft}
              onChange={e => setDraft(e.target.value)}
            />
            <button
              className="act"
              type="button"
              onClick={() => setResult(setDescription(sw.hostname, port.name, draft.trim()))}
            >
              Сменить описание
            </button>
          </div>

          <Outcome r={result} />
        </div>
      )}
    </>
  )
}

function Svis({ sw }: { sw: NetSwitch }) {
  const inspect = useGame(s => s.inspectObject)
  const setHelper = useGame(s => s.setSviHelper)
  const [picked, setPicked] = useState<number | null>(null)
  const [helper, setHelperText] = useState('')
  const [result, setResult] = useState<InfraResult | null>(null)
  const svi = sw.vlanInterfaces.find(v => v.vlan === picked)

  return (
    <>
      <table>
        <thead>
          <tr><th>Интерфейс</th><th>Адрес</th><th>Ретрансляция DHCP</th><th>Состояние</th></tr>
        </thead>
        <tbody>
          {sw.vlanInterfaces.map(v => (
            <tr
              key={v.vlan}
              className={picked === v.vlan ? 'row sel' : 'row'}
              onClick={() => {
                setPicked(v.vlan)
                setResult(null)
                inspect('svi', `${sw.hostname}/Vlan${v.vlan}`)
              }}
            >
              <td className="data">Vlan{v.vlan}</td>
              <td className="data">{v.ip}</td>
              <td className="data">{v.helpers.join(', ') || '—'}</td>
              <td>{v.adminUp ? 'поднят' : 'выключен'}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {svi && (
        <div className="app-detail">
          <dl className="kv">
            <dt>Интерфейс</dt><dd className="data">Vlan{svi.vlan}</dd>
            <dt>Сеть</dt><dd>{sw.vlans.find(v => v.id === svi.vlan)?.name ?? '—'}</dd>
            <dt>Адрес</dt><dd className="data">{svi.ip} {svi.mask}</dd>
            <dt>Ретрансляция DHCP</dt><dd className="data">{svi.helpers.join(', ') || 'нет'}</dd>
          </dl>
          <p className="sub">
            Интерфейсы VLAN ядра — маршрутизация целого сегмента. Изменения вносит
            сетевая группа по заявке.
          </p>
          <div className="bar">
            <input
              type="text"
              aria-label="Адрес ретрансляции"
              value={helper}
              onChange={e => setHelperText(e.target.value)}
            />
            <button
              className="act"
              type="button"
              onClick={() => setResult(setHelper(sw.hostname, svi.vlan, helper.trim(), true))}
            >
              Добавить ретрансляцию
            </button>
          </div>
          <Outcome r={result} />
        </div>
      )}
    </>
  )
}

function ServerDiag({ world, host }: { world: WorldState; host: string }) {
  const restart = useGame(s => s.restartServerService)
  const [result, setResult] = useState<InfraResult | null>(null)
  const srv = world.network.servers.find(s => s.hostname === host)!
  const scopes = world.network.segments.filter(s => s.dhcpServer === srv.ip)

  return (
    <>
      <table>
        <thead><tr><th>Служба</th><th>Имя</th><th>Состояние</th><th /></tr></thead>
        <tbody>
          {srv.services.map(svc => (
            <tr key={svc.name}>
              <td>{svc.displayName}</td>
              <td className="data">{svc.name}</td>
              <td>{svc.status === 'running' ? 'Выполняется' : 'Остановлена'}</td>
              <td>
                <button
                  className="act"
                  type="button"
                  onClick={() => setResult(restart(srv.hostname, svc.name))}
                >
                  Перезапустить
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {scopes.length > 0 && (
        <table>
          <thead>
            <tr><th>Область DHCP</th><th>Сеть</th><th>Пул</th><th>Аренд</th><th>Запросов за час</th></tr>
          </thead>
          <tbody>
            {scopes.map(seg => (
              <tr key={seg.vlanId}>
                <td>VLAN {seg.vlanId} {seg.name}</td>
                <td className="data">{seg.subnet}</td>
                <td className="data">{seg.leasePool[0]} – {seg.leasePool.at(-1)}</td>
                <td className="data">{Object.keys(seg.leases).length}</td>
                <td className="data">{dhcpRequestsLastHour(world, seg.vlanId)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <Outcome r={result} />
    </>
  )
}

export function ServerRoom() {
  const world = useGame(s => s.world)
  const inspect = useGame(s => s.inspectObject)
  const [picked, setPicked] = useState<Picked | null>(null)
  const [tab, setTab] = useState<Tab>('general')

  const groups: Array<{ label: string; kind: Kind; hosts: string[] }> = [
    { label: 'Коммутаторы', kind: 'switch', hosts: world.network.switches.map(s => s.hostname) },
    { label: 'Маршрутизаторы', kind: 'router', hosts: world.network.routers.map(r => r.hostname) },
    { label: 'Серверы', kind: 'server', hosts: world.network.servers.map(s => s.hostname) },
    { label: 'Принтеры', kind: 'printer', hosts: world.network.printers.map(p => p.hostname) },
  ]

  function pick(kind: Kind, host: string) {
    setPicked({ kind, host })
    setTab('general')
    // Открытая карточка устройства — доказательство наравне с командой.
    inspect('device', host)
  }

  const sw = picked?.kind === 'switch' ? world.network.switches.find(s => s.hostname === picked.host) : undefined
  const router = picked?.kind === 'router' ? world.network.routers.find(r => r.hostname === picked.host) : undefined
  const server = picked?.kind === 'server' ? world.network.servers.find(s => s.hostname === picked.host) : undefined
  const printer = picked?.kind === 'printer' ? world.network.printers.find(p => p.hostname === picked.host) : undefined

  return (
    <div className="dir room">
      <div className="dir-tree">
        {groups.map(g => (
          <div key={g.kind} className="room-group">
            <span className="sub">{g.label}</span>
            {g.hosts.map(h => (
              <button
                key={h}
                type="button"
                aria-current={picked?.host === h}
                onClick={() => pick(g.kind, h)}
              >
                {h}
              </button>
            ))}
          </div>
        ))}
      </div>

      <div className="dir-body">
        {!picked && (
          <p className="sub">
            Выберите устройство слева. Всё, что здесь меняется, меняется по взятому
            тикету и только в его пределах.
          </p>
        )}

        {picked && (
          <>
            <h2 className="room-title">{picked.host}</h2>
            <div className="dir-tabs">
              {tabsFor(world, picked).map(t => (
                <button key={t} type="button" aria-current={tab === t} onClick={() => setTab(t)}>
                  {TAB_LABEL[t]}
                </button>
              ))}
            </div>
          </>
        )}

        {sw && tab === 'general' && (
          <dl className="kv">
            <dt>Роль</dt><dd>{sw.role === 'core' ? 'Ядро сети' : 'Коммутатор доступа'}</dd>
            <dt>Модель</dt><dd>{sw.vendor} {sw.model}</dd>
            <dt>Серийный номер</dt><dd className="data">{sw.serial}</dd>
            <dt>Прошивка</dt><dd className="data">{sw.firmware}</dd>
            <dt>Расположение</dt><dd>{sw.location}</dd>
            <dt>Адрес управления</dt><dd className="data">{sw.mgmtIp}</dd>
            <dt>Портов</dt><dd className="data">{sw.ports.length}</dd>
          </dl>
        )}
        {sw && tab === 'health' && <Health h={sw.health} />}
        {sw && tab === 'ports' && <Ports key={sw.hostname} world={world} sw={sw} />}
        {sw && tab === 'svi' && <Svis key={sw.hostname} sw={sw} />}
        {sw && tab === 'console' && <SwitchConsole key={sw.hostname} device={sw.hostname} />}

        {router && tab === 'general' && (
          <dl className="kv">
            <dt>Модель</dt><dd>{router.vendor} {router.model}</dd>
            <dt>Серийный номер</dt><dd className="data">{router.serial}</dd>
            <dt>Расположение</dt><dd>{router.location}</dd>
            <dt>Адрес управления</dt><dd className="data">{router.mgmtIp}</dd>
            <dt>Провайдер</dt><dd>{router.wan.isp}</dd>
            <dt>Внешний адрес</dt><dd className="data">{router.wan.ip}</dd>
            <dt>Канал</dt>
            <dd className={router.wan.up ? undefined : 'flag-bad'}>{router.wan.up ? 'Поднят' : 'Нет связи'}</dd>
          </dl>
        )}
        {router && tab === 'health' && <Health h={router.health} />}

        {server && tab === 'general' && (
          <dl className="kv">
            <dt>Роли</dt><dd>{server.roles.join(', ')}</dd>
            <dt>Адрес</dt><dd className="data">{server.ip}</dd>
            <dt>Система</dt><dd>{server.os}</dd>
            <dt>Расположение</dt><dd>{server.location}</dd>
          </dl>
        )}
        {server && tab === 'health' && <Health h={server.health} />}
        {server && tab === 'diag' && <ServerDiag world={world} host={server.hostname} />}

        {printer && (
          <dl className="kv">
            <dt>Модель</dt><dd>{printer.vendor} {printer.model}</dd>
            <dt>Адрес</dt><dd className="data">{printer.ip}</dd>
            <dt>Расположение</dt><dd>{printer.location}</dd>
            <dt>Состояние</dt>
            <dd className={printer.status === 'ready' ? undefined : 'flag-bad'}>
              {printer.status === 'ready' ? 'Готов' : printer.status === 'error' ? 'Ошибка' : 'Не в сети'}
            </dd>
            <dt>Тонер</dt><dd className="data">{printer.tonerPct}%</dd>
            <dt>Бумага</dt><dd>{printer.paper === 'ok' ? 'Есть' : printer.paper === 'low' ? 'Мало' : 'Нет'}</dd>
            <dt>Заданий в очереди</dt><dd className="data">{printer.queue}</dd>
          </dl>
        )}
      </div>
    </div>
  )
}
