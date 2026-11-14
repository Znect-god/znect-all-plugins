# Znect CI Bridge — запуск, настройка и проверка

**Статус: `in-development` — разработка, экспериментальный прототип, не готов к Production.**  
**Версия:** `0.1.0`  
**Дата актуализации:** 2026-11-14  
**Целевой проект CircleCI:** `gh/Znect-god/znect-forge`.

> **Главное правило документации:** наличие реализации, зелёные unit-тесты, mock-тесты, Wrangler dry-run или синтетическое событие не означают, что функция полностью проверена в реальной эксплуатации. Ниже каждый этап разделён на «проверено» и «ещё требуется». Если этап не отмечен как проверенный, считайте его разработкой/непроверенной функцией.

## 1. Назначение и архитектура

Znect CI Bridge — read-only сервис Znect для просмотра и диагностики CircleCI Forge. Он состоит из:
- Cloudflare Worker;
- Streamable HTTP MCP endpoint `/mcp`;
- браузерной панели и read-only JSON API;
- подписанного CircleCI webhook receiver `POST /webhooks/circleci`;
- SQLite-backed Durable Object inbox для нормализованных событий.

Поток webhook:

1. Forge workflow завершается в CircleCI.
2. CircleCI отправляет `workflow-completed` на Preview webhook URL.
3. Worker проверяет HMAC-подпись и проект, нормализует событие.
4. Durable Object сохраняет событие с дедупликацией по event ID.
5. Событие читается через MCP `list_recent_events` или Browser API `GET /api/v1/events`.

Webhook inbox не отправляет самопроизвольные сообщения в открытый диалог ChatGPT. Для этого отдельно потребуется поддерживаемый канал polling/delivery.

## 2. Текущее состояние — 2026-11-14

| Этап | Состояние |
|---|---|
| Исходники, TypeScript и unit/regression tests | Проверены GitHub Actions на текущей feature branch |
| Isolated Cloudflare Preview | Развёрнут workflow run #43568774133; Production не затрагивался |
| Preview secrets | Workflow установил `CIRCLECI_WEBHOOK_SECRET`; authenticated smoke test прошёл |
| CircleCI API v3 project access | Подтверждён smoke test для фиксированного Forge project |
| MCP discovery и список read-only tools | Подтверждены smoke test |
| Browser API и synthetic event inbox | Подтверждены smoke test |
| Synthetic HMAC webhook, deduplication, durable storage и retrieval | Подтверждены в Preview |
| Реальная регистрация CircleCI webhook | Выполнена пользователем; CircleCI принял автоматическую Add Webhook ping/check с 2xx |
| Реальное `workflow-completed` событие от CircleCI | **Ожидает проверки** |
| Полная проверка run/job/log/test/artifact на реальных CI данных | **Частично/не проверено** |
| Автоматическая доставка событий в открытый ChatGPT диалог | **Не реализована/не проверена** |
| Production deployment и независимый security review | **Не выполнялись; не разрешены** |

Актуальные ресурсы:
- Репозиторий: https://github.com/Znect-god/znect-all-plugins
- Рабочая ветка: `feat/ci-bridge-circleci-webhooks`
- Draft PR #5: https://github.com/Znect-god/znect-all-plugins/pull/5
- Последний подтверждённый workflow: https://github.com/Znect-god/znect-all-plugins/actions/runs/43568774133
- Isolated Preview root: `https://feat-ci-bridge-circleci-webhooks-znect-ci-bridge.znect699.workers.dev`
- MCP: `https://feat-ci-bridge-circleci-webhooks-znect-ci-bridge.znect699.workers.dev/mcp`
- CircleCI webhook: `https://feat-ci-bridge-circleci-webhooks-znect-ci-bridge.znect699.workers.dev/webhooks/circleci`

PR #5 остаётся Draft и не объединён. Его base — `feature/ci-bridge-test-reports`, не `main`. Не менять `main`, не объединять PR и не развёртывать Production без отдельного прямого разрешения.

## 2A. Журнал фактически выполненных действий

