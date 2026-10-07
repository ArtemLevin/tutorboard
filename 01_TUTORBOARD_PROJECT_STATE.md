# TutorBoard — текущее состояние проекта

**Дата среза:** 30.09.2026  
**Репозиторий:** `ArtemLevin/tutorboard`  
**Ветка:** `main`  
**Срез поставки:** PR #133 — `Input Foundation + Shape Constraints`  
**Последняя поставка текущего среза:** PR #133 — `feat: harden board input and Shift shape constraints`

---

## 0. P0 build/CI recovery — 30.09.2026

Исходный `main` для recovery-блока: `7f3c29a7b35771f340858cc2d4f9edaff3d3cca2`.

PR #154 (`fix/p0-build-contract-consistency`) восстанавливает build contract и
обязательные quality gates. Проверенный implementation SHA до синхронизации
проектной документации:

`02603132f6dd2fae2aeeb92f294b92ac2a122235`

На этом SHA успешно завершён GitHub Actions CI run `36762680350`:

- Quality gate: board/GeometryOS contracts, format, lint, strict typecheck,
  dependency audit, 832 unit tests, performance budgets, architecture и
  production build;
- Board-only frontend profile;
- Chromium и Firefox browser smoke;
- GeometryOS live browser contract;
- Coordinate Plot production gate.

Browser smoke включает оба eraser regression-сценария из
`tests/e2e/drawing-tools.spec.ts`: mixed editable erase с live preview +
one-step undo и partial pen-stroke erase + atomic undo.

P0 исправляет:

- optional `batchId` normalization и сохранение при durable queue
  `reconcile()`;
- branded `GroupId` / `Solid3DId` в eraser controller;
- тип `BoardDocument` для server-sync applied accumulator;
- устаревший тестовый импорт `planEraserChanges` с переносом mixed-erasing
  coverage на действующий App/controller flow;
- generator/generated drift board contract docs и manifest hashes;
- накопленный Prettier drift, блокировавший обязательный quality gate.

Reliability-блок от `da10527` закрывает operational P1: atomic group enqueue/ack,
monotonic Lamport, durable batch identity/restart, StrictMode lifecycle и terminal
ticket denial. Подробности и проверочные команды — в
`docs/P1_DURABLE_SYNC_REVIEW.md`; статус review findings — в operational addendum
`03_TUTORBOARD_BACKLOG.md`. Deployment и controlled pilot gates остаются отдельными.

## 1. Назначение проекта

TutorBoard — браузерная интерактивная образовательная доска и клиентское ядро экосистемы Tutor Assistant.

Ключевые зоны ответственности:

- бесконечное полотно и интерактивные объекты;
- рукописный ввод и Smart Ink;
- математические построения и интеграция с GeometryOS;
- координатная плоскость и графики;
- семантические 3D-модели и построение сечений;
- локальная persistence-модель документа;
- server sync и collaboration;
- экспорт учебных материалов и снимков доски;
- интеграция с lesson-bound workflow платформы Tutor Assistant.

Архитектурное разделение:

```text
GeometryOS
  математическая семантика, GIR, layout
        ↓
TutorBoard
  представление, интерактивность, состояние доски
        ↓
tutor-assistant-web
  пользователи, занятия, API, storage, sync, business workflow
```

---

## 2. Технологический стек

Основной стек на текущем `main`:

- React `19.2.8`;
- React DOM `19.2.8`;
- TypeScript `6.0.2`;
- Vite `8.1.5`;
- Three.js `^0.179.1`;
- Konva `10.3.0`;
- React-Konva `19.2.5`;
- Dexie `4.4.4`;
- Zod `4.4.3`;
- pdf-lib `1.17.1`;
- DOMPurify `3.4.12`;
- Vitest `4.1.10`;
- Playwright `1.61.1`;
- ESLint `10.7.0`;
- Prettier `3.9.6`.

Требования к runtime/toolchain:

```text
Node.js >= 24
npm >= 11
```

Главная команда quality gate:

```bash
npm run check
```

Она выполняет:

