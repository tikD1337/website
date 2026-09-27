# Срез 6А — серверная и коммутатор: план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** коммутатор и серверная как инструменты над единым миром, консоль с синтаксисом IOS, область тикета в шлюзе полномочий и два сетевых сценария — решаемый и с эскалацией.

**Architecture:** порт коммутатора — источник истины для линка и VLAN машины; DHCP выводится из ретрансляции ядра и области сервера. Консоль — чистая функция `runSwitch` над миром; кнопки серверной и команды консоли вызывают одни операции `core/infra/switchops.ts`, прошедшие через `authorize`. Эскалация получает свою оценку, сценарий — общие ресурсы и починку второй линией.

**Tech Stack:** TypeScript, React 18, zustand, vitest. Без новых зависимостей.

**Spec:** `docs/superpowers/specs/2026-09-27-slice-6a-server-room-design.md`

## Global Constraints

- Ядро (`src/core/**`) — без React, `window` и `Date.now()`; время — через `Clock`.
- Вывод консоли — по-английски; интерфейс и тексты сценариев — по-русски.
- Бренды вымышленные: сетевое железо `Ferrix` (`BRAND.vendors.network`), принтеры `Kiyomi`. `brand.test.ts` сторожит мир и сценарии.
- Цвет в интерфейсе — только суждение; состояние порта — знаком и словом. Шрифты системные, скругление — у интерактивного.
- Тесты — по разделу CLAUDE.md «Какие тесты писать»: одно поведение — один тест, вывод — эталоном целиком, литералы.
- Не использовать `git add -A`. Коммит после каждой задачи, `npm run typecheck` и `npm test` зелёные.

## Review Focus

1. **Машина без порта** (не воткнута ни в один порт) — линк опущен, `ipconfig` печатает `Media disconnected`, консоль и серверная не падают. Тест — задача 1.
2. **Сокращение команды совпадает с началом двух слов** (`sh` → `show`, но `s` → `show`/`shutdown` в `config-if`) — `% Ambiguous command`, мир не меняется. Тест — задача 5.
3. **Изменение порта без взятого тикета** — отказ `Command authorization failed.`, мир не меняется. Тест — задача 3 (`authorize`) и задача 5 (консоль).
4. **Повторная аренда той же машины** возвращает её прежний адрес, а не чужой; две машины подряд получают разные. Тест — задача 2.
5. **Эскалация решаемого сценария** — вторая линия не «чинит» за техника: `onEscalate` есть только у сценария, где эскалация верна; код закрытия «неверный» снижает полномочия. Тест — задача 6.

---

## Раскладка файлов

| Файл | Ответственность |
|---|---|
| `src/core/world/types.ts` | новые типы сети и серверной; `Adapter.segment` удаляется |
| `src/core/world/seed-network.ts` (новый) | сегменты, коммутаторы, маршрутизатор, серверы, принтер |
| `src/core/world/seed.ts`, `seed-directory.ts` | подключение сетевого сида; Tomas Lindqvist и AL-LPT-0788 |
| `src/core/network/link.ts` (новый) | порт, линк, VLAN и сегмент машины |
| `src/core/network/dhcp.ts` (новый) | обслуживает ли DHCP VLAN, выдача аренды, самоназначение |
| `src/core/infra/switchops.ts` (новый) | операции над коммутатором через шлюз |
| `src/core/switchcli/{grammar,show,cli}.ts` (новые) | разбор по префиксу, вывод `show`, режимы консоли |
| `src/core/session/*`, `policy/authorize.ts` | инцидент сессии, `canonical`, `userInformed`, `infra-change` |
| `src/core/scenario/types.ts`, `tickets/generate.ts` | `resources`, `onEscalate` |
| `src/core/grading/{grade,notes}.ts`, `dialogue/{intent,scripted}.ts` | эскалация в оценке, намерение `handoff` |
| `src/scenarios/net-wrong-vlan-port.ts`, `net-dhcp-relay-missing.ts` (новые) | сценарии |
| `src/store/useGame.ts` | консоли, операции, «сообщить о передаче», `onEscalate` |
| `src/ui/ServerRoom.tsx`, `src/ui/infra/*` (новые) | серверная, порты, консоль |

