import { useGame, type Tool } from '../store/useGame'
import { IncidentRail } from './IncidentRail'
import { QueueView } from './QueueView'
import { TicketView } from './TicketView'
import { RemoteDesktop } from './RemoteDesktop'
import { DirectoryConsole } from './apps/DirectoryConsole'
import { ServerRoom } from './ServerRoom'
import { AssetsView } from './AssetsView'
import { LogisticsView } from './LogisticsView'
import { KnowledgeView } from './KnowledgeView'
import { CommsView } from './CommsView'
import { SettingsView } from './SettingsView'
import { ScorecardView } from './ScorecardView'
import { HistoryView } from './HistoryView'
import { ProfileView } from './ProfileView'
import { CoursesView } from './CoursesView'
import { InterviewView } from './InterviewView'
import { BRAND } from '../brand'

const TOOLS: Array<{ id: Tool; label: string }> = [
  { id: 'queue', label: 'Очередь' },
  { id: 'ticket', label: 'Тикет' },
  { id: 'comms', label: 'Связь' },
  { id: 'terminal', label: 'Удалёнка' },
  { id: 'directory', label: 'Каталог' },
  { id: 'serverroom', label: 'Серверная' },
  { id: 'assets', label: 'Активы' },
  { id: 'logistics', label: 'Логистика' },
  { id: 'kb', label: 'Документация' },
  { id: 'scorecard', label: 'Разбор' },
  { id: 'history', label: 'История' },
  { id: 'profile', label: 'Профиль' },
  { id: 'courses', label: 'Курсы' },
  { id: 'interview', label: 'Интервью' },
  { id: 'settings', label: 'Настройки' },
]

export function Shell() {
  const tool = useGame(s => s.activeTool)
  const setTool = useGame(s => s.setTool)

  return (
    <div className="shell">
      <nav className="nav" aria-label="Инструменты">
        <div className="brand">
          <b>Служба поддержки</b>
          <span>Первая линия, {BRAND.domain}</span>
        </div>

        {TOOLS.map(t => (
          <button
            key={t.id}
            type="button"
            aria-current={tool === t.id}
            onClick={() => setTool(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <IncidentRail />

      <main className="main">
        {tool === 'queue' && <QueueView />}
        {tool === 'ticket' && <TicketView />}
        {tool === 'comms' && <CommsView />}
        {tool === 'terminal' && <RemoteDesktop />}
        {tool === 'directory' && <DirectoryConsole />}
        {tool === 'serverroom' && <ServerRoom />}
        {tool === 'assets' && <AssetsView />}
        {tool === 'logistics' && <LogisticsView />}
        {tool === 'kb' && <KnowledgeView />}
        {tool === 'scorecard' && <ScorecardView />}
        {tool === 'history' && <HistoryView />}
        {tool === 'profile' && <ProfileView />}
        {tool === 'courses' && <CoursesView />}
        {tool === 'interview' && <InterviewView />}
        {tool === 'settings' && <SettingsView />}
      </main>
    </div>
  )
}
