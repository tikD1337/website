import { describe, it, expect } from 'vitest'
import { scriptedReply, similarity, bestMatch } from './scripted'
import { detectIntent } from './intent'
import { briefFor, contactBrief } from './brief'
import { loadScenario } from '../scenario/load'
import { identityAccountLockout } from '../../scenarios/identity-account-lockout'
import { identityShareAccess } from '../../scenarios/identity-share-access'
import { applyInject } from '../world/world'
import type { DialogueRequest, PersonaBrief } from './types'

function ask(brief: PersonaBrief, said: string, history: DialogueRequest['history'] = [],
  withWhom = 'e.varga') {
  return scriptedReply({ channel: 'call', withWhom, brief, said, history })
}

const lockout = () => {
  const { world, ticket } = loadScenario(identityAccountLockout)
  return briefFor(identityAccountLockout, ticket, world)
}

const shareAccess = (fixed = false) => {
  const { world, ticket } = loadScenario(identityShareAccess)
  if (fixed) {
    applyInject(world, [{
      path: 'org.users[samAccountName=n.haruna].tokenGroups',
      value: ['GRP-All-Staff', 'GRP-Printer-Floor3', 'GRP-Finance-Reports'],
    }])
  }
  return briefFor(identityShareAccess, ticket, world)
}

describe('разбор реплики', () => {
  /*
    Масштаб перебивает результат в смешанной фразе: флаг про масштаб
    поднимается один раз за инцидент, и терять его на самой естественной
    формулировке обидно. «Здравствуйте, попробуйте войти» — прежде всего
    просьба проверить: приветствие не съедает ответ по делу.
  */
  it('намерение: проверка, масштаб, приветствие или прочее', () => {
    const cases: Array<[string, string]> = [
      ['Попробуйте войти сейчас', 'retry'],
      ['Получилось?', 'retry'],
      ['У коллег рядом так же?', 'scope'],
      ['У коллег открывается, а вы попробуйте у себя', 'scope'],
      ['Здравствуйте, это служба поддержки', 'greeting'],
      ['Добрый день!', 'greeting'],
      ['Здравствуйте, попробуйте войти сейчас', 'retry'],
      ['Когда это началось?', 'other'],
    ]
    for (const [said, intent] of cases) expect(detectIntent(said), said).toBe(intent)
  })

  /*
    Падежи без морфологии: сравнение по началу слова. Заготовка из одних
    коротких слов («У вас так же?») сопоставляется строго — все слова на
    месте, иначе она была бы мёртвой или срабатывала на обрывок.
  */
  it('схожесть фраз', () => {
    expect(similarity('Когда это началось?', 'Когда это началось?')).toBe(1)
    expect(similarity('Какой у вас принтер', 'Когда это началось')).toBeLessThan(0.5)
    expect(similarity('меняли пароли недавно?', 'Вы недавно меняли пароль?'))
      .toBeGreaterThanOrEqual(0.5)
    expect(similarity('Скажите пожалуйста, когда именно это началось у вас сегодня',
      'Когда это началось?')).toBeGreaterThanOrEqual(0.5)
    expect(similarity('что угодно', '')).toBe(0)
    expect(similarity('У вас так же?', 'У вас так же?')).toBe(1)
    expect(similarity('Это как?', 'У вас так же?')).toBe(0)
  })
})

