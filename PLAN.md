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

### 2.1. Доставленный baseline

TutorBoard завершил основную инфраструктурную часть Technical Spike:

| Этап     | Статус   | Доставленный результат                                                                                   |
| -------- | -------- | -------------------------------------------------------------------------------------------------------- |
| PR 2.0   | завершён | architecture contract, invariant registry и project skills                                               |
| Gate 0   | завершён | проверены API v1, GIR `0.2.0`, fixtures, Problem Details, request ID и probes GeometryOS                 |
| PR 2.1   | завершён | React/Vite/strict TypeScript foundation и enforceable module boundaries                                  |
| PR 2.2   | завершён | `BoardDocument`, commands, reducer, validation, serialization и recovery contract                        |
| PR 2.3   | завершён | заменяемый Konva adapter, infinite canvas, pan/zoom и coordinate boundary                                |
| PR 2.4   | завершён | pen, line, rectangle, ellipse и text tools                                                               |
| PR 2.5   | завершён | selection, marquee, movement, delete, lock и inspector                                                   |
| PR 2.6   | завершён | Dexie revisions, autosave, optimistic conflict и explicit recovery                                       |
| PR 2.7   | завершён | bounded deny-by-default SVG import и stored-object revalidation                                          |
| PR 2.8   | завершён | pinned/generated GeometryOS client, runtime validators и bounded HTTP adapter                            |
| PR 2.8.1 | смёржен  | producer repin на `49e98394d0c9cdeaf7fdaf45b712dbee3a04a74c`, новый OpenAPI/fixtures и live-contract job |
| PR 2.8.2 | завершён | executable ESM validators, plain-Node smoke и real Chromium CORS/request-ID/runtime gate                 |

Текущий stored contract — `BoardDocument 0.2`. Canvas runtime, selection,
preview и transport state не сериализуются. Canonical GIR хранится отдельно от
Board objects и не восстанавливается из SVG или пользовательских transforms.

### 2.2. Подтверждённые блокеры

1. **GeometryOS не публикует Layout Document 0.1.** API v1 возвращает canonical
   GIR и SVG/TikZ, но не версионированные координаты с provenance. SVG не может
   использоваться как semantic source согласно `GEO-009`.
2. **GeometryOS client ещё не скомпонован с UI.** HTTP adapter существует, но
   prompt flow, clarification UI, retry identity и atomic import появятся только
   в следующих PR.
3. **Общий vertical slice не закрыт.** Цепочка
   `text → GIR → Layout Document → BoardDocument → canvas` пока не доказана.

### 2.3. Обязательный execution order

#### TutorBoard PR 2.8.2 — восстановить зелёный live-contract gate — завершён

Доставлено:

- Ajv standalone output fail-closed нормализуется в executable ESM на границе
  генератора, а неизвестные CommonJS runtime helpers отклоняются;
- exact Ajv version одинакова в root и isolated code-generation toolchain;
- committed validators воспроизводимо проверяются plain Node ESM loader и
  положительными/отрицательными contract fixtures;
- отдельный protocol probe проверяет readiness, allowed/denied CORS preflight и
  отсутствие credentials;
- реальный Chromium выполняет cross-origin POST, читает exposed
  `X-Request-ID` и валидирует live response тем же generated validator;
- exact producer commit и hardened read-only container сохранены;
- Quality gate, Browser smoke и GeometryOS live browser contract прошли в CI
  run 149; diagnostics не содержат prompt, response body или credentials;
- BoardDocument, canvas, UI, persistence и geometry import contracts не менялись.

#### GeometryOS G-10 — чистый Layout Document 0.1

Выполняется в репозитории GeometryOS и является внешней зависимостью TutorBoard.
Нужны versioned coordinate space, canonical GIR SHA-256, provenance, stable
synthetic IDs, completeness/reference invariants, typed `success` /
`unsupported` / `invalid_scene`, schema, fixtures и exact benchmarks.

G-10 не включает HTTP endpoint и не меняет GIR `0.2.0`.

