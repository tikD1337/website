import { useState } from 'react'
import { useGame } from '../store/useGame'
import { speechAvailable } from './speech/speak'
import { listenAvailable } from './speech/listen'
import {
  LOCAL_MODEL_URL, PROXY_URL, DEFAULT_MODEL,
  type DialogueMode, type DialogueConfig,
} from '../core/dialogue/types'

/**
 * Настройки собеседника.
 *
 * Три режима, одна реализация: Ollama отдаёт OpenAI-совместимый
 * эндпоинт, поэтому локальная модель и чужой API различаются только
 * адресом и ключом.
 *
 * Переключение работает на лету — перезагрузка не нужна, и это не
 * удобство, а требование: режим меняют посреди инцидента, когда модель
 * начала отвечать невпопад.
 */

const MODES: Array<{ id: DialogueMode; label: string; hint: string }> = [
  {
    id: 'scripted',
    label: 'Реплики сценария',
    hint: 'Работает всегда, без сети и без модели. Это основной режим, '
      + 'а не запасной: все сценарии проходятся целиком.',
  },
  {
    id: 'local',
    label: 'Локальная модель',
    hint: `Ollama на этой машине. Бесплатно и оффлайн; ключ не нужен. `
      + `Загрузить модель: ollama pull ${DEFAULT_MODEL}`,
  },
  {
    id: 'endpoint',
    label: 'Свой эндпоинт',
    hint: 'Любой OpenAI-совместимый API через прокси dev-сервера. Ключ '
      + 'подставляет прокси из config/llm.local.json — этот файл вне '
      + 'репозитория, и в собранную страницу ключ не попадает.',
  },
]

