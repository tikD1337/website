import { describe, it, expect } from 'vitest'
import { createGameStore } from './useGame'
import { defaultConfig } from '../core/dialogue/types'
import type { FetchLike } from '../core/dialogue/openai'

const clock = { now: () => new Date('2026-09-10T09:00:00.000Z') }

const store = (fetch?: FetchLike) => {
  const g = createGameStore(clock, fetch ? { fetch } : undefined)
  g.getState().start()
  const s = () => g.getState()
  const lockout = s().queue.tickets.find(
    t => t.scenarioId === 'identity-account-lockout')!
  s().claimTicket(lockout.number)
  return s
}

const modelSays = (text: string): FetchLike => async () => ({
  ok: true,
  status: 200,
  json: async () => ({ choices: [{ message: { content: text } }] }),
})

describe('разговор требует тикета и собеседника', () => {
  it('без тикета реплика не уходит', async () => {
    const g = createGameStore(clock)
    g.getState().start()
    g.getState().callTo('e.varga')
    await g.getState().say('Здравствуйте')
    expect(g.getState().session.dialogue).toHaveLength(0)
  })

  it('без собеседника реплика не уходит', async () => {
    const s = store()
    await s().say('Здравствуйте')
    expect(s().session.dialogue).toHaveLength(0)
  })

  it('пустая реплика игнорируется', async () => {
    const s = store()
    s().callTo('e.varga')
    await s().say('   ')
    expect(s().session.dialogue).toHaveLength(0)
  })
})

describe('реплика и ответ', () => {
  it('обе стороны попадают в журнал сессии', async () => {
    const s = store()
    s().callTo('e.varga')
    await s().say('Когда это началось?')

    const d = s().session.dialogue
    expect(d).toHaveLength(2)
    expect(d[0]!.speaker).toBe('technician')
    expect(d[1]!.speaker).toBe('requester')
    expect(d[1]!.text).toContain('Сегодня утром')
  })

  it('обе стороны попадают в переписку тикета', async () => {
    const s = store()
    s().callTo('e.varga')
    await s().say('Когда это началось?')

    const ticket = s().queue.tickets.find(t => t.number === s().queue.assigned)!
    expect(ticket.communications).toHaveLength(2)
    expect(ticket.communications[0]!.from).toBe('technician')
  })

  /*
    Найдено разбором среза 3: переписка подписывала просьбу техника
    именем заявителя. Здесь та же проверка для свободной реплики.
  */
  it('реплика техника подписана им, а не собеседником', async () => {
    const s = store()
    s().callTo('e.varga')
    await s().say('Здравствуйте, это служба поддержки')

    const ticket = s().queue.tickets.find(t => t.number === s().queue.assigned)!
    expect(ticket.communications[0]!.from).toBe('technician')
    expect(ticket.communications[0]!.with).toBe('e.varga')
  })

  it('канал переписки — выбранный', async () => {
    const s = store()
    s().setChannel('mail')
    s().callTo('e.varga')
    await s().say('Добрый день, уточните пожалуйста')

    expect(s().session.dialogue[0]!.channel).toBe('mail')
  })
})

/**
 * Флаг объявлен в срезе 0 и до появления разговора не поднимался ничем.
 * Правило доктрины: проговори действие прежде, чем его сделать.
 */
describe('связь до начала работы', () => {
  it('разговор до изменений поднимает флаг', async () => {
    const s = store()
    s().callTo('e.varga')
    await s().say('Здравствуйте, разбираюсь с вашей заявкой')
    expect(s().session.flags.announcedBeforeActing).toBe(true)
  })

  /*
    Техник сразу полез в каталог, не сказав заявителю ни слова.
    Именно этот случай флаг и ловит: разговор после изменения мира —
    уже не предупреждение, а отчёт о сделанном.
  */
  it('разговор после изменения мира флаг не поднимает', async () => {
    const s = store()
    s().unlockUser('e.varga')
    s().callTo('e.varga')
    await s().say('Проверьте, пожалуйста')

    expect(s().session.changes.length).toBeGreaterThan(0)
    expect(s().session.flags.announcedBeforeActing).toBe(false)
  })

  /* Сверка личности — тоже разговор, и она поднимает тот же флаг. */
  it('сверка личности засчитывается как связь', () => {
    const s = store()
    s().verifyRequester('manager', 'Dumisani Mbeki')
    expect(s().session.flags.announcedBeforeActing).toBe(true)
  })

  /*
    Найдено разбором кода: кнопка «Позвонить заявителю» записывала
    только ответ, без вопроса. Флаг связи поднимается репликой техника,
    поэтому звонивший кнопкой читал в разборе «на связь до начала
    работы вы не выходили» — при том что звонил.
  */
  it('кнопка звонка засчитывается как связь', () => {
    const s = store()
    s().confirmWithUser()
    expect(s().session.flags.announcedBeforeActing).toBe(true)
  })

  it('в переписке виден и вопрос техника, и ответ', () => {
    const s = store()
    s().confirmWithUser()

    const ticket = s().queue.tickets.find(t => t.number === s().queue.assigned)!
    expect(ticket.communications).toHaveLength(2)
    expect(ticket.communications[0]!.from).toBe('technician')
    expect(ticket.communications[1]!.from).toBe('e.varga')
  })
})

