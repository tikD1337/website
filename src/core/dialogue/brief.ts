import { allHold } from '../scenario/check'
import { findUser } from '../directory/accounts'
import type { WorldState } from '../world/types'
import type { Scenario } from '../scenario/types'
import type { Ticket } from '../tickets/types'
import type { PersonaBrief } from './types'

/**
 * Сводка о собеседнике.
 *
 * Главное правило среза живёт здесь: **корневая причина не передаётся
 * никогда**. Ни она, ни цели сценария, ни тексты просьб, ни ловушки на
 * тихие поломки, ни список действий, которых следует избегать. Каждое
 * из перечисленного — готовый ответ на вопрос, который техник должен
 * задать себе сам.
 *
 * Особенно тексты просьб: «учётную запись блокирует почта на вашем
 * телефоне» — это и есть разгадка, напечатанная словами заявителя.
 * В интерфейсе она закрыта до расследования (`unlockedBy`), и было бы
 * странно закрывать кнопку, чтобы тут же отдать тот же текст модели.
 *
 * Проверяется тестом по всем сценариям библиотеки, а не аккуратностью
 * автора: сводка сериализуется и в ней ищутся запрещённые строки.
 */
export function briefFor(
  scenario: Scenario,
  ticket: Ticket,
  world: WorldState,
): PersonaBrief {
  const user = findUser(world, ticket.requester)

  return {
    displayName: user?.displayName ?? ticket.requester,
    dept: user?.dept ?? '',
    title: user?.title ?? '',
    complaint: ticket.description,
    knows: [...scenario.persona.knows],
    doesntKnow: [...scenario.persona.doesntKnow],
    canDoIfAsked: [...scenario.persona.canDoIfAsked],
    scripted: scenario.persona.scripted.map(s => ({ ask: s.ask, reply: s.reply })),
    /*
      Заявитель судит по своей проблеме, а не по состоянию мира вообще:
      при неполадке с печатью его не волнует сетевой адаптер. То же
      условие, по которому он подтверждает результат по телефону.
    */
    problemGone: allHold(world, scenario.fixedWhen),
    confirmReplies: [...scenario.confirmReplies] as [string, string],
  }
}

/**
 * Сводка о человеке из справочника, который к инциденту отношения
 * не имеет.
 *
 * Диалер показывает весь каталог, значит позвонить можно любому — и это
 * не декорация: «спросите у коллеги, открывается ли у него» — приём
 * первой линии. Коллега отвечает по своей карточке и про чужую
 * проблему ничего не знает.
 *
 * Сверку личности это не подменяет: контрольных полей заявителя он
 * не знает, а сверка идёт против карточки того, чей аккаунт меняют.
 */
export function contactBrief(world: WorldState, sam: string): PersonaBrief {
  const user = findUser(world, sam)

  return {
    displayName: user?.displayName ?? sam,
    dept: user?.dept ?? '',
    title: user?.title ?? '',
    complaint: '',
    knows: [
      `работаю в отделе «${user?.dept ?? '—'}»`,
      `должность: ${user?.title ?? '—'}`,
      'у меня самого всё работает',
    ],
    doesntKnow: [
      'чужие проблемы и чужие учётные записи',
      'служебная терминология',
    ],
    canDoIfAsked: [
      'проверить, работает ли то же самое у меня',
      'позвать коллегу, который сидит рядом',
    ],
    scripted: [
      {
        ask: 'У вас так же?',
        reply: 'Нет, у меня всё открывается как обычно.',
      },
      {
        ask: 'Кто это?',
        reply: `${user?.displayName ?? sam}, ${user?.title ?? ''}. Слушаю вас.`,
      },
    ],
    problemGone: true,
    confirmReplies: [
      'У меня всё работает, да.',
      'У меня всё работает — я по этому поводу ничего не замечал.',
    ],
    bystander: true,
  }
}
