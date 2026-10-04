# TutorBoard — план закрытия findings аудита 2026-10-03

Дата: 2026-10-03  
Репозиторий: `ArtemLevin/tutorboard`  
Baseline: `57f3318b02dc646492310ddeaeebc4339a5e1f8f`  
Источник: `tutorboard-audit-2026-10-03.md`

## 1. Цель

Закрыть подтверждённые findings аудита небольшими независимыми PR с воспроизводимыми regression tests, сохранением backward compatibility и полным quality gate перед merge.

Порядок работ:

```text
A1 → A2 → A3 → A4 → A5
→ B1 → B2 → B3
→ C1 → C2 → C3
→ D1 → D2 → D3
```

Приоритет:
1. корректность пользовательского ввода и экспортируемых данных;
2. отзывчивость доски;
3. манипуляции объектами и media UX;
4. probabilistic recognition и OCR integration.

Каждый следующий PR создаётся от уже смерженного предыдущего `main`, чтобы исключить длинную stacked-цепочку и упростить review/regression isolation.

### Execution status — 2026-10-04

| Этап | Статус | Evidence |
| --- | --- | --- |
| A1 — Pen pressure & tap | RESOLVED | PR #157–#158 |
| A2 — Stroke width & stroke styles | RESOLVED | PR #159–#160 |
| A3 — Closed Vector Ink / render bounds / Wet Ink parity | RESOLVED | PR #161–#163 |
| A4 — Unified text keyboard contract | RESOLVED | PR #164 |
| Browser release gate after A1–A4 | RESOLVED | PR #165; `main` CI `37186878246` green |
| A5 — Coordinate plot export fidelity | RESOLVED | PR #167; PR CI `37194207372` green |
| B1 — Eraser broad-phase selection | RESOLVED | PR #168; PR CI `37197289434` green |
| B2 — Incremental eraser gesture | RESOLVED | PR #169; PR CI `37200715401` green; merged as `932371e046cedcee4b55399b7764637352eba858` |
| B3 — Clear/resource lifecycle | RESOLVED | PR #170; merged as `893c3cb601844e0a827d084579acae3e0a5cfb55` |
| C1 — Line endpoint rotation | RESOLVED | PR #171; merged as `5d88746eb46f7280d89e543ac285c885a1510f6b`; final CI `37214700224` green |
| C2 — Context-aware image sizing and ±50% | RESOLVED | PR #172; merged as `7965d3926d27e3c134efcfd2df52c0571e486a41`; final HEAD `35ad7c697eecf257b7ccdc62cfafac52d2914fef`; CI #2017 green |

PR #165 дополнительно закрепил актуальный pen-tap contract в Chromium/Firefox
browser coverage и выровнял right-double-click object settings с forgiving
selection через один screen-stable proximity tolerance. Полный push-CI на
`main` после merge прошёл Quality gate, Chromium/Firefox E2E, Board-only
profile, Coordinate plot production gate, GeometryOS live browser contract и
Production image.

PR #167 закрыл A5: document-transfer snapshot теперь использует тот же
renderer-neutral Coordinate Plot render model и production sampler, что и
interactive canvas. Экспорт сохраняет real series geometry, viewport,
grid/axes, clipping, series visibility/styles, legend, relation fills и
раздельные discontinuity fragments. PNG и PDF получают ту же geometry через
общий SVG rasterization path. CI routing дополнен так, чтобы изменения
`src/modules/document-transfer/snapshot.ts` запускали Coordinate Plot
production gate.

---

## 2. Общий engineering contract для каждого PR

Рабочий цикл:

```text
reproduce
→ trace flow
→ identify root cause
→ add regression guard
→ implement minimal correct fix
→ focused verification
→ full quality gates
→ diff self-review
→ fix review findings
→ merge
```

Обязательные правила:

- перепроверять finding на актуальном `main` до изменения кода;
- не менять persisted formats, public contracts и collaboration semantics без необходимости;
- не ослаблять существующие тесты;
- не использовать `skip`, `xfail`, `@ts-ignore`, broad mocks или timing sleeps как обход дефекта;
- одна пользовательская операция должна сохранять атомарный undo;
- read-only и collaboration boundaries должны сохраняться;
- новые performance changes проверяются на одинаковой workload до/после;
- новые recognition changes проверяются на positive и negative corpus;
- после существенных изменений обновлять `PLAN.md`, project state/backlog/decision docs, если меняются фактический статус или контракт.

### Базовый full gate

После focused tests:

```sh
npm run check
```

Он включает:

- GeometryOS contract check;
- board contract check;
- format check;
- lint;
- typecheck;
- unit tests;
- performance tests;
- architecture check;
- production build.

Дополнительно запускать относящиеся к PR specialized/browser gates.

---

# Release train A — корректность пера, текста и экспорта

## A1 — Pen pressure & tap

### Finding

Stationary pressure sample отбрасывается при совпадающих координатах. Последовательность:

```text
pointerdown pressure=0
stationary move pressure=0.8
pointerup pressure=0
```