describe('выяснение масштаба', () => {
  it('«у коллег так же?» поднимает флаг', async () => {
    const s = store()
    s().callTo('e.varga')
    await s().say('У коллег рядом так же?')
    expect(s().session.flags.scopeChecked).toBe(true)
  })

  it('обычный вопрос флаг не поднимает', async () => {
    const s = store()
    s().callTo('e.varga')
    await s().say('Когда это началось?')
    expect(s().session.flags.scopeChecked).toBe(false)
  })

  it('масштаб добавляет балл расследованию', async () => {
    const play = async (askScope: boolean) => {
      const s = store()
      s().verifyRequester('manager', 'Dumisani Mbeki')
      s().runCommand('net user e.varga')
      s().openApp('eventvwr')
      if (askScope) {
        s().callTo('e.varga')
        await s().say('У коллег так же?')
      }
      s().unlockUser('e.varga')
      s().askRequesterTo('clear-phone')
      s().confirmWithUser()
      s().saveResolutionNotes('Сняли блокировку e.varga, подтвердила.')
      s().setResolutionCode('solved')
      s().resolveTicket()
      return s().scorecard!.dimensions.find(d => d.id === 'investigation')!.score
    }

    expect(await play(true)).toBeGreaterThanOrEqual(await play(false))
  })
})

/**
 * Подтверждение засчитывается состоянием мира, а не словами.
 * Иначе модель, сказавшая «спасибо, работает» из вежливости, стала бы
 * оракулом — тот самый дефект, который дважды ловился в прошлых срезах.
 */
describe('подтверждение через разговор', () => {
  it('на сломанном мире «попробуйте» не подтверждает', async () => {
    const s = store()
    s().callTo('e.varga')
    await s().say('Попробуйте войти сейчас')

    expect(s().session.flags.userConfirmed).toBe(false)
    expect(s().session.dialogue.at(-1)!.text).toContain('то же самое')
  })

  it('на починенном — подтверждает', async () => {
    const s = store()
    s().verifyRequester('manager', 'Dumisani Mbeki')
    s().unlockUser('e.varga')
    s().callTo('e.varga')
    await s().say('Попробуйте войти сейчас')

    expect(s().session.flags.userConfirmed).toBe(true)
    expect(s().session.dialogue.at(-1)!.text).toContain('пустило')
  })

  /*
    Проверку результата модель не отвечает вовсе — её отвечает мир.

    Сначала защита была мягче: модель говорила что угодно, а флаг
    ставился по `fixedWhen`. Живая проверка на Ollama показала, чем это
    плохо: блокировку сняли, флаг встал, а модель по инерции твердила
    «всё ещё заблокирована» — на экране жалоба рядом с галочкой
    «подтвердил». Теперь на «попробуйте» отвечает сценарий, и реплика с
    флагом не расходятся никогда.
  */
  it('вежливость модели не подтверждает непочиненное', async () => {
    const s = store(modelSays('Да-да, спасибо, всё прекрасно работает!'))
    s().setDialogueConfig({ ...defaultConfig(), mode: 'local' })
    s().callTo('e.varga')
    await s().say('Попробуйте войти сейчас')

    expect(s().session.dialogue.at(-1)!.text).not.toContain('прекрасно работает')
    expect(s().session.dialogue.at(-1)!.text).toContain('то же самое')
    expect(s().session.flags.userConfirmed).toBe(false)
  })

  it('на починенном мире реплика и флаг не расходятся', async () => {
    const s = store(modelSays('Нет, всё ещё не пускает!'))
    s().setDialogueConfig({ ...defaultConfig(), mode: 'local' })
    s().verifyRequester('manager', 'Dumisani Mbeki')
    s().unlockUser('e.varga')
    s().callTo('e.varga')
    await s().say('Попробуйте войти сейчас')

    expect(s().session.dialogue.at(-1)!.text).toContain('пустило')
    expect(s().session.flags.userConfirmed).toBe(true)
  })

  it('подтверждает только заявитель, а не коллега', async () => {
    const s = store()
    s().verifyRequester('manager', 'Dumisani Mbeki')
    s().unlockUser('e.varga')
    s().callTo('s.okafor')
    await s().say('Попробуйте войти сейчас')

    expect(s().session.flags.userConfirmed).toBe(false)
  })
})

