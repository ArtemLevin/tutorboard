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

### Предлагаемая ветка

`feat/image-sizing-shortcuts`

---

## C3 — Media performance

### Important constraint

Аудит установил вероятные причины деградации, однако вклад каждой причины browser profile ещё не измерен.

Поэтому implementation начинается с воспроизводимого benchmark.

### Benchmark matrix

- 1/5/10 static images;
- 1/4/8 GIF;
- mixed pen + coordinate plot + images + GIF;
- visible/offscreen media;
- active/hidden tab;
- autosave cycle.

### Metrics

- frame duration/p95;
- main-thread long tasks;
- decoded image memory;
- heap before/after cleanup;
- autosave serialization;
- redraw count;
- animation callbacks.

### Candidate fixes only after profiling

- bounded display bitmap cache by `contentSha256`;
- downscaled bitmap для screen rendering;
- animated media isolated from static layer;
- pause offscreen/hidden-tab animation;
- memoization of stable rendering;
- bounded decoded-resource cache.

Если dominant cost связан с embedded bytes/history, переход к external asset storage выносится в отдельный architecture/data-migration PR.

### Acceptance criteria

- profile до/после сохранён;
- исправлен подтверждённый dominant contributor;
- measurable reduction in main-thread/render/memory cost;
- export quality/source preservation сохраняются;
- GIF cleanup verified.

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
