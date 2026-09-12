import type { Clock } from '../world/types'
import type {
  SessionLog, DialogueChannel, Speaker, BooleanFlag,
} from './types'

export function createSession(): SessionLog {
  return {
    askedFor: [],
    inspected: [],
    commands: [],
    changes: [],
    dialogue: [],
    flags: {
      identityVerified: false,
      scopeChecked: false,
      userConfirmed: false,
      announcedBeforeActing: false,
      eventLogRead: false,
      dangerousActions: [],
    },
  }
}

/** Каждый вызов терминала, включая нераспознанные и упавшие. */
export function recordCommand(
  s: SessionLog,
  clock: Clock,
  device: string,
  cmdline: string,
  exitCode: number,
): void {
  s.commands.push({ at: clock.now().toISOString(), device, cmdline, exitCode })
}

/** Каждое изменение мира, с прежним значением — иначе не сверить заметку. */
export function recordChange(
  s: SessionLog,
  clock: Clock,
  path: string,
  before: unknown,
  after: unknown,
authorized: boolean,
): void {
  s.changes.push({ at: clock.now().toISOString(), path, before, after, authorized })
}

export function recordDialogue(
  s: SessionLog,
  clock: Clock,
  channel: DialogueChannel,
  withWhom: string,
  speaker: Speaker,
  text: string,
): void {
  s.dialogue.push({
    at: clock.now().toISOString(),
    channel,
    with: withWhom,
    speaker,
    text,
  })

  /*
    Техник связался с заявителем прежде, чем менять мир.

    Флаг объявлен в срезе 0 и до появления разговора не поднимался
    ничем: связаться было нечем. Правило доктрины — «проговори
    действие до того, как его сделаешь», и проверяется оно порядком:
    первая реплика техника прозвучала, когда журнал изменений ещё пуст.

    Место одно, поэтому считается любой канал и любой повод — сверка
    личности, звонок, письмо. Развести их значило бы учить, что
    предупреждать нужно только по телефону.
  */
  if (speaker === 'technician' && s.changes.length === 0) {
    s.flags.announcedBeforeActing = true
  }
}

/**
 * Действие, которое шлюз полномочий отклонил.
 *
 * Важно, что оно именно записывается, а не просто не срабатывает:
 * попытка отключить защиту — это событие, за которое оценка снимает
 * балл, а не безобидный тупик.
 */
export function addDangerousAction(
  s: SessionLog,
  clock: Clock,
  action: string,
  reason: string,
): void {
  s.flags.dangerousActions.push({ at: clock.now().toISOString(), action, reason })
}

export function setFlag(s: SessionLog, key: BooleanFlag, value: boolean): void {
  s.flags[key] = value
}
