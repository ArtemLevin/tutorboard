# TutorBoard — полный план разработки

## 1. Назначение документа

Этот документ определяет полную последовательность разработки TutorBoard: от архитектурного Technical Spike до production-ready модуля виртуального класса, интегрированного с GeometryOS, tutor-assistant-web, tutor-assistant, LessonEvidenceBundle и контуром публикации учебных материалов.

План является техническим roadmap, а не календарным обещанием. Переход к следующей фазе разрешён только после выполнения exit criteria предыдущей.

---

# 2. Целевой продукт

TutorBoard — браузерное интерактивное полотно для преподавателя и ученика.

Целевые возможности:

- бесконечное полотно;
- перо, фигуры, текст и изображения;
- интерактивные математические объекты;
- построения через GeometryOS;
- сохранение документов в контексте занятия;
- совместная работа преподавателя и ученика;
- история изменений;
- snapshot и post-lesson evidence;
- связь с материалами, транскриптом и записью;
- встраивание в tutor-assistant-web и virtual classroom;
- безопасный production deployment.

TutorBoard не заменяет GeometryOS, tutor-assistant-web, desktop tutor-assistant или DocumentEngine. Он является клиентским интерактивным слоем между пользователем и остальными сервисами.

---

# 3. Архитектурная карта

```text
TutorBoard
├── Board Domain
│   ├── BoardDocument
│   ├── BoardObject
│   ├── commands
│   ├── groups
│   ├── transforms
│   └── schema migrations
├── Canvas Adapter
│   ├── renderer
│   ├── pointer interaction
│   ├── selection
│   └── viewport
├── Geometry Integration
│   ├── generated GeometryOS client
│   ├── GIR validation boundary
│   ├── GIR → Board adapter
│   ├── import provenance
│   └── visual overrides
├── Persistence
│   ├── IndexedDB during spike
│   ├── server document repository
│   ├── revisions
│   └── recovery
├── Collaboration
│   ├── presence
│   ├── shared operations
│   ├── conflict resolution
│   └── reconnect
└── Platform Integration
    ├── tutor-assistant-web identity
    ├── lesson context
    ├── BBB classroom
    ├── LessonEvidenceBundle
    └── published materials
```

---

# 4. Неподвижные архитектурные принципы

1. `BoardDocument` является source of truth.
2. Canvas library является renderer, но не моделью документа.
3. GeometryOS является source of truth для математической семантики.
4. GIR и `BoardDocument` являются разными моделями.
5. GeometryOS DTO не используются напрямую как UI state.
6. Все изменения проходят через application commands.
7. Все persistent документы имеют `schemaVersion`.
8. Все внешние contracts проверяются runtime validation.
9. Все repository boundaries покрываются architecture tests.
10. Любая совместная операция должна быть детерминированной и replayable.
11. Визуальные и математические изменения классифицируются отдельно.
12. TutorBoard не создаёт вторую identity/lesson/business platform рядом с tutor-assistant-web.

---

# 5. Модель фаз

| Фаза | Название | Главный результат |
|---|---|---|
| 1 | GeometryOS Integration Baseline | стабильный API/GIR/OpenAPI contract |
| 2 | TutorBoard Technical Spike | доказанный text → GIR → interactive board vertical slice |
| 3 | Product Foundation | надёжная одиночная доска как самостоятельный frontend |
| 4 | Platform Integration | TutorBoard связан с tutor-assistant-web и занятиями |
| 5 | Server Persistence and History | серверные документы, revisions и recovery |
| 6 | Real-time Collaboration | совместная работа преподавателя и ученика |
| 7 | Lesson Evidence and Materials | snapshot доски входит в post-lesson workflow |
| 8 | Production Readiness | security, observability, performance, deployment |
| 9 | Advanced Geometry and AI | математическое редактирование и интеллектуальные инструменты |

---

# 6. Фаза 1. GeometryOS Integration Baseline

## Статус

Выполнена в отдельном репозитории GeometryOS.

## Обязательные результаты