Ниже записаны только этапы, для которых в истории разработки есть наблюдаемый результат. Это журнал процесса, а не утверждение, что вся система готова.

### 11 ноября 2026 — локальная проверка и ограничение Android

- Репозиторий развивается в общем `znect-plugins` monorepo, а не в отдельном репозитории для Bridge.
- В Termux на Android ARM64 выполнена установка зависимостей; `npm run typecheck` завершился без ошибок.
- `npm rebuild esbuild workerd` и `npx wrangler login` не сработали: `workerd` сообщил `Unsupported platform: android arm64 LE`. Это ограничение локального окружения, а не ошибка TypeScript-кода.
- В результате deployment был перенесён в Linux GitHub Actions/Cloudflare workflow. Не следует описывать локальный Termux как успешную среду Wrangler deployment.

### 12 ноября 2026 — CircleCI credentials и первые реальные API-ответы

- Первоначальный CircleCI token был заменён после отказа CircleCI API v3: `API CircleCI v3 отклонил настроенный токен только для чтения`.
- После замены токена live-вызов `list_recent_runs(limit=10)` успешно получил проект `gh/Znect-god/znect-forge` и три запуска.
- Затем `get_job_details` успешно вернул job `build-0-7-0`. В прочитанных шагах был `Run unit tests` со статусом failed (exit 1): всего 115 тестов, 2 failed. Это подтверждает не только соединение, но и чтение реальных CircleCI job details.
- Ранее `/health` возвращал `status: ok`, проект `Znect-god/znect-forge`, режим `read-only`. Обычный GET к `/mcp` в браузере не был MCP handshake и не считался проверкой MCP.

### 13 ноября 2026 — настройка Preview secrets и исправление доступа

- Для GitHub repository Actions были заведены/подтверждены secrets `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`, `MCP_ACCESS_TOKEN`, `WEB_ACCESS_TOKEN`. Значения не документируются.
- `CIRCLECI_TOKEN` настраивался отдельно как Cloudflare Worker Secret, а не как пятый GitHub Actions secret.
- Cloudflare environment переключался на Preview. Сначала workflow успешно выполнял typecheck/tests и Preview deployment, но `/api/v1/status` возвращал HTTP 503; MCP/CircleCI checks тогда не достигались. Этот запуск нельзя записывать как успешный end-to-end test.
- После настройки Preview secrets и пересоздания named Preview deployment secrets стали доступны соответствующему Worker; 503 исчезла, проверка дошла до разрешения project slug.
- На следующем этапе исправлялась обработка `attributes.slug`. После этого были подтверждены живой Worker, авторизованный CircleCI API, MCP discovery и обнаружение 12 read-only tools. Однако `check_connection`/MCP `tools/call` в тот момент ещё возвращал HTTP 400, поэтому этот этап не доказывал успешный live tool call.
- Более ранний MCP Inspector вызов также возвращал сообщение о ненастроенных handler secrets; отдельный `MCP_ACCESS_TOKEN` сохранялся и не заменял CircleCI API token.

### 14 ноября 2026 — отдельная webhook feature branch и Preview validation

