# TutorBoard standalone: детализированный план гостевой совместной доски

> Статус документа: основной execution plan с 2026-08-15.
>
> Документ обновлён после ревью фактического состояния `main`. Существующий
> revision-based sync, WebSocket collaboration и durable offline queue считаются
> зрелым baseline и не переписываются. Основной объём новой работы — standalone
> ownership, guest capability-link access, security boundaries, principal-scoped
> local persistence и board-only production deployment.
>
> Прежние этапы развития полотна, GeometryOS, Smart Ink и lesson-bound
> интеграции сохранены в `docs/DEVELOPMENT_PLAN.md`, ADR и профильных планах в
> `docs/architecture/`.

## 1. Продуктовое решение

Первая публичная версия TutorBoard разворачивается как отдельный продукт и
поддерживает основной сценарий:

1. Преподаватель авторизуется.
2. Преподаватель создаёт независимую доску.
3. Преподаватель выпускает секретную ссылку для конкретного ученика.
4. Ученик открывает ссылку без регистрации, логина и пароля.
5. Ссылка обменивается на ограниченную guest session только для этой доски.
6. Преподаватель и ученик синхронно редактируют один `BoardDocument`.
7. Преподаватель может перевести ученика в read-only, вернуть write, отозвать
   или ротировать ссылку без пересоздания доски.
8. Преподаватель может архивировать, восстановить или мягко удалить доску.

Авторизация преподавателя обязательна. Анонимное создание досок не допускается:
оно разрушает модель владения, аудит, отзыв доступа, защиту от злоупотреблений и
восстановление данных.

### 1.1. Что означает «без авторизации ученика»

Ученик не создаёт учётную запись и не вводит персональные данные. При открытии
секретной ссылки сервер создаёт техническую board-scoped guest session и
устанавливает `HttpOnly` cookie. Это credential браузера, а не пользовательский
аккаунт.

Capability-link имеет фундаментальное ограничение:

> Любой, кто получил секретную ссылку, может воспользоваться ею до истечения
> срока или отзыва. Без идентификации невозможно доказать, кому именно была
> переслана ссылка.

Риск ограничивается высокой энтропией token, коротким TTL, board-scoped
capabilities, revoke/rotate, audit, rate limits и запретом хранения raw token.

### 1.2. Архитектурные инварианты первой версии

Следующие решения считаются обязательными и не должны размываться в отдельных
PR:

1. **Существующий sync не переписывается.** Сохраняются ordered commands,
   sequential server revisions, SHA-256, idempotency, Lamport metadata,
   snapshots, IndexedDB pending queue, pull/rebase/push и `409` recovery.
2. **`BoardSyncEngine` синхронизирует существующую доску, но не создаёт её.**
   Создание board относится к management/API layer. `lessonId` не должен быть
   обязательной зависимостью sync engine.
3. **Backend является единственным authority для capabilities.** UI может
   скрывать или блокировать действия, но любой write, ticket, archive, invite и
   delete повторно проверяются сервером.
4. **Durable browser state изолируется по security principal/access scope, а не
   только по `documentId`.** Teacher cache и guest cache одной доски не
   считаются одной и той же security областью.
5. **Смена прав создаёт новый local access epoch.** Pending-команды гостя,
   созданные до revoke/read-only downgrade, не должны автоматически «оживать»
   после последующего возврата write.
6. **Revoke является терминальным состоянием guest client.** После
   `access.revoked` клиент прекращает reconnect/push и не входит в бесконечный
   цикл повторного подключения.
7. **Guest shell имеет route-level least privilege.** Недостаточно скрыть
   навигацию: недоступные guest routes не должны монтировать teacher-only UI и
   вызывать teacher-only API.
8. **Raw invitation token никогда не является runtime identifier.** После
   `/j/<secret>` он исчезает из URL, не сохраняется в storage и не используется
   в WebSocket.
9. **WebSocket ticket остаётся короткоживущим one-time credential.** Его query
   parameter должен быть redacted из access logs, metrics, traces и error
   reporting.
10. **Одна доска может иметь несколько invitations.** Write permission хранится
    на invitation level; дополнительно board имеет глобальный kill switch для
    гостевых записей.

## 2. Цели и границы первой поставки

### 2.1. Обязательные возможности

- standalone board без обязательных `studentId` и `lessonId`;
- owner-scoped список досок преподавателя;
- создание, открытие, переименование, архивирование, восстановление и soft
  delete;
- одна или несколько независимых guest invitations на доску;
- отображаемое имя ученика на invitation;
- срок ссылки: 1 час, 24 часа, 7 дней или до отзыва;
- per-invitation `write_enabled`;
- board-wide `guest_writes_enabled` как аварийный/общий переключатель;
- guest entry без промежуточной login form;
- HTTP push/pull, server revisions, snapshots и offline recovery;
- WebSocket presence, cursors, ink/transform previews и reconnect;
- live read-only/revoke propagation;
- principal-scoped local durable queue;
- отзыв и ротация invitation без изменения board id;
- export преподавателем в `.tutorboard.json`, SVG, PNG и PDF;
- board-only production deployment в Yandex Cloud;
- off-host backup и проверяемый restore drill.

### 2.2. Не входит в первую поставку

- аккаунты учеников и родителей;
- каталог учеников и расписание;
- обязательная привязка к lesson;
- BigBlueButton;
- запись и транскрибация урока;
- портал материалов;
- генерация учебных PDF/HTML после урока;
- публичный каталог досок;
- анонимное создание досок;
- transfer ownership;
- end-to-end encryption;
- CRDT-переписывание revision protocol;
- отдельный backend-репозиторий TutorBoard до production stabilization;
- отдельный guest subdomain в обязательном v1 scope. Он остаётся допустимым
  hardening после первой поставки, если появится session-confusion риск.