export function SettingsView() {
  const config = useGame(s => s.dialogueConfig)
  const probe = useGame(s => s.probeResult)
  const setConfig = useGame(s => s.setDialogueConfig)
  const probeModel = useGame(s => s.probeModel)
  const records = useGame(s => s.progress.records)
  const wipeProgress = useGame(s => s.wipeProgress)

  const [checking, setChecking] = useState(false)
  /*
    Сброс прогресса необратим, поэтому спрашивается дважды. Вторым
    нажатием подтверждается ровно то действие, которое названо на
    кнопке, — окна подтверждения браузера здесь нет намеренно: оно
    выглядит как чужое и его закрывают не глядя.
  */
  const [confirmWipe, setConfirmWipe] = useState(false)

  const patch = (p: Partial<DialogueConfig>) => setConfig({ ...config, ...p })

  /*
    Смена режима подставляет разумный адрес: локальной модели — Ollama,
    своему эндпоинту — прокси. Введённый вручную адрес при возврате в
    тот же режим не восстанавливается, и это честнее, чем угадывать.
  */
  const switchMode = (mode: DialogueMode) => {
    if (mode === 'local') patch({ mode, baseUrl: LOCAL_MODEL_URL })
    else if (mode === 'endpoint') patch({ mode, baseUrl: PROXY_URL })
    else patch({ mode })
  }

  const check = async () => {
    setChecking(true)
    await probeModel()
    setChecking(false)
  }

  return (
    <>
      <div className="head">
        <h1>Настройки</h1>
        <p>
          Кто отвечает за заявителя в разговоре. Тренажёр целиком работает
          без модели — она делает беседу живее, но ничего не открывает и
          ничего не решает за вас.
        </p>
      </div>

      <div className="section">
        <h2>Собеседник</h2>

        <div className="modes">
          {MODES.map(m => (
            <button
              key={m.id}
              type="button"
              className="mode"
              aria-current={config.mode === m.id}
              onClick={() => switchMode(m.id)}
            >
              <b>{m.label}</b>
              <span className="sub">{m.hint}</span>
            </button>
          ))}
        </div>
      </div>

      {config.mode !== 'scripted' && (
        <div className="section">
          <h2>Подключение</h2>

          <dl className="kv wide">
            <dt>Адрес</dt>
            <dd>
              <input
                type="text"
                aria-label="Адрес эндпоинта"
                value={config.baseUrl}
                onChange={e => patch({ baseUrl: e.target.value })}
              />
            </dd>

            <dt>Модель</dt>
            <dd>
              <input
                type="text"
                aria-label="Имя модели"
                value={config.model}
                onChange={e => patch({ model: e.target.value })}
              />
            </dd>

            <dt>Ключ</dt>
            <dd>
              <input
                type="text"
                aria-label="Ключ API"
                value={config.apiKey}
                placeholder={config.mode === 'local'
                  ? 'локальной модели ключ не нужен'
                  : 'обычно не нужен — ключ подставляет прокси'}
                onChange={e => patch({ apiKey: e.target.value })}
              />
            </dd>
          </dl>

          {/*
            Ключ живёт только в памяти страницы. Написано прямо на
            экране, потому что «куда делся мой ключ» — вопрос, который
            возникает через минуту после перезагрузки.
          */}
          <p className="sub">
            Ключ хранится только до закрытия вкладки и никуда не
            записывается. Штатный способ — прокси dev-сервера: положите
            адрес и ключ в <code>config/llm.local.json</code> (пример
            рядом, в <code>llm.local.example.json</code>) и выберите
            «Свой эндпоинт».
          </p>

          <div className="bar">
            <button
              className="act"
              type="button"
              disabled={checking}
              onClick={() => void check()}
            >
              {checking ? 'Проверяю…' : 'Проверить соединение'}
            </button>

            {probe && (
              <span className={probe.ok ? 'flag-on' : 'deny'}>
                {probe.ok
                  ? '✓ Модель ответила.'
                  : `✕ ${probe.error}`}
              </span>
            )}
          </div>

          {probe && !probe.ok && (
            <p className="sub">
              Разговор от этого не сломается: при отказе модели отвечают
              реплики сценария, и над лентой появляется плашка с причиной.
            </p>
          )}
        </div>
      )}

      <div className="section">
        <h2>Речь</h2>

        <div className="bar">
          <button
            className="act"
            type="button"
            aria-pressed={config.speak}
            disabled={!speechAvailable()}
            onClick={() => patch({ speak: !config.speak })}
          >
            {config.speak ? 'Озвучка включена' : 'Озвучка выключена'}
          </button>
        </div>

        <p className="sub">
          {speechAvailable()
            ? 'Реплики собеседника проговариваются голосом браузера. '
              + 'Текст остаётся на экране всегда.'
            : 'Синтез речи в этом браузере недоступен — реплики только текстом.'}
          {' '}
          {listenAvailable()
            ? 'Микрофон доступен: в разговоре есть кнопка «Микрофон», '
              + 'но набирать текст можно всегда.'
            : 'Распознавание речи недоступно — ввод только текстом.'}
        </p>
      </div>

      <div className="section">
        <h2>Прогресс</h2>

        <p className="sub">
          Закрытых тикетов в истории: {records.length}. «Пройти заново»
          начинает новую смену и прогресс не трогает — стирает только эта
          кнопка, и восстановить стёртое нельзя.
        </p>

        {/*
          Отмена стоит первой, и это не вкусовщина.

          Подтверждение появляется на месте кнопки, которую только что
          нажали: React переиспользует узел, курсор остаётся там же, а
          фокус переходит на первую кнопку. Поставь «стереть» первой —
          и двойной клик по инерции сотрёт историю, не дав прочитать
          вопрос. Под курсором обязано оставаться безопасное действие.
        */}
        <div className="bar">
          {confirmWipe ? (
            <>
              <button
                className="act primary"
                type="button"
                onClick={() => setConfirmWipe(false)}
              >
                Отмена
              </button>
              <button
                className="act"
                type="button"
                onClick={() => { void wipeProgress(); setConfirmWipe(false) }}
              >
                Да, стереть навсегда
              </button>
            </>
          ) : (
            <button
              className="act"
              type="button"
              disabled={records.length === 0}
              onClick={() => setConfirmWipe(true)}
            >
              Сбросить прогресс
            </button>
          )}
        </div>
      </div>
    </>
  )
}