сохраняет только нулевое давление, поэтому короткий tap может оказаться почти невидимым.

### Root cause

`src/modules/drawing/interaction.ts`:

`appendPenSample()` отбрасывает новый sample, если координаты равны предыдущим, независимо от изменения pressure.

`completePen()` при коротком tap может использовать pressure финального `pointerup`, которое у реального пера часто равно нулю.

### Scope

- сохранять stationary sample при значимом изменении pressure;
- корректно выбирать useful contact pressure при завершении tap;
- сохранить текущий limit samples;
- не менять persisted `VectorInkData` schema;
- проверить mouse/pointer без meaningful pressure.

### Regression matrix

- `0 → 0.8 → 0`;
- `0.5 → 0`;
- stationary pressure progression;
- normal moving stroke;
- mouse input;
- быстрый tap;
- undo одной операцией.

### Acceptance criteria

- обычное касание пером создаёт визуально различимую точку;
- полезное pressure не теряется из-за stationary coordinates;
- normal strokes не получают лишних геометрических артефактов;
- старые документы читаются без миграции;
- focused tests + `npm run check` green.

### Предлагаемая ветка

`fix/pen-pressure-tap`

---

## A2 — Stroke width & stroke styles

### Findings

- `thin` принудительно даёт width 2;
- `thick` принудительно даёт width 6;
- ряд других styles имеет hard lower bounds;
- wavy pen визуально совпадает с solid;
- wet ink preview использует иной width contract, чем final renderer.

### Целевой контракт

```text
strokeWidth = фактическая числовая толщина
strokeStyle = характер линии
```

Preset может один раз выставить рекомендованную ширину. После этого изменение числового поля должно непосредственно влиять на финальный результат.

### Scope

- реорганизовать `resolveStrokeStyle`;
- согласовать wet-ink и persisted renderer;
- реализовать реальную wavy geometry для pen stroke;
- проверить dashed/dash-dot semantics для применимых pen representations;
- не менять BoardDocument schema;
- обновить UI tests для поля «Толщина».

### Acceptance criteria

- изменение числовой толщины видно на доске для всех поддерживаемых стилей;
- wavy визуально и структурно отличается от solid;
- preview не меняет толщину/характер после `pointerup`;
- export renderer соблюдает тот же контракт;
- zoom не ломает visual width semantics;
- focused tests + full gate green.

### Предлагаемая ветка

`fix/pen-stroke-style-width`

---

## A3 — Closed Vector Ink outline

### Finding

Замкнутый variable-width outline может иметь разрыв около первой вершины.

Минимальный reproducer:

```text
(0,0) → (200,0) → (100,160) → (0,0)
```

### Root cause area

`src/core/board/vector-ink.ts`

При closed stroke дублирующая конечная точка удаляется, затем offset boundaries соединяются способом, который не гарантирует корректное замыкание обеих границ в районе seam.

### Scope

- корректно строить closed outer/inner boundaries;
- обеспечить непрерывность seam;
- сохранить поддержку variable pressure;
- проверить CW/CCW orientation;
- проверить острые углы;
- не менять persisted Vector Ink format.

### Regression matrix

- triangle CW;
- triangle CCW;
- rectangle;
- freehand closed contour;
- varying pressure;
- thin/thick;
- export;
- partial eraser.

### Acceptance criteria

- contour покрывает весь замкнутый centerline без seam gap;
- отсутствуют self-crossing artefacts на типичных фигурах;
- старые documents render корректно;
- unit + renderer/export tests green.

### Предлагаемая ветка

`fix/vector-ink-closed-outline`

---

## A4 — Unified text keyboard contract

### Finding

Новый inline text editor и редактор выбранного существующего текста используют разные keyboard semantics.

### Target UX contract

- `Enter` — newline;
- `Shift+Enter` — commit;
- `Ctrl+Enter` / `Cmd+Enter` — commit, если этот существующий shortcut сохраняется;
- `Escape` — текущая documented cancel/selection semantics;
- IME composition не должен случайно commit/cancel;
- одно редактирование = одна undo operation.

### Scope

- вынести общий keyboard helper/contract;
- применить к обоим editor flows;
- добавить tests для IME;
- проверить read-only transition и focus/blur duplication.

### Acceptance criteria

- новая и существующая надпись ведут себя одинаково;
- нет double commit через keydown + blur;
- multiline text работает;
- IME safe;
- undo/redo atomic.

### Предлагаемая ветка

`fix/text-editor-keyboard-contract`

---

## A5 — Coordinate plot export fidelity

### Finding

Snapshot renderer экспортирует для `math.coordinate-plot` фактически placeholder plane: series не экспортируются. Изменение выражения не меняет SVG-источник export.

### Severity

Высокая: экспорт способен терять математическое содержимое пользователя.

### Target architecture

Использовать общий plot sampling/render model для interactive и export surfaces:

```text
plot definition
→ shared sampler/render model
→ canvas renderer
→ SVG/PDF/PNG renderer
```