## 3. Фактический технический baseline и текущие разрывы

### 3.1. Уже реализованный baseline

В текущем TutorBoard сохраняются без фундаментальной переработки:

- `BoardDocument` и command-only mutation boundary;
- ordered command envelope `1.5`;
- sequential server revisions;
- SHA-256 document/snapshot validation;
- idempotency keys;
- Lamport ordering по `actorId + originId`;
- `BoardSyncEngine` с bootstrap, pull, optimistic push, rebase и conflict
  recovery;
- durable Dexie queue;
- confirmed head cache;
- quarantine конфликтующих/повреждённых pending commands;
- offline → reconnect → pull/rebase/push;
- server rollback/split-brain/revision-gap checks;
- HTTP board adapter с strict runtime validation;
- WebSocket collaboration ticket;
- reconnect/heartbeat;
- presence snapshot/join/leave/update;
- cursors и selection/viewport presence;
- ink preview и transform preview;
- message size/rate/participant limits;
- Chromium/Firefox collaboration E2E infrastructure.

### 3.2. Текущие разрывы относительно standalone target

До начала публичного rollout необходимо устранить следующие зависимости:

- bootstrap запускает server sync только при `lessonId + documentId`;
- `ProductServerSync` и `SyncedApp` требуют `lessonId`;
- `BoardSyncEngine` вызывает `ensureBoard(lessonId, documentId)` и поэтому
  смешивает создание и синхронизацию;
- `ServerBoardDescriptor` требует `lessonId` и `studentId`;
- `BoardSessionContext` содержит role, но не capabilities/access scope;
- текущий HTTP context schema strict и должен быть версионирован согласованно с
  backend;
- `BoardPlatformRepository` объединяет sync, collaboration, evidence, history и
  management methods;
- Dexie durable state в основном keyed по `documentId`, что недостаточно после
  появления teacher/guest principals;
- pending command metadata не различает access epoch;
- `App` не имеет общего capability-aware mutation boundary;
- read-only сейчас нельзя считать полноценным UX state;
- `copyBoardShareUrl(window.location)` не является invitation flow;
- `SyncedApp` вызывает lesson/evidence API, недоступные guest principal;
- WebSocket protocol не имеет terminal `access.revoked` и
  `access.capabilities.changed` control events;
- teacher-only routes защищаются в основном структурой UI, а не отдельным
  route authorization layer.

## 4. Целевая архитектура

```text
Internet
   |
   v
Caddy: TLS, security headers, routing, query/path redaction
   |----------------------|
   v                      v
TutorBoard UI         Board API
                          |-------- PostgreSQL
                          |-------- Redis
                          |-------- Yandex Object Storage
                          `-------- GeometryOS (optional pinned sidecar)
```

### 4.1. Runtime-компоненты

| Компонент      | Ответственность                                  | Статус                      |
| -------------- | ------------------------------------------------ | --------------------------- |
| Caddy          | TLS, routing, headers, sensitive URL redaction   | обязателен                  |
| TutorBoard UI  | canvas, access-aware shell, sync client          | обязателен                  |
| Board API      | owner auth, invitations, commands, snapshots, WS | обязателен                  |
| PostgreSQL     | boards, commands, invitations, audit             | обязателен                  |
| Redis          | tickets, presence, Pub/Sub, rate limits          | обязателен                  |
| Object Storage | snapshots и off-host backups                     | обязателен                  |
| GeometryOS     | построение по тексту                             | optional first rollout      |

Redis не является источником истины. Его потеря может оборвать live presence и
WS, но не должна потерять подтверждённые board revisions. Источник истины —
PostgreSQL плюс проверенные snapshots.

### 4.2. Board API placement

На первом этапе серверная реализация остаётся в `tutor-assistant-web`, чтобы не
копировать зрелые persistence/collaboration modules. Добавляется composition
profile:

```text
APP_PROFILE=board
```

Он подключает только:

```text
identity + boards + guest-access + audit + health + metrics
```

Deployment image:

```text
ghcr.io/artemlevin/tutorboard-api:<release>
```

Выделение API в отдельный repo возможно только после production stabilization и
отдельного ADR.

### 4.3. Frontend bootstrap pipeline

Standalone launch должен стать context-first:

```text
URL
 |
 v
readBoardLaunchContext()
 |-------------------------------|
 | local                         | standalone/legacy
 v                               v
PersistedApp              GET /api/v1/boards/context
                                  |
                                  v
                           BoardAccessContext
                                  |
                       +----------+----------+
                       |                     |
                       v                     v
                 repository set       cacheScopeId
                       |                     |
                       +----------+----------+
                                  |
                                  v
                           BoardSyncEngine
                                  |
                                  v
                              SyncedApp
```

`BoardLaunchContext` должен различать:

```ts
type BoardLaunchContext =
  | { mode: "local" }
  | { mode: "standalone"; boardId: string }
  | { mode: "legacy-lesson"; documentId: string; lessonId: string };
```

Standalone canonical URL:

```text
/b/<public-board-id>#/board
```

Legacy query parser сохраняется временно только для backward compatibility.

### 4.4. Repository least-privilege split

Текущий `BoardPlatformRepository` необходимо декомпозировать. Целевая модель:

```ts
BoardContextRepository
BoardSyncRepository
BoardCollaborationRepository
BoardTeacherManagementRepository
BoardEvidenceRepository
```

Правила:

- `BoardSyncEngine` принимает только `BoardSyncRepository`;
- collaboration client принимает `BoardContextRepository +
  BoardCollaborationRepository`;
- guest shell не получает management/evidence interfaces;
- teacher board list не требует sync engine;
- evidence остаётся legacy/teacher feature и не монтируется в guest standalone
  workspace.

Это даёт compile-time least privilege поверх обязательных backend checks.

## 5. Пользовательские сценарии

### 5.1. Teacher создаёт standalone board

1. Teacher открывает `/boards`.
2. UI получает teacher context.
3. Teacher нажимает «Создать доску».
4. `POST /api/v1/boards` создаёт board row и revision `0`.
5. Ответ содержит public board id, title и access metadata.
6. UI открывает `/b/<board-id>#/board`.
7. Sync engine только загружает уже существующую board.
8. Audit фиксирует `board.created`.

