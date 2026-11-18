# Znect CI Bridge — руководство по использованию и проверке

**Актуально на 2026-11-18.** Это руководство описывает текущую инженерную ветку `feature/ci-bridge-android-exporter`, а не старые Preview/GitHub Actions сценарии.

> **Архитектурный контракт:** CircleCI — единственный исполнитель CI Bridge validation. ChatGPT-facing источник отчётов — приватный Browser JSON API. Android exporter выполняет проверку read path и предоставляет ручную передачу отчёта через Sharesheet. MCP не требуется и не используется как канал ChatGPT. Znect Build — отдельный проект, не исполнитель проверок CI Bridge.

## 1. Назначение и границы

Znect CI Bridge — экспериментальный read-only сервис для чтения CircleCI runs, workflows, jobs, logs, test results, artifacts и нормализованных webhook events по явно зарегистрированным проектам/соединениям.

Разделение ответственности:
- `Znect-god/znect-all-plugins` — исходный код Bridge и Android exporter.
- CircleCI — выполняет проверки самого Bridge по корневому `.circleci/config.yml`.
- Cloudflare Worker — приватный API слой и CircleCI read-only adapter.
- Android companion exporter — локальная проверка соединения, загрузка ограниченного JSON-отчёта и явный экспорт пользователем.
- `Znect-god/znect-build` — отдельная центральная система сборки других проектов; не использовать её как CI executor Bridge.

Bridge не запускает, не отменяет, не перезапускает pipelines/jobs и не изменяет настройки CircleCI. Все запросы к CircleCI API со стороны Bridge — GET-only.

## 2. Текущий статус

- Worker и Android exporter source code реализованы на feature branch.
- Browser API `GET /api/v1/status` проверяет доступность CircleCI read probe для выбранного проекта.
- Browser API `GET /api/v1/report` возвращает ограниченный private JSON report.
- Android app проверяет оба endpoint: сначала status, затем report. Успех означает, что Android → Bridge → CircleCI read path и report endpoint доступны; это **не** означает, что ChatGPT conversation автоматически аутентифицирован.
- Android использует HTTPS, Bearer credential, локальное Keystore-backed encrypted storage, bounded response validation и ручной Android Sharesheet export.
- Написано 40 Android JVM test cases: 8 origin + 18 report/privacy + 3 Bearer policy + 11 CircleCI status validator. Ни один из этих тестов на текущей ветке ещё не подтверждён как выполненный.
- CircleCI workflow описан, но успешный запуск для текущего HEAD не получен. APK artifact не подтверждён; устройство не проверено.
- Автоматическая ChatGPT authentication к приватному Browser API не подтверждена и остаётся открытым platform limitation. Текущий handoff — ручной.

Подробный прогресс: [Implementation roadmap](IMPLEMENTATION_ROADMAP.md). Актуальный контракт бесплатного канала: [Free access plan](FREE_ACCESS_PLAN.md). Android details: [Android exporter README](../android-exporter/README.md).

## 3. CircleCI validation setup

1. Владелец проекта подключает `Znect-god/znect-all-plugins` как CircleCI project.
2. CircleCI project должен читать корневой `.circleci/config.yml`.
3. Разрешённые ветки конфигурации: `main` и `feature/ci-bridge-android-exporter`.
4. После обычного commit/push CircleCI должен запустить workflow согласно настройкам проекта. Не запускать pipeline через API и не использовать GitHub Actions в качестве замены.
5. В workflow два job:
   - `ci-bridge-validation`: `npm ci`, `npm audit --audit-level=high`, `npm run check`, syntax check smoke script, Wrangler dry-run без deploy.
   - `ci-bridge-android-exporter`: checksum Gradle Wrapper JAR, Android SDK 35, JVM unit tests, debug APK assembly, сохранение test results и APK artifact.

Эти job не требуют CircleCI API token, Cloudflare credentials или Worker secrets. CircleCI API token для чтения диагностируемых проектов — отдельный runtime secret Bridge, не нужен для выполнения validation workflow.

