import { describe, it, expect, beforeEach } from 'vitest'
import { createGameStore } from './store/useGame'
import { loadScenarios } from './core/scenario/load'
import { SCENARIOS } from './scenarios'
import { printSpoolerStopped } from './scenarios/print-spooler-stopped'
import { findService } from './core/device/services'

const clock = { now: () => new Date('2026-09-10T10:00:00.000Z') }
const HOST = 'AL-DSK-0192'

const store = () => {
  const g = createGameStore(clock)
  g.getState().start()
  return () => g.getState()
}

const NOTE =
  'Sam Okafor сообщил, что документы не печатаются и задания копятся в '
  + 'очереди. sc query spooler показал, что диспетчер печати остановлен, '
  + 'а тип запуска — «отключена». В журнале событий нашёлся сбой: драйвер '
  + 'kiyomi_pcl6.dll трижды ронял spoolsv.exe, после чего службу отключили. '
  + 'Вернул тип запуска «автоматически» и запустил службу. Проверено: '
  + 'заявитель подтвердил, что лист вышел. Передаю второй линии: пока '
  + 'драйвер Kiyomi PCL6 не заменён, падения повторятся.'

/**
 * Инъекция адресует службу по имени. Тест остаётся: он проверяет, что
 * патч попал именно в диспетчер печати и не задел соседей.
 */
describe('инъекция сценария попадает в нужную службу', () => {
  it('ломает именно диспетчер печати', () => {
    const { world } = loadScenarios([printSpoolerStopped])
    const spooler = findService(world, HOST, 'Spooler')!
    expect(spooler.status).toBe('stopped')
    expect(spooler.startType).toBe('disabled')
  })

  it('не трогает остальные службы на этой машине', () => {
    const { world } = loadScenarios([printSpoolerStopped])
    const others = world.devices[HOST]!.services.filter(s => s.name !== 'Spooler')
    expect(others.every(s => s.startType !== 'disabled')).toBe(true)
  })

  it('не трогает машину другого сценария', () => {
    const { world } = loadScenarios(SCENARIOS)
    expect(findService(world, 'AL-LPT-0447', 'Spooler')!.status).toBe('running')
  })

  it('журнал событий содержит причину падения', () => {
    const { world } = loadScenarios([printSpoolerStopped])
    const log = world.devices[HOST]!.eventLog
    expect(log.some(e => e.message.includes('kiyomi_pcl6.dll'))).toBe(true)
    expect(log.some(e => e.eventId === 7031)).toBe(true)
    expect(log.some(e => e.eventId === 7040)).toBe(true)
  })
})

describe('очередь держит оба сценария', () => {
  it('в очереди два тикета на разных машинах', () => {
    const s = store()
    expect(s().queue.tickets).toHaveLength(2)
    const devices = s().queue.tickets.map(t => t.device)
    expect(new Set(devices).size).toBe(2)
  })

  it('второй тикет нельзя взять, пока не закрыт первый', () => {
    const s = store()
    s().claimTicket(s().queue.tickets[0]!.number)
    expect(() => s().claimTicket(s().queue.tickets[1]!.number))
      .toThrow('сначала завершите текущий тикет')
  })
})

describe('инцидент с диспетчером печати', () => {
  let s: () => ReturnType<ReturnType<typeof createGameStore>['getState']>

  beforeEach(() => {
    s = store()
    const spoolerTicket = s().queue.tickets.find(
      t => t.scenarioId === 'print-spooler-stopped')!
    s().claimTicket(spoolerTicket.number)
  })

  it('sc показывает остановленную службу', () => {
    s().runCommand('sc query spooler')
    expect(s().terminalLines.some(l => l.text.includes('1  STOPPED'))).toBe(true)
  })

  it('служба не запускается, пока тип «отключена»', () => {
    const r = s().startServiceOn('Spooler')
    expect(r.ok).toBe(false)
    expect(findService(s().world, HOST, 'Spooler')!.status).toBe('stopped')
  })

  it('образцовое прохождение: журнал, тип запуска, старт, подтверждение', () => {
    s().runCommand('sc query spooler')
    s().openApp('eventvwr')
    s().setServiceStartType('Spooler', 'auto')
    s().startServiceOn('Spooler')
    s().confirmWithUser()
    s().saveResolutionNotes(NOTE)
    s().setResolutionCode('solved')
    s().resolveTicket()

    const card = s().scorecard!
    expect(card.silentFaults).toEqual([])
    expect(card.verdict).toBe('full')
    expect(card.objectives.every(o => o.met)).toBe(true)
  })

  it('запустил службу, не прочитав журнал — цель не закрыта', () => {
    s().setServiceStartType('Spooler', 'auto')
    s().startServiceOn('Spooler')
    s().confirmWithUser()
    s().saveResolutionNotes(NOTE)
    s().setResolutionCode('solved')
    s().resolveTicket()

    const card = s().scorecard!
    expect(card.objectives.find(o => o.id === 'obj-read-log')!.met).toBe(false)
    expect(card.verdict).not.toBe('full')
  })

  it('оставил тип «отключена» — тихая поломка и провал', () => {
    // сначала вернуть в auto, чтобы служба вообще запустилась,
    // затем «забыть» и вернуть обратно — типичная ошибка второпях
    s().openApp('eventvwr')
    s().setServiceStartType('Spooler', 'auto')
    s().startServiceOn('Spooler')
    s().setServiceStartType('Spooler', 'disabled')
    s().confirmWithUser()
    s().saveResolutionNotes(NOTE)
    s().setResolutionCode('solved')
    s().resolveTicket()

    const card = s().scorecard!
    expect(card.silentFaults).toHaveLength(1)
    expect(card.silentFaults[0]).toContain('перезагрузк')
    expect(card.verdict).toBe('fail')
  })

  it('заявитель подтверждает только после запуска службы', () => {
    s().confirmWithUser()
    expect(s().session.flags.userConfirmed).toBe(false)

    s().setServiceStartType('Spooler', 'auto')
    s().startServiceOn('Spooler')
    s().confirmWithUser()
    expect(s().session.flags.userConfirmed).toBe(true)
  })

  it('попытка остановить защиту валит вердикт и здесь', () => {
    s().openApp('eventvwr')
    s().setServiceStartType('Spooler', 'auto')
    s().startServiceOn('Spooler')
    s().runCommand('sc stop windefend')
    s().confirmWithUser()
    s().saveResolutionNotes(NOTE)
    s().setResolutionCode('solved')
    s().resolveTicket()

    expect(s().scorecard!.verdict).toBe('fail')
    expect(s().scorecard!.dimensions.find(d => d.id === 'authority')!.score).toBe(0)
  })

  it('остановка службы мышью и командой пишут одно и то же', () => {
    s().setServiceStartType('Spooler', 'auto')
    s().startServiceOn('Spooler')
    const changesBefore = s().session.changes.length
    s().stopServiceOn('Spooler')
    const viaUi = s().session.changes[changesBefore]!

    const s2 = store()
    const t = s2().queue.tickets.find(x => x.scenarioId === 'print-spooler-stopped')!
    s2().claimTicket(t.number)
    s2().runCommand('sc config spooler start= auto')
    s2().runCommand('sc start spooler')
    const before2 = s2().session.changes.length
    s2().runCommand('sc stop spooler')
    const viaCmd = s2().session.changes[before2]!

    expect(viaUi.path).toBe(viaCmd.path)
    expect(viaUi.before).toBe(viaCmd.before)
    expect(viaUi.after).toBe(viaCmd.after)
  })
})