- GeometryOS `0.2.0`;
- HTTP API v1;
- GIR `0.2.0`;
- deterministic OpenAPI artifact;
- TutorBoard consumer fixtures;
- TypeScript generation smoke;
- Problem Details;
- request ID;
- timeout policy;
- health/readiness;
- hardened container;
- release candidate workflow.

## Exit criteria

TutorBoard может:

- сгенерировать строгие TypeScript types из OpenAPI;
- отправить `POST /api/v1/generate`;
- различить `success`, `needs_clarification` и domain `error`;
- обработать `application/problem+json`;
- получить GIR `0.2.0`;
- использовать fixture contracts без запуска реального сервиса.

---

# 7. Фаза 2. TutorBoard Technical Spike

## Цель

Проверить архитектурный стык, не создавая преждевременно полноценный продукт.

Обязательный вертикальный сценарий:

```text
Построй треугольник ABC и высоту AH
    ↓
GeometryOS API
    ↓
GIR
    ↓
GIR → Board adapter
    ↓
интерактивные точки, отрезки и подписи
    ↓
выделение, перемещение, локальное сохранение
```

Полное описание экспериментов находится в `PHASE_2_TECHNICAL_SPIKE_PLAN.md`.

## PR 2.1 — Repository foundation

### Scope

- Vite;
- React;
- TypeScript strict;
- ESLint;
- formatter;
- Vitest;
- Testing Library;
- Playwright skeleton;
- CI;
- Dependabot/Renovate policy;
- `.editorconfig`;
- architecture folders;
- base ADR templates.

### Acceptance

- `npm ci` воспроизводим;
- lint, typecheck, unit tests и build зелёные;
- ни одной product dependency без lock-файла;
- CI использует pinned Node LTS;
- repository contains no business logic.

## PR 2.2 — Board domain model

### Scope

- branded identifiers;
- `BoardDocument`;
- discriminated `BoardObject` union;
- groups;
- object ordering;
- viewport DTO;
- commands;
- reducer;
- selectors;
- schema validation;
- serialization round-trip.

### Acceptance

- domain layer не импортирует React/Konva/Dexie;
- exhaustive switch включён;
- invalid references rejected;
- document serializable to JSON;
- tests cover IDs, grouping, move and ordering.

## PR 2.3 — Infinite canvas

### Scope

- Konva/react-konva adapter;
- world/screen conversion;
- pointer-centred zoom;
- pan;
- resize observer;
- rendering registry;
- debug origin/grid.

### Acceptance

- pan не меняет object coordinates;
- zoom сохраняет world point под курсором;
- renderer получает только selectors/read model;
- canvas nodes не сериализуются.

## PR 2.4 — Pen and primitive tools

### Scope

- tool state machine;
- pen;
- line;
- rectangle;
- ellipse;
- text;
- toolbar;
- world-coordinate pointer sampling.

### Acceptance

- tools создают commands;
- interaction can be cancelled;
- switching tools leaves no half-created object;
- pen data survives serialization.

## PR 2.5 — Selection and movement

### Scope

- click selection;
- multi-selection;
- area selection;
- drag;
- group movement;
- delete;
- lock state;
- selection inspector.

### Acceptance

- movement represented as one command;
- locked objects do not move;
- selection is runtime-only;
- delta independent from viewport zoom.

## PR 2.6 — Local persistence

### Scope

- Dexie;
- IndexedDB repository;
- autosave;
- restore;
- schema version;
- migrations registry;
- recovery record;
- diagnostic JSON export/import.

### Acceptance

- reload restores document and viewport;
- corrupted state produces recovery UI, not white screen;
- last successful revision preserved;
- persistence adapter does not import canvas.

## PR 2.7 — Safe SVG insertion

### Scope

- SVG sanitization;
- size and complexity limits;
- local bounds;
- selection/movement;
- invalid SVG errors.

### Acceptance

- scripts/event handlers removed;
- remote references rejected;
- SVG stored as board object;
- SVG is not used as semantic geometry source.

## PR 2.8 — GeometryOS client

### Scope

- generated TypeScript types;
- client wrapper;
- request ID;
- timeout/abort;
- Problem Details;
- domain result handling;
- fixtures and mock transport;
- readiness probe for development.

