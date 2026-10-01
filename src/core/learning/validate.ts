import type { Check, Course } from './types'

/**
 * Загрузчик-сторож курсов: бросает при запуске стора.
 *
 * Правило то же, что у сценариев: опечатка автора падает сразу и с
 * адресом, а не у ученика на шестом уроке. Особенно — урок без
 * проверок: он проходился бы сам (`[].every()` истинно), как цель без
 * доказательств засчитывалась бы всегда.
 */
export function validateCourses(courses: Course[], scenarioIds: string[]): void {
  unique(courses.map(c => c.id), id => id)
  for (const course of courses) {
    unique(course.sections.map(s => s.id), id => `${course.id}/${id}`)
    for (const section of course.sections) {
      const at = `${course.id}/${section.id}`
      if (section.lessons.length === 0) fail(at, 'у секции нет уроков')
      if (section.quiz.length === 0) fail(at, 'у квиза нет вопросов')
      unique(section.lessons.map(l => l.id), id => `${at}/${id}`)
      unique(section.quiz.map(q => q.id), id => `${at}/${id}`)
      section.quiz.forEach(q => checkCheck(q, `${at}/${q.id}`))

      for (const lesson of section.lessons) {
        const lat = `${at}/${lesson.id}`
        if (lesson.checks.length === 0) fail(lat, 'у урока нет проверок')
        if (lesson.practice !== undefined && !scenarioIds.includes(lesson.practice)) {
          fail(lat, `практика ссылается на неизвестный сценарий ${lesson.practice}`)
        }
        unique(lesson.checks.map(c => c.id), id => `${lat}/${id}`)
        lesson.checks.forEach(c => checkCheck(c, `${lat}/${c.id}`))
      }
    }
  }
}

function fail(at: string, why: string): never {
  throw new Error(`курс ${at}: ${why}`)
}

function unique(ids: string[], at: (id: string) => string): void {
  const seen = new Set<string>()
  for (const id of ids) {
    if (seen.has(id)) fail(at(id), 'повторяется id')
    seen.add(id)
  }
}

const blank = (s: string) => s.trim() === ''

function checkCheck(c: Check, at: string): void {
  if (c.kind === 'choice') {
    if (c.options.length < 2) fail(at, 'меньше двух вариантов')
    const right = c.options.filter(o => o.correct).length
    if (right === 0) fail(at, 'нет верного варианта')
    if (right > 1) fail(at, 'верных вариантов больше одного')
    if (c.options.some(o => blank(o.why))) fail(at, 'у варианта нет разбора')
    return
  }
  if (c.accept.filter(a => !blank(a)).length === 0) fail(at, 'нет допустимых ответов')
  if (blank(c.why) || (c.misses ?? []).some(m => blank(m.why))) fail(at, 'у ответа нет разбора')
}
