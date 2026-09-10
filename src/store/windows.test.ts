import { describe, it, expect, beforeEach } from 'vitest'
import {
  createWindows, openWindow, closeWindow, focusWindow, moveWindow,
  minimizeWindow, restoreWindow, toggleMaximize, isOpen, topmost, visibleWindows,
} from './windows'
import type { WindowsState } from './windows'

let w: WindowsState

beforeEach(() => {
  w = createWindows()
})

describe('открытие', () => {
  it('на старте окон нет', () => {
    expect(w.windows).toEqual([])
  })

  it('открывает окно с заголовком и размером', () => {
    openWindow(w, 'cmd')
    expect(w.windows).toHaveLength(1)
    const win = w.windows[0]!
    expect(win.id).toBe('cmd')
    expect(win.title).toBe('Command Prompt')
    expect(win.w).toBeGreaterThan(200)
    expect(win.h).toBeGreaterThan(150)
  })

  it('повторное открытие не создаёт второе окно', () => {
    openWindow(w, 'cmd')
    openWindow(w, 'cmd')
    expect(w.windows).toHaveLength(1)
  })

  it('повторное открытие поднимает окно наверх и разворачивает свёрнутое', () => {
    openWindow(w, 'cmd')
    openWindow(w, 'eventvwr')
    minimizeWindow(w, 'cmd')

    openWindow(w, 'cmd')
    expect(topmost(w)?.id).toBe('cmd')
    expect(isOpen(w, 'cmd')).toBe(true)
    expect(w.windows.find(x => x.id === 'cmd')!.minimized).toBe(false)
  })

  it('окна раскладываются каскадом, а не друг на друге', () => {
    openWindow(w, 'cmd')
    openWindow(w, 'eventvwr')
    const [a, b] = w.windows
    expect(b!.x).not.toBe(a!.x)
    expect(b!.y).not.toBe(a!.y)
  })

  it('новое окно оказывается наверху', () => {
    openWindow(w, 'cmd')
    openWindow(w, 'eventvwr')
    expect(topmost(w)?.id).toBe('eventvwr')
  })
})

describe('фокус и порядок', () => {
  beforeEach(() => {
    openWindow(w, 'cmd')
    openWindow(w, 'eventvwr')
    openWindow(w, 'services')
  })

  it('фокус поднимает окно наверх', () => {
    focusWindow(w, 'cmd')
    expect(topmost(w)?.id).toBe('cmd')
  })

  it('фокус не меняет относительный порядок остальных', () => {
    const before = w.windows
      .filter(x => x.id !== 'cmd')
      .sort((a, b) => a.z - b.z)
      .map(x => x.id)

    focusWindow(w, 'cmd')

    const after = w.windows
      .filter(x => x.id !== 'cmd')
      .sort((a, b) => a.z - b.z)
      .map(x => x.id)

    expect(after).toEqual(before)
  })

  it('фокус несуществующего окна ничего не ломает', () => {
    const before = topmost(w)?.id
    focusWindow(w, 'devmgmt')
    expect(topmost(w)?.id).toBe(before)
  })

  it('z-порядок остаётся уникальным', () => {
    focusWindow(w, 'cmd')
    focusWindow(w, 'eventvwr')
    const zs = w.windows.map(x => x.z)
    expect(new Set(zs).size).toBe(zs.length)
  })
})

describe('закрытие', () => {
  it('убирает окно', () => {
    openWindow(w, 'cmd')
    closeWindow(w, 'cmd')
    expect(isOpen(w, 'cmd')).toBe(false)
    expect(w.windows).toHaveLength(0)
  })

  it('закрытие несуществующего окна безвредно', () => {
    expect(() => closeWindow(w, 'cmd')).not.toThrow()
  })

  it('после закрытия верхним становится следующее', () => {
    openWindow(w, 'cmd')
    openWindow(w, 'eventvwr')
    closeWindow(w, 'eventvwr')
    expect(topmost(w)?.id).toBe('cmd')
  })
})

describe('свёртывание и разворот', () => {
  beforeEach(() => openWindow(w, 'cmd'))

  it('свёрнутое окно остаётся в списке, но не видно', () => {
    minimizeWindow(w, 'cmd')
    expect(isOpen(w, 'cmd')).toBe(true)
    expect(visibleWindows(w)).toHaveLength(0)
  })

  it('свёрнутое окно не может быть верхним', () => {
    openWindow(w, 'eventvwr')
    focusWindow(w, 'cmd')
    minimizeWindow(w, 'cmd')
    expect(topmost(w)?.id).toBe('eventvwr')
  })

  it('восстановление возвращает окно и поднимает наверх', () => {
    openWindow(w, 'eventvwr')
    minimizeWindow(w, 'cmd')
    restoreWindow(w, 'cmd')
    expect(topmost(w)?.id).toBe('cmd')
  })

  it('разворот запоминает прежние размеры и возвращает их', () => {
    moveWindow(w, 'cmd', 100, 120)
    const win = () => w.windows.find(x => x.id === 'cmd')!
    const before = { x: win().x, y: win().y, w: win().w, h: win().h }

    toggleMaximize(w, 'cmd')
    expect(win().maximized).toBe(true)

    toggleMaximize(w, 'cmd')
    expect(win().maximized).toBe(false)
    expect({ x: win().x, y: win().y, w: win().w, h: win().h }).toEqual(before)
  })
})

describe('перемещение', () => {
  beforeEach(() => openWindow(w, 'cmd'))

  it('меняет координаты', () => {
    moveWindow(w, 'cmd', 250, 180)
    const win = w.windows.find(x => x.id === 'cmd')!
    expect(win.x).toBe(250)
    expect(win.y).toBe(180)
  })

  it('не даёт уехать за верхний край и утащить заголовок', () => {
    moveWindow(w, 'cmd', -500, -500)
    const win = w.windows.find(x => x.id === 'cmd')!
    expect(win.y).toBeGreaterThanOrEqual(0)
    expect(win.x).toBeGreaterThan(-win.w)
  })

  it('развёрнутое окно не перемещается', () => {
    toggleMaximize(w, 'cmd')
    const before = w.windows.find(x => x.id === 'cmd')!.x
    moveWindow(w, 'cmd', 400, 400)
    expect(w.windows.find(x => x.id === 'cmd')!.x).toBe(before)
  })
})