### Scope

- export real series;
- viewport;
- axes;
- clipping;
- visibility;
- series style;
- labels/legend, если входят в current interactive contract;
- discontinuities без ложных соединений;
- parameter/relation data по поддерживаемому current model.

### Required fixtures

- `x^2`;
- `2*x+a`;
- `1/x`;
- shifted viewport;
- hidden series;
- multiple series;
- parameterized curve;
- relation/implicit case;
- large zoom;
- full-board export.

### CI routing

Проверить `scripts/ci/compute-gate-routing.mjs`.

Если изменение `src/modules/document-transfer/snapshot.ts` не включает Coordinate Plot production gate, добавить export/snapshot path в routing contract и regression test маршрутизации.

### Acceptance criteria

- математически разные графики дают разные exported geometry;
- разрывные функции не соединяют ветви;
- SVG/PNG/PDF согласованы;
- coordinate plot production tests + browser visual matrix green;
- full gate green.

### Предлагаемая ветка

`fix/coordinate-plot-export`

---

# Release train B — ластик и lifecycle

## B1 — Eraser broad-phase selection

**Статус: RESOLVED — PR #168.**

### Finding

`selectObjectIdsNearPath` выполняет дорогую pairwise geometry проверку без предварительного bounding-box отсечения.

Audit benchmark:

| Objects | Path points | Median |
|---:|---:|---:|
| 100 | 10 | 1.33 ms |
| 100 | 100 | 7.23 ms |
| 1,000 | 10 | 7.08 ms |
| 1,000 | 100 | 48.00 ms |
| 5,000 | 10 | 24.86 ms |
| 5,000 | 100 | 212.72 ms |

### Scope

Добавить cheap broad phase:

```text
object bounds
vs
expanded swept-path bounds
→ only possible candidates
→ precise distance calculation
```

Первый PR не меняет gesture state machine.

### Verification

- correctness parity against current selector;
- far-object benchmark;
- dense intersecting scene;
- mixed object kinds;
- zoom-independent world geometry.

### Acceptance criteria

- candidate search значительно дешевле на sparse large board;
- hit-set соответствует прежнему correct behavior;
- performance test фиксирует budget/trend без brittle machine-specific threshold;
- full gate green.

### Предлагаемая ветка

`perf/eraser-broad-phase`

---

## B2 — Incremental eraser gesture

**Статус: RESOLVED — PR #169.**

### Finding

Каждый move повторно обрабатывает весь накопленный gesture path.

### Target flow

Session хранит:

- последнюю обработанную точку;
- accumulated affected object IDs;
- replacement/fragments state;
- stable fragment IDs;
- session baseline metadata.

Каждый move обрабатывает только новый path segment.

### Concurrency requirement

На `finish` использовать актуальный document и безопасно reconciliation-ить накопленный preview с объектами, изменившимися во время жеста.

Нельзя commit stale deletion поверх concurrent edit.

### Additional cleanup

Унифицировать eraser preference storage format с backward-compatible чтением старого numeric/JSON representation.

### Acceptance criteria

- gesture cost не растёт линейно со всей пройденной историей path;
- все pointer samples учитываются;
- preview остаётся визуально устойчивым;
- commit атомарен;
- grouped erase и pen split сохраняют current semantics;
- concurrent change test;
- one undo per gesture.

### Предлагаемая ветка

`perf/eraser-incremental-gesture`

### Реализованный контракт

- session фиксирует baseline document, radius и последнюю обработанную точку;
- каждый update передаёт geometry только новый delta path;
- pen fragments эволюционируют последовательно и сохраняют IDs до реального split;
- обычные объекты и группы аккумулируются один раз;
- finish reconciliation сравнивает affected snapshots со свежим document;
- stale object/group/pen targets исключаются из commit;
- ungrouped delete и pen replacement объединяются через batch-replace;
- один завершённый gesture публикуется одним `commitCommands()` и остаётся одной
  undo operation;
- eraser preferences читают legacy numeric и JSON representation, запись
  канонизирована в JSON.

PR-CI `37200381127`: unit suite, performance budgets, production build,
Chromium/Firefox eraser smoke и Board-only profile — green. Smart Ink, Formula
Recognition и Paddle sidecar gates на том же HEAD — green.

---

## B3 — Clear/resource lifecycle

### Established facts

Scene selector cache после clear уменьшается до нуля.

После clear остаются достижимыми:

- undo history;
- coordinate plot sampling LRU;
- clipboard;
- persistent revisions/history.

### Product decision

Операция «Очистить доску» остаётся отменяемой.

Поэтому history не сбрасывается только ради уменьшения памяти.

### Scope

- очищать derived renderer/sampling caches;
- завершать transient sessions;
- проверять cleanup image/GIF animation resources;
- документировать различие между undo-retained state и technical cache;
- heap/profile scenario `fill → clear → GC`.

### Acceptance criteria