1. GeometryOS contract check;
2. Board contract check;
3. formatting check;
4. ESLint;
5. TypeScript typecheck;
6. Vitest;
7. performance tests;
8. architecture boundary validation;
9. production build.

---

## 3. Текущее состояние `main`

Текущий delivery-срез включает следующие последующие поставки:

| PR | Назначение | Состояние |
|---|---|---|
| #110 | critical sync/security hardening | merged |
| #111 | декомпозиция App orchestration | merged |
| #112 | precision-first Smart Ink 2.0 | merged |
| #113 | production-ready realtime collaboration | merged |
| #114 | board bootstrap и remote sync hardening | merged |
| #116–#121 | standalone board contracts, security architecture, launch, teacher workspace и test hardening | merged |
| #123 | board-only production-plan frontend foundation | merged |
| #125 | standalone access convergence hardening | merged |
| #126–#129 | board export UX и fidelity hardening | merged |
| #131 | controlled-pilot teacher/guest E2E | merged |
| #133 | Input Foundation + Shape Constraints | текущая поставка |

PR #132 остаётся отдельным параллельным PR и не является источником истины для
этого среза. Фактический interaction baseline определяется PR #133 и его
проверенным diff.

### 3.1. Active stroke latency — 06.10.2026

После PR #175 dense-board rendering больше не пересобирает неизменённую
committed scene на transient updates. Дополнительный root-cause review выявил
оставшийся input/render feedback loop внутри текущего активного pen stroke:

- coalesced hardware samples редуцировались по одному и каждый accepted sample
  копировал накопленную immutable history;
- Wet Ink повторно строил geometry по всей истории stroke на каждом animation
  frame;
- локальный pen preview одновременно проходил через React renderer и imperative
  Wet Ink path.

Draft PR #176 (`perf/active-stroke-latency`) переводит pen moves на один batch
reducer update, исключает per-move React publication локального pen preview и
рендерит Wet Ink как sealed chunks + bounded mutable tail. Continuation state
сохраняет dash/wavy/sketch phase между chunks; collaboration preview получает
imperative point deltas. BoardDocument 1.6, persisted pen representation,
command/undo и completed-stroke Smart Ink input не изменяются.

Production code-head `67c78ce7b1eeb7ef1213d7f43873522f4e28b0bc`
прошёл Quality gate run `37466497150`: 181/181 test files, 990/990 tests,
10/10 performance files и 18/18 performance tests, architecture boundaries и
production build. На том же SHA Chromium и Firefox browser smoke прошли по
28/28 scenarios; Board-only frontend profile, GeometryOS live browser contract
и Coordinate Plot production gate также green. Финальный PR #176 HEAD
`6957440c246a75fde7962de2e076e23e5cecd189` прошёл свежий CI и переведён
в Ready for review.

### 3.2. Main-thread latency hardening — 06.10.2026

Stacked PR #177 (`perf/main-thread-latency-hardening`) уменьшает main-thread
competition, оставшуюся вокруг уже incremental active-stroke pipeline:

- Wet Ink p95 больше не сортирует 240-value latency window каждый frame;
  percentile refresh ограничен 500 ms, exact snapshot остаётся on demand;
- BoardStage throttles diagnostic DOM dataset publication до 500 ms и делает
  final flush на clear/finish;
- board-scoped GIF coordinator снижает Layer repaint до 24 fps только во время
  active Wet Ink interaction и немедленно возвращает normal cadence после
  finish/cancel/visibility resume;
- browser `@smoke` regression собирает Long Task evidence вокруг synthetic
  coalesced 240 Hz-equivalent stroke и проверяет, что diagnostic publication
  заметно реже frame count.

Проверенный code-head `91469e822dd84e3732073c153cbe1382942558c5`
прошёл CI run `37473332612`: 181/181 unit/integration files, 992/992 tests,
10/10 performance files и 18/18 performance tests, architecture boundaries и
production build. Chromium и Firefox browser smoke прошли по 28/28 scenarios;
Board-only frontend profile, GeometryOS live browser contract и Coordinate Plot
production gate green. Smart Ink, Formula Recognition и Paddle sidecar gates
на том же SHA также green.

