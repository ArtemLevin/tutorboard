# TutorBoard standalone: execution plan и Board-only Production Profile

> Статус документа: основной execution plan.
>
> Последнее обновление: 2026-08-21.
>
> Документ синхронизирован с фактическим состоянием `main` после завершения
> standalone contracts, backend persistence/guest access, standalone launch,
> teacher board workspace и test hardening. Следующий основной delivery scope —
> **Board-only Production Profile** и его production release gate.
>
> Исторические планы по полотну, GeometryOS, Smart Ink и lesson-bound интеграциям
> остаются в `docs/DEVELOPMENT_PLAN.md` и профильных ADR/документах в
> `docs/architecture/`. Этот файл определяет текущий порядок работ для публичного
> standalone TutorBoard.

## 1. Продуктовая цель

TutorBoard разворачивается как самостоятельный продукт для преподавателя и
ученика:

1. Преподаватель авторизуется.
2. Преподаватель создаёт независимую доску в `/boards`.
3. Преподаватель выпускает invitation link.
4. Ученик открывает ссылку без аккаунта и login form.
5. Ссылка обменивается на board-scoped guest session.
6. Преподаватель и ученик совместно работают в `/b/<boardId>#/board`.
7. Backend остаётся authority для read/write/revoke/rotate/archive/delete.
8. Подтверждённые board revisions переживают reconnect/restart и не зависят от
   ephemeral Redis state.
9. Production deployment публикует только board runtime surface, а не весь
   Tutor Assistant product.

Анонимное создание досок не допускается. Владение, аудит, revoke и восстановление
данных привязаны к authenticated teacher principal.

## 2. Неподвижные архитектурные инварианты

Следующие решения считаются обязательными:

1. **Revision protocol не переписывается.** Сохраняются command envelope `1.5`,
   sequential server revisions, SHA-256 validation, idempotency, Lamport
   metadata, snapshots, pull/rebase/push и conflict recovery.
2. **`BoardSyncEngine` синхронизирует существующую доску, но не создаёт её.**
   Board creation принадлежит management/API layer.
3. **Backend — единственный authority для capabilities.** UI может скрывать
   controls, но каждый write/ticket/invite/archive/delete повторно проверяется
   сервером.
4. **Browser durable state изолирован по principal/access scope.** Teacher и
   guest одной доски не используют один security scope.
5. **Access epoch защищает offline queue.** Старые pending commands не
   auto-push'ятся после revoke/read-only downgrade.
6. **Revoke терминален для guest client.** `access.revoked`/`4403` не должен
   запускать reconnect loop.
7. **Raw invitation secret не становится runtime identifier.** После
   `/j/<secret>` он исчезает из URL и не сохраняется в browser storage.
8. **WebSocket ticket остаётся короткоживущим one-time credential** и не
   попадает в persistent logs/traces.
9. **Guest shell и production proxy используют least privilege.** Недостаточно
   скрыть UI: лишние backend routes не должны быть зарегистрированы или
   опубликованы.
10. **Backward compatibility full runtime сохраняется.** Board-only profile не
    должен ломать legacy lesson-bound deployment.

## 3. Фактический статус на 2026-08-21

### 3.1. Завершённые milestones

| Milestone | Статус | Результат |
| --- | --- | --- |
| B0 | DONE | frozen standalone-board contracts, capability model, ADR |
| T0 | DONE | frontend security/architecture preparation |
| B1 | DONE | standalone board persistence и owner-scoped CRUD |
| B2 | DONE | invitation, guest session, capabilities, revoke/rotate |
| T1 | DONE | `/b/<boardId>`, context-first standalone launch |
| T2 | DONE | `/boards` teacher workspace и invitation management |
| Test audit | DONE | runtime contract parser unified; 750 Vitest tests green in PR #121 |

T1/T2 standalone flow уже поддерживает teacher management и guest-link launch.
Backend B1/B2 уже содержит standalone persistence, invitation/session model,
server-authoritative capability checks и collaboration integration.

### 3.2. Открытые delivery gaps

До production GO остаются два связанных направления:

1. **B3/T3 convergence/access hardening release gate**
   - live capability downgrade/revoke;
   - reconnect context refresh;
   - stale access-epoch pending quarantine;
   - two-browser verification для read-only/revoke/offline/reconnect.
