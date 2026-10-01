# Выкладка sysadmin.fun на Raspberry Pi

С среза 8А контент (сценарии, курсы, интервью) и оценка живут на сервере,
а в бандле браузера их нет. Сайт — две части: статика `dist/` под nginx и
сервер контента `server-dist/sysadmin-fun.mjs` под systemd.

## Что нужно на Pi

- nginx (уже стоит);
- Node.js 18 или новее: `sudo apt install nodejs` (Raspberry Pi OS bookworm
  ставит 18.19 — подходит). Проверка: `node --version`.

## Первая установка

```bash
# на своей машине, в репозитории
npm ci
npm run build          # статика → dist/
npm run build:server   # сервер → server-dist/sysadmin-fun.mjs

# на Pi
sudo mkdir -p /opt/sysadmin-fun
sudo cp sysadmin-fun.mjs /opt/sysadmin-fun/
sudo cp sysadmin-fun.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now sysadmin-fun
curl -s localhost:8787/api/catalog | head -c 80   # должен ответить JSON
```

Фрагмент `nginx.conf` из этой папки — внутрь `server { … }` сайта, затем
`sudo nginx -t && sudo systemctl reload nginx`.

## Каждая следующая выкладка

1. `npm run build && npm run build:server`.
2. **Удалить старые файлы из `assets/` на Pi** перед копированием нового
   `dist/`: старые бандлы содержат весь контент открытым текстом и
   остаются доступными по прежним адресам.
3. Скопировать `dist/` в корень сайта, `sysadmin-fun.mjs` — в
   `/opt/sysadmin-fun/`, `sudo systemctl restart sysadmin-fun`.
4. Очистить кэш Cloudflare (Caching → Configuration → Purge Everything):
   ассеты кэшируются на 4 часа.

## Один раз — убрать старые копии

Старые полные бандлы, где весь контент открытым текстом, лежат ещё в трёх
местах:

- проект Cloudflare Pages `sysadmin-fun` (sysadmin-fun.pages.dev) —
  удалить проект целиком: удаление снимает и старые выкладки по хешам;
- Worker `website` (Workers Builds) — после этого среза он собирает
  клиент без сервера и раздаёт нерабочую копию; удалить Worker, затем
  убрать `wrangler.jsonc` из репозитория — иначе пуш снова будет падать;
- репозиторий на GitHub — сделать приватным (Settings → Change visibility).

## Секрет подписи

Сервер подписывает тикеты HMAC. Секрет создаётся при первом запуске в
`/var/lib/sysadmin-fun/secret` и переживает перезапуск. Смена секрета
(удалить файл и перезапустить) обесценивает выданные тикеты: у игроков
посреди смены будет «Сервер не узнал тикет — начните смену заново».