- Работа велась в `feat/ci-bridge-circleci-webhooks`; локальный checkout уже существовал, поэтому повторный clone не выполнялся.
- `npm ci` установил 143 пакета (144 audited, 0 vulnerabilities). Локальный Wrangler по-прежнему не запускался из-за Android ARM64 `workerd`; cloud workflow использовался вместо локального deploy.
- В workflow добавлена установка `CIRCLECI_WEBHOOK_SECRET` именно в named Preview. Этот секрет — отдельный от `CIRCLECI_TOKEN`, `MCP_ACCESS_TOKEN` и `WEB_ACCESS_TOKEN`.
- CircleCI signing secret создан как отдельный случайный ключ; пользователь добавил соответствующий GitHub Actions secret и использовал то же значение в CircleCI webhook. Само значение нигде не записывается.
- В коде webhook добавлены проверка HMAC-SHA256, фильтрация проекта, нормализация полей, durable event storage и дедупликация по event ID. Для сокращённых CircleCI ping payload добавлено tolerant acknowledgement после проверки подписи; регрессионные тесты покрывают такие варианты.
- GitHub Actions run #43568768594 прошёл typecheck/unit tests, named Preview deployment, Preview-only webhook secret installation, secret-scope diagnostics и authenticated read-only smoke test.
- Run #43568774133 также завершился success на следующем test revision. Smoke validation включала MCP discovery/read-only connection check и synthetic signed webhook path; синтетическая доставка не заменяет настоящее событие CircleCI.
- Пользователь зарегистрировал CircleCI project webhook `Znect CI Bridge Preview` для `workflow-completed`. CircleCI принял Add Webhook после автоматической ping-проверки с 2xx. В интерфейсе пользователя отдельной кнопки Test Ping нет.
- После регистрации настоящая доставка `workflow-completed` от обычного Forge workflow ещё не подтверждена. Этот пункт остаётся открытым.

### Реестр секретов — что именно настраивалось

| Secret name | Подтверждённое назначение/место | Статус в истории |
|---|---|---|
| `CLOUDFLARE_ACCOUNT_ID` | GitHub Actions repository secret для deploy workflow | Был среди четырёх настроенных GitHub secrets |
| `CLOUDFLARE_API_TOKEN` | GitHub Actions repository secret для deploy workflow | Был среди четырёх настроенных GitHub secrets |
| `MCP_ACCESS_TOKEN` | Отдельная Bearer-аутентификация MCP; GitHub Actions secret и соответствующий Worker Preview secret | Наличие в GitHub secrets подтверждено; authenticated MCP smoke впоследствии прошёл |
| `WEB_ACCESS_TOKEN` | Отдельная Bearer-аутентификация browser API; GitHub Actions secret и соответствующий Worker Preview secret | Наличие в GitHub secrets подтверждено; authenticated browser smoke впоследствии прошёл |
| `CIRCLECI_TOKEN` | CircleCI Personal API token, Cloudflare Worker Preview secret | Настраивался в Cloudflare отдельно; старый token отвергался, после замены CircleCI API v3 вернул реальные runs и job details |
| `CIRCLECI_WEBHOOK_SECRET` | HMAC signing secret: GitHub Actions repository secret, named Cloudflare Preview secret и Secret Token зарегистрированного CircleCI webhook | Preview workflow установил secret; CircleCI принял webhook ping. Не является API token |

Секреты Production в рамках описанных действий не настраивались и не должны считаться готовыми. Значения секретов намеренно не фиксируются в документации.

## 3. Требования и секреты

Потребуются:
- CircleCI Cloud project `Znect-god/znect-forge`;
- Cloudflare account и Worker Preview;
- GitHub Actions secrets и доступ к feature branch;
- Node.js 24 для локальных проверок на поддерживаемой ОС; Linux GitHub Actions используется для Wrangler;
- MCP-клиент для MCP-сценария либо современный браузер для dashboard.

Секреты:

| Имя | Назначение | Где хранить |
|---|---|---|
| `CIRCLECI_TOKEN` | CircleCI API access | Cloudflare Worker Secret |
| `MCP_ACCESS_TOKEN` | MCP Bearer auth | Cloudflare Preview Secret |
| `WEB_ACCESS_TOKEN` | Browser API Bearer auth | Cloudflare Preview Secret |
| `CIRCLECI_WEBHOOK_SECRET` | HMAC подпись webhook | GitHub Actions Secret и matching Cloudflare Preview Secret; тот же signing secret в CircleCI |

Preview и Production secrets не наследуются друг от друга. Не использовать один и тот же секрет для разных назначений. Не вставлять значения в чат, Git, README, workflow logs, URL или shell arguments.

**Текущее состояние секретов:** workflow уже использовал `CIRCLECI_WEBHOOK_SECRET` для Preview; ранее настроенные API/MCP/browser credentials прошли authenticated smoke test. Не нужно повторно создавать или пересылать секреты, если они уже сохранены и работают. Workflow диагностирует только имена секретов, не их значения.

