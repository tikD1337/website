import type { SessionLog } from '../session/types'
import type { Ticket } from '../tickets/types'
import type { Scenario } from '../scenario/types'
import type { NoteScore, NotePart, Penalty } from './types'

/**
 * Оценка заметки без языковой модели.
 *
 * Принцип: заметка сверяется не со словарём «правильных слов», а с
 * **журналом сессии** — мы точно знаем, что произошло. Поэтому вопрос
 * не «употребил ли техник слово „проверил“», а «назвал ли он команду,
 * которую действительно запускал, и значение, которое действительно
 * получилось».
 *
 * Это не идеально: заметка, написанная очень необычно, может недобрать
 * балл. Компенсируется прозрачностью — разбор показывает построчно,
 * что засчитано и почему, так что игрок учится формату, а не гадает.
 */

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim()

/** Значения, реально фигурировавшие в изменениях мира. */
function changedValues(session: SessionLog): string[] {
  const out: string[] = []

  for (const c of session.changes) {
    // Значения: адреса, состояния служб, типы запуска.
    for (const v of [c.before, c.after]) {
      if (typeof v === 'string' && v.length >= 3) out.push(v.toLowerCase())
    }

    /*
      Имя объекта из пути изменения.

      «devices.AL-DSK-0192.services.Spooler.status» — упоминание Spooler
      в заметке так же конкретно, как упоминание адреса в сетевом
      сценарии. Без этого грейдер требовал бы от техника цитировать
      служебные строки вроде «running», что заметку только испортит.
    */
    const parts = c.path.split('.')
    for (const p of parts.slice(2)) {
      if (p.length >= 3 && !['services', 'adapters', 'status'].includes(p)) {
        out.push(p.toLowerCase())
      }
    }
  }

  return [...new Set(out)]
}

/** Команды, реально запускавшиеся в сессии. */
function ranCommands(session: SessionLog): string[] {
  return [...new Set(session.commands.map(c => norm(c.cmdline)))]
}

/** Команды, завершившиеся неуспешно — «проверки, которые ничего не дали». */
function fruitlessCommands(session: SessionLog): string[] {
  return [...new Set(
    session.commands.filter(c => c.exitCode !== 0).map(c => norm(c.cmdline)),
  )]
}

/** Заявитель действительно подтвердил, что проблема ушла. */
function confirmationHappened(session: SessionLog): boolean {
  return session.flags.userConfirmed
}

