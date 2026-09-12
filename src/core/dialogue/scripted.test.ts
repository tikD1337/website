import { describe, it, expect } from 'vitest'
import { scriptedReply, similarity, bestMatch } from './scripted'
import { detectIntent } from './intent'
import { briefFor, contactBrief } from './brief'
import { loadScenario } from '../scenario/load'
import { identityAccountLockout } from '../../scenarios/identity-account-lockout'
import { identityShareAccess } from '../../scenarios/identity-share-access'
import { applyInject } from '../world/world'
import type { DialogueRequest, PersonaBrief } from './types'

function ask(brief: PersonaBrief, said: string, history: DialogueRequest['history'] = []) {
  return scriptedReply({
    channel: 'call', withWhom: 'e.varga', brief, said, history,
  })
}

const lockout = () => {
  const { world, ticket } = loadScenario(identityAccountLockout)
  return { world, ticket, brief: briefFor(identityAccountLockout, ticket, world) }
}

describe('намерение реплики', () => {
  it('«попробуйте войти» — проверка результата', () => {
    expect(detectIntent('Попробуйте войти сейчас')).toBe('retry')
  })

  it('«получилось?» — проверка результата', () => {
    expect(detectIntent('Получилось?')).toBe('retry')
  })

  it('«у коллег так же?» — выяснение масштаба', () => {
    expect(detectIntent('У коллег рядом так же?')).toBe('scope')
  })

  it('обычный вопрос — ни то, ни другое', () => {
    expect(detectIntent('Когда это началось?')).toBe('other')
  })

  /*
    Масштаб важнее результата в смешанной фразе: флаг про масштаб
    поднимается один раз за инцидент, и потерять его на самой
    естественной формулировке было бы обидно.
  */
  it('в смешанной фразе масштаб перебивает результат', () => {
    expect(detectIntent('У коллег открывается, а вы попробуйте у себя'))
      .toBe('scope')
  })
})

describe('схожесть фраз', () => {
  it('точное совпадение даёт единицу', () => {
    expect(similarity('Когда это началось?', 'Когда это началось?')).toBe(1)
  })

  it('разные фразы не совпадают', () => {
    expect(similarity('Какой у вас принтер', 'Когда это началось')).toBeLessThan(0.5)
  })

  /* Падежи без морфологии: сравнение по началу слова. */
  it('падеж не мешает совпадению', () => {
    expect(similarity('меняли пароли недавно?', 'Вы недавно меняли пароль?'))
      .toBeGreaterThanOrEqual(0.5)
  })

  it('пустая заготовка не совпадает ни с чем', () => {
    expect(similarity('что угодно', '')).toBe(0)
  })

  /*
    Заготовка из одних коротких слов не должна быть мёртвой: техник
    спрашивает «У вас так же?», и это законный вопрос. Сопоставление
    таких строгое — все слова на месте.
  */
  it('короткая заготовка совпадает целиком', () => {
    expect(similarity('У вас так же?', 'У вас так же?')).toBe(1)
  })

  it('короткая заготовка не совпадает по обрывку', () => {
    expect(similarity('Это как?', 'У вас так же?')).toBe(0)
  })

  it('вопрос длиннее заготовки всё равно совпадает', () => {
    const said = 'Скажите пожалуйста, когда именно это началось у вас сегодня'
    expect(similarity(said, 'Когда это началось?')).toBeGreaterThanOrEqual(0.5)
  })
})

describe('ответы по заготовкам', () => {
  it('узнаёт заготовленный вопрос', () => {
    const { brief } = lockout()
    expect(ask(brief, 'Когда это началось?').text).toContain('Сегодня утром')
  })

  it('источник ответа — реплики сценария', () => {
    const { brief } = lockout()
    expect(ask(brief, 'Когда это началось?').source).toBe('scripted')
  })

  it('нераспознанный вопрос получает отговорку, а не молчание', () => {
    const { brief } = lockout()
    const r = ask(brief, 'Какая версия драйвера сетевой карты?')
    expect(r.text.length).toBeGreaterThan(0)
    expect(r.source).toBe('scripted')
  })

  it('отговорка не выдаёт разгадку', () => {
    const { brief } = lockout()
    const r = ask(brief, 'Что вообще происходит с вашим компьютером?')
    expect(r.text).not.toContain('ArcMail')
    expect(r.text).not.toContain('телефон')
  })

  /* Разговор обязан воспроизводиться: случайности нет. */
  it('один и тот же вопрос даёт один и тот же ответ', () => {
    const { brief } = lockout()
    const a = ask(brief, 'Расскажите про ваш монитор')
    const b = ask(brief, 'Расскажите про ваш монитор')
    expect(a.text).toBe(b.text)
  })

  it('отговорки чередуются по ходу разговора', () => {
    const { brief } = lockout()
    const first = ask(brief, 'Непонятный вопрос', [])
    const later = ask(brief, 'Непонятный вопрос', [
      { speaker: 'requester', text: 'раз' },
      { speaker: 'requester', text: 'два' },
    ])
    expect(first.text).not.toBe(later.text)
  })
})

/**
 * Главная причина существования `intent`: результат проверяется миром,
 * а не заготовками. Сценарий с папкой держит заготовку «Попробуйте
 * открыть сейчас» → «Так же — нет разрешений», и после верной починки
 * она наказывала бы за правильную работу.
 */