Persisted BoardDocument, command/undo contracts, collaboration ordering,
original media bytes и z-order этим блоком не изменяются.

### 3.3. Off-main-thread document computation — 06.10.2026

PR #178 (`perf/off-main-thread-document-computation`) переносит current-schema
full-document canonical serialization и SHA-256 с browser main thread в lazy
Worker adapter через core port `BoardDocumentComputation`.

Local persistence:

- autosave вызывает `prepareSave()` сразу при schedule и использует debounce
  окно как prewarm для Worker serialization;
- background save использует подготовленный async result;
- pagehide и SPA dispose сохраняют synchronous lifecycle serialization;
- если background save уже ждёт Worker, lifecycle flush запускает второй
  repository save с тем же operation ID и lifecycle priority до возврата из
  handler; Dexie duplicate-before-conflict semantics делают promotion
  идемпотентным;
- Worker failure деградирует к прежней inline serialization/hash реализации.

Server sync:

- `BoardSyncEngine` получает async document hasher через port;
- current schema SHA для recovery/apply flow вычисляется в Worker и
  переиспользуется там, где transport digest совпадает с canonical head hash;
- evidence finalization использует тот же worker-backed SHA;
- legacy 1.4/1.5 compatibility digests остаются migration/recovery fallback.

StrictMode ownership worker-а привязан к конкретному effect setup; cleanup
уничтожает только принадлежащий ему Worker instance.

Проверенный code-head `ecf35fce19d6d81871853477926ac4e15b4cd5a4`
прошёл CI run `37482601624`: 182/182 unit/integration files, 1000/1000 tests,
10/10 performance files, 18/18 performance tests, architecture boundaries и
production build. Chromium browser smoke: 28/28; Firefox browser smoke: 28/28.
GeometryOS live browser contract, Board-only frontend profile, Coordinate Plot
production gate, Smart Ink, Formula Recognition и Paddle sidecar gates green.

Persisted BoardDocument/schema, revision identity, undo/redo, collaboration
ordering, media bytes и public contracts сохраняются.

### 3.4. Large-raster memory baseline — 06.10.2026

PR #179 (`perf/raster-memory-baseline`) добавляет измерительный слой перед
изменением raster renderer. `RasterImageDiagnostics` отслеживает renderer
decode lifecycle: start/complete/fail/release, duplicate concurrent decode,
decode duration, active/peak decoded image count и estimated RGBA bytes.
BoardStage публикует snapshot в diagnostic data attributes для browser tests.

Production-like browser fixture создаёт два одинаковых PNG 4096×3072 с малым
compressed payload и вставляет их обычным clipboard media flow. Persisted
`image.embedded`, import limits, collaboration и rendering semantics этим
блоком не меняются.

Проверенный code-head `5051b0db0af4f7f4945088b11c2eec622ff07df0`
прошёл CI run `37495639140`: 183/183 unit/integration files, 1003/1003 tests,
10/10 performance files, 18/18 performance tests, architecture boundaries и
production build. Chromium/Firefox smoke прошли по 29/29 scenarios; GeometryOS,
Board-only и Coordinate Plot gates green. Smart Ink, Formula Recognition и
Paddle sidecar gates green.

Measured browser baseline для двух одинаковых 4096×3072 raster objects:

- active/peak estimated decoded RGBA bytes: 100,663,296;
- decode starts: 2;
- duplicate concurrent decode starts для одного content SHA: 1;
- Chromium max renderer decode: 1 ms; max frame gap: ~66.7 ms; Long Task:
  68 ms;
- Firefox max renderer decode: 13 ms; max frame gap: ~49.84 ms; engine не
  предоставляет `longtask` PerformanceObserver entry type.

### 3.5. Bounded resolution-aware raster cache — 07.10.2026

PR #180 (`perf/raster-decode-cache`) реализует A2 поверх измерений PR #179.

Static PNG/JPEG renderer:

- `RasterDecodeCache` coalesces одинаковые concurrent requests;
- cache identity включает immutable content SHA, resolution bucket и exact
  embedded source, чтобы forged/colliding source не получил чужой bitmap;
