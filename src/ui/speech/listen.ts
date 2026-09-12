/**
 * Распознавание речи.
 *
 * Локальное — то, что даёт сам браузер. Обёртка сознательно тонкая:
 * это надстройка над разговором, а не его основа.
 *
 * **Ввод текстом доступен всегда** и является основным путём. Нет
 * поддержки — кнопки микрофона просто нет, и ничего больше не
 * меняется: ни предупреждений, ни деградированного режима.
 */

type RecognitionCtor = new () => SpeechRecognitionLike

interface SpeechRecognitionLike {
  lang: string
  interimResults: boolean
  maxAlternatives: number
  continuous: boolean
  start(): void
  stop(): void
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null
  onerror: (() => void) | null
  onend: (() => void) | null
}

function ctor(): RecognitionCtor | null {
  if (typeof window === 'undefined') return null

  const w = window as unknown as {
    SpeechRecognition?: RecognitionCtor
    webkitSpeechRecognition?: RecognitionCtor
  }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

export function listenAvailable(): boolean {
  return ctor() !== null
}

export interface Listener {
  stop(): void
}

/**
 * Слушает одну реплику и отдаёт её текстом.
 *
 * Возвращает `null`, когда распознавание недоступно — вызывающая
 * сторона просто не показывает кнопку. Ошибку наружу не бросает
 * никогда: отказ микрофона переводит технику обратно на клавиатуру,
 * а не прерывает инцидент.
 */
export function listenOnce(
  onText: (text: string) => void,
  onDone: () => void,
  lang = 'ru-RU',
): Listener | null {
  const Ctor = ctor()
  if (!Ctor) return null

  try {
    const rec = new Ctor()
    rec.lang = lang
    rec.interimResults = false
    rec.maxAlternatives = 1
    rec.continuous = false

    rec.onresult = e => {
      const text = e.results?.[0]?.[0]?.transcript ?? ''
      if (text.trim()) onText(text.trim())
    }
    rec.onerror = onDone
    rec.onend = onDone

    rec.start()
    return {
      stop() {
        try {
          rec.stop()
        } catch {
          /* уже остановлено */
        }
      },
    }
  } catch {
    onDone()
    return null
  }
}
