import { describe, it, expect } from 'vitest'
import { createHandler } from './http'
import { testContent } from './test-content'
import { remoteContent } from '../remote'
import { ContentError, type ContentErrorKind } from '../port'
import { createGameStore } from '../../store/useGame'
import { resolve, findTicket } from '../../core/tickets/queue'
import { apipaNoLease } from '../../scenarios/net-apipa-no-lease'

const now = () => Date.parse('2026-10-01T09:00:00Z')
const post = (path: string, body: string) =>
  new Request(`http://x${path}`, { method: 'POST', body, headers: { 'content-type': 'application/json' } })
const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

/** Образцовый проход APIPA на локальном сторе — до закрытия, с закрытой копией тикета. */
function apipaRun() {
  const g = createGameStore({ now: () => new Date('2026-10-01T10:00:00.000Z') }, undefined, 1, testContent({ scenarios: [apipaNoLease] }))
  const s = () => g.getState()
  s().claimTicket(s().queue.tickets[0]!.number)
  s().verifyRequester('manager', 'Elena Varga')
  // Образцовый проход из e2e.test.ts (раздел APIPA): там он даёт full и 54 очка.
  for (const c of ['ipconfig /all', 'ipconfig /renew', 'ipconfig /release', 'ipconfig /renew', 'ping 8.8.8.8',
    'nslookup internal-portal.arcline.corp']) s().runCommand(c)
  s().confirmWithUser()
  s().saveResolutionNotes('Priya Raman сообщила, что не открываются сайты, локальные программы '
    + 'работают. ipconfig /all показал 169.254.23.11 без шлюза и без DNS — это '
    + 'исключило неверные настройки DNS. ipconfig /renew завершился ошибкой '
    + 'обращения к серверу. После ipconfig /release повторный renew выдал '
    + '10.20.14.88 со шлюзом и DNS. Проверено: ping 8.8.8.8 отвечает, '
    + 'заявительница подтвердила по телефону, что сайты открываются. '
    + 'Причина — кратковременная недоступность ретрансляции при загрузке.')
  s().setResolutionCode('solved')
  const queue = structuredClone(s().queue)
  const number = queue.assigned!
  resolve(queue, number, 'solved')
  return { world: s().world, ticket: findTicket(queue, number), session: s().session }
}

describe('HTTP-обработчик', () => {
  /*
    Мир и журнал едут по сети JSON-ом туда и обратно: всё, что в них не
    переживает такой путь, сделало бы оценку на сервере другой.
  */
  it('сеть и локальный разъём неотличимы: та же карточка за тот же проход', async () => {
    const local = testContent({ scenarios: [apipaNoLease] })
    const handler = createHandler(local, { now })
    const remote = remoteContent('http://x/api', (u, i) => handler(new Request(u, i)))
    const cap = local.capsule('net-apipa-no-lease')
    const input = apipaRun()

    const viaNet = await remote.grade(cap, input)
    expect(viaNet).toEqual(local.grade(cap, input))
    expect([viaNet.scorecard.verdict, viaNet.scorecard.points]).toEqual(['full', 54])
    expect(await remote.catalog()).toEqual(local.catalog())
    expect(await remote.capsule('net-apipa-no-lease')).toEqual(cap)
  })

  it('кривые тела — 400 или 413, обработчик жив', async () => {
    const handler = createHandler(testContent(), { now })
    const token = testContent().capsule('net-apipa-no-lease').token
    const cases: Array<[string, Request, number]> = [
      ['не JSON', post('/api/scenario/capsule', '{'), 400],
      ['нет поля', post('/api/scenario/state', '{}'), 400],
      ['тело — массив', post('/api/scenario/capsule', '[]'), 400],
      ['нет такого сценария', post('/api/scenario/capsule', JSON.stringify({ id: 'нет' })), 400],
      ['мир — строка', post('/api/scenario/grade', JSON.stringify({ token, world: 'x', ticket: {}, session: {} })), 400],
      ['чужой запуск', post('/api/interview/answer', JSON.stringify({ run: { track: 'first-line', plan: ['нет'], index: 9 }, text: 'а' })), 400],
      ['подпись поддельная', post('/api/scenario/state', JSON.stringify({ token: 'x.1.y', world: {} })), 403],
      ['больше мегабайта', post('/api/scenario/grade', 'x'.repeat(1_048_577)), 413],
      ['нет адреса', post('/api/nope', '{}'), 404],
      ['каталог не POST-ом', post('/api/catalog', '{}'), 404],
    ]
    for (const [name, req, status] of cases) {
      const r = await handler(req)
      expect(r.status, name).toBe(status)
      expect(typeof (await r.json()).error, `${name}: ошибка словами`).toBe('string')
    }
    expect((await handler(new Request('http://x/api/catalog'))).status, 'после всего — жив').toBe(200)
  })

  /*
    Найдено в браузере: при 12 капсулах и одной в минуту четыре
    перезагрузки подряд (каждая — новая смена, три капсулы) запирали
    тренажёр на минуты. Лимит — против скрипта, а не против F5.
  */
  it('лимит капсул: тридцать подряд, тридцать первая — 429, через 20 секунд снова можно', async () => {
    let t = now()
    const h = createHandler(testContent(), { now: () => t })
    const capsule = () => post('/api/scenario/capsule', JSON.stringify({ id: 'net-apipa-no-lease' }))
    for (let i = 0; i < 30; i++) expect((await h(capsule(), '1.2.3.4')).status, `капсула ${i + 1}`).toBe(200)
    const r = await h(capsule(), '1.2.3.4')
    expect(r.status).toBe(429)
    expect(r.headers.get('Retry-After')).toBe('20')
    expect((await h(capsule(), '5.6.7.8')).status, 'другой адрес — своя корзина').toBe(200)
    t += 20_000
    expect((await h(capsule(), '1.2.3.4')).status).toBe(200)
  })
})

describe('сетевой разъём', () => {
  it('переводит ответы в виды ошибок с текстом для плашки', async () => {
    const kinds: Array<[string, () => Promise<Response>, ContentErrorKind, string]> = [
      ['обрыв', () => Promise.reject(new TypeError('fetch failed')), 'unavailable', 'Сервер недоступен — проверьте связь и повторите.'],
      ['502', async () => new Response('', { status: 502 }), 'unavailable', 'Сервер недоступен — проверьте связь и повторите.'],
      ['не JSON', async () => new Response('<html>', { status: 200 }), 'unavailable', 'Сервер недоступен — проверьте связь и повторите.'],
      ['403', async () => json({ error: 'Подпись тикета не принята.' }, 403), 'expired', 'Сервер не узнал тикет — начните смену заново.'],
      ['429', async () => json({ error: 'Слишком много запросов — подождите.' }, 429), 'limited', 'Сервер просит подождать: слишком много запросов.'],
      ['400', async () => json({ error: 'не найдено: курс x' }, 400), 'bad', 'не найдено: курс x'],
      ['400 без текста', async () => new Response('', { status: 400 }), 'bad', 'Сервер не понял запрос.'],
    ]
    for (const [name, f, kind, message] of kinds) {
      const e = await Promise.resolve(remoteContent('/api', f).catalog()).catch(x => x)
      expect(e, name).toBeInstanceOf(ContentError)
      expect({ kind: e.kind, message: e.message }, name).toEqual({ kind, message })
    }
  })
})
