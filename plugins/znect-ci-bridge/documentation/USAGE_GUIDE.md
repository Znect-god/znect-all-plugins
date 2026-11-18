# Znect CI Bridge — engineering and usage guide

**Актуально на 2026-11-18.** Это руководство описывает существующий CI Bridge в ветке `feature/ci-bridge-android-exporter` (историческое имя ветки; Android companion source удалён).

> **Текущий архитектурный контракт:** CircleCI — исполнитель проверок CI Bridge и read-only provider для диагностики зарегистрированных проектов. Znect Build — репозиторий разработки и центральных рецептов. Проверки запускаются CircleCI по конфигурации `.circleci/config.yml` в Znect Build; отдельный GitHub Actions executor не используется. ChatGPT-facing источник — приватный Browser JSON API и ручной bounded JSON export. MCP не обязателен.

## 1. Репозитории и ответственность

- `Znect-god/znect-all-plugins` — исходный код CI Bridge, тесты, документация и подготовка Reporting / Diagnostics v1.
- `Znect-god/znect-build` — разработка центральных рецептов, реестра, схем и политик.
- CircleCI — исполнитель проверок Znect Build и точной ревизии CI Bridge; Bridge читает CircleCI только в read-only режиме.
- Cloudflare Worker — private runtime API/dashboard; Preview и Production остаются раздельными средами.

CI Bridge нужно закончить в `znect-all-plugins`; перенос исходников в `znect-build` не выполнять до завершения Reporting / Diagnostics v1.

## 2. Текущая реализация

- Cloudflare Worker `znect-ci-bridge` с Bearer-authenticated Browser JSON API.
- Multi-project registry и явный выбор CircleCI project/connection.
- CircleCI API v3 read-only adapter и отдельный legacy v1.1 compatibility path.
- Signed webhook inbox, bounded event storage, replay protection и conservative event-to-run correlation.
- Browser dashboard для статусов, runs, diagnostics, webhook events и correlation.
- `GET /api/v1/report` для bounded assistant report.
- Dashboard action **Export assistant report**: aggregate report + максимум три failed-run diagnostics, UUID validation, scope isolation, partial-result markers, 600 KB ceiling, download JSON. Each diagnostic job includes `test_summary` (passed/failed/skipped/unknown observed counts, source coverage, deduplication/conflict and incomplete flags).
- Отдельный GitHub Actions-based Znect Build adapter и маршруты `/api/v1/build/*` удалены; центральная диагностика Znect Build будет идти через обычное CircleCI project connection.

## 3. Безопасность и ограничения

- Все Browser API calls требуют `Authorization: Bearer <WEB_ACCESS_TOKEN>`.
- Токены не передаются в query strings, отчётах, issue, комментариях или сообщениях ChatGPT.
- Сохранить GET-only, rate limiting, project/connection scope checks, response bounds и redaction.
- Не добавлять unauthenticated endpoint и не отключать Bearer authentication.
- Bridge не должен trigger/retry/cancel CircleCI jobs, изменять provider settings, запускать deploy или менять source/configuration наблюдаемого проекта.
- Не читать и не раскрывать secret values; Production не трогать без отдельного разрешения.

## 4. Проверка через CircleCI и Znect Build

1. Проверить, что Znect Build CircleCI project использует `.circleci/config.yml`.
2. Для обычной проверки Znect Build запускать workflow contract tests, shell syntax и JSON policy validation.
3. Для CI Bridge exact-SHA validation требуется явный pipeline parameter `run_ci_bridge_validation=true`, branch ref и lowercase 40-character source SHA. По умолчанию workflow выключен.
4. CircleCI должен checkout-ить именно переданный SHA репозитория `Znect-god/znect-all-plugins` и подтвердить resolved SHA до запуска project scripts.
5. Сохранить реальный CircleCI run, job result, manifest artifact, source SHA и recipe SHA. Не считать конфигурацию доказательством успешного запуска.

Не запускать pipeline без отдельного разрешения. Использовать только free/included quotas; не включать paid add-ons, auto-refill, deployment или privileged credentials.

## 5. Private ChatGPT handoff

1. Выбрать project и connection в существующей dashboard.
2. Проверить, что Browser API запросы идут с Bearer header и не пересекают scope.
3. Запустить **Export assistant report**.
4. Проверить `completeness`, `assistant_handoff`, partial/limited diagnostics и отсутствие секретов. Значения `test_summary.total` — только число наблюдённых записей, а не гарантированное полное число тестов проекта.
5. Только после пользовательской проверки приложить JSON к разговору ChatGPT. Это ручная передача; `automatic_api_access` остаётся `false`, MCP не требуется.

Это ручная передача файла. Она не доказывает прямую автоматическую аутентификацию ChatGPT к Browser API. Для завершения интеграции требуется поддерживаемый private auth/handoff механизм без раскрытия секрета и без обязательного MCP.

## 6. Оставшиеся проверки

- CircleCI project connection и free-plan quota availability.
- Текущий source SHA: typecheck и полный тестовый набор через CircleCI.
- Реальный exact-SHA CircleCI run и retrieval manifest artifact через CircleCI read-only adapter.
- Live Preview: auth, report, diagnostics, project/connection isolation, redaction и freshness.
- Реальный CircleCI webhook event и round-trip через private report.
- Поддерживаемый ChatGPT Free private access path и безопасная передача.
- Independent security review, release gates и подготовка завершённой Reporting / Diagnostics v1 к переносу.

Исторические заметки о GitHub Actions executor и Android exporter в старых записях roadmap/changelog не являются текущими инструкциями.
