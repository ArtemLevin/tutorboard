# TutorBoard standalone: Pilot-first execution plan и Board-only Production Profile

> Статус документа: основной execution plan.
>
> Последнее обновление: 2026-08-21.
>
> Документ синхронизирован с фактическим состоянием `main` и текущим
> cross-repository delivery в `tutor-assistant-web`. Ближайшая продуктовая цель —
> **как можно быстрее получить реальный HTTPS-сервер и провести controlled pilot
> с одним преподавателем и одним учеником**, не подменяя этим полный production
> release gate.
>
> После Pilot Gate проект возвращается к полному **Board-only Production Profile**:
> B3/T3 convergence hardening, immutable release pipeline, staging/restore/soak и
> production rollout.
>
> Исторические планы по полотну, GeometryOS, Smart Ink и lesson-bound интеграциям
> остаются в `docs/DEVELOPMENT_PLAN.md` и профильных ADR/документах в
> `docs/architecture/`. Этот файл определяет текущий порядок работ для standalone
> TutorBoard.

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

### 1.1. Два delivery gate

Проект разделяет два разных уровня готовности:

1. **Pilot Gate** — один контролируемый реальный сервер, один преподаватель и один
   ученик. Цель — проверить настоящий пользовательский сценарий на HTTPS-host и
   получить эксплуатационный feedback без объявления окружения production.
2. **Production Gate** — полный Board-only Production Profile с P0/P1 security,
   durability, release, staging, restore, soak и rollback требованиями.

Pilot Gate не отменяет и не ослабляет Production Gate. Он только выносит
минимально безопасный пользовательский тест перед более дорогим production
hardening.

## 2. Неподвижные архитектурные инварианты

Следующие решения обязательны и для pilot, и для production:

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
5. **Access epoch защищает offline queue.** Старые pending commands не должны
   автоматически применяться после revoke/read-only downgrade.
6. **Revoke терминален для guest client.** `access.revoked`/`4403` не должен
   запускать reconnect loop.
7. **Raw invitation secret не становится runtime identifier.** После
   `/j/<secret>` он исчезает из URL и не сохраняется в browser storage.
8. **WebSocket ticket остаётся короткоживущим one-time credential** и не
   попадает в persistent logs/traces.
9. **Guest shell и proxy используют least privilege.** Недостаточно скрыть UI:
   лишние backend routes не должны быть зарегистрированы или опубликованы.
10. **Backward compatibility full runtime сохраняется.** Board-only profile не
    должен ломать legacy lesson-bound deployment.
11. **Подтверждённый command после `2xx` не теряется.** Redis не является durable
    source of truth.
12. **Production secret material durable.** `APP_SECRET_KEY` не генерируется при
    каждом deploy и входит в backup/recovery contract.

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
| T3 foundation | MERGED | PR #123: refreshable standalone access context для reconnect/access convergence |

T1/T2 standalone flow уже поддерживает teacher management и guest-link launch.
Backend B1/B2 содержит standalone persistence, invitation/session model,
server-authoritative capability checks и collaboration integration.

### 3.2. Текущие release blockers

#### TutorBoard

`main` содержит PR #123, но финальный PR-head CI этого изменения завершился на
`format:check`: Prettier сообщил drift в
`src/adapters/board-http/standalone.ts`. Из-за этого downstream lint/typecheck/
unit/performance/architecture/build в том run не были выполнены.

Следствие: первый шаг Pilot Gate — вернуть текущий frontend HEAD в полный
зелёный `npm run check`. Нельзя считать release проверенным только потому, что
изменение уже merged.

#### tutor-assistant-web

Board-only composition развивается в draft PR #31
`feat: add strict board-only production profile`. В ветке уже присутствуют:

- `APP_PROFILE=full|board`;
- minimal board container;
- standalone-only access/router surface;
- board login/logout;
- board-specific readiness/metrics;
- `compose.board.production.yml`;
- `deploy/board-production/Caddyfile.template`;
- board profile CI contract.

