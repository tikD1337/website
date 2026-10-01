import { describe, it, expect } from 'vitest'
import { createGameStore } from './useGame'
import { testContent } from '../content/server/test-content'
import { defaultConfig } from '../core/dialogue/types'
import type { FetchLike } from '../core/dialogue/openai'

const clock = { now: () => new Date('2026-09-10T09:00:00.000Z') }

/** Стор с взятым тикетом о блокировке; с fetch — модель включена. */
const store = (fetch?: FetchLike) => {
  const g = createGameStore(clock, fetch ? { fetch } : undefined, undefined, testContent())
  const s = () => g.getState()
  const lockout = s().queue.tickets.find(t => t.scenarioId === 'identity-account-lockout')!
  s().claimTicket(lockout.number)
  if (fetch) s().setDialogueConfig({ ...defaultConfig(), mode: 'local' })
  return s
}

const modelSays = (text: string): FetchLike => async () => ({
  ok: true,
  status: 200,
  json: async () => ({ choices: [{ message: { content: text } }] }),
})

/** Модель, которая отвечает только по команде: ответ приходит в изменившийся мир. */
const slowModel = (text: string) => {
  let release = () => {}
  const fetch: FetchLike = async () => {
    await new Promise<void>(r => { release = r })
    return modelSays(text)('', {})
  }
  return { fetch, release: () => release() }
}

const assignedTicket = (s: ReturnType<typeof store>) =>
  s().queue.tickets.find(t => t.number === s().queue.assigned)!

/** Техник починил инцидент с блокировкой: сверил личность и снял блокировку. */
const fix = (s: ReturnType<typeof store>) => {
  s().verifyRequester('manager', 'Dumisani Mbeki')
  s().unlockUser('e.varga')
}

describe('реплика', () => {
  it('без тикета, без собеседника и пустая — не уходит', async () => {
    const g = createGameStore(clock, undefined, undefined, testContent())
    g.getState().callTo('e.varga')
    await g.getState().say('Здравствуйте')
    expect(g.getState().session.dialogue).toHaveLength(0)

    const s = store()
    await s().say('Здравствуйте')
    s().callTo('e.varga')
    await s().say('   ')
    expect(s().session.dialogue).toHaveLength(0)
  })

  /*
    Найдено разбором среза 3: переписка подписывала реплику техника
    именем заявителя.
  */
  it('обе стороны пишутся в журнал и в переписку тикета, в выбранном канале', async () => {
    const s = store()
    s().setChannel('mail')
    s().callTo('e.varga')
    await s().say('Когда это началось?')

    expect(s().session.dialogue.map(d => [d.speaker, d.channel, d.with])).toEqual([
      ['technician', 'mail', 'e.varga'],
      ['requester', 'mail', 'e.varga'],
    ])
    expect(s().session.dialogue[1]!.text).toContain('Сегодня утром')
    expect(assignedTicket(s).communications.map(c => [c.from, c.with])).toEqual([
      ['technician', 'e.varga'],
      ['e.varga', 'e.varga'],
    ])
  })
})

/**
 * Флаг связи объявлен в срезе 0 и до появления разговора не поднимался
 * ничем. Правило доктрины: проговори действие прежде, чем его сделать.
 */
describe('связь до начала работы', () => {
  it('разговор до изменений засчитывается, после — уже отчёт, а не предупреждение', async () => {
    const before = store()
    before().callTo('e.varga')
    await before().say('Здравствуйте, разбираюсь с вашей заявкой')
    expect(before().session.flags.announcedBeforeActing).toBe(true)

    const after = store()
    after().unlockUser('e.varga')
    after().callTo('e.varga')
    await after().say('Проверьте, пожалуйста')
    expect(after().session.flags.announcedBeforeActing).toBe(false)
  })

  /*
    Найдено разбором кода: кнопка «Позвонить заявителю» записывала
    только ответ, без вопроса. Флаг связи поднимается репликой техника,
    поэтому звонивший кнопкой читал в разборе «на связь до начала работы
    вы не выходили» — при том что звонил. Сверка личности — тоже
    разговор.
  */
  it('сверка личности и кнопка звонка — тоже связь, и вопрос виден в переписке', () => {
    const verified = store()
    verified().verifyRequester('manager', 'Dumisani Mbeki')
    expect(verified().session.flags.announcedBeforeActing).toBe(true)

    const called = store()
    called().confirmWithUser()
    expect(called().session.flags.announcedBeforeActing).toBe(true)
    expect(assignedTicket(called).communications.map(c => c.from))
      .toEqual(['technician', 'e.varga'])
  })
})

describe('масштаб и собеседники', () => {
  it('«у коллег так же?» поднимает флаг масштаба, обычный вопрос — нет', async () => {
    const s = store()
    s().callTo('e.varga')
    await s().say('Когда это началось?')
    expect(s().session.flags.scopeChecked).toBe(false)
    await s().say('У коллег рядом так же?')
    expect(s().session.flags.scopeChecked).toBe(true)
  })

  /*
    Звонить можно любому из справочника, и разговоры не смешиваются:
    контекст беседы с коллегой не попадает в разговор с заявителем.
  */
  it('коллега отвечает про себя, и его разговор отделён от разговора с заявителем', async () => {
    const s = store()
    s().callTo('s.okafor')
    await s().say('У вас так же?')
    expect(s().session.dialogue.at(-1)!.text).toContain('у меня')

    s().callTo('e.varga')
    await s().say('Когда это началось?')

    const byWhom = assignedTicket(s).communications.map(c => c.with)
    expect(byWhom).toEqual(['s.okafor', 's.okafor', 'e.varga', 'e.varga'])
  })
})