### Acceptance

- client does not import board store;
- all response variants covered;
- incompatible schema version rejected;
- prompt retry does not duplicate import accidentally.

## PR 2.9 — GIR → Board adapter

### Scope

- GIR validation boundary;
- entity index;
- mapping context;
- stable board IDs;
- point/segment/label objects;
- geometry group;
- provenance;
- diagnostics;
- temporary deterministic layout fallback if required.

### Acceptance

- adapter is pure;
- triangle + altitude fixture maps deterministically;
- missing references are explicit errors;
- unsupported entities produce diagnostics;
- no primary SVG parsing.

## PR 2.10 — Vertical slice

### Scope

- prompt panel;
- loading/result states;
- GeometryOS request;
- add geometry import command;
- center in current viewport;
- automatic selection;
- autosave/reload;
- request diagnostics.

### Acceptance

E2E proves:

1. prompt entered;
2. GeometryOS fixture/live response received;
3. A/B/C/H objects created;
4. import autosaved;
5. page reloaded;
6. position preserved.

Group movement remains the first acceptance item of PR 2.11 so the vertical
slice does not bypass the explicit visual-versus-mathematical movement policy.

## PR 2.11 — Movement experiment

Status: implementation complete, verification pending.

### Scope

- group move;
- label offset;
- optional feature-flagged point drag;
- classification of visual/mathematical/unknown changes;
- experiment logging.

### Acceptance

A documented decision exists for:

- moving whole construction;
- moving labels;
- moving independent point;
- moving constrained point;
- deleting semantic element.

## PR 2.12 — Phase report

Status: complete.

### Deliverables

- `PHASE_2_REPORT.md`;
- `BOARD_MODEL.md`;
- `COORDINATE_SYSTEMS.md`;
- `GIR_MAPPING.md`;
- `CHANGE_CLASSIFICATION.md`;
- ADR set;
- GeometryOS contract proposals;
- Phase 3 backlog.

## Exit criteria фазы 2

- vertical slice работает;
- локальный документ воспроизводим;
- GIR mapping детерминирован;
- границы coordinate systems документированы;
- принято решение по visual IDs;
- принято решение по coordinates ownership;
- принято решение по semantic drag;
- все временные решения явно перечислены.

---

# 8. Фаза 3. Product Foundation

## Статус

Выполнена. Итог и проверка exit criteria:
`docs/PHASE_3_PRODUCT_FOUNDATION_REPORT.md`.

## Цель

Превратить доказательный spike в устойчивую single-user доску, сохранив архитектурные границы.

## PR 3.1 — Spike cleanup and contract freeze

- удалить экспериментальные shortcuts;
- стабилизировать public BoardDocument schema `1.0`;
- зафиксировать migration policy;
- закрепить adapters interfaces;
- пересобрать architecture tests.

## PR 3.2 — Command history and undo/redo

- immutable command records;
- inverse commands;
- bounded history;
- grouping pointer interactions into one history item;
- undo/redo shortcuts;
- history reset/load semantics.

Acceptance:

- drag produces one undo step;
- imported geometry can be removed/restored;
- persistence stores current state, not transient history unless explicitly configured.

## PR 3.3 — Clipboard and duplication

- copy/cut/paste;
- duplication with ID remapping;
- group preservation;
- geometry provenance policy;
- safe clipboard MIME format.

## PR 3.4 — Layers and object management

- z-order UI;
- hide/lock;
- groups;
- object tree;
- selection by source/import/type.

## PR 3.5 — Styling system

- stroke/fill/text styles;
- design tokens;
- selected/default style;
- visual style schema;
- accessibility contrast checks.

## PR 3.6 — Text and math labels

- text editing overlay;
- multiline support;
- math label rendering;
- font fallback;
- stable dimensions;
- label offset editing.

## PR 3.7 — Import/export document

- `.tutorboard.json` format;
- schema validation;
- deterministic export;
- imported document migrations;
- SVG/PNG snapshot export for diagnostics.

## PR 3.8 — Performance baseline