---

### Task 1: Топология — порт как источник линка и VLAN

**Files:**
- Modify: `src/core/world/types.ts`, `src/core/world/seed.ts`, `src/core/world/seed-directory.ts`
- Create: `src/core/world/seed-network.ts`, `src/core/network/link.ts`
- Modify: `src/core/terminal/commands/ipconfig.ts`, `ping.ts`, `src/ui/desktop/Taskbar.tsx`
- Test: `src/core/network/link.test.ts`, `src/core/world/world.test.ts`, `src/core/terminal/commands/ipconfig.test.ts`

**Interfaces:**
- Produces:
  - типы `SwitchPort { name; description; connectedTo; mode: 'access' | 'trunk'; accessVlan: number; adminUp: boolean; saved: PortConfig }`, `PortConfig { accessVlan; adminUp; description }`, `VlanInterface { vlan: number; ip; mask; helpers: string[]; adminUp: boolean }`, `NetSwitch` (поля из спеки), `Router`, `Server { hostname; roles: string[]; ip; os; location; health: DeviceHealth; services: Service[] }`, `NetPrinter`, `DeviceHealth`.
  - `NetworkSegment` += `vlanId: number; name: string; leases: Record<string, string>` (MAC → адрес).
  - `WorldState.network` += `switches: NetSwitch[]; routers: Router[]; servers: Server[]; printers: NetPrinter[]`.
  - `link.ts`: `portOf(world, host): { sw: NetSwitch; port: SwitchPort } | undefined`, `linkOf(world, host): boolean`, `vlanOf(world, host): number | null`, `segmentOf(world, host): NetworkSegment | undefined`.

Данные сида (спека, «Серверная»): SW-FL3-01 (access, Ferrix FX-2448P, 48 портов `Gi1/0/1..48`; 1–6 — AL-LPT-0447, 0512, 0601, 0714, AL-DSK-0192, AL-LPT-0788 в VLAN 20; 22 — `DESK-3-22`, VLAN 20, пуст; 40 — PRN-FL3-01, VLAN 40; 48 — `UPLINK-CR-01`, trunk; остальные — `DESK-3-NN`, VLAN 20). CR-01 (core, Ferrix FX-9300-24; SVI Vlan10 `10.20.10.1`, Vlan20 `10.20.14.1` helpers `['10.20.10.5']`, Vlan40 `10.20.40.1` без helpers). Сегменты: `vlan10` 10 SERVERS `10.20.10.0/24`; `vlan20` 20 STAFF (нынешний, `dhcpServer: '10.20.10.5'`, `leases` из адресов машин); `vlan40` 40 PRINTERS `10.20.40.0/24`, `dhcpServer: ''`. RT-EDGE-01, серверы DC01 `10.20.14.10`, DC02 `.11`, DHCP01 `10.20.10.5`, FS01 `.15`, MAIL01 `.25`, APP01 `.50`; PRN-FL3-01 `10.20.40.21`. Tomas Lindqvist: `t.lindqvist`, OU Operations, диспетчер, руководитель `Dumisani Mbeki`, кабинет `3-22`, AL-LPT-0788 (Kestrel Meridian 5450, MAC `F4-39-09-5B-7E-22`, адрес `10.20.14.93`).

- [ ] **Step 1: Тесты**

`link.test.ts` → `it('линк и VLAN машины выводятся из порта')`: для AL-LPT-0447 `vlanOf === 20`, `linkOf === true`; `port.adminUp = false` → `linkOf === false`; `adapter.linkUp = false` → `false`; машина без порта (`connectedTo` очищен) → `portOf === undefined`, `linkOf === false`, `vlanOf === null`; порт переведён в VLAN 40 → `segmentOf(...).vlan === 'vlan40'`.
`world.test.ts` — инвариант сида: каждая машина воткнута ровно в один порт; каждый `accessVlan` есть в `sw.vlans` и в сегментах; адреса серверов и принтера уникальны.
`ipconfig.test.ts` — порт выключен → `/all` печатает `Media disconnected` (эталон уже есть: заменить инъекцию `linkUp` на `adminUp` порта).

