/**
 * Синтез речи.
 *
 * Обёртка над `speechSynthesis` с полными проверками: браузер без
 * поддержки, выключенная озвучка, пустой список голосов — всё это
 * штатные состояния, а не ошибки. Наружу никогда не летит исключение:
 * проверка среза требует, чтобы тренировка продолжалась без единой
 * ошибки нашего кода.
 *
 * Синтез — надстройка. Текст на экране остаётся всегда, и выключение
 * озвучки не отнимает ничего, кроме звука.
 */

export function speechAvailable(): boolean {
  return typeof window !== 'undefined'
    && typeof window.speechSynthesis !== 'undefined'
    && typeof window.SpeechSynthesisUtterance === 'function'
}

/**
 * Голос под язык реплики.
 *
 * Список голосов в некоторых браузерах наполняется асинхронно и на
 * первом вызове пуст — тогда говорим голосом по умолчанию, это лучше
 * молчания.
 */
function pickVoice(lang: string): SpeechSynthesisVoice | null {
  try {
    const voices = window.speechSynthesis.getVoices()
    if (!voices || voices.length === 0) return null
    return voices.find(v => v.lang?.toLowerCase().startsWith(lang)) ?? null
  } catch {
    return null
  }
}

export function speak(text: string, lang = 'ru'): void {
  if (!speechAvailable() || !text.trim()) return

  try {
    // Новая реплика перебивает предыдущую: разговор идёт вперёд.
    window.speechSynthesis.cancel()

    const u = new window.SpeechSynthesisUtterance(text)
    u.lang = lang === 'ru' ? 'ru-RU' : lang
    u.rate = 1
    u.pitch = 1

    const voice = pickVoice(lang)
    if (voice) u.voice = voice

    window.speechSynthesis.speak(u)
  } catch {
    /*
      Молча. Отказ синтеза не должен прерывать инцидент: техник
      продолжает читать реплики глазами, и это полноценный режим.
    */
  }
}

export function stopSpeaking(): void {
  if (!speechAvailable()) return
  try {
    window.speechSynthesis.cancel()
  } catch {
    /* см. выше */
  }
}
