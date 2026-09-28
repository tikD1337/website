# Срез 6В — база знаний: план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** база знаний, которую зарабатывает игрок: закрытый тикет с заметкой становится черновиком статьи, статья правится с версиями, публикуется и архивируется, переживает перезагрузку и показывается в тикете той же проблемы.

**Architecture:** чистые функции `core/kb/` над массивом статей; база живёт в `Progress.kb` рядом с историей и пишется в IndexedDB тем же путём. Стор обновляет её синхронно при закрытии и правке, хранилище получает следом; гидратация сливает загруженное с накопленным.

**Tech Stack:** TypeScript, React 18, zustand, vitest. Без новых зависимостей.

**Spec:** `docs/superpowers/specs/2026-09-28-slice-6c-knowledge-base-design.md`

## Global Constraints

- Ядро (`src/core/**`) — без React, `window` и `Date.now()`; время — аргументом.
- Интерфейс и тексты — по-русски. Цвет — только суждение; статус статьи — словом.
- Прочитанное из хранилища — `unknown`, пока не проверено; проверка не бросает.
- Тесты — по разделу CLAUDE.md «Какие тесты писать».
- Не использовать `git add -A`. Коммит после каждой задачи, `npm run typecheck` и `npm test` зелёные.

## Review Focus

1. **Хранилище прошлого формата без `kb`** — история читается целиком, статей нет. Тест — задача 3.
2. **Черновик создан до конца гидратации** — номера не повторяются, источники одной проблемы сливаются. Тест — задача 3.
3. **«Сохранить» без изменений, дважды** — версия не растёт. Тест — задача 2.
4. **Длинная многострочная заметка** — статья показывает абзацы, ничего не вылезает. Проверка — задача 5 (визуальная).
5. **Закрытие «Отменено» или без заметки при существующей статье** — статья не тронута. Тест — задача 1.

---

## Раскладка файлов

| Файл | Ответственность |
|---|---|
| `src/core/kb/types.ts` | `KbArticle`, `KbType`, `KbStatus`, подписи |
| `src/core/kb/draft.ts` | черновик из прохождения |
| `src/core/kb/edit.ts` | правка с версией, переходы статуса |
| `src/core/kb/search.ts` | поиск, похожие, слияние при гидратации |
| `src/core/progress/types.ts`, `validate.ts`, `db.ts` | `Progress.kb`, проверка, чтение прошлого формата |
| `src/store/useGame.ts` | закрытие → черновик, правка, статус, открытие статьи |
| `src/ui/KnowledgeView.tsx` | инструмент «Документация» |

---

### Task 1: Черновик из закрытого тикета

**Files:**
- Create: `src/core/kb/types.ts`, `src/core/kb/draft.ts`
- Test: `src/core/kb/draft.test.ts`

**Interfaces:**
- Produces: типы из спеки; `TYPE_LABEL: Record<KbType, string>` (SOP, Runbook, Сеть, Справка по AD, Известные проблемы, Вендоры, Диагностика); `STATUS_LABEL: Record<KbStatus, string>` (Черновик, Опубликована, В архиве); `DraftResult { kb: KbArticle[]; id: string | null; created: boolean }`; `draftFrom(kb: KbArticle[], record: TicketRecord): DraftResult` — не мутирует вход; номер `KB-<n+1>` четырьмя цифрами.

- [ ] **Step 1: Тесты** (запись — литерал `TicketRecord` с `card` через приведение)
  - `it('закрытие с заметкой — черновик: заголовок, текст, тип по таблице')`: APIPA (`Сеть`, `solved`) → `{ id: 'KB-0001', created: true }`, статья `{ title: <summary>, body: <notes без краёв>, status: 'draft', version: 1, type: 'network', sources: ['SH-1:INC1'], history: [] }`; таблица `[категория, код, тип]`: Сеть/solved → network, Личность/solved → ad, Оборудование/solved → diagnostics, Прочее/solved → sop, Сеть/escalate → known-issue.
  - `it('повтор проблемы добавляет источник, текст не трогает')`: второй прохождение того же сценария с другой заметкой → `{ id: 'KB-0001', created: false }`, `sources` из двух, `body` и `version` прежние; вход не изменился (`toEqual` копии до вызова).
  - `it('отменённое и без заметки черновиков не дают и статью не трогают')`: `cancelled` и заметка `'   '` → `{ id: null, created: false }`, база та же — и пустая, и с готовой статьёй.
- [ ] **Step 2–4:** падают → реализация → зелёный.
- [ ] **Step 5:** коммит «База знаний: черновик из закрытого тикета».

### Task 2: Правка, статус, поиск

**Files:**
- Create: `src/core/kb/edit.ts`, `src/core/kb/search.ts`
- Test: `src/core/kb/edit.test.ts`, `src/core/kb/search.test.ts`

**Interfaces:**
- Produces: `KbResult = { ok: true; article: KbArticle } | { ok: false; error: string }`; `editArticle(a, patch: { title?: string; type?: KbType; body?: string }, at: string): KbResult`; `setStatus(a, to: KbStatus, at: string): KbResult`; `searchKb(kb, filter: { query?: string; type?: KbType; status?: KbStatus }): KbArticle[]`; `relatedTo(kb, t: { scenarioId: string; subcategory: string }): KbArticle[]`.

Тексты: `у статьи должен быть заголовок`, `у статьи должен быть текст`, `нельзя опубликовать пустую статью`, переход — `нельзя: «Черновик» → «В архиве»`. Разрешено: draft → published, published → retired, retired → published.