- deleted objects отсутствуют в active scene/render caches;
- derived caches очищаются или bounded;
- background animation после unmount отсутствует;
- undo после clear восстанавливает документ;
- repeated fill/clear не даёт неограниченного роста technical cache.

### Implementation status — PR #170

- Coordinate Plot sampling LRU имеет явный lifecycle и очищается после
  успешного clear command;
- drawing/eraser/handwriting/GeometryOS/laser/selection transient sessions,
  plot/3D editors и local transform preview завершаются при clear;
- GIF redraw scheduler отменяет pending `requestAnimationFrame` при unmount и
  не может пересоздать цикл после cleanup;
- undo history, persistent revisions и clipboard сохраняются намеренно:
  это пользовательское/восстанавливаемое состояние, в отличие от derived cache;
- repeated Coordinate Plot fill/clear regression возвращает cache size к нулю;
- существующий App clear→undo regression подтверждает восстановление документа.

Code-head PR-CI `37204307985` прошёл Quality gate, полный unit/performance
набор, architecture/build, Chromium/Firefox browser smoke, Board-only profile,
GeometryOS live browser contract и Coordinate Plot production/visual matrix.
Smart Ink, Formula Recognition и Paddle sidecar gates на том же HEAD — green.

### Предлагаемая ветка

`perf/clear-resource-lifecycle`

---

# Release train C — объектные манипуляции и media

## C1 — Line endpoint rotation

### Requirement

Выбранную линию можно вращать мышью за один конец вокруг противоположного.

### Contract

- два endpoint handles;
- hit area задаётся в screen px;
- dragged endpoint задаёт угол;
- opposite endpoint фиксирован в world coordinates;
- длина линии сохраняется;
- resize/length change остаётся отдельной операцией;
- read-only запрещает изменение.

### Required cases

- zoom;
- pan;
- transformed line;
- grouped line;
- rotated/scaled parent transforms;
- pointer capture/cancel;
- collaboration transform preview;
- undo.

### Acceptance criteria

- fixed endpoint действительно не смещается;
- длина сохраняется в пределах numerical tolerance;
- одна drag operation = один undo;
- keyboard/selection regressions отсутствуют.

### Implementation status — PR #171

- два endpoint handles отображаются для сфокусированной writable user-line;
- radius и hit area нормализованы через viewport zoom и остаются screen-stable;
- dragged endpoint задаёт направление, opposite endpoint остаётся фиксированным
  в world coordinates, world-length сохраняется;
- pure core geometry учитывает existing object transform и rotated/non-uniform
  parent transforms;
- grouped user-line изменяется через строго ограниченный transform-only
  `core.objects.replace` без новой schema/command kind;
- pointer capture, Escape, pointercancel, lost capture, blur и viewport change
  завершают session безопасно; commit происходит один раз на pointer-up;
- collaboration transform preview сохраняет parent transforms grouped object;
- generic Transformer остаётся отдельным resize/general-rotation механизмом;
- read-only/locked line и locked group endpoint editing не получают.

Regression coverage:

- core geometry: оба endpoint, transformed line, rotated/non-uniform parent,
  degenerate/singular cases;
- command/reducer: grouped transform-only policy, membership/geometry mutation
  rejection, line/group locks;
- Chromium/Firefox smoke: реальный endpoint drag, fixed pivot, preserved length,
  один undo;
- browser cancel regression: Escape не создаёт history operation.

Final review дополнительно закрепил два edge-case контракта:

- endpoint click без фактического drag не создаёт no-op history operation;
- commit использует baseline gesture; concurrent изменение target object или
  parent group transform приводит к stale rejection вместо overwrite.

Final code-head `a6ea034f4158393d0d607e0ecc4fc81807354685` прошёл CI
`37214700224`: Quality gate, unit/performance suites, architecture/build,
Chromium/Firefox smoke, Board-only profile, GeometryOS live browser contract и
Coordinate Plot production gate. Smart Ink `37214700284`, Formula Recognition
`37214700259` и Paddle sidecar `37214700269` также green. PR #171 смержен
как `5d88746eb46f7280d89e543ac285c885a1510f6b`.

### Предлагаемая ветка

`feat/line-endpoint-rotation`

---

## C2 — Context-aware image sizing and ±50%

### Current model

`image.embedded` уже содержит base `size` и generic object `scale`.

### Proposed persisted semantics

- `size` — base display size;
- uniform `scale` — пользовательский resize factor.

Новая schema не требуется.

### Placement policy

При вставке выбирать target size по следующему приоритету:

1. выбранный объект/группа, если контекст подходит;
2. соседние видимые изображения/media;
3. типичный видимый размер content;
4. viewport-relative fallback.

Всегда сохранять aspect ratio и ограничивать крайние размеры.

### Keyboard scale

Предпочтительная модель:

```text
50% → 100% → 150% → 200% → ...
```

`+` увеличивает на 50 percentage points, `-` уменьшает на 50 percentage points до минимального положительного scale.

Команды не перехватываются внутри input/textarea/contenteditable.

### Acceptance criteria