### 5.2. Teacher создаёт invitation

1. Нажимает «Пригласить ученика».
2. Вводит display name.
3. Выбирает TTL.
4. Выбирает initial write permission.
5. Backend генерирует не менее 256 бит криптографической энтропии.
6. В PostgreSQL хранится только HMAC digest token.
7. Raw URL возвращается ровно в create/rotate response.
8. UI показывает его в transient result panel и копирует в clipboard.
9. После закрытия panel raw token больше недоступен через list endpoint.

Пример:

```text
https://board.example.ru/j/3kIFV8c9JQx...opaque-secret...
```

### 5.3. Guest открывает invitation

1. `GET /j/<secret>`.
2. Backend проверяет digest, TTL, revoke, board state и rate limit.
3. Backend создаёт board-scoped guest session.
4. Response устанавливает `Cache-Control: no-store`,
   `Referrer-Policy: no-referrer`, `X-Robots-Tag: noindex, nofollow`.
5. Guest session cookie не содержит raw invitation token.
6. Выполняется `303` на `/b/<board-id>#/board`.
7. Secret отсутствует во всех последующих HTTP/WS URLs.
8. UI получает `BoardAccessContext` до запуска sync engine.
9. Guest durable queue создаётся в своём `cacheScopeId`.

Invitation reusable до expiry/revoke. Одноразовое поглощение ссылки не
используется из-за messenger preview bots и риска потерять первый exchange.

### 5.4. Teacher включает read-only

Capabilities гостя вычисляются как пересечение:

```text
invitation.write_enabled
AND board.guest_writes_enabled
AND invitation active
AND board active
```

При downgrade:

1. backend атомарно меняет permission state;
2. увеличивается серверная access version;
3. новые command POST отклоняются `board_read_only`;
4. новые collaboration tickets содержат новые permissions;
5. Redis broker публикует `access.capabilities.changed`;
6. guest UI отключает mutation tools;
7. guest local `accessEpoch` меняется;
8. pending commands старого epoch переходят в quarantine/recovery bucket и не
   auto-push'ятся при последующем возврате write.

Read-only сохраняет board read и presence.

### 5.5. Teacher отзывает invitation

1. `revoked_at` устанавливается атомарно;
2. `credential_version` увеличивается;
3. новые HTTP guest writes/reads согласно policy отклоняются;
4. новые WS tickets не выдаются;
5. broker публикует `access.revoked`;
6. active WS закрывается `4403`;
7. collaboration client входит в terminal `revoked` state;
8. reconnect больше не планируется;
9. pending guest commands старого scope/epoch не отправляются;
10. UI показывает безопасный экран «Доступ к доске отозван»;
11. teacher может создать новую invitation к той же board.

### 5.6. Invitation rotation

Rotation создаёт новый raw token и новый credential version, не меняя board,
actor history и server revisions. Старый token/session сразу становится
недействительным. Raw rotated token снова показывается только один раз.

## 6. Principal, capabilities и browser session model

### 6.1. Principals

Board API принимает:

- `TeacherPrincipal` — существующая authenticated account;
- `GuestBoardPrincipal` — signed board/invitation-scoped session.

Целевой context:

```json
{
  "actorId": "guest:9a1d...",
  "boardId": "board:71e2...",
  "cacheScopeId": "opaque:scope:...",
  "capabilities": ["board.read", "board.write", "collaboration.connect"],
  "csrfToken": "opaque-csrf",
  "displayName": "Ксения",
  "accessEpoch": "opaque:epoch:...",
  "role": "student"
}
```

`cacheScopeId` и `accessEpoch` не являются credentials и могут безопасно
храниться локально. Они должны быть opaque и не содержать raw invitation token.

### 6.2. Capability vocabulary

Минимальный v1 vocabulary:

```text
board.read
board.write
collaboration.connect
board.export
board.history.read
board.invites.manage
board.archive
board.delete
board.rename
```

| Capability              | Teacher | Guest |
| ----------------------- | ------: | ----: |
| `board.read`            |      да |    да |
| `board.write`           |      да | policy |
| `collaboration.connect` |      да |    да |
| `board.export`          |      да |   нет |
| `board.history.read`    |      да |   нет |
| `board.invites.manage`  |      да |   нет |
| `board.archive`         |      да |   нет |
| `board.delete`          |      да |   нет |
| `board.rename`          |      да |   нет |

### 6.3. Guest cookie

Требования:

- `HttpOnly`;
- `Secure`;
- `SameSite=Lax`;
- предпочтительно `Path=/api/`, поскольку UI не должен читать credential;
- не содержит raw invite token;
- срок не длиннее invitation TTL;
- содержит `invite_id`, `board_id`, `actor_id`, `credential_version`, timestamps;
- проверяется на каждом guest context/write/ticket request;
- не заменяет CSRF token для modifying HTTP requests.

### 6.4. Teacher + guest cookie collision

V1 сохраняет один public origin. Необходимо явно определить deterministic
principal precedence:

- валидная teacher auth session имеет приоритет над guest session;
- открытие invitation авторизованным teacher не должно понижать его привилегии;
- UI обязан показывать фактический principal из context, а не угадывать его по
  URL;
- E2E покрывает coexistence двух cookie types;
- при выявлении session-confusion в staging допускается отдельный
  `guest.board.<domain>` через ADR, без изменения board protocol.

## 7. Principal-scoped durable persistence

Это обязательный hardening до включения guest write.