- [ ] **Step 2: Убедиться, что падают** — `npx vitest run src/core/network src/core/world` → FAIL: нет `link.ts`.
- [ ] **Step 3: Типы, сид, `link.ts`; `ipconfig`, `ping`, трей переходят на `linkOf`/`segmentOf`** — `Adapter.segment` удалить; в `Taskbar.tsx` вызывать `networkState({ ...adapter, linkUp: linkOf(world, host) })`.
- [ ] **Step 4: Весь набор зелёный** — `npm run typecheck && npm test`.
- [ ] **Step 5: Коммит** «Порт коммутатора — источник линка и VLAN машины».

### Task 2: DHCP из ретрансляции и таблица аренд

**Files:**
- Create: `src/core/network/dhcp.ts`, `src/core/network/dhcp.test.ts`
- Modify: `src/core/terminal/commands/ipconfig.ts`

**Interfaces:**
- Consumes: `segmentOf`, `vlanOf` (задача 1).
- Produces: `coreOf(world): NetSwitch | undefined`; `dhcpServes(world, vlanId: number): boolean`; `acquireLease(world, host, clock): { ok: true; ip: string } | { ok: false }` — при успехе пишет адрес, маску, шлюз, DNS, сроки, `autoconfigured: false` и `leases[mac]`; `autoconfigure(world, host): void` — `169.254.<байт5>.<байт6 MAC>` с заменой 0 и 255 на 1 и 254; `dhcpRequestsLastHour(world, vlanId): number` — 37 при `dhcpServes`, иначе 0.

Правило аренды: `leases[mac]`, иначе первый адрес `leasePool`, не занятый адаптером другой машины и не записанный за другим MAC.

- [ ] **Step 1: Тесты** в `dhcp.test.ts`:
  - `it('DHCP отвечает VLAN, только когда есть ретрансляция и живая область')`: `dhcpServes(w, 20) === true`; `helpers = []` → `false`; SVI `adminUp = false` → `false`; `segments.vlan20.dhcpHealthy = false` → `false`; `dhcpServes(w, 40) === false`.
  - `it('аренда — прежняя по MAC, у новой машины своя')` (регрессия: раньше любой получал `10.20.14.88`): освободить адрес AL-LPT-0447 и AL-LPT-0788, `acquireLease` обеим → `10.20.14.88` и `10.20.14.93`; удалить `leases` для MAC 0788 → получает первый свободный `10.20.14.94`, а не `.88`.
  - `it('самоназначенный адрес выводится из MAC')`: `autoconfigure(w, 'AL-LPT-0788')` → `ip: '169.254.126.34'`, `mask: '255.255.0.0'`, `gateway: ''`, `autoconfigured: true`.
- [ ] **Step 2: Падают** — `npx vitest run src/core/network/dhcp.test.ts`.
- [ ] **Step 3: `dhcp.ts`; `ipconfig /renew` зовёт `acquireLease` вместо `leasePool[0]`** — эталоны `ipconfig.test.ts` не меняются.
- [ ] **Step 4: Зелёный набор.**
- [ ] **Step 5: Коммит** «DHCP выводится из ретрансляции ядра; аренда по MAC».

### Task 3: Инцидент сессии и область тикета в шлюзе

**Files:**
- Modify: `src/core/session/types.ts`, `session.ts`, `src/core/policy/authorize.ts`, `src/core/grading/grade.ts` (сверка целей с `canonical`)
- Test: `src/core/policy/authorize.test.ts`, `src/core/session/session.test.ts`, `src/core/grading/grade.test.ts`

**Interfaces:**
- Produces: `SessionLog.incident?: { number: string; device: string; requester: string }`; `createSession(incident?)`; `CommandEntry.canonical?: string`; `recordCommand(s, clock, device, cmdline, exitCode, canonical?)`; `SessionFlags.userInformed: boolean`; `ActionKind` += `'infra-change'` с `target: '<коммутатор>/<порт>'`.

