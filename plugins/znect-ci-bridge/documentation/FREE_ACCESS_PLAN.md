# Znect CI Bridge — бесплатный канал ChatGPT

**Статус:** Bridge Preview и read-only диагностика проверены; on-demand канал через приватный GitHub Actions workflow подготовлен в Draft PR и ожидает активации.

**Цель:** по команде пользователя ChatGPT самостоятельно получает актуальное состояние Znect Forge — репозиторий, запуски CI, статусы workflows/jobs, ошибки, логи, результаты тестов и события — без обязательного custom MCP и без платной подписки ChatGPT.

## 1. Архитектурный принцип

MCP остаётся дополнительным интерфейсом для совместимых клиентов. Основной бесплатный путь ChatGPT строится через уже подключённую GitHub-интеграцию и приватный GitHub Actions workflow:

1. ChatGPT по запросу пользователя инициирует команду в приватном inbox Forge.
2. GitHub Actions обращается к защищённому read-only API Znect CI Bridge.
3. Bridge получает сведения из CircleCI, не изменяя pipelines.
4. Workflow сохраняет полный JSON-отчёт в приватном Actions artifact с коротким сроком хранения.
5. ChatGPT находит workflow run, скачивает artifact через GitHub-интеграцию и анализирует его.

Этот сценарий не отправляет unsolicited-уведомления в открытый чат: он запускается только после запроса пользователя.

## 2. Схема

```
Пользователь → ChatGPT → GitHub integration
                         |
                         v
              Private Forge inbox issue #8
                         |
                         v
              GitHub Actions workflow
                         |
                  HTTPS + WEB token
                         v
              Cloudflare Worker Preview
                         |
                  CircleCI API (GET)
                         v
              CI status, runs, jobs,
              failed-step logs, tests,
              report artifacts, events
                         |
                         v
              Private Actions artifact
                         |
              GitHub integration reads it
                         v
                   ChatGPT analysis
```

## 3. Уже реализовано и проверено

- Browser API и UI с отдельным `WEB_ACCESS_TOKEN`.
- Read-only API для статуса проекта, списка запусков, сведений о запуске и webhook inbox.
- `GET /api/v1/diagnostics/{run_uuid}`: ограниченные stdout/stderr упавших шагов, structured test results и небольшой JUnit/test-results artifact.
- Redaction известных секретов и ограничения числа workflows, failed jobs, логов и размера отчёта.
- Регрессионный тест диагностики, включая проверку редактирования токена.
- Private Forge inbox issue #8.
- Draft PR #9 с on-demand workflow для закрытого отчёта.
- Preview deployment и authenticated smoke test: diagnostics API успешно проверен на реальном доступном CircleCI run.
- Typecheck и 103 unit tests прошли в GitHub Actions.

## 4. Безопасность и стоимость

- CircleCI token хранится только в Cloudflare Worker Secrets.
- GitHub Actions получает отдельный `ZNECT_CI_BRIDGE_WEB_TOKEN`; секрет не помещается в репозиторий, issue или комментарии.
- Workflow разрешает только точную команду владельца репозитория в issue #8.
- В CircleCI выполняются только GET-запросы. Запуск, повтор, отмена и изменение pipelines не предусмотрены.
- Полный отчёт хранится в приватном Forge artifact один день. Комментарий содержит только ссылку на workflow run и краткое сообщение.
- Данные диагностики и CI-логи не копируются в публичный `znect-all-plugins`.
- CircleCI build minutes не расходуются. GitHub Actions usage учитывается в квотах GitHub.
- Используется только изолированный Cloudflare Preview; Production не переключается автоматически.

## 5. Активация

1. Проверить и одобрить Draft PR #5 в `Znect-god/znect-all-plugins`, затем отдельно разрешить его слияние.
2. Проверить и одобрить Draft PR #9 в приватном `Znect-god/znect-forge`, затем отдельно разрешить его слияние в default branch. Workflow с событием `issue_comment` должен находиться в default branch.
3. Добавить в Forge Actions secret `ZNECT_CI_BRIDGE_WEB_TOKEN`, совпадающий с Preview `WEB_ACCESS_TOKEN`. Значение секрета не передавать в чат.
4. Убедиться, что Preview Worker доступен.
5. После активации ChatGPT публикует в issue #8 команду `/znect-ci-bridge check`, дожидается workflow run и получает приватный artifact.
6. Проверить полный round-trip: запрос → workflow → artifact → чтение ChatGPT → корректная диагностика.

PR #5 и PR #9 остаются Draft. Их слияние и Production deployment требуют отдельного явного разрешения.

## 6. Критерии готовности

Канал считается работающим только после подтверждения всех пунктов:
- команда из ChatGPT запускает workflow в приватном Forge;
- workflow получает данные Bridge и сохраняет отчёт;
- GitHub-интеграция ChatGPT скачивает и читает artifact;
- в отчёте присутствуют реальные CI статусы, ошибки, логи и результаты тестов;
- секреты не попадают в артефакты и комментарии;
- повторный запрос создаёт новый актуальный отчёт;
- ни один CircleCI pipeline не запускается и Production не затрагивается.

До этого момента канал обозначается как **подготовлен, но не активирован**.
