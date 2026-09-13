/**
 * Живая проверка промпта на настоящей модели.
 *
 * Тесты промпта работают на моках: они доказывают, что в запрос не
 * попала разгадка, но не отвечают на главный вопрос — **удержится ли
 * модель в роли**. Языковая модель охотно «помогает»: советует
 * перезагрузиться, называет службы, ставит диагноз. Заявитель так не
 * говорит, и такая подсказка обесценивает тренировку сильнее прямой
 * утечки, потому что выглядит правдоподобно.
 *
 * Скрипт прогоняет несколько реплик по всем сценариям библиотеки и
 * печатает ответы вместе с автоматическими придирками. Решение
 * принимает человек: это инструмент для глаз, а не тест.
 *
 *   node scripts/probe-model.mjs [модель]
 */

import { readFileSync } from 'node:fs'

const MODEL = process.argv[2] ?? 'qwen2.5:14b'
const URL = 'http://localhost:11434/v1/chat/completions'

/*
  Сценарии читаются как текст и разбираются грубо: скрипт живёт вне
  сборки, тянуть сюда TypeScript-модули значило бы городить транспиляцию
  ради диагностики.
*/
function personaOf(file) {
  const src = readFileSync(new URL(`../src/scenarios/${file}`, import.meta.url), 'utf8')

  const grab = (key) => {
    const start = src.indexOf(`${key}: [`)
    if (start < 0) return []
    const body = src.slice(start + key.length + 3)
    const end = body.indexOf('\n    ]')
    return [...body.slice(0, end).matchAll(/'([^']+)'/g)].map(m => m[1])
  }

  const rootCause = src.match(/rootCause:\s*\n?\s*'([\s\S]*?)',\n\n/)?.[1]
    ?? src.match(/rootCause:\s*'([^']+)'/)?.[1]
    ?? ''

  const description = src.match(/description:\s*\n?\s*'([\s\S]*?)',\n\s+requester/)?.[1] ?? ''

  return {
    knows: grab('knows'),
    doesntKnow: grab('doesntKnow'),
    canDoIfAsked: grab('canDoIfAsked'),
    rootCause: rootCause.replace(/'\s*\+\s*\n\s*'/g, ''),
    description: description.replace(/'\s*\+\s*\n\s*'/g, ''),
  }
}

/** Повторяет сборку промпта из src/core/dialogue/prompt.ts. */
function systemPrompt(p, name, problemGone) {
  return [
    `Ты играешь роль сотрудника по имени ${name}.`,
    '',
    'Ты обратился в службу поддержки и разговариваешь с техником.',
    'Ты НЕ технический специалист. Ты не знаешь, из-за чего возникла',
    'проблема, и не должен предполагать причину, предлагать решения,',
    'называть команды, службы, драйверы или настройки. Ты описываешь',
    'только то, что видишь на экране и что чувствуешь.',
    '',
    'Правила, которые нельзя нарушать:',
    '1. Отвечай одной-двумя фразами. Ты человек в разговоре, а не справка.',
    '2. Никогда не ставь диагноз и не подсказывай технику, что делать.',
    '3. Если не знаешь ответа — так и скажи: «не знаю», «не разбираюсь».',
    '4. Не выдумывай факты о системе. Если чего-то нет в списке ниже,',
    '   значит ты этого не знаешь.',
    '5. Ты выполняешь просьбы техника, если они тебе по силам, и',
    '   сообщаешь, что получилось.',
    '6. Не переходи на технический язык, даже если техник его использует.',
    '',
    'Это телефонный разговор: коротко, разговорно, без форматирования.',
    '',
    'Твоё обращение в поддержку было таким:',
    `«${p.description}»`,
    '',
    'Что ты знаешь и можешь рассказать:',
    ...p.knows.map(k => `- ${k}`),
    '',
    'Чего ты не знаешь и не понимаешь:',
    ...p.doesntKnow.map(k => `- ${k}`),
    '',
    'Что ты можешь сделать, если попросят:',
    ...p.canDoIfAsked.map(k => `- ${k}`),
    '',
    problemGone
      ? 'Прямо сейчас проблема, с которой ты обращался, БОЛЬШЕ НЕ ПОВТОРЯЕТСЯ. '
        + 'Если техник попросит проверить — проверь и подтверди, что заработало.'
      : 'Прямо сейчас проблема, с которой ты обращался, ВСЁ ЕЩЁ ЕСТЬ. '
        + 'Если техник попросит проверить — проверь и скажи, что ничего не '
        + 'изменилось. Не говори, что заработало, пока это не так.',
  ].join('\n')
}

async function ask(system, said) {
  const res = await fetch(URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: said },
      ],
      max_tokens: 160,
      temperature: 0.7,
      stream: false,
    }),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return (await res.json()).choices?.[0]?.message?.content?.trim() ?? '(пусто)'
}

/** Признаки того, что модель вышла из роли. */
const TECH_WORDS = [
  'ipconfig', 'dhcp', 'dns', 'кэш', 'драйвер', 'служб', 'реестр',
  'перезагруз', 'администратор', 'настройк', 'сервер', 'групп',
  'политик', 'spooler', 'диспетчер',
]

const CASES = [
  { file: 'identity-account-lockout.ts', name: 'Elena Varga' },
  { file: 'net-apipa-no-lease.ts', name: 'Priya Raman' },
  { file: 'print-spooler-stopped.ts', name: 'Sam Okafor' },
  { file: 'identity-share-access.ts', name: 'Nadia Haruna' },
]

const QUESTIONS = [
  'Здравствуйте, служба поддержки. Расскажите, что происходит?',
  'Когда это началось?',
  'А как вы думаете, из-за чего это? Что могло сломаться?',
  'Что мне сделать, чтобы починить?',
]

console.log(`Модель: ${MODEL}\n${'='.repeat(72)}`)

for (const { file, name } of CASES) {
  const p = personaOf(file)
  const system = systemPrompt(p, name, false)

  console.log(`\n### ${file} — ${name}`)

  for (const q of QUESTIONS) {
    const t0 = Date.now()
    let answer
    try {
      answer = await ask(system, q)
    } catch (e) {
      console.log(`  ✕ ${e.message}`)
      continue
    }
    const ms = Date.now() - t0

    console.log(`\n  Техник: ${q}`)
    console.log(`  ${name}: ${answer}`)

    const flags = []
    const low = answer.toLowerCase()

    const tech = TECH_WORDS.filter(w => low.includes(w))
    if (tech.length) flags.push(`технический язык: ${tech.join(', ')}`)

    // Утечка разгадки — самое важное, что здесь проверяется.
    const causeWords = p.rootCause.toLowerCase().match(/[а-яё]{6,}/g) ?? []
    const rare = [...new Set(causeWords)]
      .filter(w => !p.knows.join(' ').toLowerCase().includes(w.slice(0, 5)))
      .filter(w => low.includes(w.slice(0, 6)))
    if (rare.length) flags.push(`СЛОВА ИЗ РАЗГАДКИ: ${rare.join(', ')}`)

    if (answer.split(/[.!?]+/).filter(s => s.trim()).length > 3) {
      flags.push('длинно — больше трёх предложений')
    }
    if (!/[а-яё]/i.test(answer)) flags.push('ответ не по-русски')

    console.log(flags.length
      ? `  ⚠ ${flags.join(' · ')}   [${ms} мс]`
      : `  ✓ в роли   [${ms} мс]`)
  }
}

console.log(`\n${'='.repeat(72)}\nГотово. Читайте ответы глазами: придирки выше — подсказка, не вердикт.`)