### 7.1. Cache key

Текущего key `documentId` недостаточно. Целевая область:

```text
(cacheScopeId, documentId)
```

или эквивалентный namespaced DB key.

Teacher и guest для одной board имеют разные `cacheScopeId`.

### 7.2. Что scope'ится

По security scope должны быть разделены:

- confirmed heads;
- pending commands;
- Lamport clocks;
- queue sequence;
- quarantine records;
- recovery metadata.

Raw guest credential не хранится ни в одном IndexedDB/localStorage record.

### 7.3. Dexie migration

Нужна additive schema migration, условно `tutorboard-sync-v2`/DB version 4:

- новые compound keys включают `cacheScopeId`;
- legacy teacher rows мигрируются в deterministic legacy scope;
- migration idempotent;
- partial migration recoverable;
- corruption отправляется в quarantine, а не silently drops;
- downgrade policy документируется до merge.

### 7.4. Access epoch metadata

`PendingBoardCommand` получает **локальное**, не protocol-level поле:

```ts
accessEpochAtCreation: string
```

Это поле не добавляется в command envelope `1.5` и не меняет серверный revision
protocol.

При context epoch change:

- pending current epoch можно продолжать;
- pending old epoch нельзя auto-push;
- они перемещаются в quarantine с reason `access-epoch-changed`;
- teacher может получить recovery/export diagnostics, guest — безопасный status
  без утечки teacher data.

## 8. Data model backend

### 8.1. `board_documents`

Добавить/изменить:

```text
owner_user_id            UUID NOT NULL
title                    VARCHAR NOT NULL
guest_writes_enabled     BOOLEAN NOT NULL DEFAULT true
access_version           BIGINT NOT NULL DEFAULT 1
student_id               NULLABLE for standalone
lesson_id                NULLABLE for standalone
```

Сохраняются organization/tenant fields, revision/snapshot/archive/delete data.
Lesson-bound rows остаются читаемыми в transition period.

### 8.2. `board_invitations`

```text
id                       UUID PK
organization_id          UUID NOT NULL
board_document_id        VARCHAR NOT NULL
token_digest             CHAR(64) UNIQUE NOT NULL
actor_id                 VARCHAR UNIQUE NOT NULL
display_name             VARCHAR NOT NULL
role                     VARCHAR NOT NULL DEFAULT 'student'
write_enabled            BOOLEAN NOT NULL DEFAULT true
credential_version       BIGINT NOT NULL DEFAULT 1
access_version           BIGINT NOT NULL DEFAULT 1
expires_at               TIMESTAMPTZ NULL
revoked_at               TIMESTAMPTZ NULL
created_by               UUID NOT NULL
created_at               TIMESTAMPTZ NOT NULL
last_used_at             TIMESTAMPTZ NULL
use_count                BIGINT NOT NULL DEFAULT 0
```

Индексы:

- unique `token_digest`;
- `(organization_id, board_document_id, revoked_at)`;
- `(expires_at)`;
- `(actor_id)`;
- `(board_document_id, write_enabled, revoked_at)` при подтверждённой пользе
  query planner.

### 8.3. Access epoch derivation

Backend context возвращает opaque `accessEpoch`, вычисляемый из текущих
permission versions без раскрытия secret. Изменение board-wide guest permission,
invitation write, rotate или revoke должно менять epoch.

## 9. API contract

### 9.1. Teacher management endpoints

| Method   | Path                                              | Назначение |
| -------- | ------------------------------------------------- | ---------- |
| `POST`   | `/api/v1/boards`                                  | create standalone board |
| `GET`    | `/api/v1/boards`                                  | owner board list |
| `PATCH`  | `/api/v1/boards/{id}`                             | title/global guest write |
| `POST`   | `/api/v1/boards/{id}/archive`                     | archive |
| `POST`   | `/api/v1/boards/{id}/unarchive`                   | restore |
| `DELETE` | `/api/v1/boards/{id}`                             | soft delete |
| `POST`   | `/api/v1/boards/{id}/invitations`                 | create invitation |
| `GET`    | `/api/v1/boards/{id}/invitations`                 | statuses without raw token |
| `PATCH`  | `/api/v1/boards/{id}/invitations/{invite}`        | display/write/expiry policy |
| `POST`   | `/api/v1/boards/{id}/invitations/{invite}/revoke` | revoke |
| `POST`   | `/api/v1/boards/{id}/invitations/{invite}/rotate` | rotate |

### 9.2. Guest bootstrap

| Method | Path                     | Назначение |
| ------ | ------------------------ | ---------- |
| `GET`  | `/j/{secret}`            | link exchange → guest cookie → 303 |
| `GET`  | `/api/v1/boards/context` | principal, board, capabilities, csrf, scope/epoch |

### 9.3. Shared sync endpoints

Сохраняются текущие routes и revision semantics:

```text
GET  /api/v1/boards/{id}
GET  /api/v1/boards/{id}/commands
POST /api/v1/boards/{id}/commands
POST /api/v1/boards/{id}/snapshots
POST /api/v1/boards/{id}/collaboration-ticket
WS   /api/v1/boards/{id}/collaboration
```

Snapshot creation для guest запрещается, если snapshot endpoint рассматривается
как privileged maintenance action. Если текущий sync требует snapshot от
клиента, B0 должен выбрать один contract: либо explicit `board.snapshot.write`
capability, либо server-owned snapshotting. Нельзя оставлять implicit guest
privilege.

### 9.4. Error contract

Единый Problem Details/JSON vocabulary:

```text
board_not_found
board_read_only
board_deleted
invitation_invalid
invitation_expired
invitation_revoked
guest_session_invalid
guest_session_version_mismatch
board_revision_conflict
board_lamport_conflict
access_epoch_changed
rate_limit_exceeded
```

