/**
 * Единый вид даты в истории и разборе.
 *
 * Запись истории хранит время закрытия как ISO-строку. Показывается оно
 * в UTC, тем же стилем, что и журнал событий: день.месяц.год часы:минуты.
 * Минуты важны для истории — два тикета за смену иначе не различить.
 */
export function formatDateTime(iso: string): string {
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getUTCDate())}.${p(d.getUTCMonth() + 1)}.${d.getUTCFullYear()} `
    + `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`
}
