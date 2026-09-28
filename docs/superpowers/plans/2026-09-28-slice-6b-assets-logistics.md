# Срез 6Б — активы и логистика: план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** CMDB и логистика как инструменты над единым миром: отправления, чей статус двигается по часам, тикет «Ждём поставку», который отпускает слот и возвращается с журналом, отправка через шлюз и два сценария с противоположными решениями по гарантии.

**Architecture:** исправность периферии хранится в CMDB, диспетчер устройств выводит её оттуда. Отправление меняет CMDB только через `core/logistics`: оформление — `createShipment` через `authorize`, движение этапов — `advanceShipments(world, now)`, где момент этапа считается от оформления. Стор тикает раз в секунду, паркует инцидент ждущего тикета и возобновляет его по доставке.

**Tech Stack:** TypeScript, React 18, zustand, vitest. Без новых зависимостей.

**Spec:** `docs/superpowers/specs/2026-09-28-slice-6b-assets-logistics-design.md`

## Global Constraints

- Ядро (`src/core/**`) — без React, `window` и `Date.now()`; время — через `Clock` или аргумент `now: Date`.
- Интерфейс и тексты — по-русски; строки диспетчера устройств — по-английски, как у Windows.
- Бренды вымышленные: периферия `Halyard` (`BRAND.vendors.peripheral`), телефоны `Bramble` (`BRAND.vendors.phone`, добавить). `brand.test.ts` сторожит мир и сценарии.
- Цвет — только суждение; истёкшая гарантия — словом. Шрифты системные, скругление — у интерактивного.
- Тесты — по разделу CLAUDE.md «Какие тесты писать».
- Не использовать `git add -A`. Коммит после каждой задачи, `npm run typecheck` и `npm test` зелёные.

## Review Focus

1. **Долгий перерыв между тиками** (вкладка спала 10 минут) — все этапы наступают по порядку, каждый эффект один раз, время этапа — от оформления. Тест — задача 3.
2. **Двойное оформление одного актива** (двойной клик) — второе отклоняется ошибкой учёта «уже в пути», мир не меняется. Тест — задача 4.
3. **Тикет закрыт, а его отправление ещё едет** — доставка не падает и не возобновляет закрытый тикет. Тест — задача 6.
4. **Сброс смены при запаркованном тикете** — парковка не протекает в новую смену. Тест — задача 6.
5. **Старый док отправлен вендору раньше, чем приехал новый** — дока у машины нет; `exists` отвечает «нет», а не падает. Тест — задача 1 и задача 7.

---

## Раскладка файлов

| Файл | Ответственность |
|---|---|
| `src/core/world/path.ts` | составной выбор `[a=b&c=d]` |
| `src/core/scenario/check.ts`, `types.ts` | предикат `exists` |
| `src/core/world/types.ts` | `Asset`, `Shipment`, `WorldState.cmdb`, `WorldState.shipments` |
| `src/core/world/seed-cmdb.ts` | засев CMDB и исторических отправлений |
| `src/core/device/peripherals.ts` | строки диспетчера устройств из CMDB |
| `src/core/logistics/types.ts` | таблица типов, этапов, подписей |
| `src/core/logistics/advance.ts` | движение этапов и их эффекты |
| `src/core/logistics/ship.ts` | оформление через шлюз |
| `src/core/policy/authorize.ts` | вид действия `shipment` |
| `src/core/tickets/queue.ts`, `types.ts` | `park`, `resume`, статус `pending-shipment` |
| `src/store/useGame.ts` | `tick`, `createShipment`, `waitForShipment`, парковка, `app:` и `asset:` в осмотренном |
| `src/scenarios/hw-dock-failed.ts`, `hw-headset-worn.ts` | сценарии |
| `src/ui/AssetsView.tsx`, `src/ui/LogisticsView.tsx` | инструменты |

---

### Task 1: Составной выбор и предикат `exists`

**Files:**
- Modify: `src/core/world/path.ts`, `src/core/scenario/check.ts`, `src/core/scenario/types.ts`
- Test: `src/core/world/path.test.ts`, `src/core/scenario/check.test.ts`

**Interfaces:**
- Produces: путь `cmdb[attachedTo=AL-LPT-0512&kind=dock]` — все условия через `&`; `SilentFaultCheck.exists?: boolean`.