Публичный join UX не различает invalid/expired/revoked, но privacy-safe metric
различает причины.

## 10. WebSocket access control

### 10.1. Existing transport stays

Сохраняются one-time ticket, same-origin WS, protocol `tutorboard.v1`, heartbeat,
presence, preview throttling и reconnect strategy.

Ticket requirements:

- TTL 30 s;
- one-time consumption;
- board scope;
- principal/actor scope;
- client id binding;
- current capabilities/access version;
- URL query redaction в Caddy/logging/tracing.

### 10.2. New server control events

Добавить:

```text
access.capabilities.changed
access.revoked
```

`access.capabilities.changed` содержит только безопасный context delta или
сигнал повторно получить context. Raw token/credential в WS payload запрещён.

`access.revoked` переводит client в terminal state. Код закрытия `4403` не
должен автоматически запускать reconnect loop.

### 10.3. Offline/reconnect permission check

Перед отправкой durable pending queue после reconnect клиент обязан обновить
context и сравнить `accessEpoch`. Только после этого разрешён push.

Порядок:

```text
network online
 -> context refresh
 -> epoch/capabilities validation
 -> pull remote
 -> rebase permitted pending
 -> push
```

а не `network online -> push stale pending`.

## 11. TutorBoard frontend changes

### 11.1. Context-first bootstrap

- создать `readBoardLaunchContext()`;
- поддержать standalone `/b/<id>` и временный legacy query;
- context получать до создания `BoardSyncEngine`;
- `serverSync` больше не зависит от lesson presence;
- `BoardSyncEngineOptions` не содержит обязательный `lessonId`;
- `ensureBoard()` удалить из sync bootstrap;
- board creation выполняется management layer;
- guest credential не сохраняется в JS-readable storage.

### 11.2. Capability-aware mutation boundary

Ввести единый объект/функцию policy, например:

```ts
interface BoardMutationPolicy {
  readonly canWrite: boolean;
  readonly reason?: "read-only" | "revoked" | "offline-recovery";
}
```

Все mutation entry points должны уважать policy:

- pen/eraser;
- text create/edit;
- paste/cut/delete;
- selection transform;
- geometry import;
- Smart Ink acceptance;
- plot edit;
- 3D projection commands;
- undo/redo/collaborative undo;
- keyboard shortcuts;
- context-menu writes.

Нельзя ограничиться disabled toolbar: command dispatch boundary также проверяет
write capability.

### 11.3. Teacher board workspace

Минимальный `/boards`:

- active/archive tabs;
- create board;
- title, modified time, revision/status;
- active invitations count;
- open;
- invite/manage access;
- global guest read-only switch;
- archive/restore/delete;
- loading/empty/error/offline states;
- keyboard/focus accessibility.

### 11.4. Invitation UI

Удалить `copyBoardShareUrl(window.location)` из server-sync share action.
Новый flow:

- create invitation API;
- display name;
- expiry;
- per-invite write switch;
- copy link;
- manual fallback при clipboard denial;
- statuses `never used / active / expired / revoked`;
- revoke/rotate;
- raw token показывается только transiently после create/rotate.

### 11.5. Guest shell

Guest mode:

- разрешён только board route;
- teacher navigation не монтируется;
- settings/diagnostics/documents/history/evidence/invites/archive/delete скрыты и
  route-guarded;
- read-only отключает mutation tools и shortcuts;
- revoke очищает live previews, останавливает collaboration/sync и показывает
  terminal access-loss page;
- old-epoch pending commands не auto-push;
- export гостю отсутствует по умолчанию.

## 12. Board API changes

- standalone `create_board()` без Lesson dependency;
- owner/list/update/archive/delete services;
- generalized `BoardAccessPolicy` для teacher/guest principal;
- capability derivation;
- invitation service;
- CSPRNG token issue + HMAC lookup;
- constant-time digest compare;
- signed guest session codec;
- guest CSRF lifecycle;
- context endpoint с `cacheScopeId` и `accessEpoch`;
- guest collaboration ticket;
- actor/board scope validation для read/push/WS;
- server-authoritative read-only/revoke;
- `access.revoked`/`access.capabilities.changed` Pub/Sub;
- join/write/ticket rate limits;
- privacy-safe audit events;
- `APP_PROFILE=board` composition root;
- board profile исключает classroom, students, portal, BBB, transcription,
  materials и document engine;
- health/readiness зависит только от board runtime dependencies.

## 13. Детализированный план PR

Каждый PR должен быть небольшим, additive/migratable и иметь собственный
rollback. Нельзя объединять фундаментальную security migration и UI feature в
один PR.

### PR B0 — contracts и threat model

**Repos:** `tutorboard`, `tutor-assistant-web`.

Scope:

- ADR capability-link access;
- ADR board-only runtime boundary;
- OpenAPI draft standalone board/invitation/context endpoints;
- `BoardCapability` vocabulary;
- versioned `BoardAccessContext` fixture;
- `cacheScopeId`/`accessEpoch` semantics;
- teacher+guest cookie precedence;
- snapshot capability decision;
- WS revoke/capability event schema;
- error vocabulary;
- token/ticket/logging threat model;
- legacy lesson compatibility policy.

Gate:

- frontend/backend fixtures parse identically;
- strict Zod/Pydantic/OpenAPI contracts aligned;
- no raw token appears in fixtures/log examples;
- revoke/read-only/offline semantics documented before implementation;
- no implementation PR B1/T0 merges before B0 contract is green.

### PR T0 — frontend security/architecture preparation

**Repo:** `tutorboard`.

Это новый обязательный preparatory PR.

Scope:

- `BoardLaunchContext` abstraction;
- `BoardAccessContext` и capabilities types;
- split `BoardPlatformRepository` на least-privilege interfaces;
- убрать обязательный `lessonId` из `BoardSyncEngine`;
- удалить board creation/`ensureBoard` responsibility из sync engine;
- principal-scoped Dexie schema и migration;
- local `accessEpochAtCreation` pending metadata;
- new quarantine reason `access-epoch-changed`;
- capability-aware command/mutation boundary;
- collaboration status расширить terminal access state;
- подготовить parsing/control types для WS access events;
- legacy launch compatibility.

Gate:

- local mode не сломан;
- legacy lesson server-sync tests зелёные;
- existing collaboration E2E зелёный;
- teacher/guest scope unit tests доказывают cache isolation;
- old epoch pending никогда не auto-push;
- `BoardSyncEngine` может работать только по `documentId + context`, без lesson
  creation side effect.

Rollback:

- новая Dexie schema читает legacy data additive way;
- feature flag позволяет оставить standalone launch выключенным;
- protocol envelope остаётся `1.5`.

### PR B1 — standalone board persistence/model

**Repo:** `tutor-assistant-web`.

Scope:

- additive PostgreSQL migration;
- owner/title/global guest write/access version fields;
- nullable legacy lesson/student linkage;
- standalone create/list/update/archive/delete services;
- owner/tenant policy;
- API descriptor, compatible с standalone и legacy;
- migration/downgrade smoke.

Gate:

- legacy board tests зелёные;
- standalone CRUD tests зелёные;
- cross-owner/tenant read даёт non-enumerating 404;
- command/snapshot protocol не изменён;
- migration не удаляет production rows.

### PR B2 — invitation и guest session backend

**Repo:** `tutor-assistant-web`.

Scope:

- `board_invitations` migration;
- 256-bit token issue;
- HMAC lookup + constant-time compare;
- `/j/{secret}` exchange;
- signed guest cookie;
- guest CSRF;
- context capabilities/scope/epoch;
- per-invite write + global board write;
- expiry/revoke/rotate;
- guest read/write policy;
- guest collaboration ticket;
- audit/rate limits;
- sensitive URL redaction tests.

Gate:

- raw token отсутствует в DB/logs/traces/test snapshots;
- forged/expired/version-mismatched cookie rejected;
- cross-board request = 404;
- read-only blocks command POST server-side;
- revoke blocks HTTP/ticket;
- teacher+guest cookie precedence deterministic;
- no teacher management capability leaks to guest.

### PR T1 — standalone launch и guest-safe routing

**Repo:** `tutorboard`.

Scope:

- `/b/<boardId>` launch;
- context-first bootstrap;
- teacher/guest principal rendering;
- guest route authorization;
- principal-scoped queue wiring;
- capability-aware `SyncedApp`;
- remove lesson/evidence calls from guest composition;
- safe invalid/expired/revoked UX;
- browser tests with real backend fixtures.

Gate:

- teacher и guest открывают один server document;
- guest token отсутствует в localStorage/IndexedDB;
- guest cannot mount/call teacher routes/actions;
- invalid access does not expose board existence;
- local mode и legacy lesson mode остаются зелёными.

### PR T2 — teacher board list и invitation UI

**Repo:** `tutorboard`.

Scope:

- `/boards` workspace;
- create/rename/archive/restore/delete;
- invitation dialog;
- copy + manual fallback;
- expiry/status/revoke/rotate;
- per-invite write;
- global guest write switch;
- read-only visual state;
- accessible keyboard/focus flow;
- responsive layout.

Gate:

- raw token не повторно получается list endpoint;
- token исчезает после закрытия result panel;
- clipboard failure recoverable;
- guest не видит teacher controls;
- keyboard-only management flow проходит E2E/a11y smoke.

### PR B3/T3 — live access changes и convergence hardening

**Repos:** оба.

Backend scope:

- `access.capabilities.changed`;
- `access.revoked`;
- WS `4403`;
- server access version publication;
- ticket invalidation;
- multi-process Redis propagation.

Frontend scope:

- context refresh на capability event;
- terminal revoke state;
- no reconnect loop after revoke;
- access epoch comparison before reconnect push;
- quarantine stale pending;
- read-only mutation boundary;
- write re-enable only for new/current epoch commands.

Gate:

- stale UI cannot bypass server policy;
- confirmed revisions not lost;
- old-epoch pending never silently applies later;
- revoke active WS observed by two-browser E2E;
- read-only toggle works online/offline/reconnect;
- multi-tab guest with same actor/different originId converges.

### PR D1 — board-only runtime/containers

**Repo:** primarily `tutor-assistant-web`, deployment docs mirrored in
`tutorboard`.

Scope:

- `APP_PROFILE=board`;
- `compose.board.local.yml`;
- `compose.board.production.yml`;
- Caddy routes `/`, `/api`, `/j`, `/b`, WS;
- redaction rules for `/j/*` path and `ticket` query;
- PostgreSQL;
- Redis;
- Yandex Object Storage external S3;
- migration job;
- backup/restore commands;
- optional pinned GeometryOS profile.

Excluded:

- BBB;
- general Celery workers/scheduler;
- transcription;
- materials/document engine;
- portal;
- ClamAV;
- internal MinIO in production.

Gate:

- compose config render;
- clean-host bootstrap;
- non-root containers;
- secrets only files/Lockbox;
- HTTP readiness + WS smoke;
- log redaction test;
- backup + isolated restore.

### PR D2 — release CI and supply-chain gates

**Repos:** оба.

Scope:

- immutable UI image;
- immutable Board API image;
- image digests + commit metadata;
- SBOM;
- vulnerability scan;
- Chromium/Firefox teacher/guest two-client E2E;
- PostgreSQL/Redis integration;
- migration check;
- production compose validation;
- sensitive-token-log scan;
- ban `latest`.

Gate:

- release state resolves to `repository@sha256`;
- high/critical policy green or documented exception;
- guest E2E includes offline/read-only/revoke;
- migration + rollback smoke green.

