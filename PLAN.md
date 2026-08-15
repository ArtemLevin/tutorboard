# TutorBoard standalone: план гостевой совместной доски

> Статус документа: основной execution plan с 2026-08-15.
>
> Прежние этапы развития полотна, GeometryOS, Smart Ink и lesson-bound
> интеграции сохранены в `docs/DEVELOPMENT_PLAN.md`, архитектурных ADR и
> профильных планах в `docs/architecture/`. Этот документ определяет новый
> приоритет: самостоятельный TutorBoard, который преподаватель открывает по
> своей учётной записи, а ученик — без регистрации по секретной ссылке.

## 1. Продуктовое решение

Первая публичная версия разворачивается как отдельный продукт TutorBoard и
поддерживает основной сценарий:

1. Преподаватель авторизуется.
2. Преподаватель создаёт новую независимую доску.
3. Преподаватель выпускает отдельную секретную ссылку для ученика.
4. Ученик открывает ссылку в браузере без регистрации, логина и пароля.
5. Ссылка обменивается на ограниченную гостевую сессию только для этой доски.
6. Преподаватель и ученик синхронно редактируют один документ.
7. Преподаватель может запретить редактирование, отозвать ссылку, выпустить
   новую ссылку, архивировать или удалить доску.

Авторизация преподавателя остаётся обязательной. Полностью анонимное создание
досок не допускается, поскольку оно делает невозможными владение, аудит,
отзыв доступа, защиту от злоупотреблений и восстановление данных.

### 1.1. Что означает «без авторизации ученика»

Ученик не создаёт аккаунт и не вводит персональные данные. После открытия
секретной ссылки сервер выдаёт браузеру `HttpOnly` guest cookie. Cookie является
технической сессией доступа, а не пользовательской учётной записью.

Нужно явно учитывать ограничение capability-link модели:

> Любой, кто получил секретную ссылку, может воспользоваться ею до истечения
> срока или отзыва. Без идентификации ученика невозможно доказать, кому именно
> была переслана ссылка.

Риск ограничивается высокой энтропией секрета, коротким сроком действия,
board-scoped правами, отзывом, ротацией, аудитом и отсутствием токена в логах.

## 2. Цели и границы первой поставки

### 2.1. Обязательные возможности

- самостоятельная доска без обязательных `studentId` и `lessonId`;
- список досок преподавателя;
- создание, открытие, переименование, архивирование и мягкое удаление;
- одна или несколько независимых гостевых ссылок на доску;
- имя ученика, заданное преподавателем при создании ссылки;
- настраиваемый срок ссылки: 1 час, 24 часа, 7 дней или до отзыва;
- гостевой вход без промежуточной формы;
- HTTP push/pull, server revisions, snapshots и offline recovery;
- WebSocket presence, курсоры, ink/transform preview и reconnect;
- немедленный запрет новых записей после блокировки ученика;
- отзыв и ротация ссылки без изменения самой доски;
- экспорт преподавателем в `.tutorboard.json`, SVG, PNG и PDF;
- production deployment только board-контура в Yandex Cloud;
- off-host backup и проверяемый restore drill.

### 2.2. Не входит в первую поставку

- аккаунты учеников и родителей;
- каталог учеников и расписание;
- привязка к занятию как обязательное условие;
- BigBlueButton;
- запись и транскрибация урока;
- портал материалов;
- генерация учебных PDF/HTML после урока;
- публичный каталог досок;
- анонимное создание досок;
- передача владения доской;
- end-to-end encryption содержимого доски;
- CRDT-переписывание существующего revision protocol.

## 3. Сохраняемый технический baseline

Новая стратегия не отменяет готовую совместную синхронизацию. Без изменения
основного протокола сохраняются:

