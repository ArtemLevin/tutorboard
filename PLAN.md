# TutorBoard execution and architecture plan

## 1. Назначение

Этот файл является текущим исполнимым контрактом разработки TutorBoard. Он
фиксирует модульные границы, владельцев инвариантов, правила расширения,
маршрутизацию project skills и ближайшую последовательность поставки.

Подробный продуктовый roadmap остаётся в
[`docs/DEVELOPMENT_PLAN.md`](docs/DEVELOPMENT_PLAN.md), а эксперименты фазы 2 —
в [`docs/PHASE_2_TECHNICAL_SPIKE_PLAN.md`](docs/PHASE_2_TECHNICAL_SPIKE_PLAN.md).
Если документы расходятся в вопросе текущей последовательности работ, этот
файл определяет ближайший execution order; долгосрочные продуктовые цели
определяет `docs/DEVELOPMENT_PLAN.md`.

## 2. Текущее состояние и ближайшая последовательность

TutorBoard завершил PR 2.7 Safe SVG insertion. Gate 0 GeometryOS закрыт
проверяемым baseline в
[`docs/spike/GEOMETRYOS_CONTRACT_BASELINE.md`](docs/spike/GEOMETRYOS_CONTRACT_BASELINE.md):
API v1, GIR `0.2.0`, fixtures, Problem Details, request ID и probes подтверждены;
machine-readable layout отсутствует и оформлен как compatibility gap.

`BoardDocument 0.2`, migration `0.1 → 0.2`, branded identifiers, namespaced
commands, pure reducer,
strict validation, recovery reader и deterministic serialization реализованы в
PR 2.2. PR 2.3 добавил Konva adapter, coordinate conversion, pan,
pointer-centred zoom, ResizeObserver, grid/origin и renderer registry. PR 2.4
добавил drawing module, tool state machine, pen и primitive tools. PR 2.5
добавил runtime-only click, additive и marquee selection, атомарное перемещение
независимых объектов и групп, delete, lock state и selection inspector.
Dexie persistence и recovery реализованы в PR 2.6. PR 2.7 добавил bounded
SVG sanitizer, opaque `svg-import.svg`, selection/movement, reload revalidation
и recovery при tampered SVG. GeometryOS client ещё не реализован.

Ближайшие поставки:

1. **PR 2.0 — Architecture and Agent Contract — завершён**
   - принять этот файл;
   - зафиксировать project invariants и module contract;
   - подключить TutorBoard-specific skills;
   - определить автоматические architecture checks для PR 2.1.
2. **Gate 0 — GeometryOS contract verification — завершён**
   - проверить OpenAPI v1, GIR `0.2.0`, fixtures, result union, Problem Details,
     request ID, health/readiness и доступность layout data.
3. **PR 2.1 — Repository foundation — завершён**
   - создать React/Vite/strict TypeScript skeleton;
   - создать физические границы модулей;
   - реализовать import-boundary checks и базовый CI.
4. **PR 2.2 — Board domain model — завершён**
   - реализовать `BoardDocument 0.1`, identifiers, commands, reducer,
     validation и serialization;
   - обеспечить `DOC-001`–`DOC-012`, `CMD-001`, `CMD-003`–`CMD-007`;
   - сохранить raw input при incompatible/unknown/corrupted read;
   - использовать `order` как единственный z-order и
     `GeometryImportRecord.visualTransform` как transform импорта.
5. **PR 2.3 — Infinite canvas — завершён**
   - подключить Konva только через `adapters/canvas-konva/public`;
   - передавать renderer только immutable `BoardSceneReadModel`;
   - реализовать pure world/screen conversion, pan и pointer-centred zoom;
   - обеспечить cancel/release pointer lifecycle и browser tests;
   - не добавлять canvas runtime в `BoardDocument`.
6. **PR 2.4 — Pen and primitive tools — завершён**
   - подключить `modules/drawing/public` как единственного владельца tool IDs,
     interaction state machine, style defaults и command factory;
   - реализовать pen, line, rectangle, ellipse и text;
   - нормализовать pointer из canvas-local CSS pixels в world coordinates на
     границе адаптера;
   - хранить preview только в runtime state и создавать один
     `core.objects.add` на завершённый gesture;
   - отменять gesture при Escape, pointer loss, blur, tool switch и unmount;
   - сохранить stored shape `BoardDocument 0.1` без migration.