- decode concurrency по умолчанию ограничена двумя задачами;
- retained decoded-cache budget по умолчанию 128 MiB;
- zero-ref entries вытесняются LRU и закрывают underlying `ImageBitmap`;
- bucket вычисляется из display size, object scale, ancestor/group scale,
  viewport zoom и devicePixelRatio;
- PNG/JPEG используют resized `createImageBitmap`; unsupported/failing bitmap
  path сохраняет HTMLImageElement fallback;
- GIF redraw/animation и sanitized SVG rendering остаются на существующих путях.

Import path PNG/JPEG теперь извлекает intrinsic dimensions из file headers и
выполняет 1×1 decode probe для сохранения corrupt-file rejection contract.
Persisted `image.embedded`, BoardDocument schema, command/collaboration
contracts и original media bytes не меняются.

Self-review добавил lifecycle cleanup: когда на доске больше нет static raster
objects, zero-ref cache entries trim'ятся; при BoardStage unmount запускается
тот же cleanup после renderer releases. In-flight zero-ref decode безопасно
discard'ится после завершения. Browser regression после Clear требует
`activeDecodedCount=0` и `activeEstimatedDecodedBytes=0`.

Проверенный production code-head
`7b5d8aa3533f9319e246bacc42ec83667ca66883` прошёл CI run
`37613545140`:

- 184/184 unit/integration files, 1013/1013 tests;
- 10/10 performance files, 18/18 tests;
- architecture boundaries и production build;
- Chromium browser smoke: 29/29;
- Firefox browser smoke: 29/29;
- GeometryOS live browser contract, Board-only frontend profile и Coordinate
  Plot production gate;
- Smart Ink, Formula Recognition и Paddle formula sidecar gates.

A1 → A2 на двух одинаковых PNG 4096×3072:

| Metric | A1 | A2 |
| --- | ---: | ---: |
| decoded working set | 100,663,296 B | 786,432 B |
| actual decode starts | 2 | 1 |
| duplicate concurrent starts | 1 | 0 |
| reduction | — | 128× |

Финальный A2 browser evidence: Chromium max RAF gap 50 ms и 0 Long Tasks;
Firefox max RAF gap ~67.46 ms, `longtask` entry type отсутствует. Async renderer
decode completion составил 210.4 ms в Chromium и 69 ms в Firefox; эта величина
зависит от среды и используется как diagnostic evidence, без latency budget.

Остаточные ограничения A2:

- base64 data URL → Blob для `image.embedded` всё ещё выполняется синхронно в
  canvas adapter; asset-backed media уберёт этот large-media source path;
- 128 MiB budget ограничивает retained/evictable zero-ref cache; активно
  отображаемые referenced resources сохраняются до release;
- import decode probe сохраняет compatibility validation и всё ещё просит
  браузер декодировать содержимое, хотя output surface ограничен 1×1.

Следующий C3 milestone — asset-backed media persistence по ADR-032 для устранения
embedded-byte revision amplification и перехода large media к owned binary
assets.

---

## 4. CI/CD и release gates

Для release candidate PR #133 после final self-review успешно завершаются
основные workflow; после merge этот набор проверок является release evidence
для соответствующего состояния `main`.

### CI

Успешно прошли:

- Quality gate;
- GeometryOS live browser contract;
- Browser smoke — Chromium;
- Browser smoke — Firefox;
- Coordinate plot production gate;
- Production image.

### Дополнительные product gates

Успешно завершены:

- Smart Ink production gate;
- Formula recognition production gate.

### Production image

CI проверяет:

- immutable Docker image;
- запуск read-only контейнера;
- non-root runtime;
- healthcheck;
- Trivy scan по HIGH/CRITICAL vulnerabilities.

---

## 5. BoardDocument и persistence

Фактическая версия документа в коде:

```text
BoardDocument schemaVersion = 1.4
```

Ключевые разделы модели:

- `objects`;
- `order`;
- `groups`;
- `geometryImports`;
- `solidModels`;
- `solidLearningAttempts`;
- `viewport`;
- versioned timestamps и document metadata.

Persistence строится вокруг command-only mutation boundary, versioned document schema и строгой runtime validation.

Поддерживаются:

- undo/redo;
- deterministic import/export;
- IndexedDB через Dexie;
- autosave;
- server revisions;
- durable queue неподтверждённых команд;
- SHA verification;
- offline → reconnect;
- optimistic conflict handling;
- server rollback / split-brain protection.

---

## 6. Smart Ink

### Текущая модель работы

Smart Ink работает в режиме автоматического принятия уверенно распознанной фигуры.

Pipeline:

```text
pen stroke
  ↓
commit исходного drawing.pen-stroke
  ↓
recognizer
  ↓
recognized candidate
  ↓
core.objects.replace
  ↓
готовый BoardDocument object
```

При ambiguous/unrecognized результате исходный штрих сохраняется.

Undo восстанавливает исходный stroke.

### Поддерживаемые классы

Основной recognizer поддерживает:

- line;
- circle;
- ellipse;
- rectangle;
- square;
- triangle.

Дополнительно имеется отдельный recognizer рукописных стрелок:

```text
tutorboard.smart-ink-arrow/1.0
```

### Circle policy

Текущая canvas-policy:

```text
minimumConfidence = 0.34
ambiguityMargin = 0.02
sampleCount = 96
circle.minimumAxisRatio = 0.75
circle.minimumCandidateConfidence = 0.25
```

### Исправление треугольника

Распознанный треугольник использует linear Vector Ink centerline через:

```ts
createLinearVectorInkDataFromPoints(...)
```

Это формирует прямые стороны и устраняет эффект треугольника Рёло, возникавший при cubic smoothing.

### Arrow recognizer

Распознавание стрелки анализирует:

- shaft residual;
- геометрию наконечника;
- две стороны наконечника;
- возврат линии к tip;
- wing ratio;
- symmetry;
- направление крыльев относительно shaft;
- fit error.

Порог confidence:

```text
0.82
```

### Технический риск Smart Ink

Arrow recognizer запускается после основного primitive recognizer в ситуации, когда primitive candidate отсутствует.

Следующий полезный тестовый сценарий:

```text
рукописная стрелка → primitive recognizer уверенно выбирает line
```

Стоит проверить class arbitration между `line` и `arrow`, особенно для длинных стрелок с небольшим наконечником.

---

## 7. Toolbar и базовый UX доски

Отдельная иконка/меню «Фигуры» удалена из toolbar.

Основная компактная навигация сейчас организована вокруг групп:

- Selection;
- Drawing;
- Math;
- AI;
- Media.

В AI-группе доступны:

- Smart Ink;
- рукописная функция;
- «Построение по тексту».

Термин `GeometryOS` в пользовательском сценарии построения заменён на более понятное название «Построение по тексту».

Базовые фигуры продолжают существовать в drawing/domain модели и доступны соответствующим пользовательским сценариям и shortcut workflow.

---


### 7.1. Input Foundation + Shape Constraints — 29.09.2026

PR #133 вводит единый interaction contract для solo board workflow:

- централизованный shortcut registry и collision test;
- `L` — линия, `V` — selection, `Shift+V` — lasso;
- tool shortcuts используют физический `KeyboardEvent.code`, поэтому не
  зависят от русской/английской раскладки;
- `1..5` переключают пять основных цветов активного drawing tool;
- modifier state (`Shift/Alt/Ctrl/Meta`) проходит через canvas adapter →
  interaction router → drawing controller → deterministic reducer;
- late `Shift` пересчитывает preview без дополнительного движения указателя;
- линия фиксируется с шагом 15° и hysteresis 2°;
- rectangle + Shift → square;
- ellipse + Shift → circle;
- polygon + Shift → equal radii;
- preview и committed geometry используют один constraint resolver;
- transient constraint feedback не сохраняется в BoardDocument и не попадает в
  export/persistence.

Совместимость сохранена:

```text
BoardDocument schema     unchanged
command protocol         unchanged
IndexedDB persistence    unchanged
server API / WebSocket   unchanged
export formats           unchanged
```

Следующий UX scope:

1. partial vector eraser;
2. forgiving hit testing;
3. перенос multi-selection за общую padded область;
4. при необходимости отдельные browser interaction-performance budgets.