- `BoardDocument` и command-only mutation boundary;
- ordered command envelope `1.5`;
- последовательные server revisions;
- SHA-256 проверка документа и snapshots;
- idempotency keys;
- Lamport ordering по `actorId + originId`;
- durable IndexedDB queue;
- offline → reconnect → pull/rebase/push;
- восстановление после `409` revision conflict;
- Redis Pub/Sub room broker;
- ephemeral presence;
- одноразовые WebSocket tickets;
- same-origin HTTP и WebSocket;
- WebSocket Origin validation;
- ограничение размера и частоты live-сообщений;
- реальные Chromium/Firefox two-client E2E.

Основная работа сосредоточена на новой модели владения и доступа, а не на
повторной реализации синхронизации.

## 4. Целевая архитектура

```text
Internet
   |
   v
Caddy: TLS, security headers, routing, access-log redaction
   |----------------------|
   v                      v
TutorBoard UI         Board API
                          |-------- PostgreSQL
                          |-------- Redis
                          |-------- Yandex Object Storage
                          `-------- GeometryOS (optional pinned sidecar)
```

### 4.1. Runtime-компоненты

| Компонент      | Ответственность                                  | Состояние                   |
| -------------- | ------------------------------------------------ | --------------------------- |
| Caddy          | TLS, HTTP/3, same-origin routing, headers        | обязателен                  |
| TutorBoard UI  | полотно и клиент синхронизации                   | обязателен                  |
| Board API      | owner auth, invitations, commands, snapshots, WS | обязателен                  |
| PostgreSQL     | доски, команды, приглашения, аудит               | обязателен                  |
| Redis          | tickets, presence, Pub/Sub, rate limits          | обязателен                  |
| Object Storage | snapshots и off-host backups                     | обязателен                  |
| GeometryOS     | построение по тексту                             | опционален в первом rollout |

Потеря Redis может временно разорвать live-соединения, но не должна приводить к
потере подтверждённых изменений. Источник истины — PostgreSQL и проверенные
snapshots в Object Storage.

### 4.2. Размещение Board API

На первом этапе серверная реализация остаётся в `tutor-assistant-web`, чтобы не
копировать зрелые persistence/collaboration модули. Добавляется отдельный
профиль запуска:

```text
APP_PROFILE=board
```

Профиль подключает только:

```text
identity + boards + guest-access + audit + health + metrics
```

Для deployment публикуется самостоятельный образ:

```text
ghcr.io/artemlevin/tutorboard-api:<release>
```

Выделение API в отдельный репозиторий рассматривается только после production
стабилизации и отдельного ADR. До этого TutorBoard и Board API развиваются
согласованными PR в двух репозиториях.

## 5. Пользовательские сценарии

### 5.1. Преподаватель создаёт доску

1. Преподаватель открывает `/boards`.
2. Нажимает «Создать доску».
3. Вводит название или принимает автоматически предложенное.
4. API создаёт UUID доски и пустую revision `0`.
5. UI открывает `/b/<public-board-id>#/board`.
6. Создание фиксируется в audit log.

### 5.2. Преподаватель создаёт ссылку

1. Нажимает «Пригласить ученика».
2. Указывает отображаемое имя ученика.
3. Выбирает срок действия.
4. API создаёт 256-битный случайный token.
5. В базе сохраняется только HMAC/hash token, не исходное значение.
6. Полная ссылка возвращается ровно в ответе создания/ротации.
7. UI копирует её в clipboard и показывает срок действия.

Пример:

```text
https://board.example.ru/j/3kIFV8c9JQx...opaque-secret...
```

### 5.3. Ученик открывает ссылку

1. Браузер выполняет `GET /j/<secret>`.
2. API проверяет token, срок, отзыв, доску и rate limit.
3. API выдаёт подписанную guest cookie с board scope.
4. Ответ устанавливает `Cache-Control: no-store`,
   `Referrer-Policy: no-referrer` и `X-Robots-Tag: noindex, nofollow`.
5. API выполняет `303` на `/b/<public-board-id>#/board`.
6. Секрет исчезает из последующих HTTP/WS URL.
7. TutorBoard получает context и сразу загружает доску.

Ссылка остаётся повторно используемой до срока/отзыва. Одноразовое поглощение
не выбирается: preview-боты мессенджеров и потеря browser storage могли бы
необратимо закрыть доступ законному ученику.