- [ ] **Step 1: Тесты**
  - `path.test.ts` → `it('составной выбор — все условия сразу')`: в `{ a: [{k:'dock',h:'X',c:'faulty'},{k:'dock',h:'Y',c:'ok'},{k:'mon',h:'Y',c:'ok'}] }` путь `a[k=dock&h=Y].c` → `'ok'`; `a[k=dock&h=Z]` → `undefined`; `a[k=dock&]` бросает `некорректный путь`.
  - `check.test.ts` → `it('exists — единственный предикат, которому можно не найти элемент')`: `{ path: 'devices.AL-LPT-0447.adapters[mac=NOPE]', exists: false }` → `true`; то же с `exists: true` → `false`; `{ path: 'devices.AL-LPT-0447.adapters[mac=A4-83-E7-2C-91-44]', exists: true }` → `true`; путь без выбора на конце (`devices.AL-LPT-0447.hostname`, `exists: true`) бросает `exists допустим только для выбора по полю`; контейнер, который не массив (`devises[x=1]`), бросает `условие ссылается на несуществующий путь`.
- [ ] **Step 2:** падают.
- [ ] **Step 3:** `FieldSelector` → `{ conds: Array<{ field: string; value: string }> }`; пустое условие — ошибка разбора. `checkHolds`: при `exists` путь обязан оканчиваться `]` с `=` внутри; путь до последней `[` обязан давать массив, иначе ошибка несуществующего пути; ответ — `(getPath(...) !== undefined) === exists`.
- [ ] **Step 4:** зелёный набор. **Step 5:** коммит «Составной выбор в пути и условие существования».

### Task 2: CMDB и периферия в диспетчере устройств

**Files:**
- Modify: `src/core/world/types.ts`, `src/core/world/seed.ts`, `src/brand.ts`
- Create: `src/core/world/seed-cmdb.ts`, `src/core/device/peripherals.ts`
- Test: `src/core/world/world.test.ts`, `src/core/device/peripherals.test.ts`

**Interfaces:**
- Produces: `Asset`, `AssetKind`, `Lifecycle` (как в спеке), `WorldState.cmdb: Asset[]`, `WorldState.shipments: Shipment[]` (тип — задача 3, засев истории — здесь пустым массивом); `peripheralsOf(world, host): Driver[]`; `KIND_LABEL: Record<AssetKind, string>` в `core/world/assets.ts` (ноутбук, компьютер, док-станция, монитор, гарнитура, телефон, комплект кабелей, коммутатор, маршрутизатор, сервер, принтер); `warrantyActive(asset, now: Date): boolean` там же.

Засев (`seedCmdb(devices, network, users)`), теги и даты — литералами:

| Что | Теги | Владелец / где | Куплен → гарантия до |
|---|---|---|---|
| машины мира | `assetTag` устройств | владелец, `Стол <кабинет>` | L0447 2024-02-12, L0512 2024-05-20, L0601 2023-11-06, L0714 2026-09-01, D0192 2023-02-01, L0788 2025-01-15; гарантия +3 года |
| доки `Halyard` `D6000 USB-C Dock` | AL-P2030 (0447), AL-P2031 (0512), AL-P2032 (0601), AL-P2033 (0714), AL-P2034 (0788) | владелец машины, `attachedTo` машина | 2025-03-10 → 2027-03-10 |
| мониторы `Halyard` `M27Q` | AL-P2101…AL-P2106 по машинам в порядке 0447, 0512, 0601, 0714, 0192, 0788 | то же | 2024-06-01 → 2027-06-01 |
| гарнитуры `Halyard` `H340 USB Headset` | AL-P3017 (s.okafor, AL-DSK-0192), AL-P3018 (p.raman, 0447) | то же | P3017 2023-02-01 → 2025-02-01; P3018 2025-09-01 → 2027-09-01 |
| телефоны `Bramble` `Note 12` | AL-M4001 d.mbeki, AL-M4002 e.varga, AL-M4003 p.raman | стол владельца, `attachedTo: ''` | 2025-01-15 → 2027-01-15 |
| склад, `Склад, стеллаж B2` | доки AL-P2040, AL-P2041; монитор AL-P2110; гарнитуры AL-P3030, AL-P3031, AL-P3032; кабели AL-P5001 `Комплект кабелей USB-C/HDMI`; подменные ноутбуки AL-L9001, AL-L9002 (`Kestrel Meridian 5450`, `Склад, подменный фонд`); AL-L9003 то же, пришёл входящим | `in-stock` | склад 2026-06-01 → 2028-06-01 |
| списан | AL-L0301 `Torvald WorkLine T14 Gen 2` | `retired`, `Утилизирован` | 2021-03-01 → 2024-03-01 |
| серверная | AL-N0101 SW-FL3-01, AL-N0102 CR-01, AL-N0103 RT-EDGE-01, AL-N0110 PRN-FL3-01, AL-S0201…AL-S0206 серверы по порядку | место — из серверной, `hostname` | 2024-01-10 → 2029-01-10 |