/**
 * Подтверждение засчитывается состоянием мира, а не словами.
 *
 * Живая проверка на Ollama показала, почему на «попробуйте» отвечает
 * сценарий, а не модель: блокировку сняли, флаг встал, а модель по
 * инерции твердила «всё ещё заблокирована» — жалоба рядом с галочкой
 * «подтвердил». Вежливость модели не подтверждает непочиненное, а её
 * инерция не отменяет починенного.
 */
describe('подтверждение через разговор', () => {
  it('реплика и флаг следуют миру, а не модели', async () => {
    const broken = store(modelSays('Да-да, спасибо, всё прекрасно работает!'))
    broken().callTo('e.varga')
    await broken().say('Попробуйте войти сейчас')
    expect(broken().session.dialogue.at(-1)!.text).toContain('то же самое')
    expect(broken().session.flags.userConfirmed).toBe(false)

    const fixed = store(modelSays('Нет, всё ещё не пускает!'))
    fix(fixed)
    fixed().callTo('e.varga')
    await fixed().say('Попробуйте войти сейчас')
    expect(fixed().session.dialogue.at(-1)!.text).toContain('пустило')
    expect(fixed().session.flags.userConfirmed).toBe(true)
  })

  it('подтверждает только заявитель, а не коллега', async () => {
    const s = store()
    fix(s)
    s().callTo('s.okafor')
    await s().say('Попробуйте войти сейчас')
    expect(s().session.flags.userConfirmed).toBe(false)
  })
})

describe('модель в сторе', () => {
  /* Проверка среза: модель выключилась — тренировка продолжается с плашкой. */
  it('ответ модели снимает плашку, отказ её показывает', async () => {
    const alive = store(modelSays('Утром, как пришла на работу.'))
    alive().callTo('e.varga')
    await alive().say('Когда это началось?')
    expect(alive().session.dialogue.at(-1)!.text).toBe('Утром, как пришла на работу.')
    expect(alive().dialogueNotice).toBeNull()

    const dead = store(async () => { throw new Error('ECONNREFUSED') })
    dead().callTo('e.varga')
    await dead().say('Когда это началось?')
    expect(dead().session.dialogue.at(-1)!.text).toContain('Сегодня утром')
    expect(dead().dialogueNotice).toContain('недоступна')
  })

  it('настройки модели и результат проверки живут в сторе и переживают сброс', async () => {
    const s = store(modelSays('ок'))
    s().setDialogueConfig({ ...defaultConfig(), mode: 'local', model: 'qwen2.5' })
    await s().probeModel()
    expect(s().probeResult).toEqual({ ok: true })

    s().reset()
    expect(s().dialogueConfig.model).toBe('qwen2.5')
  })
})

describe('ответ, пришедший позже', () => {
  /* Обычные действия во время ожидания ответ не отбрасывают. */
  it('пока модель думает, поднят флаг ожидания, а работа в инструментах не мешает', async () => {
    const m = slowModel('дошёл ответ')
    const s = store(m.fetch)
    s().callTo('e.varga')

    const pending = s().say('Здравствуйте')
    expect(s().waitingReply).toBe(true)
    s().openApp('eventvwr')
    s().runCommand('net user e.varga')
    s().inspectObject('user', 'e.varga')

    m.release()
    await pending
    expect(s().waitingReply).toBe(false)
    expect(s().session.dialogue.at(-1)!.text).toBe('дошёл ответ')
  })

  /*
    Найдено разбором кода: после await проверялся только собеседник.
    Закрытый тикет, сброс и смена собеседника пропускали ответ в
    изменившийся мир — реплика дописывалась в закрытую переписку, а
    `userConfirmed` мог подняться после того, как разбор посчитан.
  */
  it('ответ в изменившийся мир отбрасывается', async () => {
    // Тикет закрыли, пока модель думала.
    const closed = slowModel('поздний ответ')
    const a = store(closed.fetch)
    const ticket = assignedTicket(a)
    fix(a)
    a().callTo('e.varga')
    const p1 = a().say('Что сейчас на экране?')
    a().setResolutionCode('solved')
    a().resolveTicket()
    const graded = a().scorecard!.dimensions.find(d => d.id === 'communication')!.score
    closed.release()
    await p1
    expect(ticket.communications.some(c => c.text === 'поздний ответ')).toBe(false)
    expect(a().scorecard!.dimensions.find(d => d.id === 'communication')!.score).toBe(graded)

    // Прохождение начали заново.
    const reset = slowModel('из прошлой игры')
    const b = store(reset.fetch)
    b().callTo('e.varga')
    const p2 = b().say('Здравствуйте')
    b().reset()
    reset.release()
    await p2
    expect(b().session.dialogue).toHaveLength(0)
    expect(b().queue.tickets.every(t => t.communications.length === 0)).toBe(true)

    // Техник переключился на другого собеседника.
    const switched = slowModel('поздний ответ')
    const c = store(switched.fetch)
    c().callTo('e.varga')
    const p3 = c().say('Когда это началось?')
    c().callTo('s.okafor')
    switched.release()
    await p3
    expect(c().session.dialogue.some(d => d.text === 'поздний ответ')).toBe(false)
  })
})