describe('звонок коллеге', () => {
  it('коллега отвечает про себя', async () => {
    const s = store()
    s().callTo('s.okafor')
    await s().say('У вас так же?')

    expect(s().session.dialogue.at(-1)!.text).toContain('у меня')
  })

  it('разговор приписан коллеге, а не заявителю', async () => {
    const s = store()
    s().callTo('s.okafor')
    await s().say('Здравствуйте')

    expect(s().session.dialogue.every(d => d.with === 's.okafor')).toBe(true)
  })

  /*
    История разговора не смешивается: контекст беседы с коллегой не
    должен попадать в разговор с заявителем.
  */
  it('истории разных собеседников раздельны', async () => {
    const s = store()
    s().callTo('s.okafor')
    await s().say('Здравствуйте')
    s().callTo('e.varga')
    await s().say('Когда это началось?')

    const ticket = s().queue.tickets.find(t => t.number === s().queue.assigned)!
    const withVarga = ticket.communications.filter(c => c.with === 'e.varga')
    expect(withVarga).toHaveLength(2)
  })
})

describe('модель подключена', () => {
  it('ответ приходит от модели', async () => {
    const s = store(modelSays('Утром, как пришла на работу.'))
    s().setDialogueConfig({ ...defaultConfig(), mode: 'local' })
    s().callTo('e.varga')
    await s().say('Когда это началось?')

    expect(s().session.dialogue.at(-1)!.text).toBe('Утром, как пришла на работу.')
    expect(s().dialogueNotice).toBeNull()
  })

  /* Проверка среза: модель выключена — тренировка продолжается. */
  it('отказ модели даёт реплику сценария и плашку', async () => {
    const dead: FetchLike = async () => { throw new Error('ECONNREFUSED') }
    const s = store(dead)
    s().setDialogueConfig({ ...defaultConfig(), mode: 'local' })
    s().callTo('e.varga')
    await s().say('Когда это началось?')

    expect(s().session.dialogue.at(-1)!.text).toContain('Сегодня утром')
    expect(s().dialogueNotice).toContain('недоступна')
  })

  it('после отказа разговор идёт дальше', async () => {
    const dead: FetchLike = async () => { throw new Error('ECONNREFUSED') }
    const s = store(dead)
    s().setDialogueConfig({ ...defaultConfig(), mode: 'local' })
    s().callTo('e.varga')
    await s().say('Когда это началось?')
    await s().say('Вы недавно меняли пароль?')

    expect(s().session.dialogue.at(-1)!.text).toContain('на прошлой неделе')
    expect(s().session.dialogue).toHaveLength(4)
  })

  it('проверка соединения сообщает результат', async () => {
    const s = store(modelSays('ок'))
    s().setDialogueConfig({ ...defaultConfig(), mode: 'local' })
    await s().probeModel()
    expect(s().probeResult).toEqual({ ok: true })
  })

  it('настройки переживают сброс мира', () => {
    const s = store()
    s().setDialogueConfig({ ...defaultConfig(), mode: 'local', model: 'qwen2.5' })
    s().reset()
    expect(s().dialogueConfig.model).toBe('qwen2.5')
  })
})