#### TutorBoard PR 2.9A — pure GIR semantic adapter

Может выполняться параллельно с GeometryOS G-10 после зелёного PR 2.8.2.

Scope:

- runtime GIR validation boundary;
- entity index и reference resolver;
- stable Board IDs и deterministic root group ID;
- mapping GIR ID → Board object ID;
- provenance и explicit unsupported diagnostics;
- pure `GeometryImportSemanticPlan` без React, HTTP, persistence и coordinates.

Enforcement: `GEO-003`–`GEO-010`, architecture tests и deterministic fixtures.

#### GeometryOS G-11 — HTTP Layout API

Предпочтительный контракт: `POST /api/v1/layout` для уже существующего canonical
GIR. Endpoint должен публиковать Layout Document 0.1, typed unsupported/invalid
outcomes, request ID, readiness, timeout budget, OpenAPI и TutorBoard fixtures.

#### TutorBoard PR 2.9B — Layout-to-Board и атомарный import

Scope:

- vendored/generated Layout Document types и runtime validator;
- Layout coordinates → local geometry group coordinates;
- geometry object renderers и bounds;
- один namespaced atomic import command;
- import record, group, objects, order, mapping и provenance добавляются целиком
  либо document остаётся неизменным;
- migration только если stored union действительно меняется.

#### TutorBoard PR 2.10 — полный GeometryOS vertical slice

Prompt → readiness → generate → layout → import → select → move → autosave →
reload. Обязательный fixture: «Построй треугольник ABC и высоту AH».

#### TutorBoard PR 2.11 — visual versus mathematical movement

Разрешить group translation, label offsets и style overrides. Individual drag
constrained geometry points остаётся запрещённым до отдельного semantic edit
contract. Visual operations не изменяют canonical GIR.

#### TutorBoard PR 2.12 — закрытие Technical Spike

Подготовить Phase 2 report, coordinate/mapping/change-classification ADRs,
зафиксировать временные ограничения и сформировать Phase 3 backlog.

#### GeometryOS G-13 — release 0.3.0

После стабилизации Layout API выпустить GeometryOS `0.3.0`, включив layout
schema/fixtures в release bundle и опубликовав consumer upgrade guide.

### 2.4. Правила параллельной разработки

- PR 2.8.2 закрыт; следующий TutorBoard owner — pure semantic PR 2.9A.
- TutorBoard PR 2.9A может идти параллельно с GeometryOS G-10, поскольку не
  владеет coordinates и не вызывает HTTP.
- PR 2.9B начинается только после принятия G-10 и опубликованного G-11 contract.
- PR 2.10 начинается только после зелёных 2.9A, G-11 и 2.9B.
- TutorBoard не создаёт общий layout solver и не парсит SVG ради семантики.
- GeometryOS не хранит BoardDocument, viewport или пользовательские overrides.

### 2.5. Следующие продуктовые фазы

После PR 2.12 выполняется Phase 3 Product Foundation:

1. contract freeze и `BoardDocument 1.0`;
2. undo/redo с одним history item на gesture/import;
3. clipboard и deterministic ID remapping;
4. layers/object manager;
5. styling и visual overrides;
6. text/math labels;
7. deterministic document import/export;
8. performance baseline и viewport culling;
9. accessibility baseline;
10. product shell, diagnostics и feature flags.

Дальнейший порядок: tutor-assistant-web gateway integration → server revisions и
offline synchronization → collaboration protocol → lesson evidence → production
readiness → advanced semantic geometry/AI. CRDT, semantic point drag и
production direct-browser access к GeometryOS не выбираются заранее.

### 2.6. No-go gates

Запрещено объявлять Technical Spike завершённым, пока:

- Layout Document не versioned и runtime-validated;
- import не атомарен;
- canonical GIR/provenance не переживают save/reload;
- visual movement policy не зафиксирована;
- обязательный triangle-altitude E2E не проходит через реальный BoardDocument.

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
