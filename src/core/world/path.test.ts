import { describe, it, expect } from 'vitest'
import { parsePath, getPath, setPath } from './path'

describe('parsePath', () => {
  it('разбирает точки и индексы массива', () => {
    expect(parsePath('devices.AL-LPT-0447.adapters[0].ip'))
      .toEqual(['devices', 'AL-LPT-0447', 'adapters', 0, 'ip'])
  })

  it('разбирает одиночный сегмент', () => {
    expect(parsePath('org')).toEqual(['org'])
  })

  it('разбирает индекс в середине пути', () => {
    expect(parsePath('network.segments[0].dhcpHealthy'))
      .toEqual(['network', 'segments', 0, 'dhcpHealthy'])
  })

  it('отвергает мусор вместо пути', () => {
    expect(() => parsePath('devices..ip')).toThrow('некорректный путь')
  })
})

describe('getPath', () => {
  const root = { devices: { 'AL-LPT-0447': { adapters: [{ ip: '169.254.23.11' }] } } }

  it('достаёт вложенное значение через индекс массива', () => {
    expect(getPath(root, 'devices.AL-LPT-0447.adapters[0].ip')).toBe('169.254.23.11')
  })

  it('возвращает undefined для несуществующего пути', () => {
    expect(getPath(root, 'devices.NOPE.adapters[0].ip')).toBeUndefined()
  })
})

describe('setPath', () => {
  it('записывает значение по вложенному пути', () => {
    const root = { devices: { 'AL-LPT-0447': { adapters: [{ ip: '169.254.23.11' }] } } }
    setPath(root, 'devices.AL-LPT-0447.adapters[0].ip', '10.20.14.88')
    expect(root.devices['AL-LPT-0447'].adapters[0].ip).toBe('10.20.14.88')
  })

  it('бросает исключение, если промежуточный сегмент отсутствует', () => {
    const root = { devices: {} }
    expect(() => setPath(root, 'devices.NOPE.adapters[0].ip', 'x'))
      .toThrow('путь не существует')
  })

  it('позволяет записать существующее поле в значение null', () => {
    const root = { a: { b: 'x' as string | null } }
    setPath(root, 'a.b', null)
    expect(root.a.b).toBeNull()
  })
})
