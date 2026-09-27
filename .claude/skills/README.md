# Скиллы проекта

Копии скиллов из плагинов, которые на локальной машине стоят плагинами.
В облачных сессиях Claude Code плагины недоступны, а скиллы из
`.claude/skills/` репозитория подхватываются всегда — поэтому они здесь.

| Скиллы | Источник | Версия | Лицензия |
|---|---|---|---|
| brainstorming, dispatching-parallel-agents, executing-plans, finishing-a-development-branch, receiving-code-review, requesting-code-review, subagent-driven-development, systematic-debugging, test-driven-development, using-git-worktrees, using-superpowers, verification-before-completion, writing-plans | https://github.com/obra/superpowers, `skills/` | коммит `8ca22db` (6.4.x) | MIT, `LICENSE-superpowers` |
| frontend-design | https://github.com/anthropics/claude-plugins-official, `plugins/frontend-design/skills/` | коммит `fa59bc9` | Apache 2.0, `frontend-design/LICENSE.txt` |

Не взяты `diagnosing-superpowers` (отладка самого плагина) и
`writing-skills` (написание скиллов) — к работе над проектом отношения
не имеют.

Здесь имена без префикса плагина: `superpowers:brainstorming` из CLAUDE.md
в облаке — это `brainstorming`. Внутри скиллов ссылки на другие скиллы
остались с префиксом `superpowers:` — это те же скиллы.

Обновить: склонировать источник заново и заменить папки целиком, не
правя их руками — иначе следующее обновление затрёт правки молча.
