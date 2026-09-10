/**
 * Оконный менеджер рабочего стола удалёнки.
 *
 * Состояние окон живёт **отдельно от `WorldState`** и намеренно.
 * Где лежит окно и что открыто — состояние интерфейса, к инциденту
 * отношения не имеет: свернув «Службы», техник не меняет мир. Смешать
 * их значило бы записывать перетаскивание окна в журнал изменений.
 *
 * Функции чистые в том же смысле, что и остальное ядро: мутируют
 * переданное состояние и ничего не знают о React.
 */

export type AppId =
  | 'cmd'
  | 'eventvwr'
  | 'services'
  | 'devmgmt'
  | 'explorer'
  | 'browser'
  | 'settings'

export interface AppMeta {
  title: string
  w: number
  h: number
  /** реализовано ли приложение; остальные открываются заглушкой */
  implemented: boolean
}

export const APPS: Record<AppId, AppMeta> = {
  cmd: { title: 'Command Prompt', w: 720, h: 420, implemented: true },
  eventvwr: { title: 'Event Viewer', w: 860, h: 520, implemented: true },
  services: { title: 'Services', w: 820, h: 500, implemented: true },
  devmgmt: { title: 'Device Manager', w: 640, h: 460, implemented: true },
  explorer: { title: 'File Explorer', w: 700, h: 460, implemented: false },
  browser: { title: 'Larkspur Browser', w: 900, h: 560, implemented: false },
  settings: { title: 'Settings', w: 780, h: 520, implemented: false },
}

export interface WindowState {
  id: AppId
  title: string
  x: number
  y: number
  w: number
  h: number
  z: number
  minimized: boolean
  maximized: boolean
  /** размеры до разворота, чтобы вернуть их обратно */
  restore: { x: number; y: number; w: number; h: number } | null
}

export interface WindowsState {
  windows: WindowState[]
  nextZ: number
  /** сколько окон уже открывалось — для каскада */
  opened: number
  /**
   * Размер рабочего стола в пикселях.
   *
   * Окна подгоняются под него, а не под константы из APPS: иначе
   * окно шириной 820 вылезет за край области в 719 — это и случилось
   * при первой визуальной проверке.
   */
  viewport: { w: number; h: number }
}

const CASCADE_STEP = 28
const CASCADE_ORIGIN = { x: 40, y: 24 }
const CASCADE_WRAP = 6

export function createWindows(): WindowsState {
  return { windows: [], nextZ: 1, opened: 0, viewport: { w: 1024, h: 640 } }
}

/** Рабочий стол сообщает свой размер: от него зависят размеры окон. */
export function setViewport(s: WindowsState, w: number, h: number): void {
  s.viewport = { w: Math.max(320, w), h: Math.max(240, h) }

  // Уже открытые окна возвращаются в границы.
  for (const win of s.windows) {
    win.w = Math.min(win.w, s.viewport.w - 16)
    win.h = Math.min(win.h, s.viewport.h - TASKBAR - 16)
    clampInto(s, win)
  }
}

/** Высота панели задач — окна не должны под неё заезжать. */
const TASKBAR = 44

/**
 * Возвращает окно в пределы рабочего стола.
 *
 * Полностью запирать окно внутри нельзя — тогда его не подвинуть к
 * краю. Но заголовок должен остаться доступным, иначе окно потеряно.
 */
function clampInto(s: WindowsState, win: WindowState): void {
  const maxX = s.viewport.w - MIN_VISIBLE
  const maxY = s.viewport.h - TASKBAR - BAR_HEIGHT
  win.x = Math.min(Math.max(-win.w + MIN_VISIBLE, win.x), maxX)
  win.y = Math.min(Math.max(0, win.y), Math.max(0, maxY))
}

const MIN_VISIBLE = 80
const BAR_HEIGHT = 30

function find(s: WindowsState, id: AppId): WindowState | undefined {
  return s.windows.find(x => x.id === id)
}

export function isOpen(s: WindowsState, id: AppId): boolean {
  return s.windows.some(x => x.id === id)
}

/** Видимые окна — то есть открытые и не свёрнутые. */
export function visibleWindows(s: WindowsState): WindowState[] {
  return s.windows.filter(x => !x.minimized)
}

/** Верхнее видимое окно; свёрнутое верхним быть не может. */
export function topmost(s: WindowsState): WindowState | undefined {
  return visibleWindows(s).reduce<WindowState | undefined>(
    (best, x) => (!best || x.z > best.z ? x : best),
    undefined,
  )
}

function raise(s: WindowsState, win: WindowState): void {
  win.z = s.nextZ
  s.nextZ += 1
}

export function openWindow(s: WindowsState, id: AppId): void {
  const existing = find(s, id)
  if (existing) {
    existing.minimized = false
    raise(s, existing)
    return
  }

  const meta = APPS[id]
  const step = s.opened % CASCADE_WRAP

  // Окно не больше доступного места, с запасом на каскад и панель задач.
  const w = Math.min(meta.w, s.viewport.w - 2 * CASCADE_ORIGIN.x)
  const h = Math.min(meta.h, s.viewport.h - TASKBAR - 2 * CASCADE_ORIGIN.y)

  const x = Math.min(
    CASCADE_ORIGIN.x + step * CASCADE_STEP,
    Math.max(0, s.viewport.w - w - 8),
  )
  const y = Math.min(
    CASCADE_ORIGIN.y + step * CASCADE_STEP,
    Math.max(0, s.viewport.h - TASKBAR - h - 8),
  )

  s.windows.push({
    id,
    title: meta.title,
    x,
    y,
    w,
    h,
    z: s.nextZ,
    minimized: false,
    maximized: false,
    restore: null,
  })

  s.nextZ += 1
  s.opened += 1
}

export function closeWindow(s: WindowsState, id: AppId): void {
  s.windows = s.windows.filter(x => x.id !== id)
}

export function focusWindow(s: WindowsState, id: AppId): void {
  const win = find(s, id)
  if (!win) return
  raise(s, win)
}

export function minimizeWindow(s: WindowsState, id: AppId): void {
  const win = find(s, id)
  if (win) win.minimized = true
}

export function restoreWindow(s: WindowsState, id: AppId): void {
  const win = find(s, id)
  if (!win) return
  win.minimized = false
  raise(s, win)
}

export function toggleMaximize(s: WindowsState, id: AppId): void {
  const win = find(s, id)
  if (!win) return

  if (win.maximized) {
    if (win.restore) {
      win.x = win.restore.x
      win.y = win.restore.y
      win.w = win.restore.w
      win.h = win.restore.h
    }
    win.maximized = false
    win.restore = null
    return
  }

  win.restore = { x: win.x, y: win.y, w: win.w, h: win.h }
  win.maximized = true
}

/**
 * Перемещение с одним ограничением: заголовок нельзя утащить за верхний
 * край или полностью вывести вбок — иначе окно станет недоступным.
 */
export function moveWindow(s: WindowsState, id: AppId, x: number, y: number): void {
  const win = find(s, id)
  if (!win || win.maximized) return

  win.x = x
  win.y = y
  clampInto(s, win)
}