Серийный номер — `<две буквы вендора><цифры тега>K7`: `TO0447K7`. Все `condition: 'ok'`, `note: ''`.

- [ ] **Step 1: Тесты**
  - `world.test.ts` → `it('CMDB: у каждой машины есть актив, теги не повторяются, склад на месте')`: `cmdb.find(a => a.hostname === h)?.tag === devices[h].assetTag` для каждой машины; `new Set(tags).size === cmdb.length`; `cmdb.filter(a => a.lifecycle === 'in-stock').map(a => a.tag)` → `['AL-P2040','AL-P2041','AL-P2110','AL-P3030','AL-P3031','AL-P3032','AL-P5001','AL-L9001','AL-L9002','AL-L9003']`.
  - `peripherals.test.ts` → `it('строки диспетчера — из подключённых активов; неисправный док — Code 43, гарнитура — исправна')`: `peripheralsOf(w, 'AL-LPT-0512').map(d => d.device)` → `['Halyard D6000 USB-C Dock', 'Generic PnP Monitor']`; после `condition = 'faulty'` у AL-P2031 строка дока — `{ status: 'problem', problemCode: 43, problemText: 'Windows has stopped this device because it has reported problems. (Code 43)' }`; у AL-DSK-0192 с неисправной AL-P3017 строка `Halyard H340 USB Headset` — `status: 'ok'`; `warrantyActive` — таблица: AL-P2031 на 2026-09-28 `true`, AL-P3017 `false`, ровно в день окончания `false`.
- [ ] **Step 2–4:** падают → реализация → зелёный набор (эталоны `net user`, `dsquery` не меняются: каталог не тронут).
- [ ] **Step 5:** коммит «CMDB: засев и периферия в диспетчере устройств».

### Task 3: Этапы отправлений по часам

**Files:**
- Create: `src/core/logistics/types.ts`, `src/core/logistics/advance.ts`
- Modify: `src/core/world/types.ts`, `src/core/world/seed-cmdb.ts` (история)
- Test: `src/core/logistics/advance.test.ts`

**Interfaces:**
- Produces: `ShipmentType`, `Shipment` (как в спеке); `SHIPMENT_TYPES: Record<ShipmentType, { label: string; direction; kinds: AssetKind[] }>`; `STAGES: Record<Direction, Array<{ label: string; after: number }>>` (`after` — секунд от предыдущего этапа, у первого 0); `ShipmentEvent { id: string; ticket: string; stage: string; final: boolean; direction }`; `advanceShipments(world: WorldState, now: Date): ShipmentEvent[]`; `trackingFor(n: number): string` → `HX-1041-43679` (`(n * 7919) % 100000`, пять цифр).

Подписи типов: `headset-to-desk` «Гарнитура на стол», `phone-rma` «RMA телефона», `cable-kit` «Комплект кабелей», `dock-monitor-swap` «Замена дока или монитора», `vendor-rma` «RMA вендору», `inbound` «Входящее оборудование», `loaner` «Подменный фонд», `disposal` «Утилизация». Этапы: на стол — Оформлено 0 · Собирается на складе 15 · У курьера 30 · Доставлено 45; вендору — Оформлено 0 · Передано курьеру 20 · У вендора 60 · Решение вендора 60; утилизация — Оформлено 0 · Вывезено 30 · Утилизировано 60; на склад — В пути 0 · Принято складом 120.

