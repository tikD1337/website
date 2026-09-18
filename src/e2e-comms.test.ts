import { describe, it, expect } from 'vitest'
import { createGameStore } from './store/useGame'
import { defaultConfig } from './core/dialogue/types'
import type { FetchLike } from './core/dialogue/openai'

const clock = { now: () => new Date('2026-09-12T09:30:00.000Z') }

const store = (fetch?: FetchLike) => {
  const g = createGameStore(clock, fetch ? { fetch } : undefined)
  g.getState().start()
  const s = () => g.getState()
  const lockout = s().queue.tickets.find(
    t => t.scenarioId === 'identity-account-lockout')!
  s().claimTicket(lockout.number)
  return s
}

const NOTE =
  'Elena Varga сообщила, что не может войти — пишет, что учётная запись '
  + 'заблокирована. Смотрел карточку в консоли каталога: блокировка и девять '
  + 'неудачных входов, последний вход вчера вечером. В журнале событий событие '
  + '4740: источник — ARC-MOBILE-0512, рабочий телефон. Пароль верный, поэтому '
  + 'не сбрасывал: снял блокировку с e.varga и попросил удалить и заново '
  + 'добавить почту на телефоне. Проверено: заявительница подтвердила, что '
  + 'вход прошёл. При повторении смотреть телефон — причина в кэше пароля.'

/**
 * Инцидент, пройденный разговором, а не кнопкой.
 *
 * Этот путь пройден в браузере руками: расследование мышью, разговор
 * вместо кнопки «Позвонить», подтверждение через «попробуйте войти».
 * Тест закрепляет его целиком — включая то, что терминал не
 * понадобился ни разу.
 */
describe('инцидент, пройденный разговором', () => {
  const play = async (s: ReturnType<typeof store>) => {
    // Ссылку на тикет берём до закрытия: завершённый тикет покидает окно.
    const ticket = s().queue.tickets.find(
      t => t.scenarioId === 'identity-account-lockout')!

    // Связь до любых изменений — доктрина «проговори, потом делай».
    s().callTo('e.varga')
    await s().say('Здравствуйте, это служба поддержки, разбираюсь с вашей заявкой.')
    await s().say('У коллег рядом так же?')

    s().verifyRequester('manager', 'Dumisani Mbeki')
    s().inspectObject('user', 'e.varga')
    s().openApp('eventvwr')
    s().unlockUser('e.varga')
    s().askRequesterTo('clear-phone')

    await s().say('Попробуйте войти сейчас, пожалуйста.')

    s().saveResolutionNotes(NOTE)
    s().setResolutionCode('solved')
    s().resolveTicket()
    return ticket
  }

  it('даёт полный вердикт без единой команды в терминале', async () => {
    const s = store()
    await play(s)

    const card = s().scorecard!
    expect(s().session.commands).toHaveLength(0)
    expect(card.silentFaults).toEqual([])
    expect(card.objectives.filter(o => !o.met).map(o => o.id)).toEqual([])
    expect(card.verdict).toBe('full')
  })

  it('разбор отмечает выясненный масштаб', async () => {
    const s = store()
    await play(s)

    const investigation = s().scorecard!.dimensions
      .find(d => d.id === 'investigation')!
    expect(investigation.explain).toContain('Масштаб выяснен')
    expect(investigation.score).toBe(10)
  })

  it('связь до изменений засчитана', async () => {
    const s = store()
    await play(s)
    expect(s().session.flags.announcedBeforeActing).toBe(true)
  })

  it('подтверждение пришло через разговор, а не кнопкой', async () => {
    const s = store()
    await play(s)

    expect(s().session.flags.userConfirmed).toBe(true)
    const confirm = s().session.dialogue.at(-1)!
    expect(confirm.speaker).toBe('requester')
    expect(confirm.text).toContain('пустило')
  })

  it('вся переписка попала в тикет', async () => {
    const s = store()
    const ticket = await play(s)

    // три реплики техника, три ответа, плюс просьба и ответ на неё
    expect(ticket.communications.length).toBeGreaterThanOrEqual(8)
    expect(ticket.communications.every(c => c.with === 'e.varga')).toBe(true)
  })
})

/**
 * Проверка среза дословно: «выдернуть сеть и выключить модель —
 * тренировка должна продолжаться без единой ошибки в консоли».
 */
describe('модель выключена, сеть выдернута', () => {
  const dead: FetchLike = async () => { throw new TypeError('Failed to fetch') }

  it('инцидент проходится целиком', async () => {
    const s = store(dead)
    s().setDialogueConfig({ ...defaultConfig(), mode: 'local' })

    s().callTo('e.varga')
    await s().say('Здравствуйте, служба поддержки.')
    await s().say('У коллег так же?')
    s().verifyRequester('manager', 'Dumisani Mbeki')
    s().inspectObject('user', 'e.varga')
    s().openApp('eventvwr')
    s().unlockUser('e.varga')
    s().askRequesterTo('clear-phone')
    await s().say('Попробуйте войти сейчас.')
    s().saveResolutionNotes(NOTE)
    s().setResolutionCode('solved')
    s().resolveTicket()

    expect(s().scorecard!.verdict).toBe('full')
  })

  it('каждая реплика получила осмысленный ответ', async () => {
    const s = store(dead)
    s().setDialogueConfig({ ...defaultConfig(), mode: 'local' })
    s().callTo('e.varga')

    await s().say('Здравствуйте!')
    await s().say('Когда это началось?')
    await s().say('Вы недавно меняли пароль?')

    const replies = s().session.dialogue.filter(d => d.speaker === 'requester')
    expect(replies).toHaveLength(3)
    expect(replies.every(r => r.text.length > 10)).toBe(true)
    expect(replies[1]!.text).toContain('Сегодня утром')
    expect(replies[2]!.text).toContain('на прошлой неделе')
  })

  it('плашка объясняет, почему отвечает не модель', async () => {
    const s = store(dead)
    s().setDialogueConfig({ ...defaultConfig(), mode: 'local' })
    s().callTo('e.varga')
    await s().say('Здравствуйте!')

    expect(s().dialogueNotice).toContain('недоступна')
  })

  /*
    Размыкатель: после первого отказа модель не опрашивается. Иначе
    каждая реплика ждёт таймаут, а консоль браузера копит отказы
    соединения, которых мы не контролируем.
  */
  it('модель опрашивается один раз, а не на каждую реплику', async () => {
    let calls = 0
    const counted: FetchLike = async () => {
      calls += 1
      throw new TypeError('Failed to fetch')
    }
    const s = store(counted)
    s().setDialogueConfig({ ...defaultConfig(), mode: 'local' })
    s().callTo('e.varga')

    await s().say('Здравствуйте!')
    await s().say('Когда это началось?')
    await s().say('А что на экране?')

    expect(calls).toBe(1)
  })
})
