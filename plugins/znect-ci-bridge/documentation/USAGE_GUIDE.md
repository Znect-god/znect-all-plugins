# Znect CI Bridge — engineering and usage guide

**Актуально на 2026-11-18.** Это руководство описывает существующий CI Bridge в ветке `feature/ci-bridge-android-exporter` (историческое имя ветки; Android companion source удалён).

> **Текущий архитектурный контракт:** CircleCI — read-only provider для получения данных о зарегистрированных CI runs. Проверки и сборка самого CI Bridge выполняются только через центральный `Znect-god/znect-build`. Отдельный `.circleci/config.yml`, отдельный GitHub Actions executor и Android exporter не поддерживаются. ChatGPT-facing источник — приватный Browser JSON API; dashboard JSON export остаётся ручным fallback handoff. MCP не обязателен.

## 1. Репозитории и ответственность

- `Znect-god/znect-all-plugins` — исходный код CI Bridge, тесты, документация и подготовка Reporting / Diagnostics v1.
- `Znect-god/znect-build` — центральная система рецептов и выполнения проверок/сборок Znect, включая CI Bridge.
- CircleCI — внешний read-only provider, который Bridge опрашивает для статусов, jobs, logs, tests, artifacts и webhook events.
- Cloudflare Worker — private runtime API/dashboard; Preview и Production остаются раздельными средами.

CI Bridge нужно закончить в `znect-all-plugins`; перенос в `znect-build` не выполнять до завершения Reporting / Diagnostics v1.

## 2. Текущая реализация

- Cloudflare Worker `znect-ci-bridge` с Bearer-authenticated Browser JSON API.
- Multi-project registry и явный выбор project/connection.
- CircleCI API v3 read-only adapter, legacy v1.1 compatibility path.
- Signed webhook inbox, bounded event storage, replay protection и conservative event-to-run correlation.
- Browser dashboard для статусов, runs, diagnostics, webhook events и correlation.
- `GET /api/v1/report` для bounded assistant report.
- Dashboard action **Export assistant report**: aggregate report + максимум три failed-run diagnostics, UUID validation, scope isolation, partial-result markers, 600 KB ceiling, download JSON.
- Regression tests покрывают Worker/API и dashboard export; фактический запуск на текущем SHA ещё не подтверждён.

## 3. Безопасность и ограничения

- Все Browser API calls требуют `Authorization: Bearer <WEB_ACCESS_TOKEN>`.
- Токены не передаются в query strings, отчётах, issue, комментариях или сообщениях ChatGPT.
- Сохранить GET-only, rate limiting, project/connection scope checks, response bounds и redaction.
- Не добавлять unauthenticated endpoint и не отключать Bearer authentication.
- Bridge не должен trigger/retry/cancel CI jobs, изменять provider settings, запускать deploy или менять source/configuration наблюдаемого проекта.
- Не читать и не раскрывать secret values; Production не трогать без отдельного разрешения.

## 4. Проверка через Znect Build

1. Сверить central Node.js/Cloudflare Worker recipe в `Znect-god/znect-build`.
2. Проверить target/registry mapping на репозиторий `Znect-god/znect-all-plugins`, нужную feature branch и точный source SHA.
3. Убедиться, что target остаётся disabled до явного разрешения на запуск.
4. После разрешения выполнить dependency install, audit, typecheck, полный Vitest suite и Wrangler bundle dry-run только через Znect Build.
5. Сохранить реальный run ID, source SHA, job results, logs и validation manifest; не считать конфигурацию доказательством успешного запуска.

Не создавать root `.circleci/config.yml`, не активировать GitHub Actions обходной workflow и не запускать отдельный Android APK pipeline.

## 5. Private ChatGPT handoff

1. Выбрать project и connection в существующей dashboard.
2. Проверить, что Browser API запросы идут с Bearer header и не пересекают scope.
3. Запустить **Export assistant report**.
4. Проверить `completeness`, partial/limited diagnostics и отсутствие секретов.
5. Только после пользовательской проверки приложить JSON к разговору ChatGPT.

Это ручная передача файла. Она не доказывает прямую автоматическую аутентификацию ChatGPT к Browser API. Для завершения интеграции требуется поддерживаемый private auth/handoff механизм без раскрытия секрета и без обязательного MCP.

## 6. Оставшиеся проверки

- Текущий source SHA: typecheck и полный тестовый набор через Znect Build.
- Live Preview: auth, report, diagnostics, project/connection isolation, redaction и freshness.
- Реальный CircleCI webhook event и round-trip через private report.
- Поддерживаемый ChatGPT private access path и безопасная передача.
- Independent security review, release gates и подготовка завершённой Reporting / Diagnostics v1 к переносу.

Исторические заметки о CircleCI executor и Android exporter в старых записях roadmap/changelog не являются текущими инструкциями.
