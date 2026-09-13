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
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

const MODEL = process.argv[2] ?? 'qwen2.5:14b'
// Не `URL`: так называется глобальный класс, которым ниже читаются файлы.
const ENDPOINT = 'http://localhost:11434/v1/chat/completions'

/*
  Промпт и параметры генерации берутся из кода тренажёра, а не
  повторяются здесь: копия разошлась бы, и проверяли бы мы не то.

  `prompt.ts` не импортирует ничего исполняемого — только типы, которые
  esbuild снимает, — поэтому модуль загружается как есть. Файл с
  импортом соседей так уже не взять: относительные пути внутри `data:`
  не разрешаются.
*/
const { systemPrompt, GENERATION } =
  await loadModule('../src/core/dialogue/prompt.ts')

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

/**
 * Промпт берётся из настоящего `prompt.ts`, а не переписывается здесь.
 *
 * Копия промпта в скрипте разошлась с кодом за один вечер — худший род
 * дефекта для проверочного инструмента: он показывает, что всё хорошо,
 * проверив не то, что уходит модели.
 *
 * Типы снимает esbuild — он и так стоит вместе с Vite. Снимать их
 * регулярками я пробовал; на `as const` это ломается, а чинить разбор
 * TypeScript вручную ради диагностики бессмысленно.
 */
async function loadModule(relPath) {
  const file = fileURLToPath(new URL(relPath, import.meta.url))

  const esbuild = fileURLToPath(new URL(
    process.platform === 'win32'
      ? '../node_modules/esbuild/bin/esbuild'
      : '../node_modules/.bin/esbuild',
    import.meta.url))

  // Через node напрямую: spawn на .cmd под Windows требует shell, а
  // shell тащит за собой экранирование путей с пробелами.
  // Загрузчик по расширению esbuild выбирает сам; `--loader` при чтении
  // из файла он считает ошибкой.
  const js = execFileSync(
    process.execPath,
    [esbuild, file, '--format=esm'],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
  )

  return import(
    `data:text/javascript;base64,${Buffer.from(js).toString('base64')}`)
}

async function ask(system, said) {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: said },
      ],
      // Те же параметры, что в тренажёре: иначе проверяем не то.
      ...GENERATION,
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


/*
  Сводка нужна, чтобы сравнивать модели, а не разглядывать простыню
  текста: «сорвался на китайский трижды из четырёх» — довод, а
  «кажется, отвечает похуже» — нет.
*/
const stats = {
  total: 0, clean: 0, foreign: 0, advice: 0, leak: 0, long: 0, echo: 0,
  times: [],
}

const median = (xs) => {
  if (!xs.length) return 0
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)]
}

for (const { file, name } of CASES) {
  const p = personaOf(file)

  const system = systemPrompt({
    channel: 'call',
    withWhom: name,
    said: '',
    history: [],
    brief: {
      displayName: name,
      dept: '',
      title: '',
      complaint: p.description,
      knows: p.knows,
      doesntKnow: p.doesntKnow,
      canDoIfAsked: p.canDoIfAsked,
      scripted: [],
      problemGone: false,
      confirmReplies: ['', ''],
    },
  })

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

    /*
      Срыв на чужой язык. Многоязычная модель тем охотнее уходит в язык
      обучения, чем длиннее рассуждение: Qwen вставлял китайский,
      Mistral — французское «locaux programs».

      Латиница ловится только та, которой нет в промпте: имена людей,
      названия машин и брендов там законны.
    */
    if (/[一-鿿぀-ヿ가-힯]/.test(answer)) {
      flags.push('СРЫВ НА ЧУЖОЙ ЯЗЫК (иероглифы)')
    } else {
      const latin = [...new Set(answer.match(/\b[A-Za-z]{4,}\b/g) ?? [])]
        .filter(w => !system.includes(w))
      if (latin.length) flags.push(`ЛАТИНИЦА ВНЕ ПРОМПТА: ${latin.join(', ')}`)
    }

    /*
      Пересказ инструкций вслух.

      Заявитель, честно перечисляющий «я не знаю, что такое блокировка,
      и могу удалить учётную запись в почте, если попросят», вываливает
      технику содержимое системного промпта — включая список того, о
      чём его стоит попросить. Вреда не меньше, чем от прямой утечки
      причины, а выглядит правдоподобнее.
    */
    const echoed = [...p.doesntKnow, ...p.canDoIfAsked]
      .filter(item => {
        const core = item.toLowerCase().split(/\s+/).filter(w => w.length > 4)
        return core.length >= 2 && core.every(w => low.includes(w.slice(0, 5)))
      })
    if (echoed.length) {
      flags.push(`ПЕРЕСКАЗ ПРОМПТА: «${echoed[0].slice(0, 40)}…»`)
    }

    /*
      Непрошеный совет. Заявитель, предлагающий «выйти и войти снова»,
      выдаёт половину решения сценария с доступом к папке — и делает
      это правдоподобно, отчего вред больше, чем от прямой утечки.
    */
    const ADVICE = [
      'стоит попробовать', 'может быть, стоит', 'может, стоит',
      'советую', 'рекомендую', 'нужно проверить', 'надо проверить',
      'попробуйте', 'вам стоит',
    ]
    const advice = ADVICE.filter(a => low.includes(a))
    if (advice.length) flags.push(`СОВЕТ ТЕХНИКУ: ${advice.join(', ')}`)

    stats.total += 1
    stats.times.push(ms)
    if (flags.length === 0) stats.clean += 1
    if (flags.some(f => f.includes('ЧУЖОЙ ЯЗЫК') || f.includes('ЛАТИНИЦА'))) {
      stats.foreign += 1
    }
    if (flags.some(f => f.includes('ПЕРЕСКАЗ'))) stats.echo += 1
    if (flags.some(f => f.includes('СОВЕТ'))) stats.advice += 1
    if (flags.some(f => f.includes('РАЗГАДКИ'))) stats.leak += 1
    if (flags.some(f => f.includes('длинно'))) stats.long += 1

    console.log(flags.length
      ? `  ⚠ ${flags.join(' · ')}   [${ms} мс]`
      : `  ✓ в роли   [${ms} мс]`)
  }
}

console.log(`\n${'='.repeat(72)}`)
console.log(`Модель: ${MODEL}`)
console.log(`Ответов: ${stats.total}, из них в роли: ${stats.clean}`)
console.log(`Срывов на чужой язык: ${stats.foreign}`)
console.log(`Пересказов промпта: ${stats.echo}`)
console.log(`Советов технику: ${stats.advice}`)
console.log(`Утечек разгадки: ${stats.leak}`)
console.log(`Слишком длинных: ${stats.long}`)
console.log(`Медиана ответа: ${median(stats.times)} мс`)
console.log('\nЧитайте ответы глазами: придирки — подсказка, не вердикт.')
console.log('Сравнить другую модель: node scripts/probe-model.mjs gemma2:9b')
