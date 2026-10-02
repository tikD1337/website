import { portStatus } from '../../core/network/link'
import type { NetSwitch, SwitchPort, WorldState } from '../../core/world/types'

/**
 * Лицевая панель коммутатора.
 *
 * Порты стоят, как на железе: блоками по двенадцать, нечётные сверху,
 * чётные снизу. Состояние — знаком и словом, не цветом: цвет в проекте
 * означает только суждение, а «порт выключен» — факт, не оценка.
 */

export const STATUS_WORD: Record<ReturnType<typeof portStatus>, string> = {
  connected: 'подключён',
  notconnect: 'нет линка',
  disabled: 'выключен',
  'err-disabled': 'отключён защитой',
}

const SYMBOL: Record<ReturnType<typeof portStatus>, string> = {
  connected: '●',
  notconnect: '○',
  disabled: '×',
  'err-disabled': '⊘',
}

const number = (p: SwitchPort) => p.name.split('/').at(-1)!

export function PortGrid({ world, sw, selected, onSelect }: {
  world: WorldState
  sw: NetSwitch
  selected: string | null
  onSelect: (port: string) => void
}) {
  const blocks: SwitchPort[][] = []
  for (let i = 0; i < sw.ports.length; i += 12) blocks.push(sw.ports.slice(i, i + 12))

  return (
    <div className="faceplate">
      <div className="ports" role="group" aria-label={`Порты ${sw.hostname}`}>
        {blocks.map(block => (
          <div className="port-block" key={block[0]!.name}>
            {block.map(p => {
              const status = portStatus(world, p)
              return (
                <button
                  key={p.name}
                  type="button"
                  className="port"
                  aria-pressed={selected === p.name}
                  aria-label={`${p.name}, ${STATUS_WORD[status]}, `
                    + (p.mode === 'trunk' ? 'магистраль' : `VLAN ${p.accessVlan}`)}
                  title={`${p.name} ${p.description}`}
                  onClick={() => onSelect(p.name)}
                >
                  <span className="sym" aria-hidden="true">{SYMBOL[status]}</span>
                  <span className="num" aria-hidden="true">{number(p)}</span>
                </button>
              )
            })}
          </div>
        ))}
      </div>
      <p className="sub legend">
        <span>● подключён</span><span>○ нет линка</span><span>× выключен</span><span>⊘ отключён защитой</span>
      </p>
    </div>
  )
}
