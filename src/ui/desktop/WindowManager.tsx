import { useGame } from '../../store/useGame'
import { visibleWindows } from '../../store/windows'
import { Window } from './Window'
import { CommandPrompt } from '../apps/CommandPrompt'
import { EventViewer } from '../apps/EventViewer'
import { ServicesApp } from '../apps/ServicesApp'
import { DeviceManager } from '../apps/DeviceManager'
import { NotImplemented } from '../apps/NotImplemented'
import type { AppId } from '../../store/windows'

function appBody(id: AppId) {
  switch (id) {
    case 'cmd': return <CommandPrompt />
    case 'eventvwr': return <EventViewer />
    case 'services': return <ServicesApp />
    case 'devmgmt': return <DeviceManager />
    default: return <NotImplemented id={id} />
  }
}

export function WindowManager() {
  const windows = useGame(s => s.windows)

  return (
    <>
      {visibleWindows(windows).map(win => (
        <Window key={win.id} win={win}>
          {appBody(win.id)}
        </Window>
      ))}
    </>
  )
}