История в засеве: SHP-1039 `disposal` AL-L0301, создано 2026-09-20T09:00:00Z, этап последний; SHP-1040 `inbound` AL-L9003, создано 2026-09-26T08:00:00Z, этап последний. История этапов — литералы по тем же длительностям.

- [ ] **Step 1: Тесты** (мир — `createWorld()`, отправление добавлено руками, `createdAt: '2026-09-28T10:00:00.000Z'`)
  - `it('этапы наступают по часам; тик после долгого перерыва равен тикам каждую секунду')`: отправление на стол AL-P2040 для e.varga; тик на +14 с — событий нет; на +15 — событие `Собирается на складе`; второй мир тикается каждую секунду до +90, первый — один раз на +600: `shipments` и `cmdb` обоих равны, `history.map(h => h.at)` → `['…10:00:00.000Z','…10:00:15.000Z','…10:00:45.000Z','…10:01:30.000Z']`.
  - `it('доставка на стол: актив в работе у заявителя, прежний того же вида отключён')`: док AL-P2040 на стол e.varga → `{ lifecycle: 'in-use', owner: 'e.varga', location: 'Стол 3-20', attachedTo: 'AL-LPT-0512' }`; AL-P2031 → `attachedTo: ''`, `lifecycle: 'in-use'`; последнее событие `{ final: true, ticket: 'INC1', direction: 'to-desk' }`.
  - `it('вендор: по гарантии принимает, без гарантии возвращает на склад неисправным')`: AL-P2031 → `{ lifecycle: 'rma', location: 'Сервисный центр Halyard' }`, `outcome: 'accepted'`; AL-P3017 (`faulty`) → `{ lifecycle: 'in-stock', location: 'Склад, возврат от вендора', note: 'Отклонено вендором: гарантия истекла', condition: 'faulty' }`, `outcome: 'rejected'`.
  - `it('утилизация списывает, входящее принимается складом')`.
- [ ] **Step 2–4:** падают → реализация → зелёный набор.
- [ ] **Step 5:** коммит «Отправления: этапы по часам и их эффекты».

### Task 4: Оформление через шлюз

**Files:**
- Create: `src/core/logistics/ship.ts`
- Modify: `src/core/policy/authorize.ts`
- Test: `src/core/logistics/ship.test.ts`

**Interfaces:**
- Consumes: `SHIPMENT_TYPES`, `warrantyActive`, `session.incident`.
- Produces: `ShipmentInput { type: ShipmentType; assetTag: string; recipient?: string }` (по умолчанию — заявитель); `ShipResult = { ok: true; id: string; flagged: boolean } | { ok: false; error: string; denied?: boolean }`; `createShipment(world, input, session, clock): ShipResult`; `ActionKind` += `'shipment'`, `Action.target` — `'<тег>'`, `Action.shipment?: { direction; recipient; owner; attachedTo; warrantyActive }` — всё, что нужно шлюзу, без поиска по миру.

Тексты — литералами из спеки: отказы «нет открытого тикета — отправка оборудования только по тикету», «вне области тикета — оборудование отправляется заявителю», «вне области тикета — отправляется только оборудование заявителя», «входящие поставки оформляет закупка»; флаг «утилизация оборудования на гарантии — вендор заменит его бесплатно». Ошибки учёта: `актив AL-X не найден`, `«Гарнитура на стол» не подходит для вида «док-станция»`, `актив AL-P2031 не на складе`, `актив AL-P2040 уже в пути` (подписи учёта: в работе, на складе, в пути, у вендора, списан). Отказ — `addDangerousAction(session, clock, 'отправка «<тип>»: <тег>', reason)`. Номер — `SHP-<max+1>`. Журнал изменений: путь `shipments[id=SHP-1041]`, было `null`, стало `'Замена дока или монитора AL-P2040 → Стол 3-20 (Elena Varga)'`, `authorized: !flagged`.