### PR D3 — Yandex Cloud staging

Scope:

- separate Terraform state;
- VM/static IP/security group/DNS;
- Lockbox;
- Object Storage snapshots/backups;
- Ansible board-only playbook;
- monitoring/budget/audit;
- staging deployment without production DNS.

Initial sizing:

```text
4 vCPU, 8 GiB RAM, 100 GiB network SSD
```

Gate:

- full functional E2E;
- load test;
- Redis restart drill;
- PostgreSQL restart drill;
- VM reboot drill;
- real off-host backup;
- isolated restore;
- 24h soak without unexplained disconnect/data divergence;
- no raw invitation/WS ticket in collected logs/traces.

### PR D4 — production rollout

Scope:

- separate production state/Lockbox/bucket/domain;
- digest-pinned deploy;
- no-apply preflight;
- migration backup;
- blue/green application switch;
- smoke + manual teacher/student acceptance;
- rollback evidence.

Gate:

- manual approval after staging;
- DNS/TLS ready;
- dashboards/alerts active;
- previous image digests preserved;
- latest restore drill confirmed;
- previous slot rollback verified.

## 14. Test strategy

### 14.1. Unit/property

- token entropy/encoding/digest;
- constant-time compare wrapper;
- expiry boundaries/clock skew;
- capability derivation intersection;
- teacher/guest principal precedence;
- cookie signing/tampering/version;
- route parsing;
- `cacheScopeId` isolation;
- access epoch transitions;
- old epoch quarantine;
- command mutation policy;
- WS revoke terminal state;
- sensitive URL redaction.

### 14.2. Frontend persistence tests

- same board teacher/guest produce separate heads/queues;
- two invitations same board have separate guest scopes;
- reload resumes correct scope;
- legacy Dexie migration preserves data;
- failed migration enters explicit recovery;
- corrupt pending record quarantined;
- read-only downgrade quarantines stale guest pending;
- write restore does not resurrect stale pending;
- rotate/revoke invalidates old scope.

### 14.3. PostgreSQL integration

- standalone create/list/update;
- owner/tenant isolation;
- invitation uniqueness;
- concurrent rotate/revoke;
- concurrent write switch;
- legacy board migration;
- revision/idempotency/Lamport invariants;
- snapshot recovery;
- soft delete/purge;
- access version monotonicity.

### 14.4. Redis/WebSocket integration

- one-time ticket consumption;
- wrong-board/wrong-client ticket rejection;
- presence lifecycle;
- multi-process Pub/Sub;
- active revoke;
- read-only capability change;
- Redis restart/reconnect;
- size/rate enforcement;
- ticket query redaction.

### 14.5. Security tests

- brute force/rate limit;
- raw invitation token absent from DB/log/metrics/Sentry/traces;
- WS ticket absent from persistent logs/traces;
- guest CSRF;
- Origin mismatch;
- forged cookie;
- replayed WS ticket;
- cross-board enumeration;
- guest management denial;
- cache/referrer/robots headers;
- CSP/dependency audit;
- teacher+guest cookie coexistence;
- guest route deep-link denial.

### 14.6. Browser release E2E

Минимальный Chromium + Firefox gate:

1. Teacher login.
2. Create standalone board.
3. Create invitation «Ксения».
4. New isolated browser context opens link without login screen.
5. Both clients load revision `0`.
6. Both draw/move different objects concurrently.
7. Presence/cursors/previews visible.
8. Guest reload restores same board.
9. Guest edits offline.
10. Teacher enables read-only before guest reconnect.
11. Guest reconnects; old offline writes do not auto-apply.
12. Teacher restores write; only new commands sync.
13. Guest cannot open neighboring board id.
14. Teacher rotates invitation; old session loses authorization according to
    contract.
15. New invitation opens same board.
16. Teacher revokes active invitation; active guest reaches terminal access
    screen and does not reconnect-loop.
17. Teacher exports final board.
18. Same board opened under teacher and guest contexts does not share local
    durable cache scope.

Manual staging matrix before production: Edge/Chrome/Safari/iPad as available.

### 14.7. Load/chaos

- 100 concurrent WS clients;
- at least 50 teacher/student pairs on independent boards;
- drawing/transform preview burst;
- reconnect storm after Redis restart;
- permission-change storm on subset of rooms;
- PostgreSQL connection exhaustion protection;
- disk warning;
- container/VM restart;
- backup under moderate activity;
- restore followed by checksum/revision validation.

## 15. Observability and SLO

Initial targets after staging calibration:

| Показатель | Цель |
| ---------- | ---- |
| HTTPS availability | >= 99.5% / month |
| accepted command after `2xx` | never lost |
| join exchange p95 | <= 500 ms |
| command commit p95 | <= 750 ms excluding client network |
| presence/preview delivery p95 | <= 500 ms |
| reconnect to converged state p95 | <= 10 s |
| access revoke propagation p95 | <= 2 s target, calibrate staging |
| backup RPO | <= 24 h |
| verified restore RTO | <= 2 h |

Metrics:

- active WS by principal/role;
- join success/failure reason without token;
- invitation issued/active/revoked/expired;
- read-only/revoke propagation latency;
- command commit/conflict/idempotent retry;
- stale-access-epoch quarantine count;
- reconnect/convergence duration;
- Redis/PostgreSQL/S3 health;
- snapshot age/failure;
- queue/quarantine age;
- backup age/result;
- CPU/memory/disk/container restarts.

Alerts:

- readiness unavailable;
- join failure spike;
- WS disconnect spike;
- command conflict spike;
- access revoke propagation failure;
- stale pending/quarantine growth;
- PostgreSQL/Redis unavailable;
- snapshot/backup too old;
- low disk;
- restore verification failure.

## 16. Migration and compatibility

### 16.1. Safe migration order

