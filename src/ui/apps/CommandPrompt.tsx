import { useState, useRef, useEffect, type FormEvent, type KeyboardEvent } from 'react'
import { useGame } from '../../store/useGame'

/**
 * Командная строка внутри окна.
 *
 * Поведение перенесено из прежнего полноэкранного терминала без
 * изменений: те же команды, тот же журнал, та же история по стрелкам.
 * Добавлен только `cls`, которому раньше негде было пригодиться.
 */
export function CommandPrompt() {
  const lines = useGame(s => s.terminalLines)
  const runCommand = useGame(s => s.runCommand)
  const clearTerminal = useGame(s => s.clearTerminal)

  const [input, setInput] = useState('')
  const [history, setHistory] = useState<string[]>([])
  const [cursor, setCursor] = useState(-1)

  const bottom = useRef<HTMLDivElement>(null)
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' })
  }, [lines.length])

  function submit(e: FormEvent) {
    e.preventDefault()
    const line = input.trim()
    if (!line) return

    if (line.toLowerCase() === 'cls') {
      clearTerminal()
    } else {
      runCommand(input)
    }

    setHistory(h => [input, ...h])
    setCursor(-1)
    setInput('')
  }

  /** Стрелки листают историю команд — как в настоящей консоли. */
  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      const next = Math.min(cursor + 1, history.length - 1)
      if (next >= 0) {
        setCursor(next)
        setInput(history[next] ?? '')
      }
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      const next = cursor - 1
      setCursor(next)
      setInput(next >= 0 ? history[next] ?? '' : '')
    }
  }

  return (
    <div
      className="term"
      ref={box}
      onClick={() => box.current?.querySelector('input')?.focus()}
    >
      {lines.map((l, i) => (
        <div key={i} className={l.kind === 'output' ? undefined : l.kind}>
          {l.text}
        </div>
      ))}

      <form onSubmit={submit}>
        <span className="prompt">{'C:\\Users\\Technician>'}</span>
        <input
          type="text"
          aria-label="Ввод команды"
          value={input}
          autoFocus
          autoComplete="off"
          spellCheck={false}
          onKeyDown={onKey}
          onChange={e => setInput(e.target.value)}
        />
      </form>

      <div ref={bottom} />
    </div>
  )
}
