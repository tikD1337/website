import { useState, useRef, useEffect, type FormEvent, type KeyboardEvent } from 'react'
import { useGame } from '../../store/useGame'
import { newCli, promptOf } from '../../core/switchcli/cli'

/**
 * Консоль коммутатора — сеанс SSH из серверной.
 *
 * Устроена как командная строка машины: строки вывода, приглашение,
 * история по стрелкам. Отличие одно, и оно из настоящей консоли: после
 * `?` набранное возвращается в строку ввода, чтобы продолжить с того
 * места, где спросил.
 */
export function SwitchConsole({ device }: { device: string }) {
  const open = useGame(s => s.consoles[device])
  const openConsole = useGame(s => s.openConsole)
  const run = useGame(s => s.runSwitchCommand)

  const [input, setInput] = useState('')
  const [history, setHistory] = useState<string[]>([])
  const [cursor, setCursor] = useState(-1)
  const bottom = useRef<HTMLDivElement>(null)
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => { openConsole(device) }, [device, openConsole])

  const lines = open?.lines ?? []
  const cli = open?.cli ?? newCli(device)

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' })
    if (open?.draft) setInput(open.draft)
  }, [lines.length, open?.draft])

  function submit(e: FormEvent) {
    e.preventDefault()
    run(device, input)
    if (input.trim() && !input.trim().endsWith('?')) setHistory(h => [input, ...h])
    setCursor(-1)
    setInput('')
  }

  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault()
      const next = e.key === 'ArrowUp' ? Math.min(cursor + 1, history.length - 1) : cursor - 1
      if (e.key === 'ArrowUp' && next < 0) return
      setCursor(next)
      setInput(next >= 0 ? history[next] ?? '' : '')
    }
  }

  return (
    <div
      className="term switch-term"
      ref={box}
      onClick={() => box.current?.querySelector('input')?.focus()}
    >
      {lines.map((l, i) => (
        <div key={i} className={l.kind === 'output' ? undefined : l.kind}>{l.text}</div>
      ))}

      <form onSubmit={submit}>
        <span className="prompt">{promptOf(cli)}</span>
        <input
          type="text"
          aria-label={`Консоль ${device}`}
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