- [ ] **Step 1: Тесты**
  - `authorize.test.ts` → `it('порт машины из тикета менять можно, чужой и без тикета — нельзя')`: сессия с `incident.device = 'AL-LPT-0447'` → `infra-change` `SW-FL3-01/Gi1/0/1` → `allow`; `SW-FL3-01/Gi1/0/2` → `deny`, `reason` содержит «вне области тикета»; `SW-FL3-01/Gi1/0/48` → `deny`; сессия без инцидента → `deny`, `reason` содержит «нет открытого тикета».
  - `grade.test.ts` → `it('цель засчитывается по канонической форме команды')`: `recordCommand(..., 'sh ip int br', 0, 'show ip interface brief')` закрывает цель с `commands: ['show ip interface brief']`.
- [ ] **Step 2: Падают.**
- [ ] **Step 3: Реализация** — `objectiveMet` кладёт в множество выполненных и `cmdline`, и `canonical`.
- [ ] **Step 4: Зелёный набор.**
- [ ] **Step 5: Коммит** «Сессия знает свой инцидент; область тикета в шлюзе».

### Task 4: Операции над коммутатором

**Files:**
- Create: `src/core/infra/switchops.ts`, `src/core/infra/switchops.test.ts`

**Interfaces:**
- Consumes: `authorize` (задача 3), `acquireLease`, `autoconfigure` (задача 2), `portOf` (задача 1).
- Produces: `InfraResult { ok: boolean; error?: string; alreadyInState?: boolean }`; `setAccessVlan(world, sw, port, vlan, session, clock)`, `setPortAdmin(world, sw, port, up, session, clock)`, `setDescription(world, sw, port, text, session, clock)`, `saveConfig(world, sw, session, clock)`, `setHelper(world, sw, vlan, ip, add, session, clock)` — все `InfraResult`. `findPort(world, sw, name)` принимает `Gi1/0/22`, `gi1/0/22`, `GigabitEthernet1/0/22`.

Изменение пишется в журнал путём `network.switches[hostname=SW-FL3-01].ports[name=Gi1/0/22].accessVlan`, в журнал коммутатора — `%SYS-5-CONFIG_I: Configured from console by helpdesk on vty0` и при смене линка `%LINK-3-UPDOWN: Interface GigabitEthernet1/0/22, changed state to up|down`. Подъём линка с поднятым адаптером зовёт `acquireLease`, при отказе — `autoconfigure`. `setHelper` — всегда `shared-system`. `saveConfig` с инцидентом копирует `adminUp`, `accessVlan`, `description` в `saved`.

- [ ] **Step 1: Тесты** в `switchops.test.ts`:
  - `it('VLAN порта из тикета меняется и пишется, машина при поднятом линке не трогается')`.
  - `it('подъём линка запускает получение адреса: есть DHCP — аренда, нет — 169.254')` — порт AL-LPT-0447 выключить и включить → `10.20.14.88`; то же в VLAN 40 → `autoconfigured: true`.
  - `it('чужой порт и ретрансляция — отказ, опасное действие, мир не меняется')`.
  - `it('сохранение копирует текущую конфигурацию в стартовую')`.
- [ ] **Step 2–4:** падают → реализация → зелёный набор.
- [ ] **Step 5: Коммит** «Операции над коммутатором через шлюз».

### Task 5: Консоль коммутатора

**Files:**
- Create: `src/core/switchcli/grammar.ts`, `show.ts`, `cli.ts`, `src/core/switchcli/cli.test.ts`

**Interfaces:**
- Consumes: `switchops` (задача 4), `recordCommand` с `canonical` (задача 3).
- Produces: `CliMode = 'user' | 'enable' | 'config' | 'config-if'`; `CliState { device: string; mode: CliMode; iface: string | null }`; `newCli(device): CliState` (режим `user`); `promptOf(state): string` (`SW-FL3-01>`, `#`, `(config)#`, `(config-if)#`); `runSwitch(line, state, ctx: CommandContext): { stdout: string; exitCode: number; state: CliState }` — сам пишет команду в журнал (пустую строку — нет), `ctx.device` — имя коммутатора.