### 5.4. Преподаватель отзывает доступ

1. API увеличивает `credential_version` и ставит `revoked_at`.
2. Новые HTTP/WS tickets больше не выдаются.
3. Broker публикует `access.revoked` в room.
4. Активный WebSocket ученика закрывается кодом `4403`.
5. Следующая запись ученика отклоняется сервером независимо от состояния UI.
6. Преподаватель может выпустить новую ссылку без создания новой доски.

### 5.5. Преподаватель блокирует редактирование

- чтение и presence сохраняются;
- `board.write` удаляется из guest capabilities;
- сервер отклоняет command POST;
- UI выключает инструменты и показывает режим «Только просмотр»;
- broker отправляет `access.capabilities.changed` активным клиентам.

## 6. Модель доступа и безопасность

### 6.1. Principal

Board API принимает два типа principal:

- `TeacherPrincipal`: существующая авторизованная учётная запись;
- `GuestBoardPrincipal`: подписанная board-scoped сессия приглашения.

Пример guest context:

```json
{
  "actorId": "guest:9a1d...",
  "boardId": "board:71e2...",
  "capabilities": ["board.read", "board.write", "collaboration.connect"],
  "csrfToken": "opaque-csrf",
  "displayName": "Ксения",
  "role": "student"
}
```

### 6.2. Capability matrix

| Capability              | Teacher |    Guest student |
| ----------------------- | ------: | ---------------: |
| `board.read`            |      да |               да |
| `board.write`           |      да |    настраивается |
| `collaboration.connect` |      да |               да |
| `board.export`          |      да | нет по умолчанию |
| `board.history.read`    |      да |              нет |
| `board.invites.manage`  |      да |              нет |
| `board.archive`         |      да |              нет |
| `board.delete`          |      да |              нет |

Frontend скрывает недоступные действия, но окончательное решение всегда
принимает backend.

### 6.3. Guest cookie

Cookie содержит только подписанные claims:

```text
invite_id, board_id, actor_id, credential_version, issued_at, expires_at
```

Требования:

- `HttpOnly`;
- `Secure`;
- `SameSite=Lax`;
- ограниченный `Path=/`;
- не содержит исходный invite token;
- имеет срок не длиннее срока invitation;
- проверяется по актуальному `credential_version`;
- не заменяет CSRF token для изменяющих HTTP-запросов.

### 6.4. Защитные инварианты

- недоступная чужая доска отвечает `404`, а не раскрывающим `403`;
- actor envelope и вложенных commands совпадает с principal;
- invitation никогда не предоставляет manage capabilities;
- сырой token не хранится в PostgreSQL, Redis, audit и access logs;
- `/j/*` исключён из обычного access logging либо путь редактируется;
- invitation lookup выполняется по HMAC-SHA-256 с server-side pepper;
- сравнение token digest выполняется constant-time;
- все изменяющие HTTP endpoints требуют CSRF;
- production WebSocket без `Origin` запрещён;
- WebSocket подключается только через одноразовый ticket с TTL 30 секунд;
- revoke и read-only переключатель проверяются на сервере, а не только в UI;
- guest не может перечислять доски, приглашения, пользователей и revisions;
- failed join attempts и command abuse имеют IP/invite rate limits;
- CSP запрещает непредусмотренные third-party scripts и connections.

## 7. Изменения модели данных

### 7.1. `board_documents`

Добавить:

```text
owner_user_id            NOT NULL
title                    NOT NULL
student_editing_enabled  NOT NULL DEFAULT true
```

Изменить:

- `student_id` и `lesson_id` перестают быть обязательными для standalone board;
- удалить обязательный composite FK на `lessons` для новых досок;
- заменить uniqueness `organization + lesson` на явные ограничения standalone;
- сохранить `organization_id` для tenant isolation;
- сохранить текущие revision/snapshot/delete поля.

Lesson-bound доски должны продолжать читаться в переходный период. Миграция не
удаляет существующие данные и не меняет command payload.