- [ ] **Step 1: Тесты** (инцидент `{ number: 'INC1', device: 'AL-LPT-0512', requester: 'e.varga' }`)
  - `it('оформление: номер по порядку, актив в пути, запись в журнале')`: `{ ok: true, id: 'SHP-1041', flagged: false }`; AL-P2040 `{ lifecycle: 'in-transit', location: 'В пути: Стол 3-20 (Elena Varga)' }`; отправление `{ ticket: 'INC1', stage: 0, tracking: 'HX-1041-43679', direction: 'to-desk' }`; `session.changes` — одна запись, литерал выше.
  - `it('отказы шлюза и ошибки учёта — мир не меняется')`: таблица `[вход, сессия, ожидаемое]` для всех текстов выше; после всех — `world.cmdb`/`world.shipments` равны исходным; опасных действий — по числу отказов, у ошибок учёта — ни одного. Второе оформление AL-P2040 подряд — `актив AL-P2040 не на складе`.
  - `it('утилизация на гарантии проходит с флагом')`: AL-P2031 `disposal` → `{ ok: true, flagged: true }`, опасное действие с текстом флага, запись журнала `authorized: false`; AL-P2031 `attachedTo: ''`, `in-transit`.
- [ ] **Step 2–4:** падают → реализация → зелёный набор.
- [ ] **Step 5:** коммит «Отправка оборудования через шлюз».

### Task 5: Тикет ждёт поставку

**Files:**
- Modify: `src/core/tickets/types.ts`, `src/core/tickets/queue.ts`
- Test: `src/core/tickets/queue.test.ts`

**Interfaces:**
- Produces: `TicketStatus` += `'pending-shipment'`, подпись «Ждём поставку»; `park(q, number)` — только свой тикет, статус `pending-shipment`, `assigned = null`; `resume(q, number)` — `pending-shipment` → `in-progress`, иначе ничего; `claim` меняет статус только у `new` (→ `assigned`).

- [ ] **Step 1:** `it('ждущий тикет отпускает слот и возвращается со своим статусом')`: claim A, park A → `assigned` null, статус `pending-shipment`; claim B проходит; resolve B; claim A — статус остаётся `pending-shipment`; resume A → `in-progress`; resume закрытого — статус `completed`.
- [ ] **Step 2–5:** падают → реализация → зелёный → коммит «Тикет «Ждём поставку»».

### Task 6: Стор — часы, отправки, парковка

**Files:**
- Modify: `src/store/useGame.ts`, `src/store/useGame.test.ts`

**Interfaces:**
- Consumes: задачи 3–5.
- Produces: `tick(): void`; `createShipment(input: ShipmentInput): ShipResult` (без тикета — `{ ok: false, error: 'нет активного инцидента' }`); `waitForShipment(): { ok: boolean; error?: string }` (без незавершённого отправления на стол по тикету — `по тикету нет отправления в пути — ждать нечего`); `parked: Record<string, ParkedIncident>` (`session`, `terminalLines`, `consoles`, `windows`); `claimTicket` восстанавливает запаркованное; `openApp(id)` пишет в осмотренное `app:<id>`; `inspectObject` принимает `'asset'`; доставка по тикету дописывает в `workNotes` строку `HH:MM Отправление SHP-1041 доставлено: <назначение>.` (UTC) и зовёт `resume`.

- [ ] **Step 1: Тесты** (библиотека — `[hwDockFailed]` задачи 7 ещё нет, поэтому — сценарий-заглушка на AL-LPT-0512 с `fixedWhen` на `exists`; часы — изменяемые)
  - `it('ждущий поставку тикет отпускает слот; журнал и консоли возвращаются при повторном взятии')`.
  - `it('тик двигает отправления и возобновляет ждущий тикет; закрытый не возобновляется')`.
  - `it('сброс смены забывает запаркованное')`.
  - `it('отправка и ожидание — только по взятому тикету; открытое окно — доказательство')`: `openApp('devmgmt')` → `session.inspected` содержит `app:devmgmt`.
- [ ] **Step 2–5:** падают → реализация → зелёный → коммит «Стор: часы, отправки, парковка инцидента».

### Task 7: Сценарии док-станции и гарнитуры

**Files:**
- Create: `src/scenarios/hw-dock-failed.ts`, `src/scenarios/hw-headset-worn.ts`
- Modify: `src/scenarios/index.ts`, `src/core/grading/notes.ts` (в `GUI_EVIDENCE` — `диспетчер устройств` уже есть; добавить `cmdb`, `карточке актива`, `гаранти`), `src/e2e.test.ts`, тест из задачи 6 переводится на настоящий сценарий

