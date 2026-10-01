import { LIBRARY } from './library'

/**
 * Все строки решений библиотеки — то, чего нет ни в бандле, ни в ответах
 * сервера до срока.
 *
 * Только тесты. Допустимые ответы ввода (`accept`, `misses[].answer`) сюда
 * не входят: команда вроде `ipconfig /release` законно стоит в тексте
 * урока — на неё проверяется поле, а не строка.
 *
 * Секрет — только то, чего нет в открытом материале. Курс учит тому же,
 * что требуют цели сценариев («Подключиться к машине»), а разбор варианта
 * может дословно повторять свой урок: такие строки и так видны каждому,
 * кто открыл урок. То же правило держит тест интервьюера (срез 7Б).
 */
export function secrets(): string[] {
  const { scenarios, courses, tracks } = LIBRARY
  const lessons = courses.flatMap(c => c.sections.flatMap(s => s.lessons))
  const checks = courses.flatMap(c => c.sections.flatMap(s => [...s.lessons.flatMap(l => l.checks), ...s.quiz]))
  const open = JSON.stringify([
    lessons.map(l => [l.title, l.body]),
    checks.map(k => [k.prompt, k.kind === 'choice' ? k.options.map(o => o.text) : []]),
    scenarios.map(s => [s.summary, s.description, s.persona, s.confirmReplies]),
    tracks.map(t => [t.greeting, t.yourQuestions, t.company, t.faq,
      [t.intro, ...t.technical, ...t.experience].map(q => q.prompt)]),
  ])
  const all = [
    ...scenarios.flatMap(s => [
      s.rootCause,
      ...s.objectives.flatMap(o => [o.title, o.why, ...o.steps]),
      ...s.actionsToAvoid,
      ...s.fixedWhen.map(c => c.message),
      ...(s.silentFaultChecks ?? []).map(c => c.message),
      ...(s.asks ?? []).flatMap(a => [a.ask, a.reply, a.replyIfBroken ?? '']),
    ]),
    ...courses.flatMap(c => c.sections.flatMap(s => [...s.lessons.flatMap(l => l.checks), ...s.quiz]))
      .flatMap(k => k.kind === 'choice' ? k.options.map(o => o.why) : [k.why, ...(k.misses ?? []).map(m => m.why)]),
    ...tracks.flatMap(t => [t.intro, ...t.technical, ...t.experience])
      .flatMap(q => [q.expected, ...q.points.map(p => p.why)]),
  ]
  // JSON-экранирование одинаковое в материале и в проверяемых ответах — сравниваем в нём.
  return [...new Set(all.filter(x => x.trim().length > 0 && !open.includes(JSON.stringify(x).slice(1, -1))))]
}