### 7.2. `board_invitations`

```text
id                       UUID PK
organization_id          UUID NOT NULL
board_document_id        VARCHAR NOT NULL
token_digest             CHAR(64) UNIQUE NOT NULL
actor_id                 VARCHAR UNIQUE NOT NULL
display_name             VARCHAR NOT NULL
role                     VARCHAR NOT NULL DEFAULT 'student'
credential_version       INTEGER NOT NULL DEFAULT 1
expires_at               TIMESTAMPTZ NULL
revoked_at               TIMESTAMPTZ NULL
created_by               UUID NOT NULL
created_at               TIMESTAMPTZ NOT NULL
last_used_at             TIMESTAMPTZ NULL
use_count                BIGINT NOT NULL DEFAULT 0
```

Обязательные индексы:

- unique `token_digest`;
- `(organization_id, board_document_id, revoked_at)`;
- `(expires_at)` для cleanup;
- `(actor_id)` для envelope validation/audit.

## 8. API-контракт

### 8.1. Teacher endpoints

| Method   | Path                                              | Назначение                 |
| -------- | ------------------------------------------------- | -------------------------- |
| `POST`   | `/api/v1/boards`                                  | создать standalone board   |
| `GET`    | `/api/v1/boards`                                  | список досок владельца     |
| `PATCH`  | `/api/v1/boards/{id}`                             | название и student editing |
| `POST`   | `/api/v1/boards/{id}/archive`                     | архивировать               |
| `POST`   | `/api/v1/boards/{id}/unarchive`                   | восстановить               |
| `DELETE` | `/api/v1/boards/{id}`                             | мягкое удаление            |
| `POST`   | `/api/v1/boards/{id}/invitations`                 | выпустить ссылку           |
| `GET`    | `/api/v1/boards/{id}/invitations`                 | статусы ссылок без token   |
| `POST`   | `/api/v1/boards/{id}/invitations/{invite}/revoke` | отозвать                   |
| `POST`   | `/api/v1/boards/{id}/invitations/{invite}/rotate` | заменить ссылку            |

### 8.2. Guest bootstrap

| Method | Path                     | Назначение                           |
| ------ | ------------------------ | ------------------------------------ |
| `GET`  | `/j/{secret}`            | exchange link → guest cookie → 303   |
| `GET`  | `/api/v1/boards/context` | teacher/guest context и capabilities |

### 8.3. Shared board endpoints

Сохраняются текущие routes:

```text
GET  /api/v1/boards/{id}
GET  /api/v1/boards/{id}/commands
POST /api/v1/boards/{id}/commands
POST /api/v1/boards/{id}/snapshots
POST /api/v1/boards/{id}/collaboration-ticket
WS   /api/v1/boards/{id}/collaboration
```

Teacher-only evidence/history endpoints скрываются в board-only UI до
отдельного продуктового решения.

### 8.4. Ошибки

API использует единый Problem Details/JSON error contract:

- `board_not_found`;
- `invitation_invalid`;
- `invitation_expired`;
- `invitation_revoked`;
- `guest_session_invalid`;
- `board_read_only`;
- `board_revision_conflict`;
- `board_lamport_conflict`;
- `rate_limit_exceeded`.

Публичная join-страница не различает invalid/expired/revoked для пользователя,
но метрика и privacy-safe audit должны различать причины.

## 9. Изменения TutorBoard frontend

### 9.1. Bootstrap

- заменить обязательный `lessonId + documentId` на standalone `boardId`;
- сохранить временное чтение legacy query для обратной совместимости;
- создать `readBoardLaunchContext()`;
- открывать synced app по `/b/<boardId>#/board`;
- context получать до запуска sync engine;
- не сохранять guest cookie/token в IndexedDB/localStorage;
- сохранять только безопасный `originId` и локальную command queue.

### 9.2. Share UI

Текущий `copyBoardShareUrl(window.location)` удалить из server-sync режима.
Вместо этого UI должен:

- вызвать invitation API;
- показать имя ученика и срок;
- скопировать возвращённую секретную ссылку;
- показывать `never used / active / expired / revoked`;
- позволять revoke/rotate;
- не отображать старый token после закрытия результата создания.

### 9.3. Teacher workspace

Добавить минимальный `/boards` shell:

- список активных и архивных досок;
- название и дата последнего изменения;
- наличие активного ученика;
- кнопки «Открыть», «Пригласить», «Только просмотр», «Архивировать»;
- создание доски;
- empty, loading, offline и error states;
- keyboard/focus accessibility.

### 9.4. Guest mode

- не показывать login, settings, diagnostics и board list;
- показывать имя преподавателя/доски только если это разрешено context;
- скрывать invite, archive, delete, history и evidence actions;
- при read-only выключать mutation tools;
- при revoke очищать pending UI, закрывать collaboration и показывать
  безопасную страницу потери доступа;
- не отправлять уже запрещённые pending commands после revoke/read-only.

## 10. Изменения Board API

- добавить независимый `create_board()` без Lesson dependency;
- обобщить `BoardAccessPolicy` на teacher/guest principal;
- добавить invitation service;
- добавить signed guest session codec;
- добавить HMAC token lookup;
- добавить guest CSRF lifecycle;
- выдавать существующий one-time collaboration ticket гостю;
- валидировать board scope и actor для pull/push/snapshot/WS;
- публиковать `access.revoked` и `access.capabilities.changed`;
- добавить join/access rate limits;
- добавить privacy-safe audit events;
- добавить `APP_PROFILE=board` composition root;
- исключить classroom, students, portal, BBB, transcription, materials и
  document-engine routes из board profile;
- добавить health/readiness dependencies только для PostgreSQL, Redis и S3.

## 11. Пошаговый план PR

Каждый PR должен быть небольшим, мигрируемым и иметь собственный rollback.

### PR B0 — зафиксировать standalone contracts

Репозитории: `tutorboard`, `tutor-assistant-web`.

Scope:

- ADR capability-link access;
- ADR board-only runtime boundary;
- OpenAPI draft invitation/context endpoints;
- capability vocabulary;
- cookie/token/logging threat model;
- legacy lesson-bound compatibility policy.

Gate:

- frontend/backend fixtures одинаково понимают context и errors;
- нет реализации до согласования token lifecycle и revoke semantics.

### PR B1 — отвязать BoardDocument от Lesson

Репозиторий: `tutor-assistant-web`.

Scope:

- additive PostgreSQL migration;
- owner/title/student-editing fields;
- nullable legacy lesson/student linkage;
- standalone create/list/update service;
- tenant/owner access tests;
- migration and downgrade smoke.

Gate:

- существующие lesson-bound board tests зелёные;
- новые standalone board tests зелёные;
- command and snapshot contracts не изменены;
- production data migration не удаляет строки.

### PR B2 — invitation и guest session backend

Репозиторий: `tutor-assistant-web`.

Scope:

- `board_invitations` migration;
- token issue/HMAC lookup;
- exchange route и guest cookie;
- capabilities/CSRF context;
- revoke/rotate/expiry;
- guest read/write access;
- WebSocket ticket для guest;
- audit и rate limits.

Gate:

- raw token отсутствует в DB/log/test snapshots;
- cross-board запрос возвращает 404;
- revoke блокирует HTTP и активный WS;
- read-only блокирует server write;
- forged/expired/version-mismatched cookie отклоняется.

### PR T1 — standalone board launch

Репозиторий: `tutorboard`.

Scope:

- `boardId` launch context;
- context-first bootstrap;
- capability-aware shell;
- legacy query compatibility;
- guest-safe routing;
- unit/component/browser tests.

Gate:

- обычный локальный mode не сломан;
- teacher и guest открывают один document;
- guest token не попадает в local storage/IndexedDB;
- invalid access показывает безопасный UX.

### PR T2 — teacher board list и invitation UI

Репозиторий: `tutorboard`.