## 8. GeometryOS integration

TutorBoard использует GeometryOS как внешний математический semantic engine.

Общий pipeline:

```text
текстовый запрос
    ↓
TutorBoard
    ↓
same-origin /api/v1/geometryos
    ↓
tutor-assistant-web
    ↓
GeometryOS
    ↓
GIR
    ↓
Layout Document
    ↓
Board adapter
    ↓
BoardDocument objects
```

Репозиторий содержит pinned consumer contracts, runtime validation, code generation и live contract smoke.

CI отдельно поднимает pinned GeometryOS image и проверяет:

- live protocol;
- browser integration;
- production contract compatibility.

---

## 9. Координатная плоскость и графики

Coordinate plot имеет отдельный production gate.

Текущая CI-проверка включает:

- integration tests;
- persistence tests;
- sync tests;
- performance budgets;
- Chromium lifecycle;
- Firefox lifecycle;
- visual regression matrix.

Подсистема уже рассматривается как production-grade часть TutorBoard.

---

## 10. 3D — текущее состояние

3D-подсистема существенно расширена серией PR #103–#109.

### 10.1. Поддерживаемые тела

Текущий semantic catalog включает:

- cube;
- cuboid;
- tetrahedron;
- octahedron;
- prism;
- pyramid;
- truncated pyramid;
- regular polyhedron;
- sphere;
- hemisphere;
- cylinder;
- cone;
- truncated cone.

Также добавлена нативная поддержка правильных многогранников, включая dodecahedron и icosahedron.

### 10.2. Semantic anchors

Используются устойчивые anchors для:

- vertex;
- edge;
- topology face;
- analytic surface.

Для topology faces хранится стабильная triangle identity и barycentric local position.

Для analytic surfaces применяются parameterized semantic anchors.

Это позволяет сохранять положение точек при изменении размеров тела.

### 10.3. Parametric editing

Поддерживается изменение размеров и параметров тел.

В зависимости от типа модели редактируются:

- edge length;
- width / height / depth;
- radius;
- top/bottom radius;
- solid height;
- base scale;
- arbitrary polygon bases;
- количество сторон основания.

Изменение размеров выполняется транзакционно.

### 10.4. Construction Studio

Добавлен отдельный construction workflow для 3D.

Поддерживается:

- выбор типа тела;
- призмы и пирамиды с `3..32` сторонами;
- усечённые пирамиды;
- arbitrary polygon base;
- добавление вершин основания;
- удаление вершин;
- изменение порядка вершин;
- синхронное соответствие bottom/top base у truncated pyramid.

### 10.5. Параметризованный текстовый ввод 3D

Поддерживаются запросы вида:

```text
призма 7
семиугольная призма
пирамида с 11 угольным основанием
усечённая пятиугольная пирамида
додекаэдр
икосаэдр
```

### 10.6. Persistent model rotation

Поворот тела сохраняется в модели отдельно от состояния камеры.

Используется normalized quaternion.

Доступны:

- X/Y/Z rotation;
- ручной ввод градусов;
- шаг `-15°`;
- шаг `+15°`;
- presets `0°`;
- presets `90°`;
- presets `180°`;
- полный reset;
- drag через XYZ rotation gizmo.

Поворот участвует в последующей проекции сечения на доску.

### 10.7. Semantic highlights

Hover может подсвечивать:

- vertex;
- edge;
- topology face;
- analytic surface.

Для analytic surfaces используется triangle-to-semantic-surface mapping.

### 10.8. Постановка точек

Пользователь может ставить точки непосредственно на 3D-модель.

Для точки сохраняются:

- semantic anchor;
- position;
- id;
- editable label.

Лимит записи:

```text
32 точки на модель
```

Hidden helper points, используемые constraints workflow, исключаются из стандартного списка пользовательских точек.

### 10.9. Сечения

Текущий lifecycle:

```text
выбор 3 точек
    ↓
live preview
    ↓
Создать сечение
    ↓
persistent saved section
    ↓
выбор активного сечения
    ↓
Отобразить выбранное сечение на доске
```

Сечение сохраняет собственный `sectionId`.