- viewport culling;
- render batching;
- selector optimization;
- stroke simplification;
- large document benchmark;
- memory leak checks.

Target baseline:

- smooth interaction for agreed representative document;
- no O(n) full-document mutation on pointer move;
- stable memory after repeated document open/close.

## PR 3.9 — Accessibility and keyboard workflow

- keyboard navigation;
- visible focus;
- ARIA toolbar;
- reduced motion;
- shortcuts help;
- non-pointer object movement.

## PR 3.10 — Product shell

- routing;
- document list placeholder;
- error boundaries;
- notifications;
- settings;
- feature flags;
- development diagnostics panel.

## Exit criteria фазы 3

- stable `BoardDocument 1.0`;
- undo/redo;
- import/export;
- usable keyboard workflow;
- performance benchmark in CI;
- no spike-only code in default path;
- frontend can operate offline as a complete single-user application.

---

# 9. Фаза 4. Интеграция с tutor-assistant-web

## Цель

Подключить TutorBoard к существующей identity, tenant, student и lesson model вместо создания собственного backend.

## Интеграционная модель

```text
tutor-assistant-web
    ├── authenticates user
    ├── checks organization/lesson permissions
    ├── creates board session/document
    ├── issues scoped access token
    └── embeds or redirects to TutorBoard

TutorBoard
    ├── accepts session context
    ├── loads board document
    ├── calls GeometryOS through approved route
    └── saves document through platform API
```

## PR 4.1 — Integration contract specification

- board document resource contract;
- lesson-board relationship;
- token claims;
- tenant context;
- role matrix;
- CORS/CSP/embedding decision;
- API versioning;
- error model.

Deliverable: joint ADR in both repositories.

## PR 4.2 — Authentication adapter

- platform session bootstrap;
- scoped token storage in memory;
- refresh/expiry handling;
- logout/session invalidation;
- forbidden state.

Security:

- no long-lived token in localStorage;
- no GeometryOS credentials in browser;
- tenant ID never trusted from editable client state.

## PR 4.3 — Lesson context

- lesson ID;
- student metadata;
- subject/topic;
- tutor/student role;
- readonly/interactive mode;
- board title and timestamps.

## PR 4.4 — Board API client

- create document;
- load document;
- save revision;
- optimistic concurrency token;
- delete/archive;
- list lesson boards;
- Problem Details.

## PR 4.5 — GeometryOS gateway decision

Preferred production path:

```text
TutorBoard → tutor-assistant-web gateway → GeometryOS
```

Reasons:

- centralized authentication;
- rate limiting;
- audit;
- service discovery;
- no internal GeometryOS exposure;
- consistent request correlation.

Implement:

- gateway endpoint;
- request ID propagation;
- timeout budget;
- error mapping without losing GeometryOS Problem Details.

## PR 4.6 — Embedded classroom mode

- standalone and embedded modes;
- route contract;
- iframe or same-origin module decision;
- resize/focus behavior;
- CSP framing policy;
- deep link to lesson.

## PR 4.7 — Role-based capabilities

| Capability | Tutor | Student | Parent | Admin |
|---|---:|---:|---:|---:|
| View board | yes | assigned lesson | published/read-only | support/audit |
| Edit board | yes | during allowed session | no | controlled |
| Run GeometryOS | yes | policy-dependent | no | diagnostics |
| Export snapshot | yes | optional | no | controlled |
| Archive document | yes | no | no | yes |

## Exit criteria фазы 4

- TutorBoard opens from a real lesson;
- identity and permissions come from tutor-assistant-web;
- no duplicate user database;
- GeometryOS is reached through approved production boundary;
- tenant isolation covered by integration tests;
- student cannot access another organization’s board.

---

# 10. Фаза 5. Server Persistence and History

## Цель

Перенести source of truth документа из IndexedDB в versioned platform storage, сохранив offline recovery.

## PR 5.1 — Server document model

- board_documents;
- board_revisions;
- lesson relation;
- organization relation;
- created_by/updated_by;
- schema version;
- content hash;
- optimistic version;
- archive state.

## PR 5.2 — Revision API