7. **PR 2.5 — Selection and movement — завершён**
   - подключить `modules/selection/public` как владельца selection tool,
     runtime state machine, bounds/hit testing и command factories;
   - реализовать click, additive и marquee selection;
   - хранить selection, marquee и drag preview только в runtime state;
   - перемещать независимые объекты и generic groups одной атомарной командой;
   - реализовать delete, lock/unlock и inspector;
   - отменять drag/marquee при Escape, pointer loss, blur, tool switch и unmount;
   - сохранить stored shape `BoardDocument 0.1` без migration.
8. **PR 2.6 — Local persistence — завершён**
   - реализован versioned Dexie repository с append-only revisions;
   - autosave использует durable operation ID и optimistic revision check;
   - reload восстанавливает document и viewport;
   - повреждённая current revision сохраняется в recovery record, а UI открывает
     last-good revision или явный recovery flow;
   - diagnostic JSON можно экспортировать и импортировать.
9. **PR 2.7 — Safe SVG insertion — завершён**
   - реализован deny-by-default sanitizer с byte/node/depth/path/dimension limits;
   - `BoardDocument 0.2` добавляет один opaque `svg-import.svg`, а `0.1`
     мигрируется без изменения IDs, objects, order, groups или imports;
   - SVG выбирается, перемещается, сохраняется и повторно валидируется до render;
   - tampered stored SVG открывает recovery UI и не исполняется.
10. **PR 2.8 — GeometryOS generated client — следующий**
   - подключить pinned OpenAPI-generated DTO и HTTP adapter;
   - разделить success, clarification, domain error и Problem Details;
   - обеспечить timeout/abort, request ID и incompatible contract diagnostics.
11. Далее выполнять PR 2.9–2.12 из Technical Spike plan, не обходя phase gates.

## 3. Целевая архитектура

TutorBoard развивается как модульный frontend-монолит:

```text
Application composition root
          │
          ├── feature modules
          │       └── Board Core / declared ports
          │
          └── external adapters
                  └── Board Core / declared ports
```

Модульность означает проверяемые границы и явные контракты, а не только
структуру каталогов. До отдельного продуктового решения модули подключаются
статически при сборке. Dynamic plugin ABI, micro-frontends и runtime-загрузка
стороннего кода не входят в TutorBoard 1.0.

### 3.1. Слои

#### `app`

Единственное место композиции приложения:

- связывает ports с adapters;
- подключает модули;
- создаёт application store;
- конфигурирует routes, feature flags и platform context;
- валидирует module registrations;
- запускает bootstrap и recovery UI.

#### `core`

Стабильное ядро доски:

- `BoardDocument`;
- `BoardObject`, groups и ordering;
- branded identifiers;
- commands, events и reducers;
- coordinate primitives и transforms;
- schema versioning и validation;
- общие errors, results, read models и ports.

`core` не импортирует React, Zustand, Konva, Dexie, browser APIs, HTTP clients
или feature modules.

#### `modules`

Каждый модуль владеет отдельной возможностью и публикует только `public.ts`.
Подтверждённые модули Technical Spike:

- `drawing`;
- `selection`;
- `geometry-import`;
- `svg-import`;
- `local-persistence`.

Модули history, styling, text, lesson context, collaboration и evidence
добавляются только в соответствующих фазах.

#### `adapters`

Технологические реализации declared ports:

- `canvas-konva`;
- `geometryos-http`;
- `persistence-dexie`;
- позднее `platform-board-api`, `collaboration-websocket`, telemetry и export.

#### `shared`

Только действительно общие, стабильные utilities:

- UI primitives;
- diagnostics;
- test builders;
- platform-neutral helpers.

`shared` не становится хранилищем случайной бизнес-логики.

### 3.2. Планируемая структура