Scope:

- board list/create/archive flows;
- invitation dialog;
- copy, expiry, revoke и rotate;
- student editing switch;
- guest/read-only UI;
- accessibility и responsive layout.

Gate:

- clipboard failure имеет ручной fallback;
- token не отображается после закрытия result panel;
- ученик не видит teacher controls;
- управление полностью доступно с клавиатуры.

### PR B3/T3 — live revocation и convergence hardening

Репозитории: оба.

Scope:

- `access.revoked`;
- `access.capabilities.changed`;
- закрытие WS;
- остановка pending push;
- offline/reconnect после смены прав;
- multi-tab guest origin tests;
- duplicate/replay/revision conflict matrix.

Gate:

- сервер остаётся авторитетным при устаревшем UI;
- подтверждённые команды не теряются;
- запрещённые pending commands не отправляются после восстановления сети.

### PR D1 — board-only containers и local stack

Репозиторий: `tutor-assistant-web` с документацией в `tutorboard`.

Scope:

- `APP_PROFILE=board`;
- `compose.board.local.yml`;
- `compose.board.production.yml`;
- Caddy routes `/`, `/api`, `/j`, `/b`, WebSocket;
- PostgreSQL, Redis, external S3;
- migration job;
- backup/restore commands;
- pinned GeometryOS profile.

Исключить:

- BBB;
- Celery workers/scheduler общего приложения;
- transcription;
- materials/document engine;
- portal;
- ClamAV;
- internal MinIO при использовании Yandex Object Storage.

Gate:

- compose config render;
- clean-host bootstrap;
- non-root containers;
- secrets только через files/Lockbox;
- HTTP readiness и WebSocket smoke;
- backup/isolated restore.

### PR D2 — release CI

Репозитории: оба.

Scope:

- immutable TutorBoard UI image;
- immutable Board API image;
- SHA/digest metadata;
- SBOM и vulnerability scan;
- Chromium/Firefox two-client guest E2E;
- PostgreSQL/Redis integration;
- migration check;
- production compose validation;
- запрет `latest`.

Gate:

- release tags разрешаются в `repository@sha256`;
- runtime deployment state хранит только digests;
- high/critical vulnerability policy проходит либо имеет оформленное исключение.

### PR D3 — Yandex Cloud staging

Scope:

- отдельный Terraform state;
- VM, static IP, security group и DNS;
- отдельный Lockbox;
- Object Storage snapshots/backups;
- Ansible board-only playbook;
- monitoring, budgets и audit trail;
- staging deployment без production DNS.

Начальный sizing для проверки:

```text
4 vCPU, 8 GiB RAM, 100 GiB network SSD
```

Gate:

- полный E2E;
- load test;
- Redis/PostgreSQL restart drills;
- VM reboot drill;
- real off-host backup;
- isolated restore;
- 24-часовой soak без необъяснимых disconnect/data divergence.

### PR D4 — production rollout

Scope:

- отдельные production state/Lockbox/bucket/domain;
- digest-pinned deploy;
- preflight без запуска;
- migration backup;
- blue/green application switch;
- smoke и ручная teacher/student приёмка;
- rollback evidence.

Gate:

- ручное approval после staging;
- DNS/TLS готовы;
- dashboard/alerts активны;
- предыдущие digests сохранены;
- подтверждён последний restore drill.

## 12. Тестовая стратегия

### 12.1. Unit/property tests

- token entropy/encoding/digest;
- constant-time comparison wrapper;
- expiry boundaries и clock skew;
- capability derivation;
- cookie signing/tampering/version;
- actor/origin identity;
- route/context parsing;
- read-only UI command boundary;
- redaction token-shaped paths.

### 12.2. PostgreSQL integration

- standalone create/list/update;
- tenant and owner isolation;
- invitation uniqueness;
- concurrent rotate/revoke;
- legacy board migration;
- command revision/idempotency/Lamport invariants;
- snapshot recovery;
- soft delete and purge.

### 12.3. Redis/WebSocket integration