- load latest;
- append revision;
- compare-and-swap save;
- revision metadata;
- list revisions;
- restore revision;
- retention policy.

## PR 5.3 — Autosave synchronization

- local dirty state;
- debounced upload;
- offline queue;
- retry/backoff;
- conflict detection;
- explicit save status.

## PR 5.4 — Conflict UX

For non-collaborative conflicts:

- compare local/base/server revision;
- preserve both copies;
- duplicate-as-recovered-document;
- never silently overwrite.

## PR 5.5 — Snapshot service

- deterministic document snapshot;
- PNG/SVG preview;
- metadata manifest;
- object count and bounds;
- content hash;
- background generation for large boards.

## PR 5.6 — Retention and archive

- soft delete;
- archive by lesson;
- retention policy;
- export before deletion;
- audit events;
- operator restore.

## Exit criteria фазы 5

- server is authoritative source;
- local IndexedDB is cache/recovery;
- optimistic concurrency works;
- no silent data loss;
- revisions can be restored;
- snapshot can be attached to lesson workflow.

---

# 11. Фаза 6. Real-time Collaboration

## Цель

Добавить совместное редактирование без разрушения BoardDocument semantics.

## До реализации

Провести отдельный spike выбора модели:

- CRDT document;
- operation log with server ordering;
- hybrid model;
- existing library integration.

Не выбирать CRDT только потому, что это популярный термин. Необходимо доказать поддержку:

- groups;
- ordered objects;
- high-frequency pen strokes;
- semantic geometry imports;
- undo ownership;
- reconnect;
- bounded storage.

## PR 6.1 — Collaboration protocol ADR

- operation envelope;
- document/session identity;
- client ID;
- sequence/version;
- acknowledgement;
- reconnect;
- snapshot compaction;
- authorization.

## PR 6.2 — Presence

- connected users;
- cursor;
- viewport hint;
- selected objects;
- role;
- heartbeat;
- stale presence cleanup.

Presence is ephemeral and not part of BoardDocument.

## PR 6.3 — Shared document transport

- authenticated WebSocket;
- room membership;
- server validation;
- correlation IDs;
- rate limits;
- reconnect and resubscribe.

## PR 6.4 — Shared primitive operations

- add object;
- move object/group;
- change style;
- delete;
- order;
- pen stroke chunking.

## PR 6.5 — Collaborative undo policy

- local-author undo;
- no reversal of another user’s unrelated operation;
- operation grouping;
- invalid inverse handling.

## PR 6.6 — Geometry collaboration

- geometry import as atomic operation;
- stable mapping;
- shared group transform;
- label overrides;
- semantic edit restrictions.

## PR 6.7 — Reconnect and recovery

- missed operation replay;
- snapshot fallback;
- duplicate operation detection;
- expired session;
- read-only fallback.

## PR 6.8 — Load and chaos tests

- multiple clients;
- reconnect storms;
- delayed messages;
- duplicate messages;
- server restart;
- partial network loss;
- large strokes.

## Exit criteria фазы 6

- two users edit one board;
- state converges;
- reconnect preserves work;
- unauthorized users cannot join room;
- GeometryOS import appears atomically for all participants;
- collaboration load limits documented.

---

# 12. Фаза 7. Lesson Evidence and Materials

## Цель

Включить доску в существующий post-lesson workflow tutor-assistant-web.

## PR 7.1 — Board evidence contract

Extend `LessonEvidenceBundle` with a versioned board section:

- document ID;
- revision ID;
- snapshot artifact;
- document schema version;
- content hash;
- geometry import summary;
- timestamps;
- participants;
- optional operation summary.

Не помещать полный тяжёлый document JSON внутрь основного bundle, если он хранится отдельным immutable artifact.

## PR 7.2 — Finalize lesson board

- explicit finalize action;
- capture final revision;
- generate snapshot;
- freeze evidence reference;
- allow later board editing without mutating historical lesson evidence.

## PR 7.3 — Transcript linking

- board markers linked to transcript timestamps;
- optional teacher bookmarks;
- evidence references;
- no automatic semantic claim without explicit model confidence.

## PR 7.4 — Material generation context

