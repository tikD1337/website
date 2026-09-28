import { describe, it, expect } from 'vitest'
import { sanitizeReply } from './sanitize'

/**
 * Все примеры здесь — настоящие ответы моделей, снятые живой проверкой
 * (`scripts/probe-model.mjs`). Выдумывать их не понадобилось: модель
 * ломается изобретательнее, чем можно предположить за столом.
 */
describe('проверка ответа модели', () => {
  it('годная реплика проходит как есть, только без пробелов и внешних кавычек', () => {
    expect(sanitizeReply('  Сегодня утром, как пришла. Вчера всё работало.\n')).toEqual({
      ok: true, text: 'Сегодня утром, как пришла. Вчера всё работало.',
    })
    expect(sanitizeReply('Ноутбук AL-LPT-0512 меня не пускает.').ok).toBe(true)
    expect(sanitizeReply('"У меня проблема с папкой отчётности."').text)
      .toBe('У меня проблема с папкой отчётности.')
    expect(sanitizeReply('«Не открывается.»').text).toBe('Не открывается.')
    expect(sanitizeReply('Пишет «нет разрешений», я не понимаю.').text)
      .toBe('Пишет «нет разрешений», я не понимаю.')
  })

  /*
    Срыв на чужой язык — самый частый дефект многоязычной модели. Qwen2.5
    соскальзывал на китайский после «не разбираюсь в технических…», причём
    начало фразы было нормальным. Годное начало сохраняется по границе
    предложения; обрывок короче осмысленного отвергается целиком.
  */
  it('чужая письменность отрезается по границе предложения или отвергает ответ', () => {
    const trimmed = sanitizeReply('Не знаю, я в этом совсем не разбираюсь. 我也不确定，可能是昨天的变化。')
    expect(trimmed).toMatchObject({ ok: true, text: 'Не знаю, я в этом совсем не разбираюсь.' })
    expect(trimmed.reason).toContain('подрезан')
    expect(sanitizeReply('Всё было нормально. Потом перестало. 然后就不行了').text)
      .toBe('Всё было нормально. Потом перестало.')

    for (const tail of ['これは日本語です', '한국어입니다', 'هذا عربي', 'यह हिंदी है']) {
      expect(sanitizeReply(`Не знаю. ${tail}`).text, tail).toBe('Не знаю.')
    }

    const rejected = sanitizeReply('细节决定成败')
    expect(rejected.ok).toBe(false)
    expect(rejected.reason).toContain('не по-русски')
    expect(sanitizeReply('Я не разбираюсь в технических细节决定成败，请你只回答我知道和能做的。').ok)
      .toBe(false)
  })

  /*
    Выход из роли. Mistral Nemo отвечал «Я не технический специалист и не
    могу предложить решение…» — пересказывал системный промпт вслух.
    Честное «не разбираюсь» — законный и самый частый ответ заявителя, и
    отвергать его нельзя.
  */
  it('голос ассистента и пересказ инструкций отвергаются, «не разбираюсь» — нет', () => {
    const assistant = sanitizeReply('Здравствуйте! Как я могу вам помочь сегодня?')
    expect(assistant.ok).toBe(false)
    expect(assistant.reason).toContain('из роли')
    expect(sanitizeReply('Я не технический специалист и не могу предложить решение.').ok).toBe(false)
    expect(sanitizeReply('Как языковая модель, я не могу знать.').ok).toBe(false)

    expect(sanitizeReply('Я не разбираюсь в этом, извините.').ok).toBe(true)
  })

  it('пустой ответ отвергается', () => {
    expect(sanitizeReply('').ok).toBe(false)
    expect(sanitizeReply('   \n  ').ok).toBe(false)
  })
})