- one-time ticket consumption;
- wrong-board ticket rejection;
- presence join/leave/expiry;
- multi-process Pub/Sub;
- revoke active connection;
- read-only capability change;
- Redis restart and reconnect;
- message size/rate enforcement.

### 12.4. Security tests

- brute-force/rate-limit behavior;
- token absent from DB, logs, metrics, Sentry и traces;
- CSRF with guest cookie;
- Origin mismatch;
- forged cookie;
- replayed WebSocket ticket;
- cross-board enumeration;
- guest manage endpoint denial;
- cache/referrer/robots headers;
- CSP and dependency audit.

### 12.5. Browser E2E

Минимальный release gate:

1. Преподаватель входит в систему.
2. Создаёт доску и invitation для «Ксения».
3. Новый browser context открывает ссылку без login screen.
4. Оба клиента получают один revision `0`.
5. Оба одновременно рисуют и перемещают разные объекты.
6. Оба видят presence, курсоры и previews.
7. Ученик перезагружает страницу и восстанавливает доску.
8. Ученик работает offline, затем синхронизируется.
9. Ученик не может открыть соседний board ID.
10. Teacher включает read-only; guest write блокируется.
11. Teacher возвращает write; sync продолжается.
12. Teacher отзывает invitation; active guest теряет доступ.
13. Новая invitation снова открывает ту же доску.
14. Teacher экспортирует итоговый документ.

Матрица: Chromium и Firefox в CI; Edge/Chrome/Safari/iPad — ручная staging
приёмка до production.

### 12.6. Load/chaos gates

- 100 одновременных WebSocket clients;
- не менее 50 пар teacher/student на независимых досках;
- burst рисования и transform preview;
- reconnect storm после Redis restart;
- PostgreSQL connection exhaustion protection;
- заполнение disk warning;
- container/VM restart;
- backup во время умеренной активности;
- restore с последующим checksum/revision validation.

## 13. SLO и наблюдаемость

Начальные цели после staging calibration:

| Показатель                         | Цель                                      |
| ---------------------------------- | ----------------------------------------- |
| HTTPS availability                 | не ниже 99.5% в месяц                     |
| подтверждённая команда после `2xx` | не теряется                               |
| join exchange p95                  | не более 500 мс                           |
| command commit p95                 | не более 750 мс без учёта клиентской сети |
| presence/preview delivery p95      | не более 500 мс                           |
| reconnect to converged state p95   | не более 10 секунд                        |
| backup RPO                         | не более 24 часов                         |
| проверяемый restore RTO            | не более 2 часов                          |

Обязательные метрики:

- active WS по role;
- join success/failure reason без token;
- issued/active/revoked/expired invitations;
- command commit/conflict/idempotent retry;
- collaboration publish latency;
- reconnect/convergence duration;
- Redis/PostgreSQL/S3 health;
- snapshot age/failure/quarantine;
- backup age/result;
- disk/memory/CPU/container restarts.

Alerts:

- readiness недоступна;
- повышенный join failure rate;
- WebSocket disconnect spike;
- command conflict spike;
- oldest pending/snapshot/backup age;
- PostgreSQL/Redis unavailable;
- disk ниже установленного порога;
- restore verification failure.

## 14. Миграция и совместимость

### 14.1. Порядок миграции

1. Выпустить additive DB migration.
2. Развернуть backend, понимающий legacy и standalone rows.
3. Оставить старые lesson routes рабочими.
4. Выпустить TutorBoard с dual launch parser.
5. Включить standalone creation только после backend readiness.
6. Перевести production UI на standalone routes.
7. Наблюдать legacy traffic.
8. Удалять lesson-specific compatibility только отдельным последующим ADR/PR.

### 14.2. Rollback

- до включения standalone feature старый backend должен читать новую схему;
- миграция B1 должна иметь проверяемый downgrade без потери legacy rows;
- invitation tables можно оставить неиспользуемыми при app rollback;
- frontend rollback не удаляет server data;
- deploy хранит предыдущие immutable image digests;
- при failed smoke proxy возвращается на предыдущий slot;
- schema contract changes не объединяются с необратимым data cleanup.