DocumentEngine/material pipeline receives:

- transcript;
- teacher summary;
- selected board snapshots;
- extracted geometry GIR;
- topic metadata;
- student difficulties.

## PR 7.5 — Student publication

- published board snapshot;
- optional read-only interactive board;
- links from student portal;
- access expiry/revocation;
- downloadable related PDF/TEX/HTML.

## PR 7.6 — students-26-27 export adapter

Transition adapter for existing static publication:

- export snapshot;
- export manifest;
- stable relative paths;
- link from student page;
- no technical metadata exposed to student.

## Exit criteria фазы 7

- finalized lesson contains immutable board evidence;
- materials can reference board content;
- student sees only published artifacts;
- later board changes do not rewrite historical evidence;
- export to current static student repository remains possible during migration.

---

# 13. Фаза 8. Production Readiness

## Цель

Подготовить TutorBoard к реальной эксплуатации в составе tutor-assistant-web.

## PR 8.1 — Security hardening

- strict CSP;
- Trusted Types assessment;
- SVG sanitization hardening;
- dependency audit;
- SRI/build integrity where applicable;
- no token persistence;
- secure embedding policy;
- rate-limit integration;
- input size limits;
- audit-sensitive actions.

## PR 8.2 — Observability

Frontend telemetry:

- error boundary events;
- document save latency;
- GeometryOS latency/outcome;
- WebSocket reconnects;
- dropped operations;
- render performance;
- anonymized document size metrics.

Use platform correlation ID. Do not log board contents or student PII by default.

## PR 8.3 — Performance budgets

Define and enforce:

- initial bundle size;
- time to interactive;
- canvas frame budget;
- max representative object count;
- pen latency;
- save payload size;
- collaboration operation rate.

## PR 8.4 — Browser compatibility

- Chrome/Edge primary;
- Firefox verification;
- Safari assessment;
- pointer/touch tests;
- high-DPI;
- Windows tablet/pen;
- graceful unsupported-browser messaging.

## PR 8.5 — Deployment

Options:

1. same-origin static frontend served by tutor-assistant-web/reverse proxy;
2. separate immutable static deployment with controlled API origin.

Required:

- immutable build artifact;
- environment config injection;
- no secrets in bundle;
- staging;
- smoke tests;
- rollback;
- cache policy;
- source maps access policy.

## PR 8.6 — Disaster recovery

- document backup;
- revision restore drill;
- object storage restore;
- collaboration snapshot recovery;
- corrupted document quarantine;
- user-visible recovery path.

## PR 8.7 — SLO and alerts

Example service objectives:

- board load success;
- save success;
- GeometryOS request success separated from domain clarification;
- collaboration connection success;
- data-loss incidents: zero tolerated;
- p95 save and operation propagation budgets.

## PR 8.8 — Release workflow

- release candidate;
- dependency/security gates;
- E2E against staging platform;
- manual production approval;
- immutable version;
- changelog;
- rollback documentation.

## Exit criteria фазы 8

- production deployment reproducible;
- security review complete;
- performance budgets enforced;
- backups and restore drill successful;
- alerts and runbooks exist;
- release can be rolled back without document loss.

---

# 14. Фаза 9. Advanced Geometry and AI

## Цель

Расширить возможности только после стабилизации основной доски.

## Направление 9.1 — Structured semantic editing

- выбрать point and inspect constraints;
- request GeometryOS recomputation;
- mathematical edit command;
- GIR patch/replacement contract;
- preserve visual overrides when possible;
- explicit invalid geometry state.

## Направление 9.2 — Extended geometry coverage

- circles;
- polygons;
- perpendiculars/parallels;
- angle marks;
- equal-length marks;
- coordinate axes;
- function graphs;
- transformations;
- multi-construction documents.

## Направление 9.3 — AI board assistant

Possible commands:

- «объясни выделенное построение»;
- «добавь вспомогательную линию»;
- «создай похожую задачу»;
- «найди ошибку в решении»;
- «сформируй краткий итог доски».

Rules:

- AI does not mutate board silently;
- proposed changes shown as preview;
- semantic geometry validated by GeometryOS;
- user explicitly accepts mutation;
- provenance stored.