- [ ] **Step 1: Тесты**
  - `it('правка — новая версия, прежняя в истории; без изменений версия не растёт')`: правка текста → `version: 2`, `history: [{ version: 1, at: <создание>, title, type, body: <старый> }]`, `updatedAt` — новый; повтор той же правки → статья та же (`toBe`); пустой заголовок и текст из пробелов — ошибки, статья не изменена.
  - `it('статусы — только разрешённые переходы')`: таблица `[из, в, ok]` для всех девяти пар; успешный переход не меняет `version`.
  - `it('поиск без регистра по заголовку и тексту, фильтры; похожие — сначала та же проблема, архив не показывается')`.
- [ ] **Step 2–5:** падают → реализация → зелёный → коммит «База знаний: правка с версиями, статусы, поиск».

### Task 3: Хранение в прогрессе

**Files:**
- Modify: `src/core/progress/types.ts`, `src/core/progress/validate.ts`, `src/core/progress/db.ts`
- Create: в `src/core/kb/search.ts` — `mergeKb`
- Test: `src/core/progress/validate.test.ts`, `src/core/kb/search.test.ts`

**Interfaces:**
- Produces: `Progress.kb: KbArticle[]`, `emptyProgress().kb === []`; `validateProgress` принимает прогресс без `kb`, отвергает не массив и битую статью (коды `bad_kb`, `bad_article`); `normalizeProgress(raw: Progress): Progress` — достраивает `kb: []`, зовётся в `loadProgress`; `mergeKb(loaded: KbArticle[], inMemory: KbArticle[]): KbArticle[]`.

- [ ] **Step 1: Тесты**
  - `validate.test.ts` → `it('прогресс прошлого формата без статей читается; битая статья — ошибка')`: `{ version: 1, records: [] }` → ошибок нет, `normalizeProgress` даёт `kb: []`; `kb: 'x'` → `bad_kb`; статья без заголовка или со статусом `'lost'` → `bad_article`.
  - `search.test.ts` → `it('гидратация: загруженное первым, та же проблема сливает источники, остальные — следующие номера')`: загружено KB-0001 (apipa), KB-0002 (spooler); в памяти KB-0001 (apipa, источник `SH-9:X`), KB-0002 (lockout) → `['KB-0001','KB-0002','KB-0003']`, у apipa источники из обоих, lockout — `KB-0003`.
- [ ] **Step 2–5:** падают → реализация → зелёный → коммит «База знаний хранится в прогрессе».

### Task 4: Стор и сквозной проход

**Files:**
- Modify: `src/store/useGame.ts`, `src/store/useGame.test.ts`, `src/e2e.test.ts`

**Interfaces:**
- Consumes: задачи 1–3.
- Produces: `lastDraft: { id: string; created: boolean } | null` (сбрасывается при взятии тикета); `editArticle(id, patch): KbResult`; `setArticleStatus(id, status): KbResult`; `openArticle(id): void` — `kbOpen = id`, `activeTool = 'kb'`, при взятом тикете `kb:<id строчными>` в осмотренное; `Tool` += `'kb'`. Закрытие обновляет `progress.kb` через `draftFrom` в том же `set`, что и запись прохождения; правка и статус — `saveProgress` следом; гидратация — `mergeKb`.

- [ ] **Step 1: Тесты**
  - стор → `it('закрытие даёт черновик сразу; правка и публикация сохраняются')`: после закрытия `progress.kb` из одной статьи и `lastDraft: { id: 'KB-0001', created: true }`; `editArticle` → версия 2; `setArticleStatus('KB-0001','published')` → опубликована; `saveProgress` (мок `db`) вызван с `kb` актуальной версии.
  - стор → `it('открытая статья — в осмотренном только при взятом тикете')`.
  - `e2e` → `describe('база знаний')`, `it('своя статья возвращается с повтором проблемы и копит источники')`: закрыть APIPA с заметкой → черновик; `reset`; взять APIPA снова → `relatedTo(progress.kb, тикет)` отдаёт KB-0001; закрыть → у статьи два источника, версия 1.
- [ ] **Step 2–5:** падают → реализация → зелёный → коммит «Стор: база знаний из закрытий».

### Task 5: «Документация» в интерфейсе

**Files:**
- Create: `src/ui/KnowledgeView.tsx`
- Modify: `src/ui/Shell.tsx` (пункт «Документация» после «Логистики»), `src/ui/TicketView.tsx` (раздел «База знаний»), `src/ui/ScorecardView.tsx` (строка о черновике), `src/styles.css`

Скилл `frontend-design` — в пределах правил интерфейса. Список: поиск, фильтры типа и статуса, строки (номер, заголовок, тип, статус, версия, источников). Статья: текст абзацами (`pre-line`), метаданные, история версий; правка — заголовок, тип, текст, «Сохранить», «Опубликовать», «В архив» / «Вернуть из архива»; ошибка операции словами. Пустая база — «Статьи появятся из закрытых тикетов: заметка о решении станет черновиком».

- [ ] **Step 1: Визуальная проверка Playwright** — закрыть тикет → строка о черновике в разборе → «Документация» → правка, публикация, история; новая смена → тот же сценарий → статья в тикете, переход по ней. Снимки 1400×860 и 900×700, ничего за краем, ошибок консоли нет.
- [ ] **Step 2: Коммит** «Документация: база знаний в интерфейсе».

### Task 6: Документы

- [ ] CLAUDE.md: статус (срез 6 закрыт), модуль `kb/`, правила «одна статья на проблему», «источники — прохождения, а не номера тикетов», «база — часть прогресса, прошлый формат читается»; «Что нашлось по ходу».
- [ ] Коммит и `git push -u origin claude/gallant-lovelace-29kgtq`.

---

## Что нашлось по ходу

(заполняется при исполнении)