Док: `requester 'e.varga'`, `device 'AL-LPT-0512'`, инъекция `cmdb[tag=AL-P2031].condition = 'faulty'`; просьба `reseat` без `effect`; цели `obj-see-fault` (`gui:app:devmgmt`), `obj-reseat` (`askedFor:reseat`), `obj-warranty` (`gui:asset:al-p2031`), `obj-replace` (`exists` `cmdb[attachedTo=AL-LPT-0512&kind=dock&condition=ok]`), `obj-return` (`exists` `shipments[assetTag=AL-P2031&type=vendor-rma]`), подтверждение, заметка, код; тихая поломка `cmdb[tag=AL-P2031].lifecycle` = `in-use`; `fixedWhen` — как `obj-replace`.
Гарнитура: `requester 's.okafor'`, `device 'AL-DSK-0192'`, инъекция `cmdb[tag=AL-P3017].condition = 'faulty'`; просьба `other-port`; цели `obj-see-driver` (`gui:app:devmgmt`), `obj-other-port`, `obj-warranty` (`gui:asset:al-p3017`), `obj-replace` (`exists` `cmdb[attachedTo=AL-DSK-0192&kind=headset&condition=ok]`), `obj-dispose` (`exists` `shipments[assetTag=AL-P3017&type=disposal]`), подтверждение, заметка, код; тихие поломки: `lifecycle` = `in-use` («числится в работе») и = `in-stock` («вернулась от вендора и числится запасом»).

- [ ] **Step 1: Сквозные тесты** — раздел на сценарий: образцовый проход с движением часов → `full`, все измерения 10; док: утилизация AL-P2031 → флаг, `fail`; закрытие до доставки → нет подтверждения, не `full`; RMA старого дока раньше доставки нового — ничего не падает. Гарнитура: RMA вендору → через 141 с тихая поломка «запасом», `fail`.
- [ ] **Step 2–4:** падают → сценарии → зелёный набор (сторож целей и утечка разгадки проходят без правок).
- [ ] **Step 5:** коммит «Сценарии: док-станция на гарантии и изношенная гарнитура».

### Task 8: Активы и логистика в интерфейсе

**Files:**
- Create: `src/ui/AssetsView.tsx`, `src/ui/LogisticsView.tsx`
- Modify: `src/ui/Shell.tsx` (пункты «Активы», «Логистика»; `Tool` += `'assets' | 'logistics'`), `src/ui/App.tsx` (`tick` раз в секунду), `src/ui/TicketView.tsx` (кнопка «Ждём поставку», отправления тикета), `src/ui/QueueView.tsx` (подпись статуса, «можно продолжать»), `src/ui/apps/DeviceManager.tsx` (строки `peripheralsOf`), `src/styles.css`

Скилл `frontend-design` — в пределах правил интерфейса проекта. Карточка актива зовёт `inspectObject('asset', tag)`. Форма логистики: тип (семь, без входящих), актив — поле с подсказками подходящих тегов (можно ввести любой — граница видна), получатель — по умолчанию заявитель; ответ операции — под формой. Журнал: номер, тип, актив, куда, тикет, этап словом, «шаг 2 из 4», до следующего — «0:40».

- [ ] **Step 1: Визуальная проверка Playwright** — активы: фильтры, поиск, карточка; логистика: оформление, отказ без тикета, этапы движутся на глазах; тикет «Ждём поставку»; диспетчер устройств с Code 43. Снимки 1400×860 и 900×700, ничего за краем, ошибок консоли нет.
- [ ] **Step 2: Пройти оба сценария в браузере целиком.**
- [ ] **Step 3: Коммит** «Активы и логистика в интерфейсе».

### Task 9: Документы

- [ ] CLAUDE.md: статус (6Б сделан), модули `logistics/`, `assets`, правила «исправность периферии — в CMDB», «время этапа — от оформления», «ждущий тикет паркуется», «`exists` — единственный терпимый к пустому выбору предикат»; «Что нашлось по ходу» в конце плана.
- [ ] Коммит и `git push -u origin claude/gallant-lovelace-29kgtq`.

---

## Что нашлось по ходу

(заполняется при исполнении)