describe('проверка результата отвечается состоянием мира', () => {
  it('на сломанном мире заявитель жалуется', () => {
    const { brief } = lockout()
    expect(ask(brief, 'Попробуйте войти сейчас').text).toContain('то же самое')
  })

  it('на починенном — подтверждает', () => {
    const { world, ticket } = loadScenario(identityAccountLockout)
    applyInject(world, [
      { path: 'org.users[samAccountName=e.varga].lockedOut', value: false },
    ])
    const brief = briefFor(identityAccountLockout, ticket, world)
    expect(ask(brief, 'Попробуйте войти сейчас').text).toContain('пустило')
  })

  it('заготовка про результат не перебивает состояние мира', () => {
    const { world, ticket } = loadScenario(identityShareAccess)
    applyInject(world, [
      {
        path: 'org.users[samAccountName=n.haruna].tokenGroups',
        value: ['GRP-All-Staff', 'GRP-Printer-Floor3', 'GRP-Finance-Reports'],
      },
    ])
    const brief = briefFor(identityShareAccess, ticket, world)

    // В `scripted` сценария ровно эта фраза отвечает «нет разрешений».
    const r = scriptedReply({
      channel: 'call', withWhom: 'n.haruna', brief,
      said: 'Попробуйте открыть сейчас', history: [],
    })

    expect(r.text).toContain('Открыла')
    expect(r.text).not.toContain('нет разрешений')
  })
})

/*
  Найдено визуальной проверкой: приветствие — первая реплика почти
  каждого разговора — получало отговорку «Ой, я в этом совсем не
  разбираюсь», и разговор начинался ответом мимо. На «здравствуйте»
  человек здоровается.
*/
describe('приветствие', () => {
  it('распознаётся', () => {
    expect(detectIntent('Здравствуйте, это служба поддержки')).toBe('greeting')
    expect(detectIntent('Добрый день!')).toBe('greeting')
  })

  it('заявитель здоровается и называет свою жалобу', () => {
    const { brief } = lockout()
    const r = ask(brief, 'Здравствуйте, это служба поддержки, разбираюсь с заявкой.')
    expect(r.text).toContain('Здравствуйте')
    expect(r.text).not.toContain('не разбираюсь')
  })

  it('в приветствии нет разгадки', () => {
    const { brief } = lockout()
    const r = ask(brief, 'Здравствуйте!')
    expect(r.text).not.toContain('ArcMail')
    expect(r.text).not.toContain('ARC-MOBILE')
  })

  it('коллега здоровается без жалобы', () => {
    const { world } = loadScenario(identityAccountLockout)
    const colleague = contactBrief(world, 's.okafor')
    const r = scriptedReply({
      channel: 'call', withWhom: 's.okafor', brief: colleague,
      said: 'Добрый день, служба поддержки', history: [],
    })
    expect(r.text).toContain('Sam Okafor')
    expect(r.text).not.toContain('обращалась')
  })

  /*
    «Здравствуйте, попробуйте войти» — прежде всего просьба проверить.
    Приветствие не должно съедать ответ по делу.
  */
  it('просьба проверить важнее приветствия', () => {
    expect(detectIntent('Здравствуйте, попробуйте войти сейчас')).toBe('retry')
  })

  it('заготовка сценария важнее общего приветствия', () => {
    const { brief } = lockout()
    // «Что именно написано на экране?» — заготовка, не приветствие
    expect(ask(brief, 'Что именно написано на экране?').text)
      .toContain('заблокирована')
  })
})

/*
  Найдено визуальной проверкой, а не тестом: на «У коллег рядом так же?»
  приходило «Ой, я в этом совсем не разбираюсь. Что мне сделать?» —
  ответ мимо вопроса. Масштаб спрашивают почти в каждом инциденте, а
  заготовка на него есть не у каждого сценария.
*/
describe('вопрос о масштабе получает ответ по теме', () => {
  it('отговорка про масштаб, а не общая', () => {
    const { brief } = lockout()
    const r = ask(brief, 'У коллег рядом так же?')
    expect(r.text).not.toContain('не разбираюсь')
    expect(r.text.toLowerCase()).toMatch(/не спрашивала|не смотрела|не обращала/)
  })

  it('ответ не выдаёт настоящий масштаб', () => {
    const { brief } = lockout()
    const r = ask(brief, 'У коллег рядом так же?')
    expect(r.text).not.toContain('только у меня')
    expect(r.text).not.toContain('у всех')
  })

  it('заготовка сценария про коллег важнее отговорки', () => {
    const { world, ticket } = loadScenario(identityShareAccess)
    const brief = briefFor(identityShareAccess, ticket, world)
    // У этого сценария есть пара «У коллег из отдела эта папка открывается?»
    const r = scriptedReply({
      channel: 'call', withWhom: 'n.haruna', brief,
      said: 'У коллег из отдела эта папка открывается?', history: [],
    })
    expect(r.text).toContain('рядом стояла')
  })
})

describe('коллега из справочника', () => {
  const { world } = loadScenario(identityAccountLockout)
  const colleague = contactBrief(world, 's.okafor')

  it('отвечает про себя', () => {
    const r = scriptedReply({
      channel: 'call', withWhom: 's.okafor', brief: colleague,
      said: 'У вас так же?', history: [],
    })
    expect(r.text).toContain('у меня')
  })

  it('про чужую проблему отговаривается по-своему', () => {
    const r = scriptedReply({
      channel: 'call', withWhom: 's.okafor', brief: colleague,
      said: 'Что с учётной записью Варги?', history: [],
    })
    expect(r.text).not.toContain('ArcMail')
  })
})

describe('лучшая заготовка', () => {
  it('выбирается самая похожая, а не первая подходящая', () => {
    const { brief } = lockout()
    const r = bestMatch(brief, 'Вы недавно меняли пароль?')
    expect(r).toContain('на прошлой неделе')
  })

  it('ниже порога — ничего', () => {
    const { brief } = lockout()
    expect(bestMatch(brief, 'Сколько у вас оперативной памяти')).toBeNull()
  })
})