Канонические формы (строчными): `show interfaces status`, `show vlan brief`, `show mac address-table[ address <mac>| interface <if>]`, `show running-config interface gigabitethernet1/0/22`, `show running-config interface vlan20`, `show ip interface brief`, `show logging`, `configure terminal`, `interface gigabitethernet1/0/22`, `switchport access vlan 20`, `shutdown`, `no shutdown`, `write memory`. MAC печатается `a483.e72c.9144`, фильтр принимает и `A4-83-E7-2C-91-44`.

- [ ] **Step 1: Эталоны** (ширины колонок — в тесте литералами):
  - `show interfaces status`: заголовок `'Port         Name               Status       Vlan       Duplex  Speed Type'`, строка `'Gi1/0/1      AL-LPT-0447        connected    20         a-full a-1000 10/100/1000BaseTX'`, пустой порт `'Gi1/0/7      DESK-3-07          notconnect   20           auto   auto 10/100/1000BaseTX'`, аплинк с `trunk`, выключенный — `disabled`.
  - `show vlan brief`: `'VLAN Name                             Status    Ports'`, разделитель `'---- -------------------------------- --------- -------------------------------'`, порты по четыре в строке, продолжение с отступом 48.
  - `show mac address-table address a483.e72c.9144`: блок «Mac Address Table» и строка `'  20    a483.e72c.9144    DYNAMIC     Gi1/0/1'`, итог `Total Mac Addresses for this criterion: 1`.
  - `show running-config interface gi1/0/22`: `Building configuration...`, `Current configuration : <байты> bytes`, `!`, `interface GigabitEthernet1/0/22`, ` description DESK-3-22`, ` switchport access vlan 20`, ` switchport mode access`, ` spanning-tree portfast`, `end`. Байты — сумма `длина+1` строк от `interface` до `end`.
  - `show running-config interface vlan 20` на CR-01: ` ip address 10.20.14.1 255.255.255.0`, ` ip helper-address 10.20.10.5`.
  - `show ip interface brief` на CR-01: `'Interface              IP-Address      OK? Method Status                Protocol'`, `'Vlan20                 10.20.14.1      YES NVRAM  up                    up'`.
  - `show interfaces gi1/0/1`: первая строка `'GigabitEthernet1/0/1 is up, line protocol is up (connected)'`, затем `'  Description: AL-LPT-0447'`; выключенный — `'is administratively down, line protocol is down (disabled)'`.
  - `show logging`: `'Log Buffer (8192 bytes):'`, пустая строка, записи `'*Sep 10 02:14:07.000: %SYS-5-CONFIG_I: …'` — время из `log[].at` в UTC.
  - `write memory` → `'Building configuration...\r\n[OK]'`; `copy running-config startup-config` → строка `'Destination filename [startup-config]? '` и тот же итог.
- [ ] **Step 2: Тесты поведения**
  - `it('режимы и приглашение')`: `enable`, `conf t`, `int gi1/0/22`, `end` — приглашения по порядку.
  - `it('сокращения, неоднозначность и ошибки ввода')`: `sh vl br` ≡ `show vlan brief` (одинаковый вывод, канонический журнал); `s` в `config-if` → `% Ambiguous command:  "s"`; `show vlna` → каретка под `v`, `% Invalid input detected at '^' marker.`; `show` → `% Incomplete command.`; `conf t` в режиме `user` → `% Invalid input`.
  - `it('порт из тикета: VLAN, передёргивание, сохранение')` — через консоль, с проверкой мира.
  - `it('чужой порт и ретрансляция — Command authorization failed.')`, мир не меняется, опасное действие записано; то же без инцидента.
  - `it('консоль и операции неотличимы')` — мир и журнал изменений равны для `switchport access vlan 20` ≡ `setAccessVlan`, `shutdown` ≡ `setPortAdmin(false)`, `write memory` ≡ `saveConfig`.
- [ ] **Step 3–5:** падают → реализация → зелёный набор → коммит «Консоль коммутатора с синтаксисом IOS».