```text
src/
├── app/
│   ├── bootstrap/
│   ├── composition/
│   ├── configuration/
│   └── routing/
├── core/
│   ├── board/
│   │   ├── commands/
│   │   ├── document/
│   │   ├── events/
│   │   ├── groups/
│   │   ├── objects/
│   │   ├── transforms/
│   │   └── validation/
│   ├── contracts/
│   ├── ports/
│   └── shared-kernel/
├── modules/
│   ├── drawing/
│   ├── selection/
│   ├── geometry-import/
│   ├── svg-import/
│   └── local-persistence/
├── adapters/
│   ├── canvas-konva/
│   ├── geometryos-http/
│   └── persistence-dexie/
├── shared/
│   ├── diagnostics/
│   ├── testing/
│   └── ui/
└── tests/
    ├── architecture/
    ├── contracts/
    ├── e2e/
    └── integration/
```

Не создавать пустые каталоги для будущих фаз. Новый каталог появляется вместе
с первым реальным владельцем поведения и проверкой границы.

## 4. Dependency rules

Разрешено:

```text
app -> modules -> core
app -> adapters -> core ports
modules/ui -> shared/ui
adapters -> shared platform-neutral utilities
```

Запрещено:

```text
core -> app | modules | adapters | React | Konva | Zustand | Dexie
module A -> module B internals
adapter -> app
canvas adapter -> persistence adapter
GeometryOS client -> Board store
UI component -> IndexedDB | HTTP | WebSocket directly
```

Дополнительные правила:

- Межмодульный импорт разрешён только через `public.ts`.
- Side effects выполняются только через declared ports.
- Feature modules не читают editable role/tenant state как источник
  авторизации.
- Cross-module communication использует public contracts, commands, read
  models или типизированные domain events.
- Не вводить универсальный event bus до появления минимум двух реальных
  потребителей стабильного события.
- Любое новое dependency edge добавляется вместе с architecture test либо с
  объяснённым verification gap.

## 5. Module contract

На фазах 2–3 применяется статическое декларативное описание:

```ts
interface TutorBoardModuleDefinition {
  readonly id: ModuleId;
  readonly version: string;
  readonly requires: readonly PortToken[];
  readonly contributions: ModuleContribution;
}
```

Модуль может предоставить:

- object schemas и migrations;
- command handlers;
- renderers;
- tools;
- inspector sections;
- import/export codecs;
- diagnostics;
- keyboard shortcuts;
- evidence extractors на поздних фазах.

Инварианты регистрации:

- module ID стабилен и уникален;
- object kinds и command kinds уникальны;
- module definition является данными и не выполняет side effects;
- порядок не зависит от порядка исполнения импортов;
- порядок UI contributions задаётся явно;
- duplicate contribution останавливает bootstrap с диагностируемой ошибкой;
- отключение модуля не удаляет его persisted data;
- неизвестный object kind не игнорируется и не удаляется;
- `requires` перечисляет только declared ports, которые связывает composition root;
- feature flag не заменяет авторизацию.

## 6. Invariant registry

Каждое нетривиальное изменение указывает затронутые invariant IDs. Инвариант
считается обеспеченным только при наличии владельца и проверяемого enforcement.

### 6.1. Architecture

| ID         | Инвариант                                                          | Основное enforcement   |
| ---------- | ------------------------------------------------------------------ | ---------------------- |
| `ARCH-001` | Dependencies направлены к `core`                                   | import-boundary test   |
| `ARCH-002` | Межмодульные deep imports запрещены                                | lint/architecture test |
| `ARCH-003` | Side effects доступны только через ports                           | type boundary + review |
| `ARCH-004` | Composition выполняется только в `app`                             | import-boundary test   |
| `ARCH-005` | У каждого типа и команды один module owner                         | registry validation    |
| `ARCH-006` | Новая abstraction требует реального consumer или внешнего contract | architecture review    |
| `ARCH-007` | Dynamic plugins не входят в 1.0                                    | scope gate             |
| `ARCH-008` | Ошибка module registration безопасно останавливает bootstrap       | integration test       |

### 6.2. BoardDocument