Текущий `Board profile contract` run красный: один exact route/provider inventory
тест падает на `_IncludedRouter` без `.path`; после этого Compose/proxy/redaction
checks пропускаются.

Следствие: второй шаг Pilot Gate — исправить root cause inventory test/route
inspection и получить green board-profile gate, а не обходить проверку.

### 3.3. Почему текущий production stack нельзя использовать как shortcut

Существующий `tutor-assistant-web/main` production composition остаётся full
Tutor Assistant stack:

- `boards` связан с legacy/full-product dependencies;
- production container создаёт лишние providers;
- full Compose поднимает worker/scheduler и optional product services;
- текущий production Caddy направляет в TutorBoard только `/board/*`, тогда как
  standalone flow требует `/boards` и `/b/*`.

Следовательно, `ENABLED_MODULES=boards` и текущий full production Compose не
считаются допустимым Board-only deployment shortcut.

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

### 4.1. Источники истины

- PostgreSQL: board metadata, command journal, invitations, audit.
- Redis: collaboration tickets, presence, Pub/Sub, ephemeral coordination/rate
  limits.
- Object storage: canonical snapshots и backup artifacts.

Redis restart может оборвать live WebSocket connections, но не должен терять
accepted revisions.

### 4.2. Разрешённый runtime surface

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

### 4.3. Исключённый base runtime surface

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

GeometryOS, formula recognition и Smart Ink допускаются только как явные
opt-in dependencies и не входят в минимальный Pilot/Board v1 runtime.

## 5. Runtime profile contract

First-class configuration:

```text
APP_PROFILE=full   # default, существующее поведение
APP_PROFILE=board  # strict standalone runtime
```

Правила:

- unset `APP_PROFILE` эквивалентен `full`;
- `full` сохраняет текущее поведение;
- `board` использует фиксированный allowlist composition;
- неизвестный profile вызывает startup failure;
- `board` нельзя расширять произвольным `ENABLED_MODULES`;
- конфликтующая конфигурация fail fast до открытия listener;
- `APP_PROFILE=board` не является alias для `ENABLED_MODULES=boards`.

### 5.1. Обязательная board configuration

```text
PostgreSQL + postgresql+psycopg
AUTO_MIGRATE=false
strong durable APP_SECRET_KEY
HTTPS PUBLIC_BASE_URL
explicit TRUSTED_HOSTS
explicit trusted proxy ranges
SESSION_COOKIE_SECURE=true
Redis
S3-compatible artifact/snapshot storage
board rate limits
teacher bootstrap credentials или существующий teacher account
backup configuration
```

Не должны требоваться BBB, transcription, DocumentEngine, materials, ClamAV или
GeometryOS credentials.

## 6. D1 — Board-only runtime isolation

### 6.1. D1.1 — standalone и legacy routes

Board profile регистрирует только standalone management, invitation, sync,
collaboration, identity login/logout, health и metrics routes.

Разрешённый API surface включает:

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

В board profile отсутствуют (`404`, не `403`):

```text
/api/v1/lessons/*
student-specific board routes
board evidence endpoints
classroom routes
materials routes
portal routes
GeometryOS gateway
```

Exact allowlist строится из фактического FastAPI router inventory и закрепляется
автоматизированным тестом.

### 6.2. D1.2 — standalone access policy

Целевая модель:

```text
StandaloneBoardAccessPolicy
LegacyBoardAccessPolicy
```

`StandaloneBoardAccessPolicy` знает только teacher ownership, guest `boardId`,
guest capabilities, archived/deleted state и read/write/manage. Он не импортирует
`StudentAccess`, scheduling или classroom domain.

### 6.3. D1.3 — минимальный container

Board profile создаёт только необходимые компоненты:

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

Не создаются:

```text
BigBlueButtonClient
MaterialGenerator
TranscriptionProvider
DocumentEngine
ClassroomService dependencies
Automation services
CeleryJobDispatcher
```