describe('ответ по заготовкам', () => {
  it('узнаёт заготовленный вопрос и выбирает самую похожую заготовку', () => {
    const brief = lockout()
    expect(ask(brief, 'Когда это началось?')).toMatchObject({
      source: 'scripted', text: expect.stringContaining('Сегодня утром'),
    })
    expect(bestMatch(brief, 'Вы недавно меняли пароль?')).toContain('на прошлой неделе')
    expect(bestMatch(brief, 'Сколько у вас оперативной памяти')).toBeNull()
  })

  /* Разговор обязан воспроизводиться: случайности нет, но отговорки чередуются. */
  it('на непонятное — отговорка: не пустая, без разгадки, воспроизводимая', () => {
    const brief = lockout()
    const r = ask(brief, 'Что вообще происходит с вашим компьютером?')
    expect(r.text.length).toBeGreaterThan(0)
    expect(r.text).not.toContain('ArcMail')
    expect(r.text).not.toContain('телефон')

    expect(ask(brief, 'Расскажите про ваш монитор').text)
      .toBe(ask(brief, 'Расскажите про ваш монитор').text)
    expect(ask(brief, 'Непонятный вопрос').text).not.toBe(ask(brief, 'Непонятный вопрос', [
      { speaker: 'requester', text: 'раз' },
      { speaker: 'requester', text: 'два' },
    ]).text)
  })

  /**
   * Главная причина существования `intent`: результат проверяется миром,
   * а не заготовками. Сценарий с папкой держит заготовку «Попробуйте
   * открыть сейчас» → «нет разрешений», и после верной починки она
   * наказывала бы за правильную работу.
   */
  it('проверку результата отвечает состояние мира, а не заготовка', () => {
    expect(ask(lockout(), 'Попробуйте войти сейчас').text).toContain('то же самое')

    const { world, ticket } = loadScenario(identityAccountLockout)
    applyInject(world, [{ path: 'org.users[samAccountName=e.varga].lockedOut', value: false }])
    expect(ask(briefFor(identityAccountLockout, ticket, world), 'Попробуйте войти сейчас').text)
      .toContain('пустило')

    const r = ask(shareAccess(true), 'Попробуйте открыть сейчас', [], 'n.haruna')
    expect(r.text).toContain('Открыла')
    expect(r.text).not.toContain('нет разрешений')
  })

  /*
    Найдено визуальной проверкой: приветствие — первая реплика почти
    каждого разговора — получало отговорку «Ой, я в этом совсем не
    разбираюсь», и разговор начинался ответом мимо.
  */
  it('на приветствие здороваются: заявитель с жалобой, коллега без неё', () => {
    const brief = lockout()
    const hello = ask(brief, 'Здравствуйте, это служба поддержки, разбираюсь с заявкой.')
    expect(hello.text).toContain('Здравствуйте')
    expect(hello.text).not.toContain('не разбираюсь')
    expect(ask(brief, 'Здравствуйте!').text).not.toMatch(/ArcMail|ARC-MOBILE/)
    // Заготовка сценария важнее общего приветствия.
    expect(ask(brief, 'Что именно написано на экране?').text).toContain('заблокирована')

    const { world } = loadScenario(identityAccountLockout)
    const colleague = ask(contactBrief(world, 's.okafor'), 'Добрый день, служба поддержки',
      [], 's.okafor')
    expect(colleague.text).toContain('Sam Okafor')
    expect(colleague.text).not.toContain('обращалась')
  })

  /*
    Найдено визуальной проверкой: на «У коллег рядом так же?» приходило
    «Ой, я в этом совсем не разбираюсь». Масштаб спрашивают почти в
    каждом инциденте, а заготовка на него есть не у каждого сценария.
  */
  it('на вопрос о масштабе — ответ по теме, не выдающий настоящий масштаб', () => {
    const r = ask(lockout(), 'У коллег рядом так же?')
    expect(r.text).not.toContain('не разбираюсь')
    expect(r.text.toLowerCase()).toMatch(/не спрашивала|не смотрела|не обращала/)
    expect(r.text).not.toMatch(/только у меня|у всех/)

    // Своя заготовка сценария про коллег важнее общей отговорки.
    expect(ask(shareAccess(), 'У коллег из отдела эта папка открывается?', [], 'n.haruna').text)
      .toContain('рядом стояла')
  })

  it('коллега отвечает про себя и не знает чужой разгадки', () => {
    const { world } = loadScenario(identityAccountLockout)
    const colleague = contactBrief(world, 's.okafor')
    expect(ask(colleague, 'У вас так же?', [], 's.okafor').text).toContain('у меня')
    expect(ask(colleague, 'Что с учётной записью Варги?', [], 's.okafor').text)
      .not.toContain('ArcMail')
  })
})
