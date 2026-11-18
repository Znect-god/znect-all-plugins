# Znect CI Bridge — бесплатный приватный канал ChatGPT

**Актуальная архитектура (2026-11-18):** CircleCI — только read-only CI provider, который наблюдает Bridge. Собственная проверка и сборка CI Bridge должна проходить через центральный Znect Build. Отдельный `.circleci/config.yml` и параллельный исполнитель удалены. ChatGPT-facing источник — приватный Browser JSON API; MCP не обязателен.

## 1. Цель и текущий статус

ChatGPT должен получать актуальную диагностику зарегистрированных проектов: статусы запусков, workflows/jobs, ограниченные логи, результаты тестов, доступные артефакты и webhook-события. Интеграция с CircleCI остаётся строго read-only.

Уже реализовано в исходниках:
- защищённые GET-only Browser JSON API endpoints с отдельным `WEB_ACCESS_TOKEN`;
- CircleCI provider adapter и ограниченные JSON-отчёты по явно выбранным project/connection;
- агрегированный `GET /api/v1/report` с метаданными полноты и свежести;
- существующая dashboard-команда **Export assistant report**, которая добавляет до трёх ограниченных failed-run diagnostics и скачивает один JSON-файл;
- regression-test source для API и dashboard export.

Ограничения:
- наличие приватного Browser JSON API не означает, что ChatGPT автоматически умеет отправить к нему Bearer header;
- ручной JSON export — это явная передача пользователем, а не автоматическая ChatGPT authentication;
- исходники и тесты текущей ветки ещё не подтверждены фактическим запуском через Znect Build;
- live Preview export и реальный CircleCI webhook round-trip пока не подтверждены.

## 2. Поток данных

```
CircleCI (registered runs / jobs / logs / tests / artifacts)
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
- CircleCI — источник диагностических данных, не исполнитель проверки самого Bridge.
- Znect Build — центральный исполнитель проверки CI Bridge и остальных Znect проектов.
- Browser JSON API только читает данные и формирует ограниченный отчёт.
- Dashboard export — ручной fallback handoff, не прямая автоматическая аутентификация ChatGPT.

## 3. Безопасность

- `WEB_ACCESS_TOKEN` — отдельный секрет Browser API; он не равен CircleCI API token.
- CircleCI token хранится только в серверной среде Bridge; его нельзя помещать в исходники, отчёты, issue, комментарии или ChatGPT.
- Не отключать Bearer authentication, не публиковать unauthenticated endpoint и не передавать токены в чат.
- Browser API принимает только разрешённые GET-запросы, ограничивает объём ответов и проверяет project/connection scope.
- CircleCI API client использует фиксированный origin, GET-only, ограниченные ответы, таймауты и безопасную обработку ошибок.
- Любые production deployment, изменение secrets, CI settings или pipeline mutation требуют отдельного явного разрешения.

## 4. Условия готовности

1. Подтвердить центральный Znect Build target/recipe для CI Bridge и его безопасное выполнение на точном source SHA.
2. Получить реальные typecheck, unit-test, audit и Worker bundle validation результаты; не считать наличие тестового кода доказательством прохождения.
3. Проверить существующий Preview: Bearer auth, project/connection isolation, report freshness, pagination/truncation, redaction и partial diagnostics.
4. Подтвердить реальный CircleCI webhook delivery и round-trip через private report.
5. Установить поддерживаемый способ private ChatGPT access. До этого ручной JSON export остаётся только явным fallback handoff.
6. Пройти release/security gates и подготовить завершённый Reporting / Diagnostics v1 к переносу в `Znect-god/znect-build`.

Никаких автоматических сборок, запусков CI, Preview deployment, Production changes или secret access без отдельного разрешения.

## 5. Исключения

- Нет обязательного MCP.
- Нет отдельного CircleCI executor или второго параллельного CI.
- Нет GitHub Actions обходного пути мимо Znect Build.
- Нет публичного unauthenticated API, query-string token или передачи секрета в чат.
- Bridge не запускает, не перезапускает и не отменяет наблюдаемые CircleCI pipelines/jobs.

Исторические записи о Android exporter и самостоятельном CircleCI validation workflow не являются текущим планом и не должны восстанавливаться.