### Task 6: Сценарии: ресурсы и эскалация в оценке

**Files:**
- Modify: `src/core/scenario/types.ts`, `src/core/tickets/generate.ts`, `src/core/grading/grade.ts`, `src/core/grading/notes.ts`, `src/core/dialogue/intent.ts`, `src/core/dialogue/scripted.ts`, `src/scenarios/net-apipa-no-lease.ts`
- Test: `generate.test.ts`, `grade.test.ts`, `notes.test.ts`, `scripted.test.ts`

**Interfaces:**
- Produces: `Scenario.resources?: string[]`, `Scenario.onEscalate?: InjectPatch[]`; `Intent` += `'handoff'` (проверяется после `scope`, до `retry`: «передаю», «передам», «передал», «эскалир», «второй линии», «вторую линию», «сетевой групп», «сетевым инженер»); `scriptedReply` на `handoff` — «Поняла, спасибо. Буду ждать — сообщите, когда заработает?».

- [ ] **Step 1: Тесты**
  - `generate.test.ts` → `it('сценарии с общим ресурсом в окне не встречаются')`: два сценария на разных машинах с `resources: ['dhcp:vlan20']` — второй ждёт в пуле.
  - `grade.test.ts` → `it('эскалация: коммуникация и качество — по «сообщил о передаче», самоназначенный адрес — не тихая поломка')`: сценарий с `expectedResolution: 'escalate'`, код `escalate`, `userInformed` → коммуникация 10 (со сверкой и связью), качество 10, `silentFaults` пусты при `autoconfigured: true`; без `userInformed` — коммуникация 6; тот же адрес при коде `solved` в сценарии APIPA — тихая поломка.
  - `notes.test.ts` → `it('в заметке об эскалации — что передано и кто предупреждён')`: части `escalation` и `informed` вместо `change` и `verification`; `escalation` засчитана, если названа выполненная команда на сетевом устройстве и слово передачи.
  - `scripted.test.ts` — строка `['Передаю вашу заявку сетевой группе', 'handoff']` в таблице намерений.
  - `grade.test.ts` — эскалация решаемого: APIPA, код `escalate` → полномочия 5, вердикт не `full`.
- [ ] **Step 2–4:** падают → реализация (`apipa` получает `resources: ['dhcp:vlan20']`) → зелёный набор.
- [ ] **Step 5: Коммит** «Эскалация в оценке; общие ресурсы сценариев».

### Task 7: Стор — консоли, операции серверной, передача

**Files:**
- Modify: `src/store/useGame.ts`, `src/store/useGame.test.ts`

**Interfaces:**
- Consumes: всё выше.
- Produces в `GameState`: `consoles: Record<string, { cli: CliState; lines: TerminalLine[] }>`; `runSwitchCommand(device: string, line: string): void`; `setPortVlan(sw, port, vlan): InfraResult`; `setPortEnabled(sw, port, up): InfraResult`; `setPortDescription(sw, port, text): InfraResult`; `saveSwitchConfig(sw): InfraResult`; `informRequester(): void` — реплика техника «Передаю вашу заявку сетевой группе — это настройка сетевого оборудования, у меня нет к ней доступа. Сообщу, когда починят.», ответ заявителя, `userInformed`; `inspectObject(kind: 'user' | 'group' | 'device' | 'port' | 'svi', id)`. `claimTicket` зовёт `createSession({ number, device, requester })`, консоли сбрасываются с инцидентом. `resolveTicket` при коде `escalate` применяет `onEscalate` после оценки.

- [ ] **Step 1: Тесты** в `useGame.test.ts`:
  - `it('консоль пишет в журнал инцидента и сбрасывается со следующим тикетом')`.
  - `it('изменения серверной — только по взятому тикету')` → без тикета `{ ok: false, error: 'нет активного инцидента' }`.
  - `it('эскалация применяет починку второй линии после оценки')`; эскалация APIPA мир не меняет — у него нет `onEscalate`.
- [ ] **Step 2–5:** падают → реализация → зелёный набор → коммит «Стор: консоли коммутаторов и операции серверной».

