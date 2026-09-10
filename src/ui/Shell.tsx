import { useGame, type Tool } from '../store/useGame'
import { IncidentRail } from './IncidentRail'
import { QueueView } from './QueueView'
import { TicketView } from './TicketView'
import { TerminalView } from './TerminalView'
import { ScorecardView } from './ScorecardView'
import { BRAND } from '../brand'

const TOOLS: Array<{ id: Tool; label: string }> = [
  { id: 'queue', label: 'Очередь' },
  { id: 'ticket', label: 'Тикет' },
  { id: 'terminal', label: 'Удалёнка' },
  { id: 'scorecard', label: 'Разбор' },
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
        {tool === 'terminal' && <TerminalView />}
        {tool === 'scorecard' && <ScorecardView />}
      </main>
    </div>
  )
}
