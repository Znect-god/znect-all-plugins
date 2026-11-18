# Znect CI Bridge — бесплатный read-only канал ChatGPT

**Актуальная архитектура (2026-11-18):** CircleCI — единственный исполнитель проверок CI Bridge. ChatGPT-facing канал — приватный Browser JSON API и передача ограниченного отчёта пользователем; MCP не требуется и не используется как канал ChatGPT. GitHub Actions / Znect Build не запускают проверки CI Bridge.

## 1. Цель и текущий статус

Предоставить ChatGPT актуальные сведения CircleCI по зарегистрированному проекту: статусы запусков, workflows/jobs, логи, тесты, доступные артефакты и webhook-события. Доступ к CircleCI со стороны Bridge строго read-only.

Реализованы:
- защищённые GET-only endpoints Browser JSON API с отдельным `WEB_ACCESS_TOKEN`;
- CircleCI provider adapter и ограниченные JSON-отчёты по явно выбранным project/connection;
- Android companion exporter для локальной проверки CircleCI read path, получения отчёта и ручной передачи через Android Sharesheet;
- в Android-приложении секрет хранится локально с Android Keystore-backed encryption.

Ограничения, которые нельзя скрывать:
- приватный Browser JSON API существует, но это само по себе не означает, что отдельный ChatGPT conversation может автоматически вызвать его с Bearer header;
- Android-проверка подтверждает путь Android → Bridge → CircleCI и доступность отчёта, но не аутентифицирует ChatGPT;
- передача отчёта в ChatGPT сейчас ручная через Sharesheet; автоматический ChatGPT authentication/handoff не подтверждён и остаётся открытым platform limitation;
- 40 Android JVM test cases написаны, но не исполнены; сборка APK и проверка на устройстве не подтверждены;
- CircleCI workflow config находится в репозитории, однако фактический запуск и результаты для текущего HEAD ещё не получены.

## 2. Поток данных

```
CircleCI (runs / jobs / logs / tests / artifacts)
             |
             | HTTPS API v3, GET only
             v
Znect CI Bridge (private Worker API)
             |
             | authenticated GET /api/v1/status
             | authenticated GET /api/v1/report
             v
Android companion exporter
             |
             | user reviews bounded report
             | explicit Android Sharesheet
             v
ChatGPT conversation (manual report handoff)
```

ChatGPT-facing report API и CI execution — разные роли:
- CircleCI выполняет проверки самого CI Bridge из `.circleci/config.yml`.
- Browser JSON API только читает CircleCI и отдаёт ограниченные отчёты.
- Android exporter не запускает, не отменяет, не перезапускает CircleCI pipelines/jobs и не изменяет настройки CircleCI.
- Znect Build — отдельная система сборки других проектов Znect; она не является CI executor для CI Bridge.

## 3. Безопасность

- `WEB_ACCESS_TOKEN` — отдельный секрет Browser API; он не равен CircleCI API token.
- CircleCI token хранится только в серверной среде Bridge; его нельзя помещать в исходники, отчёты, issue, комментарии или ChatGPT.
- Не отключать Bearer authentication, не публиковать unauthenticated endpoint и не передавать токены в чат.
- Browser API принимает только разрешённые GET-запросы, ограничивает объём ответов и проверяет project/connection scope.
- CircleCI API client использует фиксированный origin, GET-only, ограниченные ответы, таймауты и безопасную обработку ошибок.
- Android хранит введённую учётную информацию локально с использованием Android Keystore; отчёт остаётся в app-private cache до явной передачи пользователем.
- Любые production deployment, изменение secrets, CircleCI project settings или pipeline mutation требуют отдельного явного разрешения.

## 4. Условия готовности

Канал нельзя объявлять полностью автоматическим, пока не подтверждены:
1. поддерживаемый механизм, позволяющий ChatGPT безопасно обращаться к приватному Browser JSON API с Bearer authentication без обязательного MCP;
2. полный round-trip ChatGPT → private report source → ChatGPT на реальных данных;
3. отсутствие утечек токенов и корректная project/connection изоляция.

Отдельно для Android:
1. CircleCI запускает job `ci-bridge-android-exporter`;
2. все 40 JVM тестов проходят;
3. debug APK собирается и доступен как CircleCI artifact;
4. приложение проверено на реальном Android устройстве.

До выполнения этих условий корректный статус: **private API и ручной Android report handoff реализованы на уровне исходников; автоматическая ChatGPT authentication и live CircleCI verification не подтверждены**.

## 5. Исторические схемы

Прежние предложения с приватным Forge inbox, GitHub Actions report collector, Actions artifacts, GitHub Actions CI executor или MCP как основным ChatGPT каналом не являются текущей архитектурой CI Bridge. Они не должны использоваться как инструкция к активации, сборке или диагностике. Исторические записи в changelog сохраняются для аудита, но не отменяют этот актуальный контракт.
