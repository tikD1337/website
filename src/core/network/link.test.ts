import { describe, it, expect } from 'vitest'
import { portOf, linkOf, vlanOf, segmentOf } from './link'
import { createWorld } from '../world/world'

const HOST = 'AL-LPT-0447'
const port = (w: ReturnType<typeof createWorld>) => portOf(w, HOST)!.port

/*
  Порт коммутатора — источник истины для линка и VLAN машины. Хранить
  их и в адаптере значило бы синхронизировать две копии, и первая же
  правка порта разошлась бы с тем, что показывает ipconfig.
*/
describe('линк и VLAN машины', () => {
  it('выводятся из порта, в который она воткнута', () => {
    const w = createWorld()
    expect(portOf(w, HOST)).toMatchObject({ sw: { hostname: 'SW-FL3-01' }, port: { name: 'Gi1/0/1' } })
    expect(linkOf(w, HOST)).toBe(true)
    expect(vlanOf(w, HOST)).toBe(20)
    expect(segmentOf(w, HOST)!.vlan).toBe('vlan20')

    port(w).accessVlan = 40
    expect(segmentOf(w, HOST)!.vlan).toBe('vlan40')

    port(w).adminUp = false
    expect(linkOf(w, HOST)).toBe(false)
  })

  it('линка нет без кабеля со стороны машины и без порта вовсе', () => {
    const unplugged = createWorld()
    unplugged.devices[HOST]!.adapters[0]!.linkUp = false
    expect(linkOf(unplugged, HOST)).toBe(false)

    const unpatched = createWorld()
    port(unpatched).connectedTo = ''
    expect(portOf(unpatched, HOST)).toBeUndefined()
    expect(linkOf(unpatched, HOST)).toBe(false)
    expect(vlanOf(unpatched, HOST)).toBeNull()
    expect(segmentOf(unpatched, HOST)).toBeUndefined()
  })
})