| ID        | Инвариант                                                    | Основное enforcement  |
| --------- | ------------------------------------------------------------ | --------------------- |
| `DOC-001` | `BoardDocument` — единственный сериализуемый source of truth | architecture test     |
| `DOC-002` | Каждый stored document содержит `schemaVersion`              | runtime schema        |
| `DOC-003` | Object IDs уникальны и стабильны                             | validator + unit test |
| `DOC-004` | `order` не содержит отсутствующих/повторных IDs              | validator             |
| `DOC-005` | Group references указывают на существующие objects           | validator             |
| `DOC-006` | Runtime selection, hover и drag preview не сериализуются     | round-trip fixture    |
| `DOC-007` | Stored schema имеет migration или явный incompatible result  | migration tests       |
| `DOC-008` | Unknown object не удаляется молча                            | recovery test         |
| `DOC-009` | Corrupted input сохраняется для recovery                     | persistence contract  |
| `DOC-010` | Canonical GIR не восстанавливается из visual objects         | adapter tests         |
| `DOC-011` | Document меняется только через command boundary              | architecture test     |
| `DOC-012` | Canvas runtime никогда не хранится в document                | serialization test    |

### 6.3. Commands and interaction

| ID        | Инвариант                                              | Основное enforcement   |
| --------- | ------------------------------------------------------ | ---------------------- |
| `CMD-001` | Command описывает одно атомарное намерение             | reducer tests          |
| `CMD-002` | Один gesture создаёт одну committed command            | browser integration    |
| `CMD-003` | Reducer не читает clock, UUID или environment          | unit/architecture test |
| `CMD-004` | IDs, time и actor поступают через application boundary | command contract       |
| `CMD-005` | Failed command не оставляет partial mutation           | negative tests         |
| `CMD-006` | Preconditions проверяются до mutation                  | reducer tests          |
| `CMD-007` | Persistent command kind имеет module namespace         | schema validation      |
| `CMD-008` | Cancelled interaction не создаёт object/history        | browser test           |

### 6.4. Canvas and coordinates

| ID           | Инвариант                                             | Основное enforcement   |
| ------------ | ----------------------------------------------------- | ---------------------- |
| `CANVAS-001` | Pan/zoom не меняют object world coordinates           | transform tests        |
| `CANVAS-002` | Zoom сохраняет world point под cursor                 | property/unit test     |
| `CANVAS-003` | Pointer coordinates нормализуются на boundary         | interaction test       |
| `CANVAS-004` | Drag preview отделён от committed document            | integration test       |
| `CANVAS-005` | Movement delta не зависит от zoom                     | browser test           |
| `CANVAS-006` | Renderer получает immutable read model                | type/architecture test |
| `CANVAS-007` | Renderer не изменяет store напрямую                   | import/API test        |
| `CANVAS-008` | DPR влияет на rendering, но не world coordinates      | browser test           |
| `CANVAS-009` | Pointer capture освобождается при cancel/loss/unmount | browser test           |
| `CANVAS-010` | Resize/tool switch не оставляют half-created object   | state-machine test     |

### 6.5. GeometryOS

| ID        | Инвариант                                           | Основное enforcement   |
| --------- | --------------------------------------------------- | ---------------------- |
| `GEO-001` | DTO генерируются из pinned OpenAPI                  | generated-diff check   |
| `GEO-002` | External response валидируется на boundary          | contract tests         |
| `GEO-003` | GIR не используется как UI/store model              | architecture test      |
| `GEO-004` | GIR-to-Board adapter является pure                  | unit/architecture test |
| `GEO-005` | Mapping детерминирован при одинаковом input/context | fixture test           |
| `GEO-006` | GIR ID хранится отдельно от Board object ID         | schema test            |
| `GEO-007` | Missing/duplicate references дают explicit error    | negative fixtures      |
| `GEO-008` | Unsupported entity создаёт diagnostic, не догадку   | fixture test           |
| `GEO-009` | SVG не является primary semantic source             | architecture review    |
| `GEO-010` | Canonical GIR и provenance сохраняются              | round-trip test        |
| `GEO-011` | Visual transform не меняет canonical GIR            | adapter test           |
| `GEO-012` | Incompatible API/GIR version отклоняется            | contract test          |
| `GEO-013` | Retry не создаёт случайный duplicate import         | integration test       |
| `GEO-014` | Request ID проходит через полный flow               | contract/E2E           |