Поддерживаются:

- editable section labels;
- visibility;
- deletion;
- active section selection;
- exact area/perimeter в локальных единицах модели;
- 2D projection на BoardDocument.

Лимит:

```text
8 сохранённых сечений на модель
```

### 10.10. Constrained sections

Реализованы semantic constraints:

- плоскость через ребро и точку;
- плоскость через точку параллельно topology face;
- плоскость через точку перпендикулярно ребру;
- плоскость через точку параллельно planar analytic base.

Для сохранения constraint semantics используются helper points.

При resize тела helper geometry пересчитывается.

### 10.11. 3D learning workspace

BoardDocument 1.4 содержит `solidLearningAttempts`.

Учебный режим включает сценарии:

- prediction;
- guided construction;
- exact measurement;
- proof;
- dynamics;
- reflection;
- hints;
- diagnostics;
- playback;
- analytics export.

3D learning включается отдельным feature flag.

---

## 11. WebGL lifecycle

Текущий viewport использует Three.js WebGLRenderer и OrbitControls.

Реализовано:

- обработка ошибки создания renderer;
- обработка `webglcontextlost`;
- retry UI;
- доступное fallback-представление;
- dispose OrbitControls;
- dispose Three.js scene resources;
- `renderer.dispose()`;
- `renderer.forceContextLoss()` при cleanup;
- ResizeObserver;
- lazy/open-on-demand 3D workflow.

### Потенциальная зона для дополнительного hardening

Главный lifecycle-effect `Solid3DViewport` сейчас зависит от:

```text
cameraMode
record.definition
record.projection
resetToken
retryToken
```

При изменении `record.projection` этот effect может полностью пересоздавать WebGL renderer и вызывать cleanup предыдущего контекста.

Одновременно ниже существует отдельный effect, который уже применяет новый quaternion к существующему `runtime.root`.

Стоит провести отдельный targeted review с целью проверить возможность исключить `record.projection` из renderer-construction lifecycle и оставить обновление rotation только через lightweight runtime effect.

Ожидаемый эффект:

- меньше WebGL context churn;
- меньше GPU allocation churn;
- стабильнее drag rotation;
- ниже риск context exhaustion в длительной сессии;
- проще mental model viewport lifecycle.

---

## 12. Feature flags

Ключевые feature flags:

```text
VITE_FEATURE_SERVER_SYNC
VITE_FEATURE_SMART_INK
VITE_FEATURE_SMART_INK_DIAGNOSTICS
VITE_FEATURE_SOLID_3D
VITE_FEATURE_SOLID_3D_LEARNING
VITE_FEATURE_GEOMETRY_PROMPT
VITE_FEATURE_HANDWRITTEN_FUNCTIONS
VITE_FEATURE_MATH_INK_RECOGNITION
VITE_FEATURE_DOCUMENT_SNAPSHOTS
VITE_FEATURE_DEV_DIAGNOSTICS
```

Текущая политика:

- `serverSync` по умолчанию включается в production;
- `solid3D` по умолчанию включён в development/test;
- `solid3D` по умолчанию выключен в production;
- `solid3DLearning` зависит от `solid3D`;
- Smart Ink проходит через отдельный release gate;
- diagnostics ограничены environment policy.

---

## 13. Известные расхождения документации

Текущая документация местами отстаёт от фактической реализации.

### 13.1. BoardDocument version

В коде:

```text
BoardDocument 1.4
```

В части документов всё ещё встречается:

```text
BoardDocument 1.3
```

### 13.2. 3D section workflow

Фактический UX:

```text
preview → explicit save → active selection → project to board
```

В старом описании 3D всё ещё встречается автоматическое создание сечения после постановки трёх точек.

### 13.3. Toolbar

Отдельная кнопка «Фигуры» удалена, однако README всё ещё содержит старое описание групп панели.

### 13.4. 3D capabilities

`docs/architecture/SOLID_3D.md` отражает раннюю фазу подсистемы и пока не описывает полностью:

- semantic analytic anchors;
- stable topology anchors;
- parametric resize;
- persistent quaternion rotation;
- rotation gizmo;
- Construction Studio;
- constrained sections;
- saved section labels;
- generalized projection workflow;
- 3D learning integration.