describe('состояние ожидания', () => {
  it('во время ответа поднят флаг ожидания', async () => {
    let release: (() => void) | null = null
    const slow: FetchLike = async () => {
      await new Promise<void>(r => { release = r })
      return { ok: true, status: 200, json: async () => ({ choices: [] }) }
    }
    const s = store(slow)
    s().setDialogueConfig({ ...defaultConfig(), mode: 'local' })
    s().callTo('e.varga')

    const pending = s().say('Когда это началось?')
    expect(s().waitingReply).toBe(true)

    release!()
    await pending
    expect(s().waitingReply).toBe(false)
  })

  /*
    Найдено разбором кода: после await проверялся только собеседник.
    Закрытый тикет, сброс и смена инцидента пропускали ответ в
    изменившийся мир — реплика дописывалась в закрытую переписку, а
    `userConfirmed` мог подняться уже после того, как разбор посчитан
    и показан.
  */
  it('закрытие тикета во время ожидания отбрасывает ответ', async () => {
    let release: (() => void) | null = null
    const slow: FetchLike = async () => {
      await new Promise<void>(r => { release = r })
      return {
        ok: true,
        status: 200,
        json: async () => ({ choices: [{ message: { content: 'поздний ответ' } }] }),
      }
    }
    const s = store(slow)
    // Тикет закрывают, пока модель думает: после resolveTicket он уходит
    // из окна, поэтому ссылку на переписку берём до закрытия.
    const ticket = s().queue.tickets.find(
      t => t.scenarioId === 'identity-account-lockout')!
    s().setDialogueConfig({ ...defaultConfig(), mode: 'local' })
    s().verifyRequester('manager', 'Dumisani Mbeki')
    s().unlockUser('e.varga')
    s().callTo('e.varga')

    // Обычный вопрос: проверку результата модель не отвечает вовсе.
    const pending = s().say('Что сейчас на экране?')

    s().saveResolutionNotes('Снял блокировку с e.varga.')
    s().setResolutionCode('solved')
    s().resolveTicket()
    const confirmedAtGrading = s().scorecard!.dimensions
      .find(d => d.id === 'communication')!.score

    release!()
    await pending

    expect(ticket.communications.some(c => c.text === 'поздний ответ')).toBe(false)
    // разбор посчитан и остаётся правдой
    expect(s().scorecard!.dimensions.find(d => d.id === 'communication')!.score)
      .toBe(confirmedAtGrading)
  })

  it('сброс во время ожидания не пачкает новое прохождение', async () => {
    let release: (() => void) | null = null
    const slow: FetchLike = async () => {
      await new Promise<void>(r => { release = r })
      return {
        ok: true,
        status: 200,
        json: async () => ({ choices: [{ message: { content: 'из прошлой игры' } }] }),
      }
    }
    const s = store(slow)
    s().setDialogueConfig({ ...defaultConfig(), mode: 'local' })
    s().callTo('e.varga')

    const pending = s().say('Здравствуйте')
    s().reset()

    release!()
    await pending

    expect(s().session.dialogue).toHaveLength(0)
    expect(s().queue.tickets.every(
      t => t.communications.length === 0)).toBe(true)
  })

  /* Обычные действия во время ожидания ответ не отбрасывают. */
  it('работа в других инструментах ответу не мешает', async () => {
    let release: (() => void) | null = null
    const slow: FetchLike = async () => {
      await new Promise<void>(r => { release = r })
      return {
        ok: true,
        status: 200,
        json: async () => ({ choices: [{ message: { content: 'дошёл ответ' } }] }),
      }
    }
    const s = store(slow)
    s().setDialogueConfig({ ...defaultConfig(), mode: 'local' })
    s().callTo('e.varga')

    const pending = s().say('Здравствуйте')

    s().openApp('eventvwr')
    s().runCommand('net user e.varga')
    s().inspectObject('user', 'e.varga')

    release!()
    await pending

    expect(s().session.dialogue.at(-1)!.text).toBe('дошёл ответ')
  })

  it('смена собеседника во время ожидания отбрасывает ответ', async () => {
    let release: (() => void) | null = null
    const slow: FetchLike = async () => {
      await new Promise<void>(r => { release = r })
      return {
        ok: true,
        status: 200,
        json: async () => ({ choices: [{ message: { content: 'поздний ответ' } }] }),
      }
    }
    const s = store(slow)
    s().setDialogueConfig({ ...defaultConfig(), mode: 'local' })
    s().callTo('e.varga')

    const pending = s().say('Когда это началось?')
    s().callTo('s.okafor')
    release!()
    await pending

    expect(s().session.dialogue.some(d => d.text === 'поздний ответ')).toBe(false)
  })
})