### 6.6. Persistence and recovery

| ID            | Инвариант                                             | Основное enforcement  |
| ------------- | ----------------------------------------------------- | --------------------- |
| `PERSIST-001` | Save не уничтожает last-good revision                 | repository contract   |
| `PERSIST-002` | Corruption не приводит к blank screen                 | recovery E2E          |
| `PERSIST-003` | Autosave failure видим пользователю                   | UI integration        |
| `PERSIST-004` | Retry не создаёт duplicate revision                   | idempotency test      |
| `PERSIST-005` | Migration атомарна или имеет safe recovery            | migration test        |
| `PERSIST-006` | Unknown schema сохраняется для recovery               | compatibility fixture |
| `PERSIST-007` | Server save использует optimistic concurrency         | API contract          |
| `PERSIST-008` | Conflict не разрешается silent overwrite              | conflict E2E          |
| `PERSIST-009` | Offline queue имеет durable operation identity        | repository test       |
| `PERSIST-010` | После integration IndexedDB не второй source of truth | architecture review   |
| `PERSIST-011` | Snapshot связан с точной revision                     | evidence contract     |
| `PERSIST-012` | Archive/delete не ломает immutable evidence           | integration test      |

### 6.7. Security and privacy

| ID        | Инвариант                                                            | Основное enforcement |
| --------- | -------------------------------------------------------------------- | -------------------- |
| `SEC-001` | SVG всегда считается untrusted input                                 | security tests       |
| `SEC-002` | Scripts, event handlers, `foreignObject`, remote resources запрещены | malicious fixtures   |
| `SEC-003` | SVG имеет byte/node/depth/dimension limits                           | boundary tests       |
| `SEC-004` | Tokens не сохраняются в localStorage/BoardDocument                   | security review      |
| `SEC-005` | Tenant/role не берутся из editable client state                      | authorization tests  |
| `SEC-006` | Authorization проверяется на resource boundary                       | integration tests    |
| `SEC-007` | Prompt/raw response/board content не логируются по умолчанию         | telemetry tests      |
| `SEC-008` | Diagnostics используют codes и минимальные metadata                  | review + fixtures    |
| `SEC-009` | Student artifacts не содержат technical metadata                     | publication test     |
| `SEC-010` | Feature flags не предоставляют permissions                           | security review      |

## 7. Extension contracts

### 7.1. Новый object kind

Модуль обязан предоставить:

- уникальный kind и owner;
- schema version и runtime validator;
- renderer и bounds calculator;
- selection/lock behavior;
- serialization fixture;
- migration/unknown-version behavior;
- inspector contribution;
- snapshot/export policy.

### 7.2. Новый tool

Модуль обязан предоставить:

- уникальный tool ID;
- interaction state machine;
- pointer/keyboard inputs;
- cancel semantics;
- command factory;
- capability requirement;
- diagnostic codes без user content;
- unit и browser scenario.

### 7.3. Новый importer

Модуль обязан предоставить:

- trust classification и input validator;
- size/complexity limits;
- conversion result;
- diagnostics и provenance;
- duplicate/retry policy;
- recovery behavior.

### 7.4. Persistence adapter

Адаптер реализует declared repository port. Domain не знает, используется
memory, Dexie или HTTP. Для любой реализации определяются:

- source-of-truth ownership;
- atomicity boundary;
- optimistic version/idempotency;
- retry и conflict policy;
- last-good state;
- migration и recovery.

### 7.5. UI contribution

Модуль использует известные slots:

- primary/secondary toolbar;
- inspector;
- prompt panel;
- status bar;
- context menu;
- diagnostics panel.

Произвольное изменение application layout из module initialization запрещено.

## 8. Project skill routing

`task-triage` всегда определяет затронутые modules, contracts и invariant IDs.
Далее подключаются только релевантные skills:

| Поверхность                                                 | Обязательные project skills               |
| ----------------------------------------------------------- | ----------------------------------------- |
| modules, dependencies, composition, public contracts        | `tutorboard-architecture`                 |
| BoardDocument, objects, commands, serialization, migrations | `board-document-evolution`                |
| canvas, coordinates, tools, selection, pointer lifecycle    | `canvas-interaction-review`               |
| OpenAPI, GIR, client, adapter, layout, imports              | `geometryos-integration-review`           |
| Dexie, autosave, revisions, offline, conflicts, restore     | `persistence-recovery-review`             |
| SVG import/render/export                                    | `svg-security-review` + `security-review` |
| auth, tenant, publication                                   | `security-review`                         |
| WebSocket, operation replay, retries                        | `concurrency-review`                      |
| platform durable schema                                     | `database-review`                         |

Skills для platform integration, collaboration protocol, lesson evidence и
production release создаются вместе с соответствующей фазой, а не заранее.

## 9. Verification routing

| Изменения                     | Минимальная проверка                                        |
| ----------------------------- | ----------------------------------------------------------- |
| `core/**`                     | typecheck, unit, schema fixtures, architecture              |
| `modules/**`                  | module unit, public API, architecture, relevant integration |
| `adapters/canvas-konva/**`    | transforms, browser interaction, E2E smoke                  |
| `adapters/geometryos-http/**` | generated contract, fixtures, error matrix                  |
| persistence                   | repository contract, migration, corruption/recovery         |
| SVG                           | malicious fixtures, limits, serialization, browser smoke    |
| collaboration                 | multi-client convergence, reconnect, duplicate/out-of-order |
| evidence/publication          | immutability, authorization, metadata minimization          |

До появления `package.json` документационные проверки ограничены:

- валидным Markdown;
- корректным YAML frontmatter project skills;
- корректными JSON schemas;
- отсутствием противоречий в routing и invariant IDs.

## 10. PR contract

Каждый нетривиальный PR содержит:

- одну цель;
- scope и non-scope;
- module owner;
- затронутые invariant IDs;
- public/stored/external contract impact;
- migration/recovery impact;
- security/privacy impact;
- точные checks и результаты;
- ADR при изменении долгоживущей границы;
- screenshots/demo для UI;
- residual risks.

Нельзя:

- смешивать unrelated module changes;
- вводить dependency без owner и boundary;
- менять stored schema без version/migration decision;
- превращать visual drag в mathematical edit молча;
- использовать full test suite вместо отсутствующего targeted test;
- объявлять инвариант обеспеченным только на основании review prose.

## 11. Phase gates

### Gate A — Architecture proven

- vertical slice работает;
- GIR mapping детерминирован;
- coordinate ownership решён;
- local recovery доказан;
- неизвестные и fallback paths перечислены;
- нет скрытой зависимости от SVG parsing или canvas runtime.

### Gate B — Single-user foundation

- `BoardDocument 1.0`;
- undo/redo;
- import/export;
- accessibility и performance baselines;
- modules расширяются через принятые contracts.

### Gate C — Platform-connected and durable

- identity/tenant/lesson приходят из `tutor-assistant-web`;
- server document является source of truth;
- optimistic concurrency и conflict UX работают;
- GeometryOS доступен через platform gateway.

### Gate D — Collaborative classroom

- two-client convergence;
- reconnect/replay/deduplication;
- authorization;
- atomic geometry import;
- документированные load limits.

### Gate E — Evidence and publication

- finalized revision immutable;
- evidence связано с точной revision;
- student видит только published artifacts;
- технические metadata и PII минимизированы.

### Gate F — Production-ready

- security review;
- observability и SLO;
- performance budgets;
- backup/restore drill;
- reproducible release и rollback без document loss.

## 12. Принятые ограничения

- Сначала внутренние статические модули, затем при доказанной необходимости
  dynamic plugins.
- Сначала command/reducer model, затем history и collaboration protocol.
- Сначала IndexedDB recovery, затем server source of truth.
- Сначала deterministic fixture integration, затем optional live GeometryOS E2E.
- Сначала измеримый performance baseline, затем optimization.
- Project skills остаются короткими и используют этот файл как единый источник
  TutorBoard invariants.