Redis/distributed collaboration остаётся обязательным даже при отсутствии
Celery.

### 6.4. D1.4 — board-only Compose

Отдельный descriptor:

```text
compose.board.production.yml
deploy/board-production/
```

Production target допускает blue/green slots. Pilot target может использовать
одиночные `board-api` и `tutorboard` services на одной VM, если соблюдены Pilot
Gate требования ниже.

Board-only Compose не содержит worker/scheduler/BBB/transcription/materials/
DocumentEngine/ClamAV/portal services.

### 6.5. D1.5 — Caddy routing и default deny

Public routing explicit:

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

everything else
        -> 404
```

`/boards` и `/b/*` используют SPA fallback. Общий backend fallback запрещён.

### 6.6. D1.6 — secret-safe proxy/logging

P0 invariants:

- raw `/j/{secret}` не хранится в persistent access logs;
- WebSocket `ticket` query не хранится в logs/traces/error reporting;
- join response: `Cache-Control: no-store`;
- `Referrer-Policy: no-referrer`;
- `X-Robots-Tag: noindex, nofollow`.

Sentinel test:

```text
/j/INVITATION_SECRET_SENTINEL
?ticket=WS_TICKET_SECRET_SENTINEL
```

После запросов Caddy/API logs проверяются на отсутствие sentinel values.

### 6.7. D1.7 — readiness и durability

`/health/live` проверяет процесс.

`/health/ready` проверяет только критические board dependencies:

```text
PostgreSQL
Redis
object/snapshot storage
```

Durability invariants:

- accepted command после `2xx` переживает API restart;
- Redis restart не теряет accepted revisions;
- snapshot digest проверяется;
- backup сохраняет board revision и invitation metadata;
- `APP_SECRET_KEY` сохраняет continuity invitation/session cryptographic state.

### 6.8. D1.8 — TutorBoard board-only build

Минимальный Pilot/v1 frontend profile:

```text
server sync          ON
document snapshots   ON
GeometryOS           OFF
formula recognition  OFF
Smart Ink            OFF
```

Feature flags задаются release configuration без fork frontend code. Existing
full build defaults сохраняются.

### 6.9. D1.9 — immutable images и release manifest

Production release публикует digest-pinned Board API и TutorBoard images.

Pilot также фиксирует immutable image reference или, как минимум, точный image
digest после сборки; floating `latest` не используется как единственный способ
воспроизведения окружения.

Release manifest фиксирует:

```text
backend git SHA
frontend git SHA
standalone-board contract version
database migration head
Board API image digest
TutorBoard image digest
deployment date/environment
```

### 6.10. D1.10 — board profile CI contract

Отдельный job проверяет:

```text
APP_PROFILE unset -> full
APP_PROFILE=full  -> full
APP_PROFILE=board -> strict board
unknown profile   -> startup failure
board + forbidden enabled module -> startup failure
```

Дополнительно проверяется exact route inventory и exact installed
module/provider inventory.

Текущий failure PR #31 должен быть исправлен на уровне корректной route
inspection. Skip/xfail/ослабление exact inventory test не допускаются.

### 6.11. D1.11 — integration matrix

На PostgreSQL + Redis + S3-compatible storage production gate проверяет:

1. teacher login;
2. create/list/rename board;
3. create invitation;
4. guest join;
5. strict teacher/guest contexts;
6. snapshot и command push/pull;
7. second-client convergence;
8. collaboration ticket + WebSocket;
9. guest write;
10. global guest-write disable;
11. per-invitation read-only;
12. rotate;
13. revoke;
14. archive/restore;
15. soft delete;
16. API restart recovery;
17. Redis restart + reconnect;
18. storage failure readiness.

Ни один сценарий не требует scheduling/student/classroom services.

## 7. B3/T3 — live access и offline convergence Production Gate

Перед публичным production use закрывается полный behavior:

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

### Required production E2E

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

## 8. Pilot Deployment Gate — ближайшая delivery цель

### 8.1. Цель Pilot Gate

Получить один реальный HTTPS-host, открыть его преподавателю и одному ученику и
провести controlled lesson на настоящем standalone flow:

```text
teacher login
   -> /boards
   -> create board
   -> create invitation
   -> guest /j/<secret>
   -> /b/<boardId>#/board
   -> bidirectional collaboration
```

Окружение маркируется как `STAGING`/`PILOT`, не как production.

### 8.2. Что разрешено упростить для pilot

Чтобы pilot не блокировался production infrastructure work, разрешается:

- одна Linux VM вместо multi-node/blue-green;
- Docker Compose вместо Kubernetes;
- PostgreSQL, Redis и MinIO/S3-compatible storage на одной VM;
- один `board-api` container;
- один `tutorboard` container;
- Caddy на той же VM;
- без Prometheus/Grafana/OTel stack;
- без 24h soak;
- без полного chaos matrix;
- без production Terraform automation;
- без full Chromium + Firefox release matrix, если browser для pilot заранее
  выбран и smoke выполнен в отдельном guest context.

Эти упрощения не становятся production architecture. После pilot полный D2-D4
Gate остаётся обязательным.

### 8.3. Что нельзя упростить даже для pilot

Обязательны:

- HTTPS;
- `APP_PROFILE=board`;
- exact/default-deny routing;
- durable PostgreSQL;
- Redis для collaboration;
- durable `APP_SECRET_KEY`;
- secure session cookies;
- invitation/WS secret redaction;
- `AUTO_MIGRATE=false`;
- explicit migration step;
- off-host DB backup перед реальным lesson;
- teacher и guest в разных browser contexts;
- подтверждённый bidirectional sync;
- API restart persistence smoke;
- guest revoke smoke;
- фиксированные frontend/backend SHAs и image digests.

### 8.4. Pilot infrastructure

Минимальная topology:

```text
Internet
   |
 DNS + HTTPS
   |
 Caddy
   |
   +-- TutorBoard
   +-- Board API
          |
          +-- PostgreSQL
          +-- Redis
          `-- MinIO / S3-compatible storage

backup job
   `-- PostgreSQL dump -> off-host destination
```

Production object storage предпочтительно внешний. Для pilot локальный MinIO
допустим только при наличии off-host database backup и понимании, что это не
полный disaster-recovery design.

### 8.5. Pilot runtime configuration

Минимум:

```text
APP_ENV=production
APP_PROFILE=board
AUTO_MIGRATE=false
PUBLIC_BASE_URL=https://<pilot-host>
TRUSTED_HOSTS=<pilot-host>
SESSION_COOKIE_SECURE=true
DATABASE_URL=postgresql+psycopg://...
REDIS_URL=redis://...
strong persistent APP_SECRET_KEY
S3-compatible storage credentials
teacher bootstrap credentials
```

Frontend:

```text
server sync          ON
document snapshots   ON
GeometryOS           OFF
formula recognition  OFF
Smart Ink            OFF
```

### 8.6. Pilot deployment sequence

```text
P1  TutorBoard full quality gate green
    |
P2  board-profile backend gate green
    |
P3  APP_PROFILE=board + Compose/Caddy contract green
    |
P4  provision VM + DNS + HTTPS
    |
P5  explicit migration + teacher account
    |
P6  teacher /boards smoke
    |
P7  invitation + guest join smoke
    |
P8  bidirectional collaboration smoke
    |
P9  refresh/reconnect smoke
    |
P10 revoke smoke
    |
P11 API restart persistence smoke
    |
P12 off-host backup + release manifest
    |
CONTROLLED PILOT LESSON
```

### 8.7. P1 — TutorBoard quality gate

Исправить known formatting failure и выполнить реальные проектные команды:

```text
npm run format:check
npm run lint
npm run typecheck
npm run test
npm run performance
npm run architecture
npm run build
npm run check
```

Exit criterion: свежий полный quality gate green на pilot frontend SHA.

### 8.8. P2/P3 — backend board profile gate

Исправить exact route inventory failure PR #31, затем выполнить board profile
contract, Compose validation, Caddy/proxy contract и secret-redaction checks.

Exit criterion:

- `APP_PROFILE=board` запускается;
- route allowlist exact;
- full-only routes отсутствуют;
- forbidden providers не создаются;
- board-only Compose валиден;
- proxy routes `/boards`, `/b/*`, `/j/*`, `/api/v1/boards/*` корректны;
- sentinel secrets отсутствуют в persistent logs.

### 8.9. P4/P5 — реальный host, миграции и teacher

Provision one VM, DNS и TLS. Миграции запускаются отдельно от API startup:

```text
backup/preflight
   -> migration container
   -> verify migration head
   -> start Board API
```

`AUTO_MIGRATE=true` на real pilot host запрещён.

После запуска проверить:

```text
/login
-> authenticated teacher
-> /boards
-> create board
-> list/rename board
```

### 8.10. P6-P8 — настоящий teacher/guest smoke

Browser A — authenticated teacher.

Browser B — fresh incognito/isolated profile.

Сценарий:

```text
Teacher creates board
Teacher creates writable invitation
Guest opens /j/<secret>
Guest is redirected to /b/<boardId>#/board
Raw invitation secret disappears from URL

Teacher draws A -> Guest sees A
Guest draws B   -> Teacher sees B

Teacher refresh -> A + B remain
Guest refresh   -> A + B remain
```

### 8.11. P9 — reconnect smoke

Минимум до первого lesson:

```text
Guest connected
Guest temporarily loses network
Teacher changes board
Guest reconnects
Both clients converge
```

Полный read-only/offline-old-epoch scenario остаётся B3/T3 Production Gate, но
обычный reconnect не должен терять confirmed state или приводить к divergence.

### 8.12. P10 — revoke smoke

```text
Guest connected
Teacher revokes invitation
Guest loses access
Guest does not enter reconnect loop
Teacher continues to work
```

Если revoke не работает терминально, Pilot Gate закрыт.

### 8.13. P11 — persistence/restart smoke

После совместного редактирования:

```text
record board/revision
restart Board API
reopen board
verify content/revision
```

Затем отдельным smoke допустимо restart Redis и проверить reconnect. Потеря
presence/WebSocket допустима; потеря accepted revisions — нет.

### 8.14. P12 — backup и Pilot Release Manifest

До первого lesson выполнить off-host PostgreSQL backup.

Сохранить continuity secrets/config и manifest:

```yaml
frontend_git_sha: <sha>
backend_git_sha: <sha>
frontend_image: <image>@sha256:<digest>
backend_image: <image>@sha256:<digest>
database_migration: <head>
standalone_board_contract: <version>
environment: pilot
deployment_date: <date>
```

Floating `latest` не считается release record.

### 8.15. Pilot Definition of Done

Controlled pilot разрешён только если одновременно:

| Gate | Требование |
| --- | --- |
| P1 | TutorBoard `npm run check` green |
| P2 | Backend board-profile tests green |
| P3 | `APP_PROFILE=board` + Compose/Caddy/redaction contract green |
| P4 | Real DNS + HTTPS работают |
| P5 | Teacher login и `/boards` работают |
| P6 | Teacher создаёт board |
| P7 | Teacher создаёт invitation, guest проходит `/j/...` -> `/b/...` |
| P8 | Teacher <-> Guest realtime edits работают |
| P9 | Refresh/reconnect сохраняет convergence |
| P10 | Revoke терминально отключает guest |
| P11 | API restart не теряет board state |
| P12 | Off-host backup и release manifest созданы |

Если любой P1-P12 не выполнен, реальный lesson не проводится до устранения
дефекта.

### 8.16. Что не блокирует первый pilot

Следующие production tasks сознательно выполняются после Pilot Gate, если они не
нужны для устранения конкретного pilot blocker:

```text
24h soak
full chaos/restart matrix
blue/green production slots
full observability stack
multi-node API
moderate/high load test
full Chromium + Firefox production matrix
complete SBOM/release automation
isolated full disaster-recovery drill
production Terraform
formal D2/D3/D4 pipeline
```

## 9. D2 — Board-only release workflow

После успешного pilot создаётся/завершается отдельный production workflow:

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

Supply-chain gates для обоих images:

- immutable digest;
- non-root runtime;
- read-only filesystem where applicable;
- `cap_drop: ALL`;
- `no-new-privileges`;
- Trivy HIGH/CRITICAL policy;
- SBOM;
- no floating `latest`.

## 10. D3 — production staging после pilot

Production staging имеет отдельные:

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
- full B3/T3 read-only/rotate/revoke/offline-old-epoch matrix;
- Redis restart;
- API/container restart;
- VM reboot;
- PostgreSQL restart;
- real off-host backup;
- isolated restore;
- log secret scan;
- moderate collaboration load;
- 24h soak без unexplained divergence/disconnect loops.

Pilot VM может быть переиспользована только если её состояние/configuration
доказуемо соответствует production staging contract. По умолчанию pilot и
production staging считаются разными delivery states.

## 11. D4 — production rollout и rollback

### 11.1. Rollout

1. Freeze immutable backend/frontend digests.
2. Проверить migration head.
3. Выполнить pre-deploy backup.
4. Развернуть green board-only slot.
5. Проверить health/readiness.
6. Выполнить teacher/guest smoke.
7. Проверить invitation/WS secret redaction.
8. Переключить Caddy на green.
9. Повторить smoke после switch.
10. Сохранить release manifest.

### 11.2. Rollback

Rollback application-level и не требует database downgrade:

```text
Caddy -> previous known-good slot
```

Предыдущие digests и compatible schema сохраняются. Irreversible schema cleanup
не объединяется с profile rollout и не выполняется до stabilization.

## 12. Test strategy

### 12.1. Unit/configuration

- profile parsing;
- exact module graph;
- exact route inventory;
- standalone access policy;
- profile-specific production validation;
- feature flag mapping;
- sensitive URL redaction helpers.

### 12.2. PostgreSQL

- owner/tenant isolation;
- standalone CRUD;
- invitation uniqueness;
- concurrent rotate/revoke;
- revision/idempotency/Lamport invariants;
- access version monotonicity;
- soft delete/purge;
- migration compatibility.

### 12.3. Redis/WebSocket

- one-time ticket;
- wrong board/client rejection;
- presence lifecycle;
- multi-process Pub/Sub;
- active revoke;
- capability change;
- Redis restart;
- reconnect;
- query-secret redaction.

### 12.4. Browser — Pilot Gate

Минимальный real-host browser contract:

1. teacher login;
2. `/boards`;
3. create board;
4. create invitation;
5. isolated guest opens `/j/<secret>`;
6. redirect to `/b/<boardId>#/board`;
7. teacher/guest both edit;
8. refresh;
9. temporary disconnect/reconnect;
10. revoke;
11. terminal guest state;
12. teacher continues.

### 12.5. Browser — Production Gate

Chromium + Firefox:

1. teacher login;
2. `/boards`;
3. create board;
4. create invitation;
5. fresh isolated guest join;
6. teacher/guest both edit;
7. guest offline;
8. teacher disables write;
9. stale pending not applied;
10. write restored;
11. only new guest commands sync;
12. rotate;
13. revoke;
14. terminal guest state;
15. teacher continues;
16. teacher/guest local durable scopes remain isolated.

### 12.6. Security

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

## 13. Risk matrix

| Priority | Риск | Regression guard |
| --- | --- | --- |
| P0 | Pilot ошибочно объявлен production | отдельные Pilot/Production DoD и environment marker |
| P0 | Full/legacy routes доступны в board profile | exact route allowlist |
| P0 | `/boards` или `/b/*` идут не в SPA | real-host deep-link smoke |
| P0 | Invitation secret попадает в logs | sentinel log-redaction test |
| P0 | WS ticket попадает в logs | query sentinel test |
| P0 | Guest остаётся активным после revoke | HTTP + WS two-browser revoke smoke |
| P0 | Accepted revision теряется после API restart | persistence restart smoke |
| P0 | Secret continuity теряется при deploy | durable APP_SECRET_KEY + backup contract |
| P0 | Guest пишет после revoke/read-only | production HTTP + WS E2E |
| P0 | Old offline writes оживают после возврата write | access-epoch quarantine E2E |
| P1 | Full profile ломается из-за refactor | existing full CI unchanged |
| P1 | UI показывает feature без backend | board build feature contract |
| P1 | snapshot storage down, readiness green | storage-aware readiness |
| P1 | Pilot data остаётся только на одной VM | off-host database backup |
| P1 | blue/green ломает existing invitation | pre/post-switch invitation smoke |
| P2 | board image содержит unused Python modules | acceptable initially if not registered/constructed |
| P2 | duplicated generic/performance CI cost | optimize after correctness |

## 14. Definition of Done Board-only Production Profile

Production Profile считается реализованным, когда одновременно:

1. `APP_PROFILE=board` существует как first-class profile.
2. `APP_PROFILE=full` сохраняет current behavior.
3. Board route inventory соответствует exact allowlist.
4. Legacy lesson/student/classroom/materials/portal routes отсутствуют.
5. Unused full-product providers не конструируются.
6. BBB/transcription/DocumentEngine/ClamAV/GeometryOS не startup dependencies.
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
19. Production staging прошёл restart/reconnect/log-redaction/restore/soak gates.
20. Production rollback на предыдущие digests проверен.

Production apply запрещён до закрытия всех применимых P0/P1 gates, green
production-staging preflight и свежего isolated restore drill.

## 15. Текущая последовательность работ

Ближайший critical path теперь Pilot-first:

1. **P1 / frontend** — исправить known Prettier drift после PR #123 и получить
   свежий green `npm run check`.
2. **P2 / backend** — исправить exact route inventory failure PR #31 без
   ослабления test contract.
3. **P3 / board profile** — получить green configuration/provider/router,
   Compose/Caddy и secret-redaction gates; довести PR #31 до merge-ready.
4. **P4 / infrastructure** — поднять одну pilot VM, DNS и HTTPS.
5. **P5 / data** — выполнить explicit migrations, зафиксировать migration head,
   создать/проверить teacher account.
6. **P6-P8 / real flow** — `/boards`, board creation, invitation, isolated guest
   join и bidirectional collaboration.
7. **P9-P11 / resilience** — reconnect, terminal revoke и API restart persistence
   smoke.
8. **P12 / recoverability** — off-host backup + Pilot Release Manifest.
9. **Controlled pilot lesson** — только после green P1-P12.
10. **B3/T3 Production Gate** — полный read-only/rotate/offline-old-epoch
    convergence matrix.
11. **D2** — production release workflow, immutable images, SBOM/scans.
12. **D3** — production staging, restart/restore/log scan/load/24h soak.
13. **D4** — manual-approved production rollout и verified rollback.

Если для прохождения Pilot Gate обнаруживается security/data-integrity defect,
его исправление становится частью critical path независимо от исходной
приоритизации.

## 16. Критерий выбора следующей задачи

При конфликте backlog priorities:

```text
pilot blocker affecting real teacher/guest flow
    > security/access correctness
    > data durability/convergence
    > runtime isolation/attack surface
    > migration/rollback safety
    > guest/teacher UX completeness
    > observability/deployment automation
    > optional features
```

Новая optional feature не расширяет public surface до закрытия соответствующих
security, durability и deployment gates.

После успешного pilot приоритет автоматически переключается с «получить первый
реальный lesson» на полный Production Gate; pilot-specific упрощения не
переносятся в production по умолчанию.