Если значение потеряно, его нельзя прочитать обратно из GitHub/Cloudflare. Сгенерируйте новое локально и обновите обе стороны, которым оно принадлежит; никогда не присылайте его в чат.

## 4. Порядок запуска и проверки

### Шаг 1 — проверить branch и CI

1. Откройте [Draft PR #5](https://github.com/Znect-god/znect-all-plugins/pull/5) и убедитесь, что он остаётся Draft.
2. Убедитесь, что рабочая ветка — `feat/ci-bridge-circleci-webhooks`.
3. Проверяйте workflow run на точном текущем head SHA, а не только зелёный статус старого запуска.
4. Ожидаемые проверки: dependency install, `npm run check` (typecheck + unit tests), syntax check smoke script, изолированный Preview deploy и authenticated smoke test.
5. PR-triggered workflow валидирует код; branch-push workflow развёртывает named Preview. Не путать эти два сценария.

Последний подтверждённый run #43568774133 прошёл. При следующих изменениях требуется новая успешная проверка на новом SHA.

### Шаг 2 — проверить Cloudflare Preview

Использовать только named Preview:
`feat-ci-bridge-circleci-webhooks`.

Root URL:
`https://feat-ci-bridge-circleci-webhooks-znect-ci-bridge.znect699.workers.dev`

Перед проверкой:
- убедиться, что Preview deployment соответствует ожидаемому commit SHA;
- проверить наличие нужных Preview secrets по именам, не раскрывая значения;
- убедиться, что Durable Object binding `EVENT_STORE` и SQLite migration применены к Preview;
- использовать Preview endpoint, не Production.

Последний подтверждённый run выполнил Preview deployment и authenticated smoke test. При новой ревизии статус проверять заново.

### Шаг 3 — smoke test

В автоматическом workflow smoke test проверяет health, browser auth/status, MCP discovery/tool annotations и CircleCI project access; для webhook path используется синтетическое подписанное событие. Успех этого теста подтверждает только перечисленные проверки и не подтверждает реальную доставку CircleCI.

Если запускаете скрипт вручную, делайте это только после проверки точного Preview URL и Preview secrets. Скрипт: `plugins/znect-ci-bridge/scripts/preview-smoke-test.mjs`. Он требует `PREVIEW_ORIGIN`, `MCP_ACCESS_TOKEN`, `WEB_ACCESS_TOKEN`; не передавайте секреты аргументами команды и не публикуйте вывод, содержащий заголовки авторизации.

### Шаг 4 — CircleCI webhook (настроен, реальная доставка ещё ожидает)

CircleCI project webhook уже добавлен пользователем для проекта `Znect-god/znect-forge`:
- Name: `Znect CI Bridge Preview`
- Event: `Workflow Completed` (`workflow-completed`)
- Certificate Validation: enabled
- URL: `https://feat-ci-bridge-circleci-webhooks-znect-ci-bridge.znect699.workers.dev/webhooks/circleci`
- Signing secret: то же значение, что хранится в GitHub Actions secret `CIRCLECI_WEBHOOK_SECRET` и в named Preview secret `CIRCLECI_WEBHOOK_SECRET`.

При добавлении CircleCI автоматически проверяет URL ping-событием. В используемом интерфейсе отдельной кнопки **Test Ping** нет. Успешное добавление означает, что автоматическая проверка URL получила 2xx. Это подтверждает ping-handshake, но **не** реальную доставку `workflow-completed`.

Не удалять и не пересоздавать webhook или signing secret только из-за информационного предупреждения CircleCI о связанном signing secret.

### Шаг 5 — дождаться обычной сборки Forge и проверить настоящее событие

Не нужно запускать искусственную сборку специально. После завершения ближайшего обычного workflow в CircleCI:

1. Зафиксировать workflow URL/ID, проект и время завершения.
2. Проверить CircleCI Webhooks delivery history для зарегистрированного webhook: статус доставки должен быть успешным (2xx). Если delivery не было, проверить выбранное событие, URL и CircleCI delivery details.
3. Прочитать Preview inbox через MCP `list_recent_events(after, limit)` либо Browser API:
   `GET /api/v1/events?after=0&limit=20` с `Authorization: Bearer <WEB_ACCESS_TOKEN>`.
4. Найти запись с тем же workflow/project и временем. Проверить event ID, тип `workflow-completed`, workflow status, timestamp и cursor.
5. Повторно прочитать inbox и убедиться, что повторная доставка того же event ID не создала дубликат.
6. Проверить получение той же записи через MCP `list_recent_events`.
7. Зафиксировать результат как **real CircleCI delivery verified** только после сопоставления с CircleCI delivery history и содержимым inbox.

До выполнения этих пунктов реальная webhook доставка остаётся **pending / not yet verified**. Синтетическое событие из smoke test не засчитывается.

### Шаг 6 — проверить API диагностики на реальном run

После обычной сборки проверить последовательно:
1. `check_connection()`;
2. `list_recent_runs(limit=5)`;
3. `get_run_details(run_id)` для UUID из ответа;
4. `get_job_details(job_id)`;
5. `get_job_logs(job_id, step_num, ...)`;
6. `get_job_test_results(job_id)`;
7. `list_job_artifacts(job_id)`;
8. `get_job_artifact(job_id, artifact_path)` только с точным путём из предыдущего списка;
9. `diagnose_run(run_id)` для неуспешного run, когда такой появится.

Не подставлять legacy build number вместо v3 UUID. Отсутствие тестовых результатов или артефактов может означать, что исходная job их не публиковала. Проверка project access не означает, что все перечисленные endpoints уже проверены.

## 5. Использование

### MCP

MCP URL для текущего Preview:
`https://feat-ci-bridge-circleci-webhooks-znect-ci-bridge.znect699.workers.dev/mcp`

Подключать его можно только из клиента, который поддерживает Streamable HTTP MCP и Bearer/API-key auth. Сначала выполнить MCP initialization/tool discovery, затем `check_connection`. Обычное открытие `/mcp` в браузере не является MCP handshake.

Возможность подключить custom MCP в ChatGPT зависит от текущего плана, workspace и платформы. Проверять нужно актуальную документацию OpenAI: https://help.openai.com/en/articles/12584461-connecting-custom-mcp-servers-in-chatgpt. Не считать установку skill или карточки приложения доказательством подключения инструментов.

### Browser dashboard

Открыть root URL подтверждённого Preview в браузере, ввести `WEB_ACCESS_TOKEN) и нажать Connect. Токен хранится только в памяти вкладки. На Android можно использовать браузер; отдельное подключение MCP к мобильному приложению для этого не требуется.

JSON API:
- `GET /api/v1/status`
- `GET /api/v1/runs?limit=10`
- `GET /api/v1/runs/{run_uuid}`
- `GET /api/v1/events?after=0&limit=20`

Для всех запросов требуется `Authorization: Bearer <WEB_ACCESS_TOKEN>`. API read-only.

### Инструменты MCP

- `check_connection()` — CircleCI API v3 access/project resolution.
- `list_recent_runs(limit)` — последние v3 runs.
- `get_run_details(run_id)` — run/workflows/jobs.
- `get_job_details(job_id)` — job metadata.
- `get_job_logs(...)` — ограниченные stdout/stderr.
- `get_job_test_results(...)` — structured test results.
- `list_job_artifacts(job_id)` / `get_job_artifact(...)` — метаданные и точный текстовый артефакт.
- `diagnose_run(run_id)` — ограниченная диагностика failed run.
- `list_recent_events(after, limit)` — webhook inbox.
- Legacy v1.1: `list_recent_builds`, `get_build_details`, `get_build_logs`.

Лимиты и неполнота диагностических ответов описаны в README и отражаются в diagnostics metadata. Если указан `incomplete=true`, результат не исчерпывающий.

## 6. Безопасность и эксплуатационные границы

- Только read-only CircleCI GET-запросы и чтение webhook inbox.
- Не добавлять trigger/retry/cancel/deploy/config-write возможности.
- Не менять Forge source, CircleCI config, GitHub branches или настройки проекта через Bridge.
- Не печатать и не запрашивать секреты.
- Webhook принимает только подписанные запросы, payload ограничен 64 KiB; сохраняется нормализованная allowlist, а не исходное тело.
- Event inbox ограничен 500 событиями и сроком хранения 30 дней.
- Дедупликация использует CircleCI event ID.
- Secret redaction — best effort, не гарантия.
- Rate limiting Cloudflare приблизительный и location-local.
- CircleCI Personal API Token может иметь широкие права; защищать его как высокочувствительный секрет.
- Production и Preview имеют отдельные secret scopes.
- Не использовать реальные production credentials в Preview без осознанного решения; для текущего тестирования работать с Preview.

## 7. Известные ограничения / незавершённые работы

1. Настоящее CircleCI `workflow-completed` событие и его end-to-end retrieval ещё не подтверждены.
2. Более широкая live-проверка run/workflow/job/log/test/artifact endpoints требует реальных representative Forge runs.
3. Входящий event inbox не инициирует сам сообщения ChatGPT; polling/delivery integration не реализована.
4. Независимый security review не проведён.
5. Production deployment не выполнялся и не разрешён.
6. Лицензия проекта пока не определена.
7. Wrangler/workerd не поддерживается в текущем Android ARM64 Termux окружении; использовать Linux CI/поддерживаемый desktop.

## 8. Типовые ошибки

| Симптом | Что проверить |
|---|---|
| CircleCI не создаёт webhook, ping получает не-2xx | Точный Preview URL, доступность deployment, path `/webhooks/circleci`, Preview signing secret, TLS/certificate validation |
| Webhook добавлен, но event inbox пуст | Был ли после регистрации новый workflow completion; выбран ли `workflow-completed`; CircleCI delivery history; соответствуют ли signing secrets |
| HTTP 401 на MCP | `MCP_ACCESS_TOKEN` в клиенте и Preview |
| HTTP 401 на browser API | `WEB_ACCESS_TOKEN` и заголовок Bearer |
| HTTP 503 | Rate-limit binding/deployment |
| CircleCI API 401/403 | Токен, срок действия, доступ к организации/проекту и SSO |
| Нет logs/test/artifacts | Опубликовала ли их исходная job |
| В браузере не открывается /mcp как страница | Это MCP transport endpoint, не HTML UI |

Не раскрывать токены в тикетах, скриншотах, чатах и логах.

## 9. Обновление и выпуск

- Изменения вносить в `feat/ci-bridge-circleci-webhooks` или отдельную согласованную feature branch.
- PR #5 остаётся Draft и unmerged.
- После каждого изменения проверять новый SHA: CI → isolated Preview → smoke test → live read-only checks.
- Не сливать PR и не менять `main` без прямого разрешения.
- Не выполнять Production deployment без отдельного прямого разрешения, независимого security review и закрытия критичных live verification пунктов.
- Тестирование Forge продолжать обычным рабочим процессом; не менять Forge 0.8.0 freeze и не запускать ненужные сборки специально для Bridge.

## 10. Официальные ссылки

- CircleCI outbound webhooks: https://circleci.com/docs/guides/integration/outbound-webhooks/
- CircleCI webhook reference: https://circleci.com/docs/reference/outbound-webhooks-reference/
- CircleCI API v3: https://circleci.com/docs/guides/toolkit/api-v3-developers-guide/
- CircleCI API tokens: https://circleci.com/docs/guides/toolkit/managing-api-tokens/
- Cloudflare Workers Previews: https://developers.cloudflare.com/workers/previews/
- OpenAI custom MCP: https://help.openai.com/en/articles/12584461-connecting-custom-mcp-servers-in-chatgpt/
- [CircleCI API migration notes](CIRCLECI_API_MIGRATION.md)
- [Security review](SECURITY_REVIEW.md)
- [Project README](../README.md)