export function gradeNote(
  note: string,
  session: SessionLog,
  ticket: Ticket,
  scenario: Scenario,
): NoteScore {
  const n = norm(note)
  const wordCount = n ? n.split(' ').length : 0

  const ran = ranCommands(session)
  const fruitless = fruitlessCommands(session)
  const values = changedValues(session)

  // 1. Симптом словами заявителя, а не переформулированный в диагноз.
  const symptomWords = [
    ...scenario.persona.knows.flatMap(k => k.toLowerCase().split(/\s+/)),
    'сайт', 'сайты', 'открыва', 'интернет',
  ]
  const symptomEarned = symptomWords.some(w => w.length > 4 && n.includes(w))

  // 2. Проверки и что они исключили.
  //
  //    Недостаточно назвать команду, которая падала: в этом сценарии
  //    ipconfig /renew сначала падает, потом проходит, так что упоминание
  //    ничего не доказывает. Рубрика требует, чтобы техник **сказал**, что
  //    проверка ничего не дала. Поэтому нужны три вещи разом: провал был
  //    в журнале, названы минимум две реально выполненные команды, и в
  //    тексте есть явный признак отрицательного результата.
  const namedCommands = ran.filter(c => n.includes(c))

  /*
    Работа мышью — такая же проверка, как команда.

    Грейдер изначально знал только про терминал, и заметка о разборе
    через окна теряла балл ни за что. Названные инструменты и объекты
    засчитываются наравне с командами.
  */
  const GUI_EVIDENCE = [
    'журнал событий', 'просмотр событий', 'журнале событий',
    'окно служб', 'окне служб', 'диспетчер устройств', 'диспетчере устройств',
    'тип запуска', 'типа запуска', 'состояние службы',
  ]
  const namedGui = GUI_EVIDENCE.filter(g => n.includes(g))
  const evidenceCount = namedCommands.length + namedGui.length

  const hadFruitless = fruitless.length > 0
  const NEGATIVE_MARKERS = [
    'ошибк', 'не прошёл', 'не прошел', 'не сработал', 'не помог',
    'исключ', 'ничего не', 'не дал', 'таймаут', 'безрезультат', 'отброс',
  ]
  const mentionsNegative = NEGATIVE_MARKERS.some(m => n.includes(m))
  /*
    Отрицательный результат обязателен только там, где он был.

    В сетевом сценарии renew падает, и умолчать об этом — потеря. В
    сценарии со службой падений нет: требовать «скажите, что не
    сработало» значило бы требовать выдумки.
  */
  const checksEarned = evidenceCount >= 2 && (!hadFruitless || mentionsNegative)

  // 3. Конкретное изменение: названо значение из журнала изменений.
  const changeEarned = values.some(v => n.includes(v))

  // 4. Подтверждение: оно состоялось И упомянуто в заметке.
  const confirmed = confirmationHappened(session)
  const mentionsConfirm = ['подтверд', 'заявител', 'пользовател', 'проверено']
    .some(t => n.includes(t))
  const verificationEarned = confirmed && mentionsConfirm

  // 5. Что нужно следующему технику.
  const handoffEarned = [
    'причин', 'при повторении', 'повторится', 'следующ', 'эскал',
    'сетев', 'второй линии', 'вторую линию', 'драйвер', 'заменён', 'заменен',
  ].some(t => n.includes(t))

  const parts: NotePart[] = [
    {
      id: 'symptom',
      label: 'Симптом словами заявителя',
      earned: symptomEarned,
      explain: symptomEarned
        ? 'Симптом описан так, как его видел пользователь.'
        : 'Не сказано, что именно наблюдал заявитель. Диагноз вместо симптома '
          + 'не даёт следующему технику понять, с чего всё началось.',
    },
    {
      id: 'checks',
      label: 'Проверки и что они исключили',
      earned: checksEarned,
      explain: checksEarned
        ? `Названы выполненные проверки (${evidenceCount}).`
        : evidenceCount < 2
          ? 'Нужно назвать минимум две проверки — команды или то, что смотрели в окнах.'
          : 'Не сказано, что какая-то из проверок ничего не дала. Именно это '
            + 'показывает, что версия была отброшена, а не забыта.',
    },
    {
      id: 'change',
      label: 'Внесённое изменение',
      earned: changeEarned,
      explain: changeEarned
        ? 'Изменение названо конкретным значением из журнала.'
        : 'Не названо конкретное значение — адрес, служба или учётная запись. '
          + '«Починил» не позволяет повторить или откатить.',
    },
    {
      id: 'verification',
      label: 'Чем подтверждено',
      earned: verificationEarned,
      explain: verificationEarned
        ? 'Подтверждение состоялось и упомянуто в заметке.'
        : confirmed
          ? 'Подтверждение было, но в заметке о нём ни слова.'
          : 'Подтверждения от заявителя вообще не было — проверка со своего '
            + 'экрана его не заменяет.',
    },
    {
      id: 'handoff',
      label: 'Что нужно следующему',
      earned: handoffEarned,
      explain: handoffEarned
        ? 'Указана причина или что делать при повторении.'
        : 'Следующий техник не узнает ни причины, ни что делать, если '
          + 'проблема вернётся.',
    },
  ]

  const penalties: Penalty[] = []

  /*
    Утечка секрета — это записанный пароль, а не слово «пароль».

    Прежнее правило штрафовало любое слово из шести букв после
    «пароль», и фраза «пароль верный, поэтому не сбрасывал» теряла три
    балла — хотя описывает единственно верное решение. Секрет узнаётся
    по виду: латиница вперемешку с цифрой, то есть то, что человек не
    пишет в обычной фразе.
  */
  const SECRET_LIKE = /(?=\S*[A-Za-z])(?=\S*\d)[A-Za-z\d!@#$%^&*_.+-]{6,}/
  const afterPassword = note.match(/парол[ья]\s*[:—–-]?\s*(\S+)/i)?.[1] ?? ''

  if (SECRET_LIKE.test(afterPassword) || /passw0rd/i.test(note)) {
    penalties.push({
      id: 'plaintext-secret',
      label: 'Пароль или секрет открытым текстом',
      points: 3,
    })
  }

  if (wordCount < 12 && !changeEarned) {
    penalties.push({
      id: 'no-specifics',
      label: 'Отписка без единой конкретики',
      points: 10,
    })
  }

  const earnedCount = parts.filter(p => p.earned).length
  const raw = Math.round((earnedCount / parts.length) * 10)
  const deduction = penalties.reduce((a, p) => a + p.points, 0)
  const score = Math.max(0, raw - deduction)

  void ticket
  return { score, parts, penalties }
}