2. **D1–D4 Board-only Production Profile**
   - strict backend composition;
   - minimal router/provider surface;
   - board-only Compose/Caddy;
   - immutable release pipeline;
   - staging/restore/chaos;
   - production rollout.

### 3.3. Root cause текущего deployment gap

Существующий backend умеет standalone boards, но production composition пока не
является board-only:

- module `boards` зависит от `scheduling`;
- `scheduling` зависит от `students`;
- `students` зависит от `identity`;
- текущий `boards/routes.py` смешивает standalone, legacy lesson, evidence и
  GeometryOS routes;
- `build_container()` создаёт full-product providers независимо от того,
  используются ли их routers;
- существующий production Compose запускает full Tutor Assistant stack;
- текущий Caddy production template направляет в TutorBoard только `/board/*`,
  но standalone product требует также `/boards` и `/b/*`.

Следовательно, `ENABLED_MODULES=boards` **не является** Board-only Production
Profile и не должен использоваться как production shortcut.

## 4. Целевая Board-only архитектура

```text
Internet
   |
 HTTPS
   |
 Caddy
   |
   +-- /, /boards, /b/*, /board/* -------> TutorBoard UI
   |
   +-- /login, /logout ------------------> Board API
   |
   +-- /j/* -----------------------------> Board API
   |
   +-- /api/v1/boards/* -----------------> Board API
   |          |
   |          `-- WebSocket collaboration
   |
   +-- /health/*, /metrics --------------> Board API
   |
   `-- everything else ------------------> 404

Board API: APP_PROFILE=board
   |
   +-- PostgreSQL
   +-- Redis
   `-- S3-compatible object storage
```

### 4.1. Разрешённый runtime surface

Board profile включает только:

```text
identity
audit
standalone boards
guest access
board sync
board collaboration
health
metrics
```

### 4.2. Исключённый runtime surface

В базовом board profile не должны устанавливаться/запускаться:

```text
students
scheduling
classroom
BBB
materials
transcription
portal
automation
general Celery workers
scheduler
ClamAV
GeometryOS
DocumentEngine
```

GeometryOS может быть добавлен позже как отдельный explicit opt-in profile или
отдельный pinned deployment capability; он не входит в минимальный v1 runtime.

### 4.3. Источники истины

- PostgreSQL: board metadata, command journal, invitations, audit.
- Redis: collaboration tickets, presence, Pub/Sub, ephemeral coordination/rate
  limits.
- Object storage: canonical snapshots и off-host backups.

Redis не является durable source of truth. Его потеря может прервать live
collaboration, но не должна потерять принятые revisions.

## 5. Runtime profile contract

Добавить first-class configuration:

```text
APP_PROFILE=full   # default, существующее поведение
APP_PROFILE=board  # strict standalone runtime
```

### 5.1. Правила

- unset `APP_PROFILE` эквивалентен `full`;
- `full` сохраняет текущее поведение;
- `board` использует фиксированный allowlist composition;
- неизвестный profile вызывает startup failure;
- `board` нельзя расширять произвольным `ENABLED_MODULES`;
- конфликтующая конфигурация должна fail fast до открытия listener.

`APP_PROFILE=board` не является alias для `ENABLED_MODULES=boards`.

### 5.2. Production validation

Для `board` обязательны:

- PostgreSQL + `postgresql+psycopg`;
- `AUTO_MIGRATE=false`;
- strong durable `APP_SECRET_KEY`;
- HTTPS `PUBLIC_BASE_URL`;
- explicit `TRUSTED_HOSTS`;
- explicit trusted proxy ranges;
- secure session cookies;
- Redis;
- S3-compatible artifact/snapshot storage;
- board rate limits;
- production teacher bootstrap credentials или существующий teacher account;
- backup configuration.

Не должны требоваться:

- BBB credentials;
- transcription provider;
- DocumentEngine;
- materials provider;
- ClamAV;
- GeometryOS.

## 6. D1.1 — разделение standalone и legacy Board API routes

Текущий mixed `modules/boards/routes.py` необходимо декомпозировать по
responsibility. Конкретные имена файлов могут быть скорректированы по фактическим
imports, но target ownership должен быть явным:

```text
modules/boards/
  standalone_routes.py
  sync_routes.py
  legacy_routes.py
  evidence_routes.py
  geometry_gateway.py
  route_support.py
```

### 6.1. Board profile routes

Разрешаются:

```text
GET    /api/v1/boards/context

POST   /api/v1/boards
GET    /api/v1/boards
PATCH  /api/v1/boards/{id}
POST   /api/v1/boards/{id}/archive
POST   /api/v1/boards/{id}/unarchive
DELETE /api/v1/boards/{id}

POST   /api/v1/boards/{id}/invitations
GET    /api/v1/boards/{id}/invitations
PATCH  /api/v1/boards/{id}/invitations/{invite}
POST   /api/v1/boards/{id}/invitations/{invite}/revoke
POST   /api/v1/boards/{id}/invitations/{invite}/rotate

GET    /j/{secret}

GET    /api/v1/boards/{id}
GET    /api/v1/boards/{id}/commands
POST   /api/v1/boards/{id}/commands
POST   /api/v1/boards/{id}/snapshots
POST   /api/v1/boards/{id}/collaboration-ticket
WS     /api/v1/boards/{id}/collaboration
```

Фактический allowlist должен генерироваться из production router inventory,
а не поддерживаться только документацией.

### 6.2. Full-only routes

В board profile не должны регистрироваться:

```text
/api/v1/lessons/*
student-specific board routes
board evidence endpoints
classroom routes
materials routes
portal routes
GeometryOS gateway
```

Ожидаемое поведение — route отсутствует (`404`), а не `403`.

## 7. D1.2 — разделение access policy

Текущий access policy знает одновременно standalone guest, tutor/admin,
student/parent и `StudentAccess`.

Целевая модель:

```text
StandaloneBoardAccessPolicy
LegacyBoardAccessPolicy
```

`StandaloneBoardAccessPolicy` знает только:

- teacher admin/tutor ownership;
- guest `boardId`;
- guest capabilities;
- archived/deleted state;
- read/write/manage.

Он не должен импортировать `StudentAccess`, scheduling или classroom domain.

Legacy policy сохраняет существующее lesson-bound поведение.

## 8. D1.3 — минимальный composition container

Отключение router недостаточно. `APP_PROFILE=board` не должен конструировать
ненужные full-product providers.

Предпочтительная безопасная реализация:

```text
build_full_container(...)
build_board_container(...)
```

Board container создаёт только необходимые компоненты:

```text
Database
WebSupport
IdentityService
AuditService factory
BoardPersistenceService factory
BoardGuestAccessService
S3 ArtifactStorage
CollaborationBroker
```

Не должны создаваться:

```text
BigBlueButtonClient
MaterialGenerator
TranscriptionProvider
DocumentEngine
ClassroomService dependencies
Automation services
CeleryJobDispatcher
```

Если transitional type требует полного container interface, допускаются только
explicit unavailable adapters, которые fail loudly при вызове. Silent no-op
providers запрещены.

Redis/distributed collaboration остаётся обязательным даже при отсутствии
Celery.

## 9. D1.4 — board-only production Compose

Создать отдельный deployment descriptor, например:

```text
compose.board.production.yml
deploy/board-production/
```

Не усложнять существующий full `compose.production.yml` множеством условных
profiles.

### 9.1. Обязательные services

```text
caddy

board-api-blue
board-api-green

tutorboard-blue
tutorboard-green

migration

postgres
redis

object-storage / external S3
object-storage-init, если storage локальный

backup
ops
```

Observability может быть вынесена в отдельный optional profile:

```text
prometheus
grafana
otel-collector
```

### 9.2. Запрещённые services

Board-only Compose не содержит:

```text
worker
scheduler
BBB
transcription
materials
DocumentEngine
ClamAV
portal
```

Production Object Storage предпочтительно внешний. Встроенный MinIO допустим
для local/staging integration, но не должен становиться единственной off-host
backup destination.

## 10. D1.5 — Caddy routing и default deny

Public routing должен быть explicit:

```text
/login
/logout
/j/*
/api/v1/boards/*
/health/*
/metrics
        -> Board API

/
/boards
/boards/*
/b/*
/board/*
        -> TutorBoard UI
```

`/board/*` нужен для static Vite assets; `/boards` и `/b/*` должны использовать
SPA fallback.

После explicit handles:

```text
everything else -> 404
```

Нельзя оставлять общий backend fallback, который случайно опубликует новые
full-product routes.

## 11. D1.6 — secret-safe proxy/logging contract

P0 security invariant:

- raw `/j/{secret}` не хранится в persistent access logs;
- WebSocket `ticket` query не хранится в logs/traces/error reporting;
- join response остаётся `Cache-Control: no-store`;
- `Referrer-Policy: no-referrer`;
- `X-Robots-Tag: noindex, nofollow`.

Добавить automated sentinel test:

```text
/j/INVITATION_SECRET_SENTINEL
?ticket=WS_TICKET_SECRET_SENTINEL
```

После запросов собрать Caddy/API/OTel logs и доказать отсутствие sentinel
значений.

Privacy test должен выполняться в CI/staging; ручной review конфигурации
недостаточен.

## 12. D1.7 — readiness и durability

Board API readiness должна проверять только критические board dependencies:

```text
PostgreSQL
Redis
object/snapshot storage
```

`/health/live` проверяет процесс.
`/health/ready` должен становиться unhealthy, если сервис не может безопасно
обслуживать production board workload.

Durability invariants:

- подтверждённый command после `2xx` не теряется;
- Redis restart не теряет accepted revisions;
- API restart не теряет board state;
- snapshot digest проверяется;
- backup/restore сохраняет board revision и invitation metadata.

### 12.1. Durable secret continuity

Существующий guest access использует server secret material для invitation
digest/session signing. Поэтому production secret является частью recovery
contract.

Backup/restore runbook обязан сохранять continuity ключей. Нельзя генерировать
новый production secret при каждом deploy.

## 13. D1.8 — TutorBoard board-only build configuration

Board-only deployment не должен показывать features, backend которых не
развёрнут.

Базовый v1 profile:

```text
server sync          ON
document snapshots   ON
GeometryOS           OFF
formula recognition  OFF, если sidecar не развернут
Smart Ink            OFF, если production dependency не развернута
```

Feature flags должны задаваться build/release configuration без fork frontend
code.

Existing full build defaults должны сохраниться для backward compatibility.

## 14. D1.9 — Board API image

Backend остаётся в `tutor-assistant-web`; отдельный repository сейчас не нужен.

Публикуется board-specific immutable image:

```text
ghcr.io/artemlevin/tutorboard-api:<release>@sha256:<digest>
```

Можно использовать тот же Dockerfile/runtime code, но deployment запускается с:

```text
APP_PROFILE=board
```

Release manifest фиксирует:

```text
backend git SHA
frontend git SHA
standalone-board contract version
database migration head
Board API image digest
TutorBoard image digest
```

Floating `latest` запрещён.

## 15. D1.10 — board profile CI contract

Добавить отдельный job, который проверяет composition независимо от full suite.

### 15.1. Configuration tests

Проверить:

```text
APP_PROFILE unset -> full
APP_PROFILE=full  -> full
APP_PROFILE=board -> strict board
unknown profile   -> startup failure
board + forbidden enabled module -> startup failure
```

### 15.2. Exact route inventory

Для `APP_PROFILE=board` получить фактические FastAPI routes и сравнить с
allowlist.

Тест должен одновременно доказывать отсутствие:

```text
/lessons
/students
/schedule
/classroom
/materials
/portal
GeometryOS routes
```

Использовать exact allowlist, а не только несколько deny assertions.

### 15.3. Composition inventory

Проверить exact installed module/provider set. Нельзя считать тест достаточным,
если он проверяет только `"portal" not in modules`.

## 16. D1.11 — integration test matrix

На реальных PostgreSQL + Redis + S3-compatible storage проверить:

1. teacher login;
2. create standalone board;
3. list/rename board;
4. create invitation;
5. guest join;
6. strict guest context;
7. teacher context;
8. initial snapshot;
9. command push/pull;
10. second-client convergence;
11. collaboration ticket;
12. WebSocket connect;
13. guest write;
14. global guest-write disable;
15. per-invitation read-only;
16. rotate;
17. revoke;
18. archive/restore;
19. soft delete;
20. API restart recovery;
21. Redis restart + reconnect;
22. storage failure readiness.

Ни один из этих сценариев не должен требовать scheduling/student/classroom
services.

## 17. B3/T3 — live access и offline convergence gate

Перед production public use должен быть закрыт следующий behavior:

### Backend

- `access.capabilities.changed`;
- `access.revoked`;
- WS close `4403`;
- server access version publication;
- ticket invalidation;
- multi-process Redis propagation.

### Frontend

- refresh context после capability event;
- terminal revoke state;
- no reconnect loop after revoke;
- access epoch check до reconnect push;
- quarantine stale pending;
- mutation boundary в read-only;
- возврат write не resurrect'ит old-epoch commands.

### Required E2E

```text
Teacher creates board + writable invitation
Guest opens link

Teacher edits -> Guest converges
Guest edits -> Teacher converges

Guest goes offline
Teacher edits
Teacher disables guest writes
Guest reconnects
Old guest pending is not auto-applied

Teacher re-enables write
Only new guest commands sync

Teacher rotates invitation
Old credential/link invalid according to contract

Teacher revokes active invitation
Guest socket reaches terminal revoked state
No reconnect loop
Teacher remains able to work
```

## 18. D2 — Board-only release workflow

Создать отдельный release workflow вместо расширения full-product release
pipeline:

```text
.github/workflows/board-release.yml
```

Pipeline:

```text
quality
  |
board-profile contract
  |
PostgreSQL + Redis + S3 integration
  |
two-client standalone E2E
  |
build Board API image
  |
build/resolve TutorBoard image
  |
SBOM + vulnerability scan
  |
non-root/read-only assertions
  |
board-only Compose validation
  |
staging deploy
  |
staging two-client smoke
  |
restart/reconnect drill
  |
backup/isolated restore drill
  |
manual production approval
  |
blue/green production deploy
  |
post-deploy smoke
  |
release manifest/tag
```

### 18.1. Supply-chain gates

Для обоих images:

- immutable digest;
- non-root runtime;
- read-only filesystem where applicable;
- `cap_drop: ALL`;
- `no-new-privileges`;
- Trivy HIGH/CRITICAL policy;
- SBOM;
- no floating `latest`.

## 19. D3 — staging

Staging имеет отдельные:

- Terraform state;
- VM/static IP;
- DNS;
- security group;
- secrets;
- PostgreSQL credentials;
- Redis credentials;
- object-storage bucket/prefix;
- GitHub Environment;
- backup destination.

До production выполнить:

- full teacher/guest E2E;
- Redis restart;
- API/container restart;
- VM reboot;
- PostgreSQL restart;
- real off-host backup;
- isolated restore;
- log secret scan;
- moderate collaboration load;
- 24h soak без unexplained divergence/disconnect loops.

Initial sizing проверяется измерением, а не фиксируется как production truth.

## 20. D4 — production rollout и rollback

### 20.1. Rollout

1. Freeze immutable backend/frontend digests.
2. Проверить migration head.
3. Выполнить pre-deploy backup.
4. Развернуть green board-only slot.
5. Проверить health/readiness.
6. Выполнить teacher/guest smoke.
7. Проверить invitation secret redaction.
8. Переключить Caddy на green.
9. Повторить smoke после switch.
10. Сохранить release manifest.

### 20.2. Rollback

Rollback должен быть application-level и не требовать database downgrade:

```text
Caddy -> previous known-good slot
```

Предыдущие digests и compatible schema сохраняются.

Irreversible schema cleanup не выполняется до production stabilization и не
объединяется с profile rollout.

## 21. Test strategy

### 21.1. Unit/configuration

- profile parsing;
- exact module graph;
- exact route inventory;
- standalone access policy;
- profile-specific production validation;
- feature flag mapping;
- sensitive URL redaction helpers.

### 21.2. PostgreSQL

- owner/tenant isolation;
- standalone CRUD;
- invitation uniqueness;
- concurrent rotate/revoke;
- revision/idempotency/Lamport invariants;
- access version monotonicity;
- soft delete/purge;
- migration compatibility.

### 21.3. Redis/WebSocket

- one-time ticket;
- wrong board/client rejection;
- presence lifecycle;
- multi-process Pub/Sub;
- active revoke;
- capability change;
- Redis restart;
- reconnect;
- query-secret redaction.

### 21.4. Browser

Chromium + Firefox release gate:

1. teacher login;
2. `/boards`;
3. create board;
4. create invitation;
5. fresh isolated guest context opens `/j/<secret>`;
6. redirect to `/b/<boardId>#/board`;
7. teacher/guest both edit;
8. guest offline/reconnect;
9. read-only while guest offline;
10. stale pending not applied;
11. write restored;
12. rotate;
13. revoke;
14. terminal guest state;
15. teacher continues;
16. teacher/guest local durable scopes remain isolated.

### 21.5. Security

- raw invitation absent from DB/log/metrics/traces;
- WS ticket absent from persistent logs/traces;
- guest CSRF;
- same-origin WebSocket;
- forged cookie;
- replayed ticket;
- cross-board enumeration;
- guest management denial;
- default-deny proxy routes;
- dependency/image scanning.

## 22. Risk matrix

| Priority | Риск | Regression guard |
| --- | --- | --- |
| P0 | Full/legacy routes доступны в board profile | exact route allowlist |
| P0 | `/boards` или `/b/*` идут не в SPA | production deep-link smoke |
| P0 | Invitation secret попадает в logs | sentinel log-redaction test |
| P0 | WS ticket попадает в logs | query sentinel test |
| P0 | Secret rotation ломает старые invitation digests | durable secret continuity + restore |
| P0 | Collaboration становится process-local | Redis multi-process integration |
| P0 | Guest пишет после revoke/read-only | HTTP + WS two-browser E2E |
| P0 | Old offline writes оживают после возврата write | access-epoch quarantine E2E |
| P1 | Full profile ломается из-за refactor | existing full CI unchanged |
| P1 | UI показывает service-backed feature без service | board build feature contract |
| P1 | snapshot storage down, readiness green | storage-aware readiness |
| P1 | blue/green ломает existing invitation | pre/post-switch invitation smoke |
| P2 | board image физически содержит unused Python modules | acceptable initially if not registered/constructed |
| P2 | duplicated generic/performance CI cost | optimize after correctness |

## 23. Definition of Done Board-only Production Profile

Profile считается реализованным, когда одновременно:

1. `APP_PROFILE=board` существует как first-class profile.
2. `APP_PROFILE=full` сохраняет current behavior.
3. Board route inventory соответствует exact allowlist.
4. Legacy lesson/student/classroom/materials/portal routes отсутствуют.
5. Unused full-product providers не конструируются.
6. BBB/transcription/DocumentEngine/ClamAV/GeometryOS не являются startup
   dependencies base profile.
7. Board-only Compose не запускает workers/scheduler/full-product services.
8. `/boards`, `/b/*`, `/board/*`, `/j/*`, `/api/v1/boards/*` маршрутизируются
   корректно.
9. Proxy default-deny доказан тестом.
10. Raw invitation и WS ticket не попадают в persistent logs.
11. PostgreSQL/Redis/S3 integration suite green.
12. API restart и Redis restart не теряют accepted revisions.
13. Read-only/revoke/rotate работают server-authoritatively.
14. Offline old-epoch pending не resurrect'ится.
15. Chromium/Firefox two-client E2E green.
16. Full-product regression suite остаётся green.
17. Board API и TutorBoard выпускаются immutable digest-pinned images.
18. Backup + isolated restore доказаны.
19. Staging прошёл restart/reconnect/log-redaction/restore/soak gates.
20. Production rollback на предыдущие digests проверен.

## 24. Текущая последовательность работ

Приоритет после обновления этого плана:

1. **D1.1** — ввести `APP_PROFILE` contract и exact module composition.
2. **D1.2** — разделить standalone и legacy Board API routes/access policy.
3. **D1.3** — минимизировать board container/providers.
4. **D1.4** — создать board-only production Compose.
5. **D1.5** — реализовать Caddy routing/default deny + secret redaction.
6. **D1.6** — readiness/durability/secret continuity tests.
7. **B3/T3 gate** — закрыть live read-only/revoke/offline convergence.
8. **D2** — отдельный board release workflow и immutable images.
9. **D3** — staging deployment, restart/restore/log scan/soak.
10. **D4** — manual-approved production rollout и verified rollback.

Production apply запрещён до закрытия P0/P1 release gates, green staging
preflight и свежего isolated restore drill.

## 25. Критерий выбора следующей задачи

При конфликте backlog priorities:

```text
security/access correctness
    > data durability/convergence
    > runtime isolation/attack surface
    > migration/rollback safety
    > guest/teacher UX completeness
    > observability/deployment
    > optional features
```

Новая optional feature не расширяет public surface до закрытия соответствующих
security, durability и deployment gates.