---

## 14. Техническая оценка текущего состояния

### Сильные стороны

1. Хорошо выраженные module boundaries.
2. Versioned persistence contracts.
3. Command-based document mutations.
4. Сильная CI-система с browser gates.
5. Отдельные product gates для Smart Ink и formula recognition.
6. Production image hardening.
7. GeometryOS live contract validation.
8. Семантическая 3D-модель вместо purely visual mesh logic.
9. Хорошее покрытие persistence/sync edge cases.
10. 3D уже поддерживает meaningful educational workflows.

### Основные текущие риски

1. Documentation drift.
2. Возможный WebGL renderer churn при persistent rotation.
3. Необходимость ручного UX/математического тестирования сложных 3D construction flows.
4. Возможные class conflicts Smart Ink `line ↔ arrow`.
5. Рост сложности `Solid3DEditorPanel` и связанных компонентов.
6. Необходимость сохранять schema compatibility при дальнейшем расширении semantic 3D records.
7. Production rollout 3D всё ещё регулируется feature flag.

---

## 15. Рекомендуемые следующие шаги

### P0 — documentation sync

Обновить:

- `README.md`;
- `docs/architecture/SOLID_3D.md`;
- связанные ADR/guides.

Зафиксировать:

- BoardDocument 1.4;
- актуальный toolbar;
- explicit section lifecycle;
- Construction Studio;
- constrained sections;
- rotation model;
- 3D learning.

### P0 — WebGL lifecycle hardening

Провести focused audit `Solid3DViewport`.

Проверить:

- необходимость зависимости renderer effect от `record.projection`;
- число создаваемых WebGL contexts при rotate/nudge/preset;
- повторные открытия/закрытия 3D;
- memory/GPU cleanup;
- context-loss recovery;
- Chromium/Firefox parity.

### P1 — Smart Ink arrow arbitration

Добавить corpus и regression cases:

- короткие стрелки;
- длинные стрелки;
- узкий head;
- широкий head;
- single-wing-like noise;
- стрелка, похожая на line;
- line, похожая на arrow;
- разные направления stroke order.

Проверить arbitration между primitive recognizer и arrow recognizer.

### P1 — 3D teacher UX pass

Провести ручные сценарии:

- prism/pyramid 3–32 sides;
- truncated pyramid;
- arbitrary base;
- resize после постановки points;
- resize после constrained section;
- rotate → project section;
- edit labels;
- delete point with dependent sections;
- multiple saved sections;
- max capacity boundaries;
- read-only behavior.

### P2 — component decomposition

При дальнейшем росте 3D UI рассмотреть разбиение `Solid3DEditorPanel` на более узкие orchestration-компоненты:

- viewport controller;
- point manager;
- section manager;
- saved section list;
- construction panel;
- learning workspace shell.

Цель — снизить coupling и упростить regression testing.

---

## 16. Базовая точка для дальнейшей работы

Все последующие изменения следует считать основанными на:

```text
repository: ArtemLevin/tutorboard
branch: main
delivery reference: PR #133
state date: 2026-09-29
```

Перед следующими крупными изменениями рекомендуется сверять HEAD с этим документом и обновлять разделы состояния при существенном изменении архитектуры, schema version, release gates или UX contract.

---

## 17. Краткий статус

```text
Core canvas                READY
BoardDocument              1.4
Persistence                READY
Server sync                READY / production-controlled
GeometryOS integration     READY
Coordinate plot            PRODUCTION-GATED
Smart Ink                  PRODUCTION-GATED
Arrow recognition          IMPLEMENTED
Formula recognition        PRODUCTION-GATED
3D semantic kernel         IMPLEMENTED
3D parametric editing      IMPLEMENTED
3D persistent rotation     IMPLEMENTED
3D Construction Studio     IMPLEMENTED
3D constrained sections    IMPLEMENTED
3D learning workspace      IMPLEMENTED
3D production rollout      FEATURE-GATED
Documentation alignment    NEEDS UPDATE
WebGL lifecycle audit      RECOMMENDED
```