### Task 8: Сценарии переезда и ретрансляции

**Files:**
- Create: `src/scenarios/net-wrong-vlan-port.ts`, `src/scenarios/net-dhcp-relay-missing.ts`
- Modify: `src/scenarios/index.ts`, `src/e2e.test.ts`

Содержание — спека, раздел «Сценарии». Номера: `incidentNumber(id)`. Цели переезда: `obj-see-apipa` (`ipconfig /all`), `obj-find-port` (`show mac address-table address f439.095b.7e22` | `show mac address-table` | `show interfaces status` | `gui:port:sw-fl3-01/gi1/0/22`), `obj-see-vlan` (`show running-config interface gigabitethernet1/0/22` | `show vlan brief` | `gui:port:sw-fl3-01/gi1/0/22`), `obj-fix-vlan` (состояние `accessVlan` = 20), `obj-lease` (состояние: не самоназначен, шлюз `10.20.14.1`), `obj-save` (состояние `saved.accessVlan` = 20), подтверждение, заметка, код. Тихая поломка: `saved.accessVlan` = 40. Цели ретрансляции: `obj-see-apipa`, `obj-scope` (`scopeChecked`), `obj-check-dhcp` (`gui:device:dhcp01`), `obj-find-relay` (`show running-config interface vlan20` | `gui:svi:cr-01/vlan20`), `obj-inform` (`userInformed`), заметка, код; `onEscalate` — `helpers: ['10.20.10.5']`. Оба — `resources: ['dhcp:vlan20']`.

- [ ] **Step 1: Сквозные тесты** — раздел на сценарий в `e2e.test.ts`:
  - переезд: образцовый проход консолью → `full`; `renew` без смены VLAN не помогает; VLAN сменён без `write memory` → тихая поломка и `fail`; проход мышью (карточка порта и кнопки) → те же цели.
  - ретрансляция: образцовый проход → код `escalate`, `full`; попытка `ip helper-address` → `fail`, полномочия 0; после закрытия ретрансляция восстановлена.
- [ ] **Step 2–4:** падают → сценарии → зелёный набор (сторож целей и проверка утечки разгадки проходят без правок).
- [ ] **Step 5: Коммит** «Сценарии: переезд в чужой VLAN и пропавшая ретрансляция».

### Task 9: Серверная в интерфейсе

**Files:**
- Create: `src/ui/ServerRoom.tsx`, `src/ui/infra/PortGrid.tsx`, `src/ui/infra/SwitchConsole.tsx`
- Modify: `src/ui/Shell.tsx` (пункт «Серверная», `Tool` += `'serverroom'`), `src/ui/TicketView.tsx` (кнопка «Сообщить о передаче»), `src/styles.css`

Скилл `frontend-design` — при вёрстке, в пределах правил интерфейса проекта. Открытие карточки устройства, порта, SVI зовёт `inspectObject`. Сетка портов: знак `●` занят и поднят, `○` пуст, `×` выключен, подпись номера; выбранный порт — рамкой. Консоль — как «Командная строка»: строки, поле ввода с приглашением `promptOf`.

- [ ] **Step 1: Визуальная проверка скриптом Playwright** — открыть серверную, SW-FL3-01 → «Порты» → Gi1/0/22 → сменить VLAN; «Консоль» → `sh vl br`; снимки при 1400×860 и 900×700 (ничего не вылезает за край, консоль прокручивается), ошибок в консоли браузера нет.
- [ ] **Step 2: Пройти оба новых сценария в браузере целиком.**
- [ ] **Step 3: Коммит** «Серверная: устройства, порты, консоль».

### Task 10: Документы

- [ ] CLAUDE.md: статус (6А сделан), модули `network/`, `infra/`, `switchcli/`, правило «порт — источник линка», «эскалация: вторая линия чинит после оценки»; спека — дополнить «Что нашлось по ходу» в конце этого плана.
- [ ] Коммит и `git push -u origin claude/gallant-lovelace-29kgtq`.

---

## Что нашлось по ходу

(заполняется при исполнении)
