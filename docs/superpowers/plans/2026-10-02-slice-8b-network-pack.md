# Срез 8Б — сетевой пакет. План реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** три сетевых сценария с развилками — DNS на списанном сервере, статический адрес с чужим шлюзом, порт в err-disabled — и малые доработки движка под них.

**Architecture:** мир получает три новые машины с людьми и портами, поле адаптера `dnsSource`, поля порта `errDisabled`/`intruder` и списанный DNS-сервер. Операции над адаптером живут в `core/device/adapter.ts` и вызываются `netsh`; `ping` отличает чужой шлюз; консоль коммутатора знает err-disabled. Сценарии — контент на сервере, как остальные.

**Tech Stack:** TypeScript, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-02-slice-8b-network-pack-design.md`

## Global Constraints

- Вывод команд — эталонным текстом целиком (`toEqual({ exitCode, stdout })`), по формату Windows 10/11 и Cisco IOS.
- `netsh interface ip show …`: метки с 5-й позиции, значения — с 43-й; продолжение списка DNS — 42 пробела и значение.
- Сообщение `ipconfig /renew` и `/release` на адаптере без DHCP: `The operation failed as no adapter is in the state permissible for this operation.`, код выхода 1.
- `ping` с чужим шлюзом: `Reply from <свой адрес>: Destination host unreachable.` ×4; статистика `Packets: Sent = 4, Received = 4, Lost = 0 (0% loss),` без строки времён.
- Журнал коммутатора при нарушении: `%PORT_SECURITY-2-PSECURE_VIOLATION: Security violation occurred, caused by MAC address <mac> on port GigabitEthernet1/0/<n>.` и `%PM-4-ERR_DISABLE: psecure-violation error detected on Gi1/0/<n>, putting Gi1/0/<n> in err-disable state`.
- `switchport port-security …` — отказ шлюза, опасное действие.
- Новые сценарии держат машину и человека константами в начале файла (подсрез 8В переведёт их в параметры).
- Тесты — по CLAUDE.md «Какие тесты писать»; `git add` явными путями; `tsc` — отдельной командой до коммита.

## Review Focus

1. Продление аренды на машине со статическим DNS меняет адрес, но не DNS (задача 2).
2. `netsh … set address … dhcp` в VLAN без DHCP (принтеры) — машина уходит на самоназначенный, как при `renew` (задача 2).
3. `no shutdown` на err-disabled порту без предварительного `shutdown` — порт остаётся err-disabled, как на Cisco (задача 5).
4. Имя интерфейса в кавычках и без, `name=` и позиционное, `ip` и `ipv4` — все формы одинаковы (задача 3).
5. Тикет закрыт кодом «решено» при DNS 8.8.8.8 — тихая поломка в разборе (задача 6).

---

### Task 1: Мир — новые машины, поля, списанный DNS

**Files:**
- Modify: `src/core/world/types.ts` (`Adapter.dnsSource`, `SwitchPort.errDisabled`, `SwitchPort.intruder`)
- Modify: `src/core/world/seed.ts`, `seed-directory.ts`, `seed-network.ts`, `seed-cmdb.ts`
- Modify: эталоны тестов, где видны все люди, машины и аренды (`net.test.ts`, `dsquery.test.ts`, `dhcp.test.ts`, `ipconfig.test.ts`, `e2e.test.ts` — по факту падения)

**Interfaces — Produces:**
- `Adapter.dnsSource: 'dhcp' | 'static'` (в стартовом мире у всех `'dhcp'`).
- `SwitchPort.errDisabled: 'psecure-violation' | null`, `SwitchPort.intruder: string | null` (MAC), в стартовом мире `null`; `saved` порта их не хранит.
- Машины: `AL-LPT-0821` (k.novak, Katarina Novak, Финансы, порт Gi1/0/7 «DESK-2-14», MAC `3C-52-82-11-6A-0E`, адрес `10.20.14.94`), `AL-LPT-0833` (r.alvarez, Rafael Alvarez, Логистика, Gi1/0/8 «DESK-4-07», `58-11-22-9B-C4-71`, `10.20.14.95`), `AL-LPT-0846` (a.osei, Ama Osei, Маркетинг, Gi1/0/9 «DESK-3-22», `7C-D3-0A-44-E8-15`, `10.20.14.96`); у каждого — контрольные поля, группа сотрудников, учётная запись машины в CMDB по образцу соседей.
- Пул VLAN 20: `10.20.14.88`–`10.20.14.99`.
- DNS-сервер `10.20.14.9` с `reachable: false` (списанный контроллер).

- [x] **Step 1:** тест мира — `seed.test` (или ближайший существующий тест мира): новые машины подключены к своим портам и в VLAN 20 (`linkOf`, `segmentOf`), пул содержит `10.20.14.99`, `10.20.14.9` есть и недоступен.
- [x] **Step 2:** запустить — FAIL.
- [x] **Step 3:** реализовать; обновить эталоны, которые изменились из-за новых людей и машин (литерал меняется на литерал, глазами сверив, что изменилась только новая строка).
- [x] **Step 4:** `npx vitest run` → PASS; `npm run typecheck` → чисто.
- [x] **Step 5:** commit «Мир: три новые машины, источник DNS, err-disabled порта».

### Task 2: Адаптер — ручной DNS и статический адрес

**Files:**
- Create: `src/core/device/adapter.ts`, `src/core/device/adapter.test.ts`
- Modify: `src/core/network/dhcp.ts` (`acquireLease` не трогает DNS при `'static'`), `src/core/terminal/commands/ipconfig.ts` (`/renew`, `/release` при `dhcpEnabled: false`)

**Interfaces — Produces** (все пишут изменение в журнал сессии, как `services.ts`):
- `setDnsDhcp(world, host, session, clock): void` — `dnsSource: 'dhcp'`, DNS из сегмента.
- `setDnsStatic(world, host, servers: string[], session, clock): void`.
- `setAddressDhcp(world, host, session, clock): void` — `dhcpEnabled: true`, затем аренда как `renew` (нет DHCP в сегменте — самоназначенный).
- `setAddressStatic(world, host, ip, mask, gateway, session, clock): void` — `dhcpEnabled: false`, `autoconfigured: false`, аренда сброшена.

- [x] **Step 1:** тесты — `renew при ручном DNS меняет адрес, но не DNS` (Review Focus 1); `set address dhcp в VLAN принтеров — самоназначенный` (Review Focus 2); `ipconfig /renew на статическом адаптере` — эталон `{ exitCode: 1, stdout: '\nWindows IP Configuration\n\nThe operation failed as no adapter is in the state permissible for this operation.\n' }` (заголовок — как у прочих режимов `ipconfig`); каждое изменение — строка в `session.changes`.
- [x] **Step 2–4:** FAIL → реализовать → PASS, `typecheck`.
- [x] **Step 5:** commit «Адаптер: ручной DNS и статический адрес».

### Task 3: `netsh interface ip`

**Files:** Modify `src/core/terminal/commands/netsh.ts`; Create `src/core/terminal/commands/netsh.test.ts`.

**Interfaces — Consumes:** задачи 2. Формы: `interface ip|ipv4 show config|dns`, `interface ip|ipv4 set dns|dnsservers <имя> dhcp|static <ip>`, `… source=dhcp`, `name="Ethernet"`, `interface ip|ipv4 set address <имя> dhcp|static <ip> <маска> [<шлюз>]`. Имя без кавычек и в кавычках равны. Неизвестное имя — `The filename, directory name, or volume label syntax is incorrect.`, код 1. Успешный `set` — пустой вывод, код 0. Контекст `advfirewall` не меняется.

- [x] **Step 1:** тесты — эталон `show config` для адаптера по DHCP и для статического (DHCP enabled `No`, `Statically Configured DNS Servers:`), эталон `show dns`; `set dns … dhcp` и `set address … static` меняют мир (таблица форм из Review Focus 4: все дают одно состояние).
- [x] **Step 2–4:** FAIL → реализовать → PASS.
- [x] **Step 5:** commit «netsh interface ip: конфигурация, DNS и адрес».

### Task 4: `ping` — чужой шлюз

**Files:** Modify `src/core/terminal/commands/ping.ts`; тест — в существующем `reachability.test.ts`.

- [x] **Step 1:** тест — шлюз адаптера не равен шлюзу сегмента: `ping 8.8.8.8` даёт эталон из Global Constraints; `ping 10.20.14.1` (адрес своей подсети) — обычный ответ.
- [x] **Step 2–4:** FAIL → реализовать → PASS.
- [x] **Step 5:** commit «ping: чужой шлюз — недостижимо».

### Task 5: Коммутатор — err-disabled и защита порта

**Files:** Modify `src/core/network/link.ts` (`portStatus` → `'err-disabled'`), `src/core/switchcli/show.ts`, `src/core/infra/switchops.ts` (`setPortAdmin`), `src/core/switchcli/cli.ts` (`switchport port-security`, флаг `switchLogRead` по `show logging` на коммутаторе тикета), `src/core/session/types.ts` + `session.ts` (флаг), `src/core/policy/authorize.ts` (вид действия); тесты — `cli.test.ts`, `switchops` / `link` тесты.

**Interfaces — Produces:** `portStatus(): 'connected' | 'notconnect' | 'disabled' | 'err-disabled'`; флаг сессии `switchLogRead: boolean`; `setPortAdmin(..., false)` снимает `errDisabled`; `setPortAdmin(..., true)` при `intruder` — снова `errDisabled: 'psecure-violation'` и две записи журнала (Global Constraints).

- [x] **Step 1:** тесты — эталон `show interfaces status` с err-disabled портом; `show interfaces Gi1/0/9` — первая строка `GigabitEthernet1/0/9 is down, line protocol is down (err-disabled)`; `no shutdown` без `shutdown` — порт остаётся err-disabled (Review Focus 3); `shutdown` + `no shutdown` при `intruder` — снова err-disabled, в журнале две новые записи; без `intruder` — `connected`, линк машины поднят; `switchport port-security maximum 2` — `Command authorization failed.` и опасное действие; `show logging` на коммутаторе тикета поднимает `switchLogRead`.
- [x] **Step 2–4:** FAIL → реализовать → PASS.
- [x] **Step 5:** commit «Коммутатор: err-disabled и защита порта».

### Task 6: Сценарий «DNS на списанном сервере»

**Files:** Create `src/scenarios/net-dns-stale-static.ts`; Modify `src/scenarios/index.ts`, `src/e2e.test.ts` (раздел).

**Поломка:** `AL-LPT-0821`: `dnsSource: 'static'`, `dns: ['10.20.14.9']`. Цели: увидеть ручной DNS (`netsh interface ip show dns` или `show config`), проверить разрешение (`nslookup`), вернуть DNS из DHCP (состояние: `dnsSource === 'dhcp'`), подтверждение заявителя, заметка, код. `fixedWhen`: `dnsSource` равен `'dhcp'` и DNS — серверы сегмента. Тихая поломка: `dnsSource === 'static'` при коде «решено» («DNS прописан вручную: внутренние имена не разрешаются»). `actionsToAvoid`: прописать публичный DNS вручную.

- [x] **Step 1:** e2e — образцовый проход (`flushdns` и `renew` ничего не меняют — `nslookup` всё так же «timed-out»; `show dns` → `set dns … dhcp` → `nslookup` отвечает → звонок → full); ловушка `set dns … static 8.8.8.8` — тихая поломка в разборе (Review Focus 5).
- [x] **Step 2–4:** FAIL → сценарий → PASS; тесты утечки в модель и бандл проходят по всей библиотеке.
- [x] **Step 5:** commit «Сценарий: DNS на списанном сервере».

### Task 7: Сценарий «Статический адрес с чужим шлюзом»

**Files:** Create `src/scenarios/net-static-wrong-gateway.ts`; Modify `index.ts`, `e2e.test.ts`.

**Поломка:** `AL-LPT-0833`: `dhcpEnabled: false`, `10.20.14.97/24`, шлюз `10.20.14.254`, DNS `10.20.14.10`, `dnsSource: 'static'`, аренда сброшена. Цели: увидеть статику (`netsh … show config` или `ipconfig /all`), проверить шлюз (`ping 10.20.14.1` или `ping 8.8.8.8`), вернуть DHCP (состояние: `dhcpEnabled === true`), подтверждение, заметка, код. Тихая поломка: `dhcpEnabled === false` при коде «решено» («адрес из пула DHCP закреплён вручную — конфликт при выдаче»).

- [x] **Step 1:** e2e — образцовый проход (`renew` — отказ; `ping 8.8.8.8` — недостижимо; `set address … dhcp` → аренда → `ping` отвечает → звонок → full); ловушка — `set address … static 10.20.14.97 255.255.255.0 10.20.14.1`: заявитель подтверждает, тихая поломка в разборе.
- [x] **Step 2–4:** FAIL → сценарий → PASS.
- [x] **Step 5:** commit «Сценарий: статический адрес с чужим шлюзом».

### Task 8: Сценарий «Порт отключён защитой»

**Files:** Create `src/scenarios/net-port-security.ts`; Modify `index.ts`, `e2e.test.ts`.

**Поломка:** порт Gi1/0/9 (`AL-LPT-0846`): `errDisabled: 'psecure-violation'`, `intruder: '3c52.8899.ab01'`, две записи журнала. Просьба `unplug-switch` («отключите от розетки маленький коммутатор…») открывается `switchLogRead`, эффект — `intruder: null`. Цели: проверить машину (`ipconfig`), найти порт и причину (`show logging` или `show interfaces status`), попросить убрать устройство (`askedFor`), поднять порт (состояние: порт `connected`), подтверждение, заметка, код. `actionsToAvoid`: поднимать порт, не убрав причину; менять защиту порта.

- [x] **Step 1:** e2e — образцовый проход (полный); развилка — `shutdown` + `no shutdown` до просьбы: порт снова err-disabled, в журнале новые записи, заявитель «всё так же»; `switchport port-security maximum 2` — отказ, опасное действие, полномочия в разборе ниже.
- [x] **Step 2–4:** FAIL → сценарий → PASS.
- [x] **Step 5:** commit «Сценарий: порт отключён защитой».

### Task 9: Проверка в браузере и документы

- [x] **Step 1:** `npm run dev`; Playwright: три сценария через интерфейс — вывод `netsh` и `ping` в терминале удалёнки, консоль коммутатора с err-disabled и журналом, просьба после `show logging`, разборы. Снимки — в рабочую папку сессии.
- [x] **Step 2:** найденное — регрессией и в план.
- [x] **Step 3:** CLAUDE.md — статус, три сценария в списке, правила среза; план — «Что нашлось по ходу», «Решения исполнителя».
- [x] **Step 4:** `npx vitest run`, `npm run typecheck`, `npm run build`, `npm run build:server`.
- [x] **Step 5:** commit «Документы среза 8Б».

## Что нашлось по ходу

Визуальная проверка (Playwright, три сценария через интерфейс) — четыре
находки при зелёных тестах, каждая с регрессией:

1. **Отменённый тикет ретрансляции оставлял VLAN 20 без DHCP до конца
   смены.** Скрипт отменил «пропавшую ретрансляцию», и DNS-тикет следом
   не смог продлить аренду — любой сетевой тикет становился непроходимым.
   `onEscalate` теперь применяется при любом коде закрытия
   (`useGame.test.ts`, «починка общей системы»). Скрытый тикет пока не
   чинит: его поломка ждёт возвращения в окно.
2. **Трей горел «Подключено» при чужом шлюзе и мёртвом DNS.** Windows в
   обоих случаях пишет «Без доступа к интернету». `internetOf` в
   `network/link.ts`, трей читает его (`link.test.ts`, `Taskbar.test.ts`).
3. **Карточка тикета показывала адрес у машины без линка**, хотя `ipconfig`
   печатал «Media disconnected». `railNetwork` в `IncidentRail.tsx`.
4. **Легенда портов не знала err-disabled** — знак ⊘ был на панели, но не
   в подписи.

По ходу: незанятые порты подписаны `DESK-3-NN`, и подписи `DESK-3-14` и
`DESK-3-20` уже повторяются у Gi1/0/1 и Gi1/0/14, Gi1/0/2 и Gi1/0/20 —
сделано до 8Б, не тронуто; новая розетка взяла `DESK-3-52`, чтобы не
добавить третий дубль.

## Решения исполнителя

- Адрес ловушки второго сценария — `10.20.14.97` из пула VLAN 20, а не `.150` из спеки: ловушка в том и состоит, что адрес из пула закреплён вручную.
- Розетка Ama Osei — `DESK-3-52` (кабинет 3-52): `DESK-3-22` уже носит Gi1/0/22.
- Отделы: Ama Osei — «Продажи» (маркетолог), Rafael Alvarez — «Операции» (логистика): новых OU каталог не получил.
- Сообщение `renew`/`release` на статическом адаптере — в две строки, как переносит Windows.
- Заметка: список DNS в изменении делится по «, », слово «dns» из пути изменением не считается.
- `set address … static` сбрасывает DNS из аренды, ручной сохраняет; `set address … dhcp` источник DNS не трогает.
- `netsh interface …` вне `ip|ipv4` — «command was not found»; `interface show interface` — таблица интерфейсов (заглушка «Ok.» отвечала на любую строку).
- `ping` с чужим шлюзом — код 1: оценка считает неуспешные команды проверками без находки.
- Правка защиты порта — вид `disable-security`; порядок журнала — `%PM-4-ERR_DISABLE`, затем `%PORT_SECURITY-2-PSECURE_VIOLATION`, как в IOS.
- Полная форма команды в журнале (`CommandResult.canonical`) для `netsh`; публичные резолверы 8.8.8.8 и 1.1.1.1 в мире.
- Все три сценария берут `dhcp:vlan20`, как остальные сетевые; у каждого — вопрос интервью об опыте.
- Тихая поломка второго сценария — общая проверка «отключён DHCP»; ручной DNS 10.20.14.10 после возврата на DHCP поломкой не считается.
- MAC чужого устройства — `00e0.4c68.2a17` (префикс `3c52` совпадал с ноутбуком Katarina Novak).