1. Merge B0 contracts.
2. Merge T0 architectural preparation while standalone remains disabled.
3. Apply additive backend B1 schema.
4. Deploy backend understanding both legacy and standalone rows.
5. Add B2 guest access behind feature flag.
6. Release T1 dual launch parser/context-first bootstrap.
7. Enable standalone creation only after backend readiness.
8. Release T2 management/invitation UX.
9. Enable B3/T3 live permission events.
10. Observe legacy traffic before removing lesson-specific compatibility.

### 16.2. Rollback rules

- database changes additive until after production stabilization;
- old backend must tolerate new nullable/additive columns where possible;
- invitation table may remain unused after app rollback;
- frontend rollback never deletes server data;
- Dexie migration has explicit recovery and does not silently discard queues;
- image digests for previous release always retained;
- failed smoke switches proxy back to previous slot;
- irreversible cleanup never shares PR with contract migration.

## 17. Board-only Yandex Cloud deployment

### 17.1. Environment isolation

Staging и production имеют отдельные:

- Terraform state;
- VM/static IP;
- DNS;
- security group;
- Lockbox secret;
- PostgreSQL data volume/database credentials;
- Object Storage bucket/prefix;
- S3 credentials;
- application secrets;
- GitHub Environment/runner controls.

### 17.2. Network

- public TCP 80/443 and UDP 443 where HTTP/3 enabled;
- SSH only narrow CIDR/VPN;
- PostgreSQL/Redis/internal metrics not public;
- outbound HTTPS for GHCR/S3/optional GeometryOS;
- Caddy only public ingress.

### 17.3. Secrets

Minimum production Lockbox:

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

Terraform stores only secret IDs, not payload. VM service account has minimal
`lockbox.payloadViewer` permission for its environment only.

## 18. Risks and mitigations

| Риск | Решение |
| ---- | ------- |
| Invitation forwarded | revoke/rotate, TTL, per-invite audit |
| Raw token in access log | `/j/*` path suppression/redaction + tests |
| WS ticket in query log | query redaction + 30s one-time ticket |
| Preview bot opens link | reusable invitation until revoke/expiry |
| Guest cookie stolen | Secure/HttpOnly/SameSite, short TTL, version revoke |
| Teacher/guest cookie collision | deterministic teacher precedence + context-driven UI |
| Teacher and guest share Dexie state | principal-scoped `cacheScopeId` |
| Old offline writes apply after read-only | local `accessEpoch` quarantine before reconnect push |
| UI stale after revoke | server checks each write/ticket + WS revoke event |
| Revoked WS reconnect loop | terminal client state for `4403/access.revoked` |
| Two devices same guest | same actor, distinct `originId`, existing Lamport ordering |
| Multiple invitations need different write | per-invitation `write_enabled` + board global kill switch |
| Legacy board broken by migration | additive schema + dual read + migration tests |
| Backend duplicated | board-only profile of existing API until stabilization |
| Redis restart | reconnect + authoritative recovery from PostgreSQL/snapshots |
| VM loss | off-host backup + restore drill + immutable deployment |

## 19. Definition of Done первой публичной версии

Release считается завершённым только если одновременно выполнены условия:

- teacher создаёт standalone board из production UI;
- invitation использует >=256 bits entropy;
- raw token нигде не хранится и не логируется;
- WS ticket не остаётся в persistent logs/traces;
- guest открывает board без account/login screen;
- guest principal ограничен board/invitation scope;
- teacher/guest local durable state изолирован `cacheScopeId`;
- teacher/student одновременно редактируют без divergence;
- offline/reconnect сохраняет допустимые pending edits;
- read-only/revoke не позволяют stale pending автоматически примениться позже;
- server-authoritative read-only и revoke работают для HTTP и active WS;
- revoke приводит к terminal guest state без reconnect loop;
- neighboring boards не перечисляются/не раскрываются;
- guest routes не монтируют teacher management UI;
- Chromium/Firefox E2E, security, migration и load gates зелёные;
- runtime использует immutable image digests;
- staging прошёл soak, reboot, Redis/PostgreSQL restart, backup и isolated
  restore;
- production имеет TLS, dashboards, alerts, budget и audit trail;
- rollback на предыдущие digests проверен;
- runbook позволяет другому оператору восстановить сервис без устных знаний.

## 20. Немедленная последовательность работ

Порядок исполнения после этого документа:

1. **B0** — зафиксировать ADR/OpenAPI/context/capability/access-epoch contracts в
   обоих repos.
2. **T0** — подготовить TutorBoard: remove lesson from sync core, split
   repositories, principal-scoped Dexie, mutation policy, terminal access state.
3. **B1** — additive standalone board migration и owner CRUD.
4. **B2** — invitation, guest cookie/context, capability enforcement и rate
   limits.
5. **T1** — `/b/<id>`, context-first bootstrap и guest-safe routing.
6. **T2** — teacher `/boards`, invitation UX, per-invite/global read-only.
7. **B3/T3** — live revoke/read-only, access epoch reconnect gate и real
   two-client E2E.
8. **D1** — board-only compose/Caddy/backup stack.
9. **D2** — immutable release, SBOM/vuln scan, browser/security gates.
10. **D3** — Yandex Cloud staging, load/chaos/restore/24h soak.
11. **D4** — manual-approved production rollout with verified rollback.

Production apply запрещён до завершения B0, T0, B1, B2, T1, T2, B3/T3, D1 и
D2, а также до зелёного staging preflight/restore/soak.

## 21. Практический критерий выбора следующей задачи

При конфликте backlog priorities используется следующий порядок:

```text
security/access correctness
    > data durability/convergence
    > migration/rollback safety
    > guest/teacher UX completeness
    > observability/deployment
    > optional features
```

Новая feature не должна расширять public surface до закрытия security и
persistence gates соответствующего предыдущего PR.