- вставляемая картинка имеет разумный экранный размер;
- +/− сохраняют aspect ratio и центр;
- одна клавиша = одна undo operation;
- работает для multi-selection изображений;
- locked/read-only objects не меняются;
- persistence/reload сохраняет результат.

### Implementation status — PR #172

- context-aware placement использует selection bounds → median visible media →
  median visible content → viewport fallback;
- aspect ratio и viewport-relative clamps сохраняются;
- `+` / `-` меняют selected media scale ступенями по 50 percentage points,
  сохраняя центр, rotation и legacy non-uniform scale;
- multi-selection коммитится одной undoable operation;
- read-only, locked, mixed non-media selection, text editing и key repeat
  сохраняют существующие semantics;
- persisted schema, BoardDocument format и command kinds не изменены;
- merge commit:
  `7965d3926d27e3c134efcfd2df52c0571e486a41`;
- final branch HEAD:
  `35ad7c697eecf257b7ccdc62cfafac52d2914fef`;
- CI `37221613258` (#2017), Smart Ink `37221613254`, Formula Recognition
  `37221613287` и Paddle `37221613252` завершились успешно.

### Реализованная ветка

`feat/image-sizing-shortcuts`

---

## C3 — Media performance

### Verified current flow

C3 starts from the merged C2 baseline and preserves the existing board contracts.

Current runtime flow on `main`:

1. `image.embedded` stores the original base64 `dataUrl`, SHA-256, intrinsic
   size and display size inside BoardDocument.
2. `EmbeddedImageRenderer` creates a fresh `HTMLImageElement` for every
   mounted embedded image and assigns `object.dataUrl`.
3. BoardStage performs viewport culling before rendering. Objects outside the
   viewport + overscan culling window are unmounted, so their renderer effects
   and GIF redraw loop are disposed.
4. Every visible GIF owns its own `requestAnimationFrame` loop through
   `startAnimatedImageRedraw()`.
5. Each GIF callback calls `batchDraw()` on the Konva Layer that contains all
   visible board content: static images, GIFs, drawing objects and coordinate
   plots.
6. Local autosave debounces document changes by 350 ms. Dexie persistence
   validates, canonicalizes and `JSON.stringify`-serializes the complete
   BoardDocument, including every embedded base64 payload, into an append-only
   full-document revision.
7. B3 already guarantees explicit GIF callback cancellation on unmount and
   clear-driven transient cleanup. C3 must extend this lifecycle safely rather
   than duplicate B3.
8. `media.asset` exists as a metadata/reference contract foundation, while
   the current canvas renderer is still a placeholder. External media bytes,
   resolver/storage and migration remain the separate ADR-032 rollout.

### Root-cause hypotheses

| ID | Confidence before profile | Hypothesis | Required evidence |
| --- | --- | --- | --- |
| C3-H1 | HIGH | A visible GIF invalidates the shared content Layer every animation frame, so unrelated static/vector/plot content is repainted with it. | Layer draw count, frame p95 and mixed-scene cost with 0/1/4/8 GIF while static scene complexity is held constant. |
| C3-H2 | HIGH | The app gives each mounted static raster its full source payload and provides no display-target decode/downscale or application-owned bounded decoded-resource cache. Browser decode policy is therefore uncontrolled by TutorBoard; remount/duplicate content can repeat decode work and may retain excessive decoded pixels. | Decode-start count, viewport churn profile, intrinsic-vs-display pixel ratio, memory/resource estimate and cleanup after eviction/unmount. |
| C3-H3 | HIGH for persistence path | Autosave repeatedly validates/canonicalizes/stringifies all embedded base64 payloads and stores a full append-only revision, making CPU/storage growth proportional to embedded bytes × revision count. | Serialized byte count, save/serialization duration and revision growth for 1/5/10 representative images. |
| C3-H4 | MEDIUM | N visible GIFs create N independent animation loops. Konva may coalesce actual Layer draws, but callback and `batchDraw()` request overhead still scales with GIF count. | Animation callback count and actual Layer draw count per browser frame. |
| C3-H5 | MEDIUM | Raster import decodes once to obtain intrinsic dimensions and the renderer decodes again after the object is mounted. | Import-to-first-paint decode event count and time. |
| C3-H6 | LOW/MEDIUM | Stable media components may still be recreated or redrawn during unrelated document/selection updates beyond what scene identity caching already prevents. | React/Konva render counts during unrelated pen/selection changes with stable media objects. |

The hypotheses are ranked for investigation only. No candidate optimization becomes
production code until its contribution is measured.

### Benchmark matrix

Use one deterministic fixture family for before/after measurements:

| Scenario | Variants |
| --- | --- |
| Static media | 1 / 5 / 10 PNG/JPEG objects; include high intrinsic-pixel / small display-size cases and duplicate SHA cases |
| Animated media | 1 / 4 / 8 GIF objects |
| Mixed scene | pen strokes + coordinate plots + static images + GIF |
| Viewport lifecycle | all visible; all media offscreen; repeated visible ↔ offscreen pan cycle |
| Page lifecycle | active page; hidden/background state where the browser harness can reproduce it deterministically |
| Persistence | one edit after 1 / 5 / 10 embedded images; repeated autosave revisions |
| Cleanup | delete/clear/unmount followed by resource/callback accounting |

The browser benchmark must run against a production build. Fixture setup time is
excluded from the measured window.

### Metrics and instrumentation

Primary metrics:

- animation callbacks requested/executed;
- Konva content-Layer draw / `batchDraw` requests;
- frame interval p50/p95/max and dropped-frame proxy;
- main-thread long tasks (>50 ms) during the measured window;
- image decode starts / completed resources;
- owned decoded-resource count and estimated decoded bytes/pixels when C3 adds
  an application cache;
- resource count after offscreen transition, clear and unmount;
- serialization duration;
- canonical serialized document bytes;
- persisted revision count / cumulative serialized bytes in the test repository.

Measurement strategy:

1. deterministic callback/resource invariants are CI-gated;
2. wall-clock/frame metrics use warm-up plus repeated samples and report
   median/p95;
3. Chromium browser memory/long-task diagnostics are evidence, with an absolute
   CI memory threshold added only when the chosen metric is stable on hosted
   runners;
4. Firefox remains part of functional lifecycle/smoke coverage even when a
   Chromium-only diagnostic API is needed for profiling.

Existing `WetInkRenderer` clock/surface injection is the preferred pattern for
deterministic frame-scheduler tests. Browser-only instrumentation should live in
the test harness where practical instead of shipping debug counters in
production runtime.

### Performance-budget calibration

Before the first production fix:

1. run two warm-up passes;
2. collect at least five measured passes per benchmark variant;
3. record median and p95 plus exact callback/draw/resource counts;
4. identify the dominant contributor by controlled one-variable comparisons;
5. set the regression budget from the verified post-fix distribution with CI
   headroom documented in the benchmark;
6. keep exact lifecycle/count invariants tighter than wall-clock budgets.

Provisional product targets for interpretation, subject to baseline validation:

- ordinary 1–4 GIF mixed scenes should target 60 fps class behavior
  (frame p95 around one display frame);
- 8-GIF stress should remain interactive and avoid repeated >50 ms long tasks;
- offscreen/hidden animated media should perform zero application-owned
  animation work after the lifecycle transition when C3 explicitly owns that
  state;
- decoded-resource retention must be bounded by explicit entry/pixel/byte
  limits;
- cleanup must return active callback/resource ownership to zero for a cleared
  board.

No existing performance threshold may be relaxed to accommodate C3.

### Decision tree after baseline

#### If C3-H4 dominates callback overhead

Implement an adapter-owned **shared animated-media redraw coordinator**:

- visible GIF renderers register/unregister with one coordinator;
- one scheduler loop services all registered GIFs;
- each unique Konva Layer receives at most one redraw request per animation
  frame;
- `visibilitychange` pauses/resumes the coordinator explicitly;
- viewport culling continues to unregister offscreen GIFs;
- cleanup is idempotent and B3 clear/unmount semantics remain green.

This is the preferred minimal fix because it preserves object order and current
Konva layer composition.

#### If C3-H1 remains dominant after callback coalescing

Do not move GIFs into a single top overlay because that would violate z-order.

First profile a z-order-preserving rendering design. Candidate approaches are
segmented static/animated render runs or bounded cached static groups. This
becomes a separate C3 sub-block with its own visual, hit-testing, transform and
z-order regression matrix before adoption.

#### If C3-H2 dominates decode/memory

Introduce a BoardStage/BoardCanvas-scoped **bounded embedded-image resource
runtime**:

- key stable resources by `contentSha256`;
- protect actively mounted resources with ownership/ref-count semantics;
- retain released resources only under bounded LRU policy;
- add explicit `clear()` / `dispose()`;
- close disposable decoded resources on eviction;
- keep GIF animation on the animation path;
- evaluate downscaled display `ImageBitmap` for PNG/JPEG only after measuring
  quality and browser support;
- derive display decode size from actual rendered scale/zoom with bucketed sizes
  to avoid re-decoding on every small zoom change;
- preserve the original `dataUrl` for persistence/export/source fidelity.

Cache constants (entry count and decoded pixel/byte budget) are selected from
the measured matrix and recorded beside the implementation.

#### If C3-H3 dominates

Record the profile as an architectural blocker and route the fix to the
ADR-032 media-asset / persistence workstream.

C3 must not silently:

- remove embedded bytes from existing BoardDocument objects;
- change revision format/retention;
- alter BoardCommand/snapshot schema;
- increase command-size limits;
- rewrite collaboration transport.

Any local revision deduplication/compaction also requires a separate persistence
design with migration/recovery analysis.

#### If C3-H5 is material

Reuse a prepared static decoded resource through the transient media runtime so
the import path can seed the renderer cache. Persisted object shape remains
unchanged.

### Implementation-ready sequence

#### C3.0 — Baseline and instrumentation

1. branch from the latest green `main` as `perf/media-rendering`;
2. add deterministic media fixtures and a browser profiling harness;
3. add a media-specific Vitest performance file for serialization/resource
   invariants that do not require a browser;
4. add a Chromium production-build profile for decode/frame/redraw/long-task
   evidence;
5. add lightweight Chromium/Firefox media lifecycle smoke coverage;
6. capture the C2-baseline results in a committed performance report or CI
   artifact referenced from the PR;
7. choose the dominant contributor and ratify budgets before behavior changes.

No production behavior changes belong in C3.0.

#### C3.1 — Minimal confirmed fix

Implement only the fix(es) justified by C3.0. Likely touched components,
depending on the measured branch:

- `src/adapters/canvas-konva/animated-image-redraw.ts`;
- `src/adapters/canvas-konva/embedded-image-renderer.tsx`;
- `src/adapters/canvas-konva/renderer-registry.tsx`;
- `src/adapters/canvas-konva/BoardStage.tsx`;
- `src/app/board/views/BoardCanvas.tsx`;
- a new adapter-owned media runtime/cache module if C3-H2 is confirmed.

Persistence modules remain measurement-only during C3 unless a separately
approved persistence design expands scope.

#### C3.2 — Regression coverage

Required tests for whichever fix is activated:

- one / four / eight GIF scheduler ownership;
- one redraw request per unique layer per frame when shared scheduling is used;
- offscreen unmount unregister;
- hidden/background pause + visible resume;
- clear/unmount idempotent cleanup;
- duplicate-SHA static resource reuse when caching is used;
- LRU bound and deterministic eviction;
- active resource cannot be evicted while owned;
- disposable resource close on eviction/clear;
- viewport churn does not cause unbounded decode growth;
- image transform, selection, hit area, z-order and export behavior unchanged;
- mixed coordinate-plot/pen/media scene remains correct;
- original `dataUrl` and `contentSha256` unchanged by display optimization.

#### C3.3 — Project gates

Focused checks are followed by:

- media-specific unit tests;
- media performance benchmark;
- `npm run performance`;
- `npm run check`;
- Chromium and Firefox browser smoke;
- Board-only frontend profile;
- specialized gates selected by canvas/composition routing;
- production-build media profile.

If CI routing is extended with a dedicated media-performance job, routing tests
must prove that media renderer/runtime/benchmark changes activate it and
documentation-only changes remain on the fast path.

#### C3.4 — Review / merge

1. compare the final benchmark against the recorded C2 baseline;
2. self-review resource ownership, cleanup, z-order, hit testing, transforms,
   export, undo/read-only and backward compatibility;
3. inspect the final diff for debug counters or benchmark-only production code;
4. update C3 status/evidence in `PLAN.md` and this document;
5. open the implementation PR;
6. perform an independent pre-merge review;
7. merge only with the applicable release gates green.

### Acceptance criteria

C3 is DONE when all of the following are evidenced:

- reproducible before/after profile exists;
- dominant contributor is demonstrated by controlled measurements;
- the selected fix materially improves the dominant metric;
- callback/resource ownership remains bounded under 1/4/8 GIF and viewport
  churn;
- mixed media + pen + coordinate-plot interaction stays responsive within the
  ratified budget;
- cleanup after offscreen/clear/unmount is verified;
- export uses original source fidelity;
- BoardDocument schema, command/envelope formats, object IDs, z-order,
  collaboration, undo/redo, read-only and group semantics remain compatible;
- full quality gate and relevant browser/specialized gates are green;
- any base64/history bottleneck that requires external assets is explicitly
  transferred to the ADR-032 workstream with evidence.

### Предлагаемая ветка

`perf/media-rendering`

---

# Release train D — Smart Ink и handwriting

## D1 — Smart Ink session grouping integration

### Finding

В коде существует временная session/grouping policy, но рабочий drawing controller её фактически не использует для common multi-stroke flow.

### Scope

- подключить time + spatial grouping к реальному controller flow;
- не расширять recognition vocabulary сверх минимально нужного;
- сохранить single-stroke arbitration;
- определить lifecycle session: start/extend/commit/timeout/cancel.

### Acceptance criteria

- существующие single-stroke cases не деградируют;
- близкие по времени/месту strokes попадают в один candidate group;
- дальние/поздние strokes не сливаются;
- ordinary writing не преобразуется автоматически без достаточной confidence.

### Предлагаемая ветка

`feat/smart-ink-session-grouping`

---

## D2 — Multi-stroke shapes and arrows

### Scope

Добавить recognition для:

- triangle/rectangle из отдельных сторон;
- разных порядков ввода сторон;
- reversed direction;
- arrow shaft + отдельный V-head;
- relevant near-miss negatives.

### Corpus requirement

Перед изменением thresholds создать/расширить human corpus:

- positives;
- messy positives;
- text negatives;
- formula negatives;
- near-shape negatives.

### Primary metric

False-positive rate имеет такой же приоритет, как recall.

### Acceptance criteria

- target multi-stroke figures распознаются на corpus;
- false-positive regression отсутствует;
- ambiguous cases не превращаются silently в неверную фигуру;
- materialized geometry использует уже исправленный Vector Ink/shape renderer;
- Smart Ink production gate green.

### Предлагаемая ветка

`feat/smart-ink-multistroke`

---

## D3 — Handwritten function runtime integration

### Current state

Frontend workflow уже существует:

```text
write strokes
→ recognize
→ edit formula
→ plot
```

Autoresognition зависит от feature flags, same-origin gateway и OCR provider.

Board profile currently conflicts with enabling these capabilities.

### Scope

1. определить approved board-profile exposure;
2. проверить frontend environment contract;
3. проверить `tutor-assistant-web` gateway availability;
4. при необходимости выполнить согласованные frontend/backend PR;
5. настроить live smoke;
6. проверить timeout/error/retry UX;
7. подтвердить отсутствие secrets в browser.

### Acceptance criteria

- production-like board profile стартует с согласованным feature contract;
- live OCR request проходит на test/provider environment;
- malformed/timeout/provider-down обрабатываются;
- manual formula correction остаётся fallback;
- secret/token values не попадают в frontend bundle/logs.

### Предлагаемая ветка

`feat/board-handwriting-runtime`

---

# 3. Merge policy

Для этой программы использовать sequential merge:

```text
main
  ↓
PR A1
  ↓ merge
main
  ↓
PR A2
...
```

Не создавать длинную цепочку dependent stacked PR.

Перед каждым merge:

1. focused checks;
2. `npm run check`;
3. relevant specialized CI;
4. Chromium/Firefox smoke для UI/interaction changes;
5. independent diff self-review;
6. проверка backward compatibility;
7. проверка stale/debug code;
8. documentation/status sync.

---

# 4. Specialized gates по release train

## A1–A4

- focused unit/component tests;
- `npm run check`;
- browser smoke при затрагивании canvas/input composition.

## A5

- `npm run check`;
- `npm run plot:production`;
- `npm run e2e:plot-production`;
- `npm run e2e:plot-visual`;
- Chromium/Firefox.

## B1–B3

- focused geometry/controller tests;
- performance suite;
- `npm run check`;
- browser profile evidence для B2/B3.

## C1–C3

- interaction/component tests;
- browser smoke;
- transform/undo tests;
- media profile/heap evidence для C3;
- `npm run check`.

## D1–D2

- Smart Ink unit/corpus evaluation;
- Smart Ink production gate;
- browser smoke;
- `npm run check`.

## D3

- frontend tests;
- gateway tests;
- production-like live smoke;
- board-profile build;
- security/log-secret review;
- `npm run check`.

---

# 5. Compatibility constraints

На протяжении серии по умолчанию сохраняются:

- BoardDocument persisted schema;
- existing board URLs;
- sync command/envelope formats;
- collaboration contract;
- offline queue behavior;
- undo/redo semantics;
- public keyboard workflow, кроме явно исправляемого дефекта;
- read-only permissions;
- old embedded images;
- old vector ink;
- full runtime profile.

Breaking change допускается только после отдельного решения с migration path.

---

# 6. Risks

## Rendering risk

A2/A3/A5 затрагивают низкоуровневый rendering. Обязателен visual/browser regression coverage.

## Realtime risk

B2 и object transformations должны учитывать изменения документа между start и finish gesture.

## Data/memory risk

C3 может привести к архитектурному изменению media storage. Такой переход нельзя выполнять скрыто внутри performance optimization.

## Recognition risk

D1/D2 способны увеличить false positives. Threshold tuning без corpus запрещён.

## Deployment risk

D3 может затронуть `tutor-assistant-web`; frontend-only включение feature flags без работающего server authority/gateway не является завершением задачи.

---

# 7. Definition of done всей программы

Программа считается закрытой, когда:

- все применимые findings аудита имеют статус `RESOLVED` либо документированное техническое исключение;
- для каждого bugfix существует regression evidence;
- export сохраняет mathematical content;
- pen/tap/width/styles/closed outlines работают согласованно;
- eraser responsiveness подтверждена профилем;
- clear lifecycle не создаёт unbounded derived resource retention;
- line endpoint rotation и image scale UX работают с undo/read-only;
- media performance подтверждена до/после;
- multi-stroke Smart Ink проверен на positive/negative corpus;
- handwritten recognition подтверждён live smoke в согласованном deployment profile;
- полный quality gate остаётся green;
- project state, plan/backlog и решения синхронизированы.

---

# 8. Первый исполнимый шаг

Начать с **A1 — Pen pressure & tap**.

Причины:

- root cause уже локализован;
- есть минимальный reproducer;
- scope небольшой;
- persisted schema не меняется;
- исправление напрямую влияет на физическое перо;
- этот PR создаёт чистый baseline перед более широкими изменениями stroke renderer.