**Важно:** наличие конфигурации и commit не доказывают, что workflow стартовал. Успешность тестов, APK assembly, наличие artifact и проверка на устройстве — отдельные критерии.

См. [CircleCI setup](CIRCLECI_SETUP.md).

## 4. Приватный Browser JSON API

- Origin должен быть HTTPS.
- Для Browser API используется отдельный `WEB_ACCESS_TOKEN` в заголовке `Authorization: Bearer …`.
- Запросы ограничены GET и project/connection scope.
- `project_id` обязателен; при нескольких соединениях нужно явно передавать `connection_id`.
- `/api/v1/status` возвращает безопасный status/probe summary.
- `/api/v1/report` возвращает bounded report; лимиты runs/events валидируются Worker.
- Не публиковать endpoint без Bearer authentication, не отключать auth и не передавать token в чат.

Наличие private HTTP API не означает, что ChatGPT может автоматически отправить Bearer header в отдельный endpoint. Не заявлять автоматический ChatGPT direct connection без подтверждённого поддерживаемого механизма. Текущий Android exporter помогает пользователю вручную передать сформированный отчёт в ChatGPT.

## 5. Android exporter

Приложение находится в `plugins/znect-ci-bridge/android-exporter/`.

Локальная настройка:
1. Ввести HTTPS API origin без path/query/fragment.
2. Ввести зарегистрированный project ID и, если требуется, connection ID.
3. Ввести Bearer credential локально в приложение; не пересылать его в чат и не добавлять в Git.
4. Нажать **Check CircleCI + ChatGPT report path**.
5. При успешной проверке получить bounded report и при необходимости использовать явную Sharesheet передачу.

Кнопка проверяет два GET-запроса: `/api/v1/status` и `/api/v1/report`. Она не логинит пользователя в ChatGPT и не подтверждает автоматическую связь с текущим conversation.

Безопасность: HTTPS only, redirects blocked, response size limits, report schema validation, локальное encrypted credential storage, app-private report cache и явное пользовательское действие для sharing. Нет фонового опроса, cloud upload или CircleCI mutation.

## 6. Секреты и безопасность

- `CIRCLECI_TOKEN`: только серверный secret Bridge для read-only CircleCI API access.
- `WEB_ACCESS_TOKEN`: отдельный Bearer secret Browser API.
- `CIRCLECI_WEBHOOK_SECRET`: отдельный secret для проверки подписей CircleCI webhook, если webhook ingress включён.
- Android Bearer credential хранится локально через Android Keystore-backed encryption.

Не путать секреты между собой. Не помещать их значения в Git, отчёты, issues, комментарии, URL, скриншоты или ChatGPT. Не просить пользователя присылать токены в чат. Не читать/менять production secrets и не выполнять deployment без отдельного разрешения.

## 7. Известные ограничения

1. Live CircleCI run для текущего engineering HEAD не подтверждён.
2. Worker test suite и 40 Android JVM tests не исполнены на текущем HEAD.
3. Debug APK не собран/не получен как CircleCI artifact.
4. Android app не проверено на реальном устройстве.
5. Автоматический ChatGPT authentication к private Browser API не реализован/не подтверждён; handoff ручной.
6. Реальные CircleCI webhook deliveries и полная live проверка run/job/log/test/artifact endpoints остаются отдельными пунктами в roadmap.
7. Prototype не готов к Production; независимый security review и release approval отсутствуют.

## 8. Исторические материалы

Старые инструкции с GitHub Actions report collector, Forge inbox command, GitHub Actions artifacts как ChatGPT transport, GitHub Actions как CI Bridge executor или MCP как основным ChatGPT каналом superseded. Они не являются действующими процедурами и не должны использоваться для запуска, настройки или выпуска текущего Bridge.

Не выполнять CircleCI trigger/retry/cancel/config-write операции. Не сливать feature branch в main и не развёртывать Production без отдельного прямого разрешения.