## Направление 9.4 — Learning analytics

- teacher-authored tags;
- board event summaries;
- difficulty markers;
- connection to transcript evidence;
- competency heatmap updates;
- privacy-preserving aggregation.

## Направление 9.5 — Templates

- lesson board templates;
- reusable geometry constructions;
- subject-specific tool palettes;
- versioned template documents;
- organization-level template permissions.

---

# 15. Cross-repository изменения

## GeometryOS

Возможные follow-up контракты по результатам spike:

- structured layout metadata;
- stable visual representation IDs;
- GIR patch/recompute endpoint;
- semantic edit validation;
- richer geometry entities;
- board-oriented consumer fixtures.

Любое изменение должно:

- сохранять API versioning policy;
- проходить compatibility checker;
- иметь TutorBoard fixture;
- обновлять generated client tests.

## tutor-assistant-web

Потребуются:

- board document tables;
- board revisions;
- scoped board access token;
- GeometryOS gateway;
- WebSocket/collaboration service;
- lesson-board relation;
- evidence artifact integration;
- publication policy;
- tenant-aware audit.

## tutor-assistant desktop

Планируемая минимальная интеграция:

- хранить board URL/document ID в metadata занятия;
- открывать TutorBoard в браузере;
- включать board reference в publication payload;
- не реализовывать canvas повторно.

## Latexed / DocumentEngine

Планируемая интеграция:

- принимать board snapshots и selected GIR as generation evidence;
- вставлять изображения в LaTeX/HTML materials;
- сохранять provenance;
- не интерпретировать BoardDocument самостоятельно.

## students-26-27

Переходный adapter:

- static board snapshot;
- link to published interactive board if permitted;
- metadata-free student presentation;
- existing PDF/TEX/HTML download structure.

---

# 16. Версионирование

Независимые версии:

| Контракт | Пример |
|---|---|
| TutorBoard application | `0.x` → `1.0.0` |
| BoardDocument schema | `1.0`, `1.1` |
| Collaboration protocol | `v1` |
| GeometryOS API | `v1 / 1.0.0` |
| GIR | `0.2.0`, далее независимо |
| Platform Board API | `/api/v1/boards` |
| LessonEvidenceBundle | собственная версия |

Правила:

- application version не заменяет document schema version;
- stored document migration обязательна;
- breaking API change требует нового major namespace или формального compatibility decision;
- collaboration client/server negotiate protocol version;
- published evidence remains immutable.

---

# 17. Стратегия тестирования

## Unit

- reducers;
- commands;
- coordinate transforms;
- IDs;
- schema validation;
- GIR mapping;
- migration;
- conflict detection;
- collaboration operation application.

## Component

- toolbar;
- prompt panel;
- inspector;
- error states;
- selection overlay;
- save status.

## Integration

- store ↔ renderer;
- store ↔ persistence;
- GeometryOS client ↔ adapter;
- platform API ↔ document repository;
- collaboration transport ↔ operation engine.

## Contract

- generated GeometryOS OpenAPI types;
- TutorBoard fixtures;
- tutor-assistant-web Board API schema;
- LessonEvidenceBundle extension;
- WebSocket message schema.

## E2E

- manual board workflow;
- GeometryOS vertical scenario;
- reload/recovery;
- lesson context;
- role permissions;
- two-client collaboration;
- lesson finalization and publication.

## Non-functional

- large document benchmark;
- memory leak test;
- reconnect/chaos;
- security regression;
- accessibility;
- browser matrix;
- deployment smoke;
- backup/restore drill.

---

# 18. CI evolution

## Фаза 2

```text
lint
format-check
typecheck
unit-tests
architecture-tests
build
e2e-smoke
```

## Фаза 4+

Добавить:

```text
GeometryOS contract
platform API contract
integration E2E
security audit
bundle budget
```

## Фаза 6+

Добавить:

```text
multi-client collaboration tests
protocol compatibility
chaos/reconnect
load tests
```

## Фаза 8

Добавить:

```text
staging deployment
production-like E2E
security scan
artifact integrity
manual approval
post-deploy smoke
```

---

# 19. Качество PR

Каждый PR обязан содержать:

- одну ясную цель;
- описанный scope и non-scope;
- tests;
- architecture impact;
- migration impact;
- security/privacy impact;
- screenshots или demo для UI;
- updated docs/ADR при изменении решения;
- acceptance checklist.

Запрещается:

- смешивать canvas refactor и API redesign без необходимости;
- добавлять backend TutorBoard до platform integration decision;
- хранить secrets в frontend;
- вводить `any` для обхода contract errors;
- сериализовать Konva runtime;
- молча менять stored schema;
- молча превращать visual drag в mathematical edit.

---

# 20. Milestone gates

## Gate A — Architecture proven

- Phase 2 report accepted;
- GIR mapping works;
- coordinate ownership decided;
- no critical unknown hidden behind fallback.

## Gate B — Single-user product foundation

- stable BoardDocument;
- undo/redo;
- import/export;
- performance baseline;
- accessibility baseline.

## Gate C — Platform-connected

- real identity;
- tenant isolation;
- lesson context;
- server save;
- GeometryOS gateway.

## Gate D — Collaborative classroom

- two-client convergence;
- reconnect;
- authorization;
- load limits.

## Gate E — Post-lesson integration

- immutable board evidence;
- material generation context;
- student publication.

## Gate F — Production-ready

- secure deployment;
- observability;
- SLO;
- backup/restore;
- release and rollback.

---

# 21. Приоритеты

## P0

- отсутствие потери документа;
- tenant data isolation;
- deterministic GIR mapping;
- correct coordinate transforms;
- recovery after failed save/reconnect;
- safe SVG;
- stable schema migration.

## P1

- undo/redo;
- performance;
- access control;
- collaboration convergence;
- evidence immutability;
- audit and observability.

## P2

- advanced styling;
- templates;
- rich export;
- subject-specific tools;
- analytics.

## P3

- decorative polish;
- plugin ecosystem;
- marketplace;
- nonessential customization.

---

# 22. Основные риски

## Canvas lock-in

Mitigation: собственный BoardDocument и canvas adapter.

## GIR недостаточен для интерактивного layout

Mitigation: structured experiment, diagnostics, versioned GeometryOS proposal.

## Дублирование backend tutor-assistant-web

Mitigation: platform integration ADR до server persistence.

## Data loss during autosave/collaboration

Mitigation: revisions, optimistic concurrency, offline recovery, replayable operations, restore drill.

## Premature CRDT complexity

Mitigation: отдельный collaboration spike и измеримые requirements.

## Semantic drag ambiguity

Mitigation: visual/mathematical classification and explicit feature gate.

## Public exposure of internal GeometryOS

Mitigation: production gateway through tutor-assistant-web.

## PII leakage in logs/evidence

Mitigation: metadata minimization, redaction, scoped access, explicit evidence contract.

## Scope explosion

Mitigation: phase exit criteria and explicit non-goals.

---

# 23. Definition of Done продукта 1.0

TutorBoard 1.0 считается готовым, когда:

- преподаватель открывает доску из занятия tutor-assistant-web;
- ученик присоединяется с корректной ролью;
- оба видят согласованное состояние;
- доступны основные инструменты;
- GeometryOS создаёт интерактивное построение;
- document сохраняется server-side с revisions;
- reconnect не теряет изменения;
- урок можно финализировать;
- snapshot входит в LessonEvidenceBundle;
- материалы могут использовать board evidence;
- опубликованный ученик видит только разрешённые данные;
- система имеет security review, observability, backup/restore, SLO и rollback;
- API, document и collaboration contracts versioned;
- production release воспроизводим.

---

# 24. Ближайшее действие

PR 2.1–2.6 завершены. Следующий практический этап — **PR 2.7 Safe SVG
insertion**.

Он должен добавить строгую sanitization boundary, byte/node/depth/dimension
limits, вычисление bounds, selection/movement и явные invalid-input diagnostics.
SVG остаётся untrusted visual Board object и не используется как источник
математической семантики.
