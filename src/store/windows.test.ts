import { describe, it, expect, beforeEach } from 'vitest'
import {
  createWindows, openWindow, closeWindow, focusWindow, moveWindow,
  minimizeWindow, restoreWindow, toggleMaximize, isOpen, topmost, visibleWindows,
  setViewport,
} from './windows'
import type { WindowsState } from './windows'

let w: WindowsState

beforeEach(() => {
  w = createWindows()
})

const win = (id: string, s = w) => s.windows.find(x => x.id === id)!
/** Порядок снизу вверх. */
const stack = (s = w) => [...s.windows].sort((a, b) => a.z - b.z).map(x => x.id)

describe('окна рабочего стола', () => {
  it('открытие: одно окно на приложение, каскадом, новое сверху', () => {
    expect(w.windows).toEqual([])
    openWindow(w, 'cmd')
    openWindow(w, 'eventvwr')
    openWindow(w, 'cmd')

    expect(w.windows).toHaveLength(2)
    expect(win('cmd').title).toBe('Command Prompt')
    expect(win('eventvwr').x).not.toBe(win('cmd').x)
    expect(win('eventvwr').y).not.toBe(win('cmd').y)
    // Повторное открытие поднимает уже открытое окно.
    expect(topmost(w)?.id).toBe('cmd')
  })

  it('повторное открытие разворачивает свёрнутое окно', () => {
    openWindow(w, 'cmd')
    openWindow(w, 'eventvwr')
    minimizeWindow(w, 'cmd')
    openWindow(w, 'cmd')
    expect(win('cmd').minimized).toBe(false)
    expect(topmost(w)?.id).toBe('cmd')
  })

  it('фокус поднимает окно, не трогая порядок остальных; чужой id безвреден', () => {
    openWindow(w, 'cmd')
    openWindow(w, 'eventvwr')
    openWindow(w, 'services')

    focusWindow(w, 'cmd')
    expect(stack()).toEqual(['eventvwr', 'services', 'cmd'])

    focusWindow(w, 'devmgmt')
    expect(stack()).toEqual(['eventvwr', 'services', 'cmd'])
    expect(new Set(w.windows.map(x => x.z)).size).toBe(3)
  })

  it('закрытие убирает окно, верхним становится следующее; закрытие закрытого безвредно', () => {
    openWindow(w, 'cmd')
    openWindow(w, 'eventvwr')
    closeWindow(w, 'eventvwr')
    expect(isOpen(w, 'eventvwr')).toBe(false)
    expect(topmost(w)?.id).toBe('cmd')
    expect(() => closeWindow(w, 'eventvwr')).not.toThrow()
  })

  it('свёрнутое окно открыто, но не видно и не бывает верхним; восстановление поднимает', () => {
    openWindow(w, 'eventvwr')
    openWindow(w, 'cmd')
    minimizeWindow(w, 'cmd')

    expect(isOpen(w, 'cmd')).toBe(true)
    expect(visibleWindows(w).map(x => x.id)).toEqual(['eventvwr'])
    expect(topmost(w)?.id).toBe('eventvwr')

    restoreWindow(w, 'cmd')
    expect(topmost(w)?.id).toBe('cmd')
  })

  it('разворот запоминает геометрию и возвращает её; развёрнутое не двигается', () => {
    openWindow(w, 'cmd')
    moveWindow(w, 'cmd', 100, 120)
    expect([win('cmd').x, win('cmd').y]).toEqual([100, 120])
    const before = { x: 100, y: 120, w: win('cmd').w, h: win('cmd').h }

    toggleMaximize(w, 'cmd')
    expect(win('cmd').maximized).toBe(true)
    const maxX = win('cmd').x
    moveWindow(w, 'cmd', 400, 400)
    expect(win('cmd').x).toBe(maxX)

    toggleMaximize(w, 'cmd')
    expect(win('cmd')).toMatchObject({ maximized: false, ...before })
  })
})

/*
  Найдено первой визуальной проверкой: окна открывались по константам
  и вылезали за край области. Рабочий стол сообщает свой размер, и
  менеджер подгоняет под него и новые окна, и уже открытые.
*/
describe('подгонка под размер рабочего стола', () => {
  it('новое окно помещается по ширине и не заезжает под панель задач', () => {
    const s = createWindows()
    setViewport(s, 719, 400)
    openWindow(s, 'services')          // по умолчанию 820 × 560
    expect(win('services', s).x + win('services', s).w).toBeLessThanOrEqual(719)
    expect(win('services', s).y + win('services', s).h).toBeLessThanOrEqual(400 - 44)

    const tiny = createWindows()
    setViewport(tiny, 320, 240)
    openWindow(tiny, 'browser')
    expect(win('browser', tiny).w).toBeGreaterThan(0)
    expect(win('browser', tiny).h).toBeGreaterThan(0)
  })

  it('открытые окна сжимаются вместе со столом', () => {
    const s = createWindows()
    setViewport(s, 1200, 800)
    openWindow(s, 'services')
    setViewport(s, 600, 500)
    expect(win('services', s).w).toBeLessThanOrEqual(600)
    expect(win('services', s).x).toBeLessThan(600)
  })

  it('перетаскивание не уводит окно за края и оставляет заголовок достижимым', () => {
    const s = createWindows()
    setViewport(s, 800, 600)
    openWindow(s, 'cmd')

    moveWindow(s, 'cmd', 5000, 5000)
    expect(win('cmd', s).x).toBeLessThan(800)
    expect(win('cmd', s).y).toBeLessThan(600)

    moveWindow(s, 'cmd', -5000, -500)
    expect(win('cmd', s).y).toBeGreaterThanOrEqual(0)
    expect(win('cmd', s).x + win('cmd', s).w).toBeGreaterThanOrEqual(80)
  })
})