## 15. Board-only deployment в Yandex Cloud

### 15.1. Изоляция окружений

Staging и production имеют отдельные:

- Terraform state;
- VM и static IPv4;
- DNS name;
- Lockbox secret;
- PostgreSQL data volumes;
- Object Storage bucket/prefix;
- S3 credentials;
- application secrets;
- GitHub Environment и runner label.

### 15.2. Сеть

- публичные TCP 80/443 и UDP 443;
- SSH только с узкого CIDR/VPN;
- PostgreSQL, Redis и internal metrics не публикуются;
- outbound HTTPS разрешён для GHCR, S3 и GeometryOS dependencies;
- Caddy — единственная публичная точка входа.

### 15.3. Secrets

Минимальный production Lockbox:

```text
app_secret_key
guest_session_signing_key
invitation_token_pepper
postgres_password
redis_password
snapshot_s3_secret_key
backup_s3_secret_key
ghcr_token
metrics_bearer_token
grafana_admin_password
sentry_dsn
```

Terraform получает только secret ID и не читает payload. VM service account
имеет `lockbox.payloadViewer` только на свой environment secret.

## 16. Риски и решения

| Риск                           | Решение                                                                  |
| ------------------------------ | ------------------------------------------------------------------------ |
| Ссылку переслали третьему лицу | revoke/rotate, короткий TTL, audit, одна ссылка на ученика               |
| Token попал в access log       | redaction/disable path logging для `/j/*`                                |
| Preview-бот открыл ссылку      | invitation reusable до revoke, cookie выдаётся только конкретному client |
| Guest cookie украдена          | Secure/HttpOnly/SameSite, CSP, короткий TTL, version revoke              |
| UI устарел после revoke        | backend validation на каждом write/ticket + WS kick                      |
| Redis перезапущен              | reconnect и recovery из PostgreSQL/snapshots                             |
| Два устройства одного ученика  | общий actor, разные `originId`, существующий Lamport contract            |
| Legacy board сломан миграцией  | additive schema, dual read, migration tests                              |
| Два backend расходятся         | не копировать board protocol, board-only profile текущего API            |
| VM потеряна                    | off-host backup, static DNS recovery, restore drill                      |

## 17. Definition of Done первой публичной версии

Поставка завершена только если одновременно выполнены условия:

- преподаватель создаёт standalone board из production UI;
- invitation содержит не менее 256 бит энтропии;
- исходный token нигде не хранится и не логируется;
- ученик открывает доску без аккаунта и login screen;
- guest principal ограничен ровно одной доской;
- teacher/student одновременно редактируют без расхождения документа;
- offline/reconnect сохраняет подтверждённые и pending изменения;
- read-only и revoke применяются сервером и к активному WS;
- соседние доски не перечисляются и не раскрываются;
- Chromium/Firefox E2E, security, migration и load gates зелёные;
- runtime использует immutable image digests;
- staging прошёл soak, reboot, backup и isolated restore;
- production имеет TLS, alerts, budget и audit trail;
- rollback на предыдущие digests проверен;
- runbook позволяет другому оператору восстановить сервис без устных знаний.

## 18. Немедленная последовательность работ

1. Выполнить PR B0 и зафиксировать ADR/OpenAPI/capabilities.
2. Выполнить backend PR B1 с additive migration.
3. Выполнить backend PR B2 с invitation и guest access.
4. Выполнить TutorBoard PR T1 с standalone bootstrap.
5. Выполнить TutorBoard PR T2 с board/invitation UX.
6. Совместно выполнить B3/T3 и real two-client revoke E2E.
7. Собрать board-only compose в D1.
8. Подключить immutable release gates в D2.
9. Развернуть staging D3, выполнить load/chaos/restore/soak.
10. После ручного approval выполнить production rollout D4.

Ни один production apply не выполняется до завершения PR B0–D2 и зелёного
board-only staging preflight.
