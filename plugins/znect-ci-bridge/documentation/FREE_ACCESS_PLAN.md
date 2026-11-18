# Znect CI Bridge — бесплатный приватный канал ChatGPT

**Актуальная архитектура (2026-11-18):** CircleCI исполняет проверки CI Bridge и остаётся единственным CI provider, который Bridge читает в режиме read-only. Znect Build — репозиторий разработки и центральных рецептов. GitHub Actions не используется. MCP не обязателен и не является каналом для ChatGPT Free.

## 1. Цель и текущий статус

ChatGPT должен получать актуальную диагностику зарегистрированных проектов: статусы запусков, workflows/jobs, ограниченные логи, результаты тестов, доступные артефакты и webhook-события. Интеграция с CircleCI остаётся строго read-only.

Уже реализовано в исходниках:
- защищённые GET-only Browser JSON API endpoints с отдельным WEB_ACCESS_TOKEN;
- CircleCI provider adapter и ограниченные JSON-отчёты по явно выбранным project/connection;
- агрегированный GET /api/v1/report с метаданными полноты и свежести;
- dashboard-команда **Export assistant report**, которая добавляет до трёх ограниченных failed-run diagnostics и скачивает один JSON-файл;
- CircleCI exact-SHA validation workflow в Znect Build с opt-in параметром и provenance manifest; живой запуск пока не подтверждён.

Ограничения:
- наличие приватного Browser JSON API не означает, что ChatGPT автоматически умеет отправить к нему Bearer header;
- ручной JSON export — явная передача пользователем, а не автоматическая ChatGPT authentication;
- CircleCI project connection для Znect Build и free-plan quota availability ещё не проверены;
- исходники и тесты текущей ветки ещё не подтверждены фактическим запуском через CircleCI;
- live Preview export и реальный CircleCI webhook round-trip пока не подтверждены.

## 2. Поток данных

```
CircleCI (runs / workflows / jobs / logs / tests / artifacts / webhooks)
             |
             | authenticated HTTPS GET, read-only
             v
Znect CI Bridge (private Worker API)
             |
             | GET /api/v1/report + bounded diagnostics
             v
Existing browser dashboard
             |
             | explicit user-reviewed JSON export
             v
ChatGPT conversation
```

Разделение ролей:
- CircleCI — исполнитель проверок и источник диагностических данных.
- Znect Build — разработка центрального рецепта, схем и validation policy.
- Browser JSON API только читает данные и формирует ограниченный отчёт.
- Dashboard export — ручной fallback handoff, не прямая автоматическая аутентификация ChatGPT.
- CI Bridge не запускает, не перезапускает и не отменяет CircleCI pipelines.

## 3. Безопасность

- WEB_ACCESS_TOKEN — отдельный секрет Browser API; он не равен CircleCI API token.
- CircleCI token хранится только в серверной среде Bridge; его нельзя помещать в исходники, отчёты, issue, комментарии или ChatGPT.
- Не отключать Bearer authentication, не публиковать unauthenticated endpoint и не передавать токены в чат.
- Browser API принимает только разрешённые GET-запросы, ограничивает объём ответов и проверяет project/connection scope.
- CircleCI API client использует фиксированный origin, GET-only, ограниченные ответы, таймауты и безопасную обработку ошибок.
- CI Bridge validation workflow в Znect Build выключен по умолчанию; он требует явного pipeline parameter и точного source SHA.
- Любые Preview/Production deployment, изменение secrets или provider settings требуют отдельного явного разрешения.

## 4. Условия готовности

1. Подтвердить CircleCI project connection для Znect-god/znect-build и доступность free/included quotas без paid add-ons.
2. После отдельного разрешения выполнить Znect Build contract tests и CI Bridge exact-SHA validation; сохранить реальные run IDs, source/recipe SHAs и manifest artifacts.
3. Получить реальные typecheck, unit-test, audit и Worker bundle validation результаты; не считать наличие тестового кода доказательством прохождения.
4. Проверить существующий Preview: auth, project/connection isolation, report freshness, pagination/truncation, redaction и partial diagnostics.
5. Подтвердить реальный CircleCI webhook delivery и round-trip через private report.
6. Установить поддерживаемый способ private ChatGPT Free access. До этого ручной JSON export остаётся только явным fallback handoff.
7. Пройти release/security gates и подготовить завершённый Reporting / Diagnostics v1.

Никаких CircleCI pipeline runs, Preview deployment, Production changes или secret access без отдельного разрешения.

## 5. Исключения

- Нет обязательного MCP.
- Нет GitHub Actions executor.
- Нет отдельного CircleCI executor в репозитории all-plugins; рецепт и CircleCI config находятся в Znect Build.
- Нет публичного unauthenticated API, query-string token или передачи секрета в чат.
- Bridge не запускает, не перезапускает и не отменяет наблюдаемые CircleCI pipelines/jobs.

Исторические записи о GitHub Actions executor и Android exporter не являются текущим планом и не должны восстанавливаться.
