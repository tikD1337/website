import { describe, it, expect, beforeEach } from 'vitest'
import {
  setAccessVlan, setPortAdmin, setDescription, saveConfig, setHelper, findPort,
} from './switchops'
import { createWorld } from '../world/world'
import { createSession } from '../session/session'
import type { WorldState } from '../world/types'
import type { SessionLog } from '../session/types'

const clock = { now: () => new Date('2026-09-10T09:30:00.000Z') }
const SW = 'SW-FL3-01'

let world: WorldState
let session: SessionLog

beforeEach(() => {
  world = createWorld()
  session = createSession({ number: 'INC0000001', device: 'AL-LPT-0447', requester: 'p.raman' })
})

const port = (name = 'Gi1/0/1') => findPort(world, SW, name)!
const adapter = () => world.devices['AL-LPT-0447']!.adapters[0]!
const swLog = () => world.network.switches.find(s => s.hostname === SW)!.log.map(l => l.text)

describe('операции над коммутатором', () => {
  it('имя порта принимается в любой записи', () => {
    for (const name of ['Gi1/0/22', 'gi1/0/22', 'GigabitEthernet1/0/22', 'gigabitethernet1/0/22']) {
      expect(findPort(world, SW, name)?.name, name).toBe('Gi1/0/22')
    }
    expect(findPort(world, SW, 'Gi1/0/99')).toBeUndefined()
    expect(findPort(world, 'НЕТ', 'Gi1/0/1')).toBeUndefined()
  })

  /*
    Смена VLAN при поднятом линке машину не трогает: Windows не узнаёт о
    ней, пока линк не передёрнут или не сделан renew. Это и есть навык.
  */
  it('VLAN порта из тикета меняется и пишется; машина при поднятом линке не трогается', () => {
    expect(setAccessVlan(world, SW, 'gi1/0/1', 40, session, clock)).toEqual({ ok: true })
    expect(port().accessVlan).toBe(40)
    expect(port().saved.accessVlan).toBe(20)
    expect(adapter().ip).toBe('10.20.14.88')
    expect(session.changes).toEqual([{
      at: '2026-09-10T09:30:00.000Z',
      path: 'network.switches[hostname=SW-FL3-01].ports[name=Gi1/0/1].accessVlan',
      before: 20, after: 40, authorized: true,
    }])
    expect(swLog().at(-1)).toBe('%SYS-5-CONFIG_I: Configured from console by helpdesk on vty0')

    expect(setAccessVlan(world, SW, 'Gi1/0/1', 40, session, clock).alreadyInState).toBe(true)
    expect(setAccessVlan(world, SW, 'Gi1/0/1', 77, session, clock).error).toContain('VLAN 77')
  })

  it('подъём линка запускает получение адреса: есть DHCP — аренда, нет — 169.254', () => {
    setPortAdmin(world, SW, 'Gi1/0/1', false, session, clock)
    expect(swLog().at(-1)).toBe('%LINK-3-UPDOWN: Interface GigabitEthernet1/0/1, changed state to down')
    Object.assign(adapter(), { ip: '0.0.0.0', gateway: '', autoconfigured: false })

    setPortAdmin(world, SW, 'Gi1/0/1', true, session, clock)
    expect(swLog().at(-1)).toBe('%LINK-3-UPDOWN: Interface GigabitEthernet1/0/1, changed state to up')
    expect(adapter()).toMatchObject({ ip: '10.20.14.88', autoconfigured: false })
    // Новый адрес машины — следствие действия техника, и журнал изменений его знает.
    expect(session.changes.at(-1)).toMatchObject({
      path: 'devices.AL-LPT-0447.adapters[0].ip', before: '0.0.0.0', after: '10.20.14.88',
    })

    setAccessVlan(world, SW, 'Gi1/0/1', 40, session, clock)
    setPortAdmin(world, SW, 'Gi1/0/1', false, session, clock)
    setPortAdmin(world, SW, 'Gi1/0/1', true, session, clock)
    expect(adapter()).toMatchObject({ ip: '169.254.145.68', autoconfigured: true })
  })

  /*
    Граница обозначается, а не прячется: чужой порт и ретрансляция на
    ядре — отказ, записанный опасным действием; мир не меняется.
  */
  it('чужой порт и ретрансляция — отказ и опасное действие, мир не меняется', () => {
    const before = structuredClone(world.network)

    expect(setAccessVlan(world, SW, 'Gi1/0/2', 40, session, clock).error).toContain('вне области тикета')
    expect(setPortAdmin(world, SW, 'Gi1/0/48', false, session, clock).ok).toBe(false)
    expect(setDescription(world, SW, 'Gi1/0/2', 'мой стол', session, clock).ok).toBe(false)
    expect(setHelper(world, 'CR-01', 20, '10.20.10.5', false, session, clock).error).toContain('эскалац')

    expect(world.network).toEqual(before)
    expect(session.changes).toEqual([])
    expect(session.flags.dangerousActions).toHaveLength(4)
  })

  it('сохранение копирует текущую конфигурацию портов в стартовую', () => {
    setAccessVlan(world, SW, 'Gi1/0/1', 40, session, clock)
    setDescription(world, SW, 'Gi1/0/1', 'DESK-3-15', session, clock)
    expect(saveConfig(world, SW, session, clock)).toEqual({ ok: true })
    expect(port().saved).toEqual({ accessVlan: 40, adminUp: true, description: 'DESK-3-15' })

    expect(saveConfig(world, SW, createSession(), clock).ok).toBe(false)
  })
})
