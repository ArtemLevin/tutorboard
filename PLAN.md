# TutorBoard standalone: execution plan и Board-only Production Profile

> Статус документа: основной execution plan.
>
> Последнее обновление: 2026-10-10.
>
> Документ синхронизирован с фактическим состоянием проекта после standalone
> contracts, access convergence, controlled-pilot E2E, **Input Foundation +
> Shape Constraints** (PR #133), **Partial eraser + forgiving selection**
> (PR #134), **Live text + Escape comfort** (PR #135) и CI/performance hardening
> вплоть до PR #142; дальнейшие C3 performance-этапы зафиксированы ниже.
> Ближайшая delivery цель по-прежнему —
> **Pilot Deployment Gate**: получить реальный HTTPS-сервер и провести
> controlled pilot с одним преподавателем и одним учеником. После pilot
> обязательным остаётся полный **Board-only Production Profile** и production
> release gate. Следующий отдельный продуктовый трек — board media assets:
> крупные изображения/GIF и последующий безопасный URL/video import.
>
> Исторические планы по полотну, GeometryOS, Smart Ink и lesson-bound интеграциям
> остаются в `docs/DEVELOPMENT_PLAN.md` и профильных ADR/документах в
> `docs/architecture/`. Этот файл определяет текущий порядок работ для публичного
> standalone TutorBoard.

## 0. P0 recovery gate — 30.09.2026

Build/CI recovery реализован в PR #154 от baseline
`7f3c29a7b35771f340858cc2d4f9edaff3d3cca2`. Implementation SHA
`02603132f6dd2fae2aeeb92f294b92ac2a122235` прошёл полный CI run
`36762680350`, включая Quality gate, board-only build и Chromium/Firefox
browser smoke.

Operational P1 review закрывается reliability-блоком
`fix/p1-durable-sync-lifecycle` от `da10527`:

1. `PendingBoardCommandQueue.enqueueBatch` и `acknowledgeBatch` задают
   транзакционные границы всей группы; `queueBatch` и undo используют этот порт.
2. Replay/quarantine сохраняет неделимость группы; restart сверяет принятые
   команды канонически и сохраняет batch idempotency key.
3. Все rebuild writers сливают Lamport clock через monotonic max, включая
   `list`, `reconcile` и concurrent enqueue из нескольких вкладок.
4. React effect владеет отдельным engine/Dexie connection; завершённый setup
   не публикует состояние в новый workspace.
5. Ticket denial допускает одно успешное обновление access context и одну
   повторную выдачу ticket; повторный отказ терминален. Сетевые ошибки сохраняют
   backoff, `4403` также уведомляет владельца sync engine.

Формат persisted command v3, IndexedDB version 4 и server envelope 1.7
сохраняются. Новые обязательные методы порта реализованы всеми adapters.
Контракт, recovery/rollback и regression evidence:
[`docs/P1_DURABLE_SYNC_REVIEW.md`](docs/P1_DURABLE_SYNC_REVIEW.md).
Operational findings ведутся в `03_TUTORBOARD_BACKLOG.md`.

### Input remediation release train — 03–04.10.2026

Аудит пользовательского ввода переведён в последовательный remediation train
из `docs/AUDIT_REMEDIATION_PLAN_2026-10-03.md`. На текущем `main` закрыты:

- A1 Pen pressure & tap — PR #157–#158;
- A2 Stroke width & stroke styles — PR #159–#160;
- A3 Vector Ink outline/bounds/Wet Ink parity — PR #161–#163;
- A4 Unified text keyboard contract — PR #164;
- browser release-gate drift после нового pen-tap contract — PR #165;
- A5 Coordinate plot export fidelity — PR #167;
- B1 Eraser broad-phase selection — PR #168;
- B2 Incremental eraser gesture — PR #169.

PR #165 восстановил единый 12 px screen-stable proximity contract для selection
и right-double-click object settings, а устаревшие canvas-mode browser tests
синхронизированы с materialized pen taps. Итоговый frontend baseline
`70d481f75b8faa72b01b381dc74bcb3a3d3fc826` прошёл push-CI
`37186878246`: Quality gate, Board-only profile, полный Chromium/Firefox E2E,
Coordinate plot production gate, GeometryOS live browser contract и Production
image — green. Smart Ink и Formula recognition production gates на том же SHA
также green.

PR #167 заменяет placeholder coordinate-plot snapshot на экспорт реальной
sampled geometry через общий renderer-neutral core render model. SVG сохраняет
viewport, grid/axes, clipping, visibility, styles, explicit/parametric/relation
series и discontinuity fragments; PNG и PDF растеризуют тот же SVG source.
PR-CI `37194207372` прошёл Quality gate, Coordinate plot integration/performance,
Chromium/Firefox lifecycle, visual regression matrix, browser smoke,
GeometryOS contract, Board-only profile и Production image.

PR #168 добавил conservative swept-path AABB broad phase перед exact
eraser geometry и закрепил sparse/dense performance regressions.

PR #169 перевёл eraser gesture на incremental session: каждый update обрабатывает
только новые pointer samples, pen fragments сохраняют стабильные IDs, а finish
reconciliation отбрасывает stale targets перед atomic commit. Eraser preference
storage унифицирован с backward-compatible чтением numeric/JSON форматов.
PR-CI `37200381127` прошёл Quality gate, unit/performance suites,
Chromium/Firefox browser smoke и Board-only profile; standalone Smart Ink,
Formula Recognition и Paddle gates на том же HEAD также green.

B3 Clear/resource lifecycle закрыт и смержен PR #170 как
`893c3cb601844e0a827d084579acae3e0a5cfb55`. Операция «Очистить холст»
сохраняет undo/history и clipboard как пользовательское состояние, одновременно
освобождая derived Coordinate Plot sampling cache, закрывая transient
drawing/eraser/handwriting/GeometryOS/laser/selection sessions, plot/3D editors
и transform preview. GIF redraw loop имеет явный cancel lifecycle.

C1 Line endpoint rotation закрыт и смержен PR #171 как
`5d88746eb46f7280d89e543ac285c885a1510f6b`. Финальный release-gate review
дополнительно устранил две edge-case проблемы: click по endpoint без drag больше
не создаёт no-op history entry, а commit endpoint transform привязан к baseline
жеста и отклоняет stale object/group transform при concurrent изменении.

Финальный code-head C1 `a6ea034f4158393d0d607e0ecc4fc81807354685`
прошёл CI `37214700224`: format/lint/typecheck, dependency threshold, unit и
performance suites, architecture/source boundaries, production build,
Chromium/Firefox browser smoke, Board-only profile, GeometryOS live contract и
Coordinate Plot production gate. Smart Ink `37214700284`, Formula Recognition
`37214700259` и Paddle sidecar `37214700269` также green.

C2 **Context-aware image sizing and ±50%** закрыт и смержен PR #172 как
`7965d3926d27e3c134efcfd2df52c0571e486a41`. Финальный branch HEAD
`35ad7c697eecf257b7ccdc62cfafac52d2914fef` прошёл CI run
`37221613258` (#2017), а также Smart Ink, Formula Recognition и Paddle
production gates.

Текущий этап remediation train — **C3 Media performance**. C3 начинается с
воспроизводимого browser profile и фиксации baseline по static images, GIF,
mixed scene, visibility/offscreen lifecycle и autosave. Production-код C3
изменяется только после подтверждения dominant contributor. Предлагаемая ветка:
`perf/media-rendering`.

05.10.2026: C3.0 baseline открыт в PR #174, его финальный HEAD
`f56852e8950fff69cbbe4b010377f9ccf3edaf98` прошёл CI #2045. От актуального
`main` подготовлен отдельный block `perf/dense-board-rendering`: подтверждённое
повторное построение committed pen geometry на transient updates устраняется
memoized scene/item views; runtime previews используют существующий Wet Ink
Layer; mounted GIF обслуживаются board-scoped coordinator с visibility/cancel
lifecycle. Schema, original embedded bytes, z-order, undo и revisions сохраняются.
Причины, локальные CPU-замеры, acceptance checks и оставшиеся decode/GIF repaint/
persistence ограничения:
[`docs/DENSE_BOARD_PERFORMANCE_REVIEW_2026-10-05.md`](docs/DENSE_BOARD_PERFORMANCE_REVIEW_2026-10-05.md).
C3 целиком остаётся открытым до browser release evidence и следующих
decode/storage блоков; PR #174 не изменяется этим исправлением.

06.10.2026: следующий отдельный responsiveness block реализован в draft PR #176
`perf/active-stroke-latency`. После PR #175 оставшийся hot path активного pen
stroke включал per-sample immutable history copies, повторную генерацию всей Wet
Ink geometry на каждом кадре и React publication локального pen preview.
PR #176 переводит coalesced pointer moves на один batch reducer update, оставляет
локальный pen/Smart Ink preview за imperative Wet Ink, а renderer использует
sealed geometry chunks и bounded mutable tail с continuation phase для
dash/wavy/sketch styles. Collaboration ink preview публикуется imperative delta
callbacks без per-move React state.

Проверенный production code-head `67c78ce7b1eeb7ef1213d7f43873522f4e28b0bc`
прошёл Quality gate CI run `37466497150`: 990 unit/integration tests, 18
performance tests, architecture boundaries и production build. Chromium и
Firefox browser smoke на том же SHA прошли по 28 сценариев, включая новый
coalesced 240 Hz stylus/burst regression; Board-only profile, GeometryOS live
contract и Coordinate Plot production gate также green. C3 остаётся открытым
для GIF repaint, large-raster decode/memory и embedded-byte persistence work.

06.10.2026: stacked PR #177 `perf/main-thread-latency-hardening` снижает
соседнюю нагрузку на main thread во время активного pen/Smart Ink gesture.
Wet Ink percentile diagnostics больше не сортируют latency window на каждом
frame: p95 обновляется не чаще одного раза в 500 ms, а exact snapshot остаётся
доступен on demand. BoardStage публикует DOM diagnostic attributes не чаще
одного раза в 500 ms и выполняет final flush при clear/finish. Animated GIF
coordinator сохраняет board-scoped RAF ownership, но во время Wet Ink gesture
ограничивает Layer repaint до 24 fps и немедленно возвращает normal cadence
после finish/cancel/visibility resume.

Browser regression дополнен Long Task observation для активного coalesced
240 Hz-equivalent stroke; Firefox gracefully работает без unsupported
`longtask` entry type. Проверенный code-head
`91469e822dd84e3732073c153cbe1382942558c5` прошёл CI run
`37473332612`: 992/992 unit/integration tests, 18/18 performance tests,
architecture/build, Chromium 28/28 и Firefox 28/28 browser smoke, Board-only,
GeometryOS и Coordinate Plot production gates. Smart Ink, Formula Recognition
и Paddle sidecar gates на том же SHA также green.

Следующий evidence-driven кандидат C3 после этого блока — full-document
validation/canonical serialization и SHA computation на main thread
(`serializeBoardDocument` / `boardDocumentSha256`), затем large-raster
decode/memory и asset-backed media persistence.

06.10.2026: кандидат реализован в draft PR #178
`perf/off-main-thread-document-computation`. Введён core port
`BoardDocumentComputation` и lazy Worker adapter для current-schema canonical
serialization и SHA-256. Local autosave prewarm'ит serialization в debounce
окне; обычный background save ждёт worker-result, а pagehide/SPA dispose
сохраняют synchronous lifecycle fallback с тем же operation ID. Если background
save уже ожидает Worker, lifecycle flush синхронно запускает idempotent promotion
в durable Dexie path. Server sync и evidence verification используют тот же
worker-backed hasher; current-schema SHA переиспользуется вместо повторного
вычисления в одном recovery/apply flow. Legacy 1.4/1.5 compatibility digests
остаются отдельным migration/recovery path.

Проверенный code-head `ecf35fce19d6d81871853477926ac4e15b4cd5a4`
прошёл CI run `37482601624`: 182/182 unit/integration files, 1000/1000 tests,
10/10 performance files и 18/18 performance tests, architecture boundaries и
production build. Chromium и Firefox browser smoke прошли по 28/28 scenarios;
GeometryOS live contract, Board-only frontend profile и Coordinate Plot
production gate green. Smart Ink, Formula Recognition и Paddle sidecar gates на
том же SHA также green.

После этого блока основные открытые C3-кандидаты: large-raster decode/memory,
asset-backed media persistence и representative browser profiling больших
embedded-media документов. Worker failure сохраняет inline fallback, persisted
BoardDocument/schema/undo/collaboration contracts остаются совместимыми.

06.10.2026: первый raster-memory блок A1 реализован в PR #179
`perf/raster-memory-baseline`. Добавлена board-level instrumentation для
renderer decode lifecycle: starts/completions/failures/releases, duplicate
concurrent decode starts, decode duration, active/peak decoded count и estimated
RGBA bytes. Диагностика публикуется через BoardStage data attributes и не меняет
rendering/persistence contracts.

Browser `@smoke` regression импортирует два одинаковых PNG 4096×3072 и
фиксирует текущий full-resolution baseline. На code-head
`5051b0db0af4f7f4945088b11c2eec622ff07df0` CI run `37495639140`
прошёл Quality gate: 183/183 unit/integration files, 1003/1003 tests,
10/10 performance files, 18/18 performance tests, architecture boundaries и
production build. Chromium/Firefox browser smoke прошли по 29/29 scenarios.

Измеренный baseline:
- два одинаковых raster objects удерживают estimated 100,663,296 bytes decoded
  RGBA working set;
- renderer выполняет два decode start для одного content hash и фиксирует один
  duplicate concurrent decode;
- Chromium: max renderer decode 1 ms, max frame gap ~66.7 ms и один Long Task
  68 ms;
- Firefox: max renderer decode 13 ms, max frame gap ~49.84 ms; Long Task API в
  данном engine unavailable.

07.10.2026: raster-memory блок A2 реализован в PR #180
`perf/raster-decode-cache`. Для static PNG/JPEG добавлен
`RasterDecodeCache`: immutable content SHA + resolution bucket + exact source
isolation, concurrent-request coalescing, максимум 2 параллельных decode,
128 MiB default retained-cache budget, LRU eviction zero-ref entries и explicit
resource close. Resolution bucket учитывает board display size, object scale,
ancestor/group scale, viewport zoom и devicePixelRatio. Production path
использует `createImageBitmap(... resizeWidth/resizeHeight ...)` с
HTMLImageElement fallback; GIF animation и sanitized SVG path не меняются.

Import path для PNG/JPEG читает intrinsic dimensions из file headers и сохраняет
decode-validation contract через 1×1 browser decode probe. Это убирает
full-resolution decoded surface, использовавшийся только для определения
размеров, при сохранении rejection повреждённых static raster файлов.

Self-review дополнительно закрыл derived-resource lifecycle: zero-ref raster
resources освобождаются после очистки доски и при unmount; queued/in-flight
entries помечаются для discard, а ready resources закрываются. Browser regression
проверяет, что после Clear active decoded count и bytes становятся нулевыми.
Dense-board profiler обновлён для `ImageBitmap`, сохраняя исходный контракт:
committed rasters присутствуют до pen gesture и не перерисовываются Wet Ink
preview.

Проверенный production code-head
`7b5d8aa3533f9319e246bacc42ec83667ca66883` прошёл CI run
`37613545140`: 184/184 unit/integration files, 1013/1013 tests,
10/10 performance files, 18/18 performance tests, architecture boundaries и
production build. Chromium/Firefox browser smoke прошли по 29/29 scenarios;
GeometryOS, Board-only и Coordinate Plot gates green. Smart Ink, Formula
Recognition и Paddle sidecar gates на том же SHA также green.

A1 → A2 для двух одинаковых PNG 4096×3072:
- decoded working set: 100,663,296 → 786,432 bytes, снижение ровно в 128 раз;
- actual decode starts: 2 → 1;
- duplicate concurrent decode starts: 1 → 0;
- Chromium A2: max frame gap 50 ms, Long Tasks 0;
- Firefox A2: max frame gap ~67.46 ms; `longtask` entry type unavailable.

Renderer decode completion time остаётся environment-sensitive и не используется
как latency budget: на финальном A2 run Chromium показал 210.4 ms, Firefox
69 ms, при этом browser smoke и frame/Long-Task contracts green.

Следующий крупный C3-блок — asset-backed media persistence по ADR-032, чтобы
убрать embedded-byte amplification в revisions и сам base64 source из обычного
large-media runtime path. Остаточный A2 риск: data URL → Blob conversion для
legacy/current `image.embedded` выполняется синхронно в JS; retained-cache budget
ограничивает evictable zero-ref resources, а активно отображаемые referenced
bitmaps не эвиктятся до release.

### C3.2: раздельные GIF-слои и wheel cache — 09.10.2026

- PR #194 (C3.2-B) объединён с `main` как `acc1342cd2d820dbd34cd02b9ab01b3193cdd8ec`.
- PR #193 (C3.2-A) объединён поверх C3.2-B как
  `2f81af565ecafbe716531b8de1cca72956378650` — подтверждённый HEAD
  `main` на 09.10.2026.
- Post-merge CI `37934870233`: Quality gate, Chromium/Firefox smoke,
  media profile (12/12), production image и профильные production gates
  завершены успешно. В профиле 600 pen + 6 PNG + 4 GIF:
  wheel zoom p95 16.8 ms, max 33.3 ms, 218 `drawImage`,
  pen input-to-paint p95 14.0 ms.
- Предыдущие повторы показали zoom p95 от 16.7 до 50 ms даже с wheel
  cache; достижение стабильных 60 fps на всех устройствах не доказано.

C3.3 diagnostic instrumentation (PR #195) объединена с `main`
9 октября как `190906383329f8f5dc17df9c5a5dce30e7ed92b1`. Последующий
main-CI `37962493241` полностью успешен, включая production image.
Синхронная стоимость первого wheel cache `begin()` на прежнем тяжёлом
сценарии составляла 21–31 ms.

C3.4 candidate (PR #196) переносит ограниченное 4 млн физических пикселей
построение кэша в browser idle и повторно использует готовые Konva
scene/hit canvases только при совпадающем DPR. При отсутствии подготовки
остаётся прежний wheel fallback; инвалидация и освобождение ресурсов
выполняются при изменении сцены, commit/cancel, истечении 15 s и unmount.
Quality gate: 1092/1092 unit/integration, 24/24 performance,
Chromium/Firefox 38/38. Расширенный Chromium media profile: 16/16,
повторён дважды без изменения кода. Подтверждены 1000–3000 strokes,
DPR2 alpha/transform overlap pixel comparison (значимые каналы
0.99284%, средняя ошибка 0.176) и 48 wheel циклов при 3000 strokes;
наблюдаемый пик кэша 2,016,464 пикселя (повтор 1,828,400).
В прогоне с подготовленным кэшем стоимость wheel begin близка к 0 ms.

Стабильные 60 FPS **пока не подтверждены**: у 3000 strokes + GIF
zoom p95 = 33.4 ms, наибольшие интервалы 83.3 и 116.6 ms в двух CI;
у 1000 strokes p95 варьирует 16.8–33.4 ms. Отдельным блоком остаются
GPU/compositor attribution, многочасовой реальный soak и сравнение
на разных устройствах. Подробнее:
[`docs/LARGE_BOARD_BROWSER_PROFILE_2026-10-09.md`](docs/LARGE_BOARD_BROWSER_PROFILE_2026-10-09.md).

### C3.5–C3.7: интеграционный release gate — 10.10.2026

PR #199 слит в `main` как `2086334bbd3254fa1542c5bd4e25cfde87f786f4`, объединяя C3.5
(scene-snapshot visibility index), C3.6 (неблокирующий cold wheel fallback)
и C3.7 (стабильные React ink runs + диагностический trace). Отдельные
stacked PR #197/#198 закрыты как superseded.
Это ограниченный performance increment: подтверждены устранение
синхронной холодной растеризации в wheel handler, повторное использование
visibility bounds и неизменных React ink subtrees. Зафиксированные
100–117 ms rAF gaps в тяжёлой сцене остаются отдельной задачей C3.9.

Интеграционный gate: полные CI/production checks для совокупного diff
от `main`, Chromium/Firefox smoke, DPR2 pixel/hit parity,
48-кратный wheel/cache lifecycle, performance evidence и review.
При squash merge последующий C3.8 переносится на свежую ветку от
обновлённого `main`, только с собственным diff относительно C3.7.
Формат BoardDocument, sync API, persistence и настройки доступа не меняются.

### C3.9-E1: парное браузерное сравнение — 10.10.2026

Первый независимый измерительный блок C3.9-E для issue #201.
Подготовлен GitHub Actions workflow с одноразовым запуском при добавлении
его в main и ручным повторным запуском, immutable baseline/candidate SHA и пяти-/восьмикратными A–B–B–A циклами Chromium, строгий анализатор
браузерных JSON-отчётов, тесты порядка запусков и сопоставимости фикстур.
Метрики: active-wheel p95/max, частота интервалов >50/>100 мс, парные
дельты и достаточность числа кадров. Прежние CI/релизные проверки
сохраняются. Ссылка на контракт и запуск:
[docs/C39_PAIRED_BROWSER_EVIDENCE_2026-10-10.md](docs/C39_PAIRED_BROWSER_EVIDENCE_2026-10-10.md).

Статус: измерительная инфраструктура готовится отдельным PR;
результатов парного workflow и подтверждения выполнения browser latency
targets пока нет. Следующий блок — получить независимые прогоны,
разделить оставшийся input-validation и compositor jank, после чего
внести минимальное корректное исправление и повторить release gates.

### C3.9-D: безопасный viewport-only fast path — 10.10.2026

Задача [#201](https://github.com/ArtemLevin/tutorboard/issues/201).
Реализовано локальное ускорение `core.viewport.set`: полная входная проверка
`BoardDocument` и проверка metadata сохраняются; после нормализации
`updatedAt` проверяются исключительно изменённые `viewport` (строгая
Zod-схема, включая лишние поля) и `updatedAt` (Zod ISO + порядок времени).
Все содержательные команды продолжают полную проверку результата.
Нет WeakMap/identity-кэша и изменений persisted format/API.

[Контрольное измерение CI #38047172922](https://github.com/ArtemLevin/tutorboard/actions/runs/38047172922):
17 unit и 28 performance тестов прошли. При 3000 strokes медиана reducer
**70,6 ms** против **146,3 ms** с добавленной полной контрольной
проверкой результата, экономия **50,0%**; при 5000 strokes **104,5 ms**
против **204,3 ms**, экономия **50,2%**. Сравнение парное в одном
прогоне с контрольной дополнительной валидацией; улучшение полной
визуальной частоты кадров по нему не подтверждено.
Добавлены дифференциальные тесты эквивалентности строгой схемы,
исправности исходного документа и истории undo/redo.
Подробности: [C3.9-D](docs/C39_VIEWPORT_FAST_PATH_2026-10-10.md).
Chromium 7-сценарный benchmark запускается по изменениям reducer.
Следующий release gate C3.9-E должен измерить фактические хвосты
`wheel-viewport-persist` и общий frame pacing; оставшаяся входная
проверка всего документа и compositor остаются приоритетами анализа.

### C3.9-C: измерение стоимости viewport-команды и истории — 10.10.2026

[Issue #201](https://github.com/ArtemLevin/tutorboard/issues/201),
[отчёт исследования](docs/C39_VIEWPORT_COMMAND_COST_2026-10-10.md).
Подтверждённый call path:
`BoardStage.commitWheel → App.commitViewport → useBoardDocumentController.commitCommand → reduceBoardDocument`.
`reduceBoardDocument` валидирует весь текущий документ, затем для
`core.viewport.set` через `accept` валидирует весь изменённый документ
повторно. Чистый `commitDocumentHistory` добавляет только ссылки на документы
в ограниченную историю (100 состояний).

В изолированном GitHub Actions эксперименте с реальными 300/1000/3000/5000
разнообразными VectorInk strokes, 6 PNG и 4 GIF на каждом размере
(2 прогрева, 7 замеров) измерено: при 3000 strokes reducer p50
**206,2 ms**, input/post validation **109,0/95,9 ms**, history **0,008 ms**;
при 5000 strokes reducer p50 **384,1 ms**, input/post validation
**193,4/188,0 ms**, history **0,008 ms**. Две реальные проверки занимали
**>99,9%** времени reducer на 3000/5000 strokes. Unit/performance-тест
подтверждает неизменность отказов по повреждённому документу и
некорректному viewport; production-код на C3.9-C не меняется.

Решение C3.9-D: сохранить полную проверку входного документа и metadata,
исследовать локальный безопасный `core.viewport.set` fast path с
инкрементальной проверкой исключительно `viewport`/`updatedAt` после
успешной полной проверки входа. Закрепить результаты дифференциальными
тестами на повреждённых документах, историей undo/redo, полным CI и
контролируемыми Chromium A/B/A замерами. Дальнейшее устранение полной
первой валидации потребует явных гарантий иммутабельности, без кэша по
непроверяемой identity.

### C3.9-B: покадровая корреляция wheel/React/Konva/Chromium — 10.10.2026

Основание: [#201](https://github.com/ArtemLevin/tutorboard/issues/201);
предыдущий C3.9-A merged в `main` как `f8602825`.
Следующий отдельный PR добавляет opt-in трассировку номера wheel-сессии,
input → viewport-layout, синхронного commit и отмены, связывает медленные
rAF intervals с JS-операциями и timestamped CDP compositor events при
валидной синхронизации browser↔Chrome clocks (два маркера/контроль drift).
При отсутствии маркеров GPU свидетельства помечаются `unavailable`,
диагностика не выдает отсутствие событий за нулевую стоимость.
Набор регрессионных unit-тестов проверяет выравнивание часов,
overlap/частичные данные и пять самых длинных окон.
Подробности: [C3.9-B trace](docs/C39_FRAME_ATTRIBUTION_2026-10-10.md).
Изменений persisted schema, сетевых протоколов и формата совместной
доски нет. Оптимизация скорости остается задачей C3.9-C–E.

### C3.9-A: репрезентативный нагрузочный baseline — 10.10.2026

Задача [#201](https://github.com/ArtemLevin/tutorboard/issues/201).
После C3.5–C3.8 в подтверждённом post-merge CI `38028358575` у
3000 pen + 6 PNG + 4 GIF измерены zoom p95 **33.4 ms**,
max **166.7 ms**, Long Task **175 ms**. Предыдущая A–B–A
последовательность max **100.0→166.7→83.2 ms** не подтверждает
устойчивого устранения хвоста задержек. Причинная атрибуция ещё открыта.

Для первого независимого PR C3.9-A расширены исключительно тестовые
fixtures: разнообразная геометрия штрихов, плотность видимых объектов,
настоящий 4-frame GIF, чередование paint-runs и отдельные интервалы
active wheel / commit observation / settling. Краткий набор проверяется
CI, расширенный вызывается `npm run e2e:c39-profile`.
Подробное описание: [C39 baseline](docs/C39_REPRESENTATIVE_BASELINE_2026-10-10.md).
Следующий блок C3.9-B — корреляция **каждого** длинного кадра с
timestamped React, Konva и compositor событиями. Ограничение: время
commit в C3.9-A измеряется по наблюдению UI, точная метка войдёт в B.
Изменений production drawing и persisted data здесь нет.

[PR #204](https://github.com/ArtemLevin/tutorboard/pull/204):
полная матрица **7/7** пройдена в
[Actions #38031741442](https://github.com/ArtemLevin/tutorboard/actions/runs/38031741442).
Новые representative scenarios показывают в одном прогоне:
для 3000 strokes + GIF, cold cache, DPR2 активный zoom p95 **150 ms**,
max **166.7 ms**; для 5000 strokes + GIF, cold DPR2 p95 **250 ms**,
max **283.3 ms**. На 3000 warm dense после окончания ввода
зафиксирован commit-observed gap **216.7 ms**. Числа получены на
одном общем CI runner, требуют повторов и точной атрибуции C3.9-B.


### C3.8: устранение лишних GIF invalidation при wheel zoom — 09.10.2026

[PR #200](https://github.com/ArtemLevin/tutorboard/pull/200)
перенесён отдельным коммитом на merged C3.5–C3.7 (#199). `AnimatedImageRedrawCoordinator` теперь
приостанавливает самостоятельный RAF redraw GIF в период wheel-жеста.
Wheel viewport сам обновляет текущие Konva layers; после commit/cancel,
scene reset и unmount GIF loop возвращается с новым кадром.
Существующий режим animation cadence 24 FPS при рисовании сохранён.
Z-order, individual hit-testing, формат документа и sync-протоколы
не меняются. В режиме opt-in браузерного профиля доступен A/B override,
отключённый для обычных пользователей.

Первый [CI #37988790830](https://github.com/ArtemLevin/tutorboard/actions/runs/37988790830):
quality gate 1098/1098 unit/integration, 25/25 performance;
Chromium/Firefox smoke, Coordinate Plot, Board-only, media profile
16/16 — success. GeometryOS live browser job не смог получить
`python:3.11-slim-bookworm` из Docker Hub, HTTP 429 anonymous pull limit;
при повторном запуске того же CI на исходном SHA проверка прошла.
Пиксельная DPR2-проверка и 48 wheel-cycle ресурсный тест пройдены.

Matched A/B на **одной** Chromium-сцене 3000 strokes + 6 PNG + 4 GIF,
две последовательные серии по 48 rAF кадров (порядок baseline→C3.8):
zoom p95 49.9→33.4 ms; max rAF 116.7→66.8 ms;
GIF invalidate 50→35; compositor DirectRenderer::DrawFrame
35/644.5 ms total/max 36.8 ms → 31/522.8 ms total/max 23.3 ms;
DoUpdateLayers после оптимизации 117.3 ms total/max 10.08 ms.
Повторный **A–B–A** профиль в
[CI #37989821535](https://github.com/ArtemLevin/tutorboard/actions/runs/37989821535)
на том же 3000-stroke fixture:
GIF invalidate 49→33→48, compositor DirectRenderer::DrawFrame
35/828.4→33/773.0→35/787.0 ms total. При этом zoom
p95 50.1→50.0→33.4 ms, max rAF 133.4→100.0→83.3 ms.
Первый A/B показал сокращение rAF хвоста, A–B–A повтор выявил
возможную зависимость от прогрева и планировщика: второй baseline
оказался быстрее оптимизированного прохода по max rAF. Надёжно
подтверждено уменьшение лишних GIF redraw requests. Устойчивое
сокращение p95/max rAF и стабильные 60 FPS пока не доказаны.
Chromium/Firefox smoke, 16/16 media-profile, 48-cycle resource checks,
unit/performance и build прошли. GeometryOS и formula-gateway container
gates первоначально блокировались HTTP 429 Docker Hub; обе проверки
успешно прошли на повторном запуске 10.10.2026 без изменения кода.

**Integration gate C3.8:** на перенесённом изменении от `main` должны пройти
quality, Chromium/Firefox, media-profile, GeometryOS, formula и все
сопутствующие CI gates. Подтверждено уменьшение лишних GIF redraw requests;
устойчивое сокращение p95/max не доказано. Отдельный release gate по долгим
кадрам, teaching soak, многократному A/B/ABBA и device variance остаётся
открытым в [#201](https://github.com/ArtemLevin/tutorboard/issues/201).

### C3.7: атрибуция длинных кадров React / Konva / compositor — 09.10.2026

Интеграционный [PR #199](https://github.com/ArtemLevin/tutorboard/pull/199)
на базе `main` включает также C3.5 (#197) и C3.6 (#198). Введена opt-in диагностика, записывающая
React viewport update→layout commit, посещения неизменных ink-run
компонентов, Konva scene/hit draw, GIF invalidation и Chromium CDP
compositor/raster events. Источник `BoardStage` не включает
профилирование без тестового флага. Исправлена семантика
`activeCachedCount` относительно idle-prepared cache — Chromium
smoke C3.6 ранее падал из-за смешения двух состояний.

В детерминированном CPU-тесте 500 штрихов:
`groupCallsDuringWheelUpdates=0`, median update 0.369 ms,
`1096/1096` unit/integration и `25/25` performance на CI
[37979094962](https://github.com/ArtemLevin/tutorboard/actions/runs/37979094962).
Во время реального wheel visible-item culling меняет набор видимых
штрихов: отрисовка затронутых React runs допустима.

Первый browser trace `37979094962` (3000 stroke + 4 GIF, cold wheel):
zoom p95 50.1 ms, max 99.9 ms; Konva scene max 10.2 ms
(66.1 ms summed), hit max 8.2 ms (46.7 ms summed);
React viewport commit max 12.5 ms (61.9 ms summed);
GIF invalidation scheduling 38 calls, 0.6 ms summed.
В повторном trace `37980204017`: zoom p95 33.4 ms,
max 116.7 ms; DirectRenderer::DrawFrame 37 events,
756.5 ms total/max 25.77 ms;
LayerTreeHost::DoUpdateLayers 37 events,
203.1 ms total/max 14.24 ms, Long Task 119 ms.
Два CI-прогона показывают существенную вариативность кадров.
GPU/compositor timestamps не являются аддитивными с JS-таймингами.
Доказанного устойчивого устранения >100 ms gaps пока нет.

**Release gate полной C3-оптимизации остаётся OPEN:** браузерная
композиция и redraw продолжают создавать длинные кадры. C3.5–C3.7
принимаются только как проверяемое локальное снижение CPU/input затрат
(интеграционный gate выше). Отдельная C3.8-проверка GIF invalidations
развивается в PR #200; долгие кадры, compositor attribution, повторный
A/B/ABBA профиль, DPR2/hit parity, Firefox и resource soak отслеживаются
в [C3.9 issue #201](https://github.com/ArtemLevin/tutorboard/issues/201).
Стабильные 60 FPS пока не считаются достигнутыми.

### C3.6: неблокирующий cold wheel fallback — 09.10.2026

В stacked draft [PR #198](https://github.com/ArtemLevin/tutorboard/pull/198)
`WheelInkCacheCoordinator.begin(..., {buildIfUnprepared:false})` используется
в `BoardStage.handleWheel`. Кэшированные scene/hit canvas продолжают
переиспользоваться при подготовленном DPR, а отсутствие idle-prewarm
ведёт к прямой отрисовке исходных штрихов без синхронного
`Konva.Group.cache()` в обработчике input. Старое поведение метода
`begin()` без options сохранено. Отдельная метрика фиксирует cold skip.

[Первый CI #37975430796](https://github.com/ArtemLevin/tutorboard/actions/runs/37975430796):
1096/1096 unit/integration, 25/25 performance, 16/16 Chromium media profile,
Chrome/Firefox smoke, GeometryOS, Coordinate plot, Board-only, all green.
3000 strokes + 4 GIF, **forced requestIdleCallback starvation**:
wheel begin `0.1 ms` vs `43.8 ms` в C3.5 baseline (runner dependent),
zoom p95 `33.4 ms` vs `50 ms`, max rAF `100 ms` vs `133.4 ms`.
Pixel parity при DPR2: significant channel fraction `0.00992839` (<0.01),
mean channel error `0.17597` (<1). В 48 wheel-cycles без prewarm
cacheBuilds=0, после clear no cached runs; память ограничена.

**Открыто:** максимальная задержка 100 ms и p95 33.4 ms исключают
утверждение о постоянных 60 FPS. Метрики отдельных GitHub-hosted прогонов
чувствительны к планировщику; повторить измерение перед merge.
Следующий C3.7 — профилирование полного Konva canvas redraw / GIF layer
invalidations / React commit под холодным zoom и исключение >50 ms frames,
с сохранением z-order, hit-testing, parity и bounded memory. PR #197/#198
оставить в draft до подтверждения release gate.

### C3.5: стабильная геометрия viewport-culling — 09.10.2026

После объединения C3.3/C3.4 (`main`
`c52a443667e4552fb879cd36b94eeffd77e1d7f7`) отдельный
draft PR #197 `perf/c3-5-stable-viewport-culling` устраняет повторное
вычисление world bounds неизменных объектов при каждом preview-wheel кадре.
`createBoardVisibilityIndex(scene.items)` пересоздаётся только при смене
snapshot сцены, выбирает точный набор видимых объектов, сохраняет порядок и
переиспользует ссылку на список при совпадающей видимости. API
`selectVisibleBoardItems` сохранён; данные и collaboration-контракты
не меняются.

Замер в Performance CI `37970012084`: 5000 объектов × 24 viewport
updates, CPU selector 114.84 ms исходным способом против 4.17 ms индексом
(≈27.6×). Unit/integration 1094/1094, performance 25/25, format/lint/typecheck,
architecture, production build и Chromium/Firefox smoke успешны.
Chromium media profile 16/16 прошёл с сохранением DPR2 pixel comparison,
3000-stroke 48-wheel cleanup и memory pixel cap.

**Release gate остаётся открытым.** При 3000 strokes + 4 GIF zoom p95
50 ms и максимальный интервал 133.4 ms: prewarm отсутствовал,
wheel begin выполнял 43.8 ms синхронного построения. C3.5 уменьшает
подтверждённые CPU-затраты, но гарантированное устранение длинных
кадров и 60 FPS не доказано. Следующий C3.6 узкий этап: измерить
причины starvation/expiry idle-prewarm, сделать budgeted fallback
без дорогостоящего синхронного raster cache в wheel handler,
подтвердить parity/correctness и повторяемые 3000-stroke кадры
на совпадающем окружении.

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

## 3. Фактический статус на 2026-09-29

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
| Access convergence | DONE | PR #125: revoke/read-only/reconnect convergence hardening |
| Export hardening | DONE | PR #126–#129: full-content/high-fidelity PNG/PDF/SVG workflow |
| Controlled pilot E2E | DONE | PR #131: teacher/guest controlled-pilot browser scenario |
| Board input comfort | DONE | PR #133: centralized shortcuts, layout-independent tool keys, late-Shift modifier pipeline и shape constraints |
| Partial eraser + forgiving selection | DONE | PR #134: vector partial eraser, proximity selection и aggregate-bounds drag |
| Live text + Escape comfort | DONE | PR #135: transient inline text editing, Escape→selection и locked-selection move hardening |

T1/T2 standalone flow уже поддерживает teacher management и guest-link launch.
Backend B1/B2 уже содержит standalone persistence, invitation/session model,
server-authoritative capability checks и collaboration integration.

### 3.2. Открытые delivery gaps

Source-side foundation для Pilot Gate существенно продвинулась:

- TutorBoard frontend release baseline green на `c0bf5ba6193972a77d3cdc5b09352a5e27b15066`;
- backend `APP_PROFILE=board`, exact route/provider checks, board-only Compose,
  Caddy/release tooling и immutable TutorBoard pin присутствуют в
  `tutor-assistant-web/main`;
- на backend release candidate `c2aa42927104510fc802d7dffc28a36872b29880`
  успешно завершились CI, Production release и TutorBoard standalone release.

Ближайший незакрытый critical path теперь операционный:

1. **Pilot Deployment Gate**
   - поднять реальную Linux VM, DNS и HTTPS;
   - выполнить explicit migration и bootstrap teacher account;
   - провести teacher/guest two-browser smoke;
   - проверить reconnect, terminal revoke и API restart persistence;
   - выполнить off-host PostgreSQL backup;
   - зафиксировать immutable Pilot Release Manifest.
2. **B3/T3 Production convergence gate**
   - полный live read-only/rotate/revoke/offline-old-epoch сценарий;
   - Chromium/Firefox production matrix.
3. **D3/D4 Production operations**
   - isolated restore;
   - log-secret scan;
   - load/24h soak;
   - manual-approved rollout и verified rollback.

Board media assets идут отдельным параллельным продуктовым треком и не
расширяют pilot public surface до прохождения собственных security/storage
gates.

### 3.3. Root cause текущего deployment gap

Текущий deployment gap больше не связан с отсутствием board-only source
composition. В `tutor-assistant-web/main` уже присутствуют:

- first-class `APP_PROFILE=board`;
- отдельный board-profile bootstrap и минимальный container;
- exact public route inventory;
- board-only Compose;
- explicit Caddy/default-deny configuration;
- release workflow;
- pilot runbook, backup/restart/restore/smoke tooling;
- immutable TutorBoard release manifest/pin.

Оставшийся разрыв находится между проверенным source/release tooling и реальным
окружением: VM, DNS/TLS, production secrets, explicit migrations, реальные
browser smoke/reconnect/revoke/restart проверки, off-host backup и release
manifest конкретного pilot deployment.

### 3.4. Актуальные blockers перед Pilot Gate

#### TutorBoard

Frontend source baseline находится в green state на текущем `main`
`c0bf5ba6193972a77d3cdc5b09352a5e27b15066` (PR #142). На этом SHA
успешно завершены Quality gate, Board-only frontend profile, GeometryOS live
browser contract, Coordinate Plot production gate, Chromium/Firefox browser
smoke, Production image, Smart Ink production gate, Formula Recognition gate и
Paddle sidecar gate.

Interaction milestones PR #133–#135 уже закрыты:

- centralized shortcuts и layout-independent tool keys;
- late-Shift + deterministic shape constraints;
- vector partial eraser с атомарным undo;
- forgiving selection hit-slop;
- drag multi-selection за aggregate bounds;
- transient inline text editor;
- `Escape` отменяет text draft и возвращает selection mode.

Следующий отдельный продуктовый блок — board media assets. Архитектурный
инвариант: крупные media bytes не попадают в BoardCommand, durable pending
queue, PostgreSQL command journal или BoardSnapshot. Первый runtime increment
начинается с versioned `media.asset` contract foundation; server-side asset
authority и upload/read API следуют отдельным этапом.

#### tutor-assistant-web

Старый draft PR #31 больше не является источником истины: его ветка разошлась с
`main`, а актуальная board-only реализация и release tooling уже присутствуют
в `main` после более поздних поставок. Проверенный backend release candidate
`c2aa42927104510fc802d7dffc28a36872b29880` имеет green CI, Production
release и TutorBoard standalone release.

Следующий backend шаг для Pilot Gate — работа с реальным окружением по
`deploy/board-production/PILOT_RUNBOOK.md`: configuration preflight, VM/DNS/TLS,
explicit migration, teacher bootstrap, two-client smoke, reconnect/revoke,
restart persistence и off-host backup. Ослабление exact allowlist,
security/redaction checks или release gates не допускается.

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

Для Pilot Gate допускается одна VM с одиночными `board-api`/`tutorboard`,
PostgreSQL, Redis и MinIO containers. Это pilot-specific упрощение и не меняет
production topology/DoD.

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

> Frontend status: DONE в TutorBoard. `VITE_APP_PROFILE=board` вводит strict
> feature contract, Docker build принимает профиль как build argument, отдельный
> CI job собирает минимальный standalone bundle. Release/deployment wiring с
> digest-pinned backend image остаётся частью D2.

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

Для Pilot Gate formula recognition и Smart Ink выключены, если их production
dependency отдельно не доказана; они не блокируют первый lesson.

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

- [x] refresh context после capability event;
- [x] terminal revoke state;
- [x] no reconnect loop after revoke;
- [x] access epoch check до reconnect push;
- [x] quarantine stale pending;
- [x] mutation boundary в read-only;
- [x] возврат write не resurrect'ит old-epoch commands.

Frontend implementation и локальные regression tests зафиксированы в
`docs/architecture/T3_ACCESS_CONVERGENCE.md`. Полный milestone остаётся открытым
до прохождения Required E2E на реальном backend.

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

## 18. Pilot Deployment Gate

Pilot Gate — отдельный delivery milestone перед production. Его цель: получить
реальный HTTPS-host и провести одно controlled занятие с одним учеником, не
объявляя окружение production.

### 18.1. Допустимые pilot-specific упрощения

До первого lesson не блокируют:

```text
blue/green production slots
Kubernetes/multi-node deployment
full observability stack
24h soak
full chaos matrix
moderate/high load test
full Chromium + Firefox production matrix
complete SBOM/release automation
production Terraform
formal D2/D3/D4 release pipeline
```

Допускается одна Linux VM с Docker Compose, Caddy, TutorBoard, Board API,
PostgreSQL, Redis и MinIO/S3-compatible storage.

Эти упрощения не становятся production contract.

### 18.2. Нельзя упростить даже для pilot

Обязательны:

- HTTPS и real DNS;
- `APP_PROFILE=board`;
- explicit/default-deny Caddy routing;
- durable PostgreSQL;
- Redis collaboration;
- durable `APP_SECRET_KEY`;
- secure session cookies;
- invitation/WS secret redaction;
- `AUTO_MIGRATE=false` и explicit migration step;
- teacher/guest в независимых browser contexts;
- bidirectional collaboration smoke;
- reconnect smoke;
- terminal revoke smoke;
- API restart persistence smoke;
- off-host PostgreSQL backup до lesson;
- фиксированные frontend/backend git SHA и image digests.

### 18.3. Pilot topology

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

backup
   `-- PostgreSQL dump -> off-host destination
```

### 18.4. Pilot runtime configuration

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

TutorBoard pilot build:

```text
server sync          ON
document snapshots   ON
GeometryOS           OFF
formula recognition  OFF
Smart Ink            OFF
```

### 18.5. Pilot critical path

```text
P1  TutorBoard full quality gate green
    |
P2  board-profile backend gate green
    |
P3  APP_PROFILE=board + Compose/Caddy/redaction green
    |
P4  real VM + DNS + HTTPS
    |
P5  explicit migration + teacher account
    |
P6  /boards + board creation
    |
P7  invitation + isolated guest join
    |
P8  bidirectional collaboration
    |
P9  refresh/reconnect
    |
P10 terminal revoke
    |
P11 API restart persistence
    |
P12 off-host backup + Pilot Release Manifest
    |
CONTROLLED PILOT LESSON
```

### 18.6. P1 — TutorBoard quality gate

**Source gate: DONE** на текущем frontend baseline
`c0bf5ba6193972a77d3cdc5b09352a5e27b15066`.

На этом SHA green: Quality gate, Board-only frontend profile, GeometryOS live
browser contract, Coordinate Plot production gate, Chromium/Firefox browser
smoke, Production image, Smart Ink production gate, Formula Recognition gate и
Paddle sidecar gate.

Перед конкретным pilot deployment pinned frontend SHA всё равно проходит
explicit release verification:

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

Exit criterion: свежий полный quality gate green именно на SHA, записываемом в
Pilot Release Manifest.

#### 18.6.1. Frontend CI routing invariant

PR verification разделён по риску:

- каждый PR всегда выполняет Quality, board-profile и Chromium/Firefox
  `@smoke`;
- GeometryOS, Coordinate Plot, production image, Smart Ink, Formula Recognition
  и Paddle sidecar выполняют тяжёлую часть только при изменении их ownership или
  shared integration boundaries;
- изменения CI workflows, routing logic, Node/toolchain или dependency lock
  считаются global CI risk и включают все specialized gates;
- routing обязан fail closed: ошибка определения diff не превращается в
  успешный skip;
- push в `main` сохраняет полный Chromium/Firefox regression и core production
  gates; существующий Paddle gate остаётся path-specific на `main`;
- `workflow_dispatch` является explicit full-gate входом для release/pilot
  verification.

Имена существующих required jobs сохраняются стабильными. Production image не
зависит от Coordinate Plot gate: оба gate маршрутизируются независимо.

Paddle image security prerequisite закрыт отдельным PR #143 до включения нового
routing contract в `main`; security threshold при этом не ослаблялся.

### 18.7. P2/P3 — backend board profile gate

**Source gates: DONE.** Актуальная реализация находится в
`tutor-assistant-web/main`, а старый draft PR #31 больше не определяет
состояние проекта.

Проверенный release candidate
`c2aa42927104510fc802d7dffc28a36872b29880` завершил успешно:

- CI;
- Production release;
- TutorBoard standalone release.

В `main` присутствуют board profile contract, exact router/provider
inventories, board-only Compose, Caddy/default-deny configuration, secret-safe
release tooling и immutable TutorBoard pin.

Exit criterion для конкретного pilot deployment: эти gates должны быть повторно
green на pinned backend SHA из Pilot Release Manifest; затем работа переходит к
P4/P5 real-host bootstrap.

### 18.8. P4/P5 — реальный host и data bootstrap

Provision one VM, DNS и TLS. Миграции выполняются отдельно:

```text
preflight/backup
   -> migration container
   -> verify migration head
   -> start Board API
```

После запуска:

```text
/login
-> authenticated teacher
-> /boards
-> create board
-> list/rename board
```

### 18.9. P6-P8 — teacher/guest real-host smoke

Browser A — authenticated teacher.
Browser B — fresh incognito/isolated profile.

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

### 18.10. P9 — reconnect smoke

```text
Guest connected
Guest temporarily loses network
Teacher changes board
Guest reconnects
Both clients converge
```

Полный read-only/offline-old-epoch scenario остаётся B3/T3 Production Gate.
Обычный reconnect для pilot не должен терять confirmed state или приводить к
divergence.

### 18.11. P10 — revoke smoke

```text
Guest connected
Teacher revokes invitation
Guest loses access
Guest does not enter reconnect loop
Teacher continues to work
```

Если revoke не терминален, Pilot Gate закрыт.

### 18.12. P11 — restart persistence smoke

```text
Teacher + Guest create content
record current revision
restart Board API
reopen board
verify content/revision
```

Redis restart может оборвать live connection, но не должен терять accepted
revisions.

### 18.13. P12 — backup и Pilot Release Manifest

До первого lesson выполнить off-host PostgreSQL backup и зафиксировать:

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

### 18.14. Pilot Definition of Done

Controlled pilot разрешён только если одновременно:

| Gate | Требование |
| --- | --- |
| P1 | TutorBoard `npm run check` green |
| P2 | Backend board-profile tests green |
| P3 | `APP_PROFILE=board` + Compose/Caddy/redaction contract green |
| P4 | Real DNS + HTTPS работают |
| P5 | Teacher login и `/boards` работают |
| P6 | Teacher создаёт board |
| P7 | Invitation приводит isolated guest из `/j/...` в `/b/...` |
| P8 | Teacher <-> Guest realtime edits работают |
| P9 | Refresh/reconnect сохраняет convergence |
| P10 | Revoke терминально отключает guest |
| P11 | API restart не теряет board state |
| P12 | Off-host backup и release manifest созданы |

Если любой P1-P12 не выполнен, реальный lesson не проводится до устранения
дефекта.

## 19. D2 — Board-only release workflow

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

### 19.1. Supply-chain gates

Для обоих images:

- immutable digest;
- non-root runtime;
- read-only filesystem where applicable;
- `cap_drop: ALL`;
- `no-new-privileges`;
- Trivy HIGH/CRITICAL policy;
- SBOM;
- no floating `latest`.

## 20. D3 — staging

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

## 21. D4 — production rollout и rollback

### 21.1. Rollout

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

### 21.2. Rollback

Rollback должен быть application-level и не требовать database downgrade:

```text
Caddy -> previous known-good slot
```

Предыдущие digests и compatible schema сохраняются.

Irreversible schema cleanup не выполняется до production stabilization и не
объединяется с profile rollout.

## 22. Test strategy

### 22.1. Unit/configuration

- profile parsing;
- exact module graph;
- exact route inventory;
- standalone access policy;
- profile-specific production validation;
- feature flag mapping;
- sensitive URL redaction helpers.

### 22.2. PostgreSQL

- owner/tenant isolation;
- standalone CRUD;
- invitation uniqueness;
- concurrent rotate/revoke;
- revision/idempotency/Lamport invariants;
- access version monotonicity;
- soft delete/purge;
- migration compatibility.

### 22.3. Redis/WebSocket

- one-time ticket;
- wrong board/client rejection;
- presence lifecycle;
- multi-process Pub/Sub;
- active revoke;
- capability change;
- Redis restart;
- reconnect;
- query-secret redaction.

### 22.4. Browser

Chromium + Firefox production release gate:

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

Pilot browser subset определён в §18 и не заменяет эту production matrix.

### 22.5. Security

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

## 23. Risk matrix

| Priority | Риск | Regression guard |
| --- | --- | --- |
| P0 | Pilot ошибочно объявлен production | отдельные Pilot/Production DoD и environment marker |
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
| P1 | Pilot data остаётся только на одной VM | off-host PostgreSQL backup |
| P1 | blue/green ломает existing invitation | pre/post-switch invitation smoke |
| P2 | board image физически содержит unused Python modules | acceptable initially if not registered/constructed |
| P2 | duplicated generic/performance CI cost | optimize after correctness |

## 24. Definition of Done Board-only Production Profile

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

## 25. Текущая последовательность работ

Ближайший critical path — Pilot-first:

1. **P1 / TutorBoard source gate — DONE.** Текущий frontend baseline
   `c0bf5ba6193972a77d3cdc5b09352a5e27b15066` имеет green core и
   specialized gates.
2. **P2/P3 / backend board-profile source gates — DONE.** Board-only runtime,
   Compose/Caddy, release tooling и immutable frontend pin находятся в
   `tutor-assistant-web/main`; release candidate
   `c2aa42927104510fc802d7dffc28a36872b29880` прошёл CI, Production release
   и TutorBoard standalone release.
3. **P4** — поднять одну pilot VM, DNS и HTTPS.
4. **P5** — выполнить configuration preflight, explicit migrations и проверить
   teacher account.
5. **P6-P8** — `/boards`, board creation, invitation, isolated guest join и
   bidirectional collaboration на реальном host.
6. **P9-P11** — reconnect, terminal revoke и API restart persistence smoke.
7. **P12** — off-host PostgreSQL backup + immutable Pilot Release Manifest.
8. **Controlled pilot lesson** — только после green P4-P12 на конкретном
   deployment.
9. **B3/T3 Production Gate** — закрыть полный live read-only/rotate/revoke/
   offline-old-epoch convergence scenario.
10. **D3** — production staging, isolated restore, log scan, load и 24h soak.
11. **D4** — manual-approved production rollout и verified rollback.

Production apply запрещён до закрытия production release gates, green staging
preflight и свежего isolated restore drill. Pilot-specific упрощения не
переносятся в production по умолчанию.

## 26. Board media assets — implementation-ready track

08.10.2026: серверная основа ADR-032 готова в
`tutor-assistant-web/main`: PR #40 (M1+M2: private storage/upload/read) и
PR #41 (M3: authoritative command/snapshot reference validation).
Frontend F1 ведётся отдельным PR #181 `feat/board-media-repository-http`:
`BoardMediaRepository` port, same-origin raw-binary upload, строгий reader
authoritative AVAILABLE metadata и lazy content-source resolver с отдельным
cache identity на каждый repository/security scope. Guest upload наследует
актуальный `X-Board-Access-Epoch` от standalone scoped transport.
F1 влит в main как PR #181. F2 влит в main как PR #182:
`MediaAssetRenderer`, обобщённый A2 RasterDecodeCache для embedded/asset,
ограниченный authenticated fetch с отменой, shared GIF object URL lifecycle,
renderer registry и optional read-port композиция в SyncedApp.
Импорт пользовательских файлов остаётся `image.embedded`; следующий блок —
upload-before-command + feature rollout. Legacy `image.embedded` сохраняется.

F3.0: перенос C3.0 media performance baseline из Draft PR #174 на актуальный
main с учётом общего GIF scheduler и A2 createImageBitmap.
Включает 1/5/10 PNG, 1/4/8 GIF, high-pixel PNG, mixed scene, Dexie
amplification, import/decode lifecycle и media-risk CI routing.
Это instrumentation-only этап; upload/import production path пока без изменений.


Архитектура больших и URL-import media определена в
`docs/adr/ADR-032-board-media-assets.md`. Главный инвариант: binary media не
попадает в BoardCommand, durable pending queue, PostgreSQL command journal или
BoardSnapshot. Существующий `image.embedded` сохраняется для совместимости.

Фактический root cause текущего лимита:

```text
local picker                  8 MiB
embedded dataUrl schema      12 MiB
BoardCommand JSON codec       2 MiB  <- sync blocker
backend command request       5 MiB default
.tutorboard.json import      10 MiB
```

Поднятие только числовых лимитов запрещено как решение media milestone.

### M1 — contract foundation

- добавить `media.asset` с immutable `assetId/contentSha256/byteSize/mimeType`;
- BoardDocument/BoardSnapshot → следующая schema revision;
- ordered command envelope → следующая compatible revision;
- сохранить чтение существующих `image.embedded` и старых envelope;
- оставить BoardCommand JSON limit 2 MiB.

Exit: большие media bytes отсутствуют в serialized add/paste command.

### M2 — backend media authority

В `tutor-assistant-web`:

- отдельная `BoardMediaAsset` persistence model с FK на board;
- private tenant-prefixed storage через существующий ArtifactStorage/S3;
- upload API с board.write + CSRF/access-epoch;
- content API с board.read, ETag/nosniff;
- Range/206 storage/read path для MP4;
- server-side checksum/MIME/size/image-complexity validation;
- GIF MIME support в artifact detector;
- conditional ClamAV gate при включённом board media;
- command-commit validation всех `media.asset` references;
- quotas/rate limits и board-retention lifecycle.

Exit: forged/cross-board/quarantined asset refs не могут стать accepted revision.

### M3 — TutorBoard image/GIF asset path

- `BoardMediaRepository` + resolver port;
- upload-before-command orchestration;
- `media.asset` renderer для PNG/JPEG/GIF;
- large file path выше embedded-safe sync threshold;
- legacy small/local `image.embedded` path остаётся;
- Chromium/Firefox + reconnect/rebase regression coverage.

Initial deployment defaults: 32 MiB для PNG/JPEG/GIF. Лимит конфигурационный.

### M4 — direct HTTPS URL import + MP4

- direct HTTPS media URL → hardened backend fetch → owned immutable asset;
- SSRF deny policy для private/loopback/link-local/IPv6 + redirect revalidation;
- streamed size/time limits и MIME signature validation;
- MP4 asset до initial 128 MiB configurable limit;
- local/ephemeral play/pause/seek state;
- provider pages/iframe/YouTube/Vimeo не входят в этот milestone.

Exit: внешний origin после import больше не участвует в rendering path.

### M5 — portability

- новый portable TutorBoard bundle: `document.json + manifest + assets/*`;
- legacy `.tutorboard.json` остаётся для self-contained embedded documents;
- asset-backed board нельзя молча экспортировать как «полный» JSON без bytes;
- bundle round-trip и integrity checks.

### M6 — optional offline staging

Первый media release требует сеть для первоначального большого upload/URL
import. После успешного upload обычная command queue сохраняет текущие offline
гарантии. Durable IndexedDB blob staging добавляется отдельным increment только
после M1–M5.

Media track может выполняться параллельно Pilot Deployment Gate при условии, что
он не расширяет pilot public surface до прохождения собственных security,
storage и browser gates.

## 27. Критерий выбора следующей задачи

При конфликте backlog priorities:

```text
pilot blocker affecting real teacher/guest flow
    > security/access correctness
    > data durability/convergence
    > runtime isolation/attack surface
    > migration/rollback safety
    > guest/teacher UX completeness
    > observability/deployment
    > optional features
```

Новая optional feature не расширяет public surface до закрытия соответствующих
security, durability и deployment gates.

После успешного pilot приоритет переключается на полный Production Gate; pilot
не считается основанием для ослабления Production Definition of Done.


## F3.1 — Upload before command (08.10.2026)

Ветка `feat/f3-upload-before-command`: opt-in `VITE_FEATURE_MEDIA_ASSET_IMPORT=true`
на синхронизируемых досках, PNG/JPEG/GIF до 32 MiB на файл и 96 MiB
на пакет, последовательная подготовка и загрузка до одной команды
`core.objects.add(media.asset)`. Серверный `AVAILABLE` descriptor используется
как источник полей объекта. SVG и локальная offline-доска продолжают
использовать `image.embedded`; никакого повышения лимита JSON-команд.
При смене прав/доски upload отменяется, частичные ошибки диагностируются.
Production требует `BOARD_MEDIA_UPLOADS_ENABLED=true` и ClamAV.
Междосковый clipboard и переносимый asset bundle остаются отдельными
пунктами ADR-032.


### F3.2.1 — real backend/browser media integration

- PR scope: asset-enabled standalone FastAPI fixture with real SQLite persistence
  and private local artifact storage, and production-built frontend with
  `VITE_FEATURE_MEDIA_ASSET_IMPORT=true`. Browser-driven teacher/guest PNG,
  JPEG, and GIF upload, authorization, `AVAILABLE` metadata, compact command,
  same-board media download checksum, real-time revision and page reload.
- CI: `npm run e2e:media-fullstack` (Chromium + Firefox), with backend pinned
  to `dab5520578c9be383bd55a60321a91d1e69e1d81` and uploads enabled only
  in the test runner. Legacy/offline modes retain default disabled flag.
- Follow-up: test PostgreSQL + S3/MinIO storage/restart/backup in an isolated
  integration environment before production rollout (F3.2.2/3).


### F3.2.3 — media-aware snapshot/export and recovery (stacked on PR #185)

- SVG/PNG/PDF export and lesson evidence now prepare a temporary snapshot document:
  retrieve media assets through the current authorized board repository, confirm
  MIME, byte length and actual SHA-256, and embed safe PNG/JPEG/GIF data URLs.
  The canonical persisted BoardDocument, commands, revision SHA and asset metadata
  remain untouched. Duplicate references are downloaded once per export.
- Missing access, unsupported media, corrupt content or over-budget exports fail
  before producing a misleading placeholder-only artifact. Static SVG/PNG/PDF
  available from the standalone settings panel with board.export capability.
- Browser fullstack regression verifies exported SVG and PDF after reload;
  focused unit cases guard wrong content/metadata and legacy export.
- Backend restore integrity and release gates live in a separate backend PR.
- Follow-up: portable JSON asset bundle and very large (>128 MiB) snapshot
  streaming/pagination require independent product formats and performance work.


### F3.3.1 — authenticated media performance measurement

- Fixed a pre-existing invalid PNG browser fixture (incorrect IDAT CRC) that
  made the full post-merge Chromium/Firefox image import smoke fail. Keep the
  functional image import assertions intact.
- Authenticated standalone 10/50/100 PNG + 1/4/8 GIF scenarios, using real
  upload-before-command, revision journal, reload and authorized media download.
  Each raster is 512×512; report decoded-pixel estimate, cold/warm image
  decoding, successful/failed media GET requests, transferred content length,
  long tasks, JS heap when supported, and rAF p50/p95 under pan/zoom.
- PR CI runs only the 10+1 smoke profile. The dedicated manual workflow
  (`workflow_dispatch`, profile=full) captures the 10/50/100 matrix into
  retained JSON artifacts. No arbitrary performance threshold is inferred
  from uncalibrated GitHub runners; metrics are diagnostics until a stable
  baseline/variance budget has been measured.
- Backend dependency is pinned to the merged F3.2 SHA. The opt-in asset flag
  is enabled strictly inside the isolated benchmark build.
- Next F3.3.2: verify/limit the `cachedSources` registry lifetime,
  cancel in-flight decodes at board switch and revocation, and introduce
  measured caps/eviction only against established benchmark evidence.

## F3.3.2 — Media cache lifecycle (08.10.2026)

The implementation is split into independent, reviewable blocks A–D.

- **A — lifecycle contract and diagnostics:** merged as PR #188 (`463ab8df`). Board-scoped lease ownership, generation invalidation and cache snapshots. See [`docs/F3_3_2_MEDIA_CACHE_LIFECYCLE.md`](docs/F3_3_2_MEDIA_CACHE_LIFECYCLE.md).
- **B — bounded source cache and resource release:** merged as PR #189 (`0b484629`). Per-registry source LRU/pruning, source-targeted raster release, O(1) queued cancellation, decode reservations and GIF abort settlement.
- **C — board/access lifecycle wiring:** merged as PR #190 (`9fd06929`). Board-scoped leases for PNG/JPEG/GIF, StrictMode-safe setup/disposal, synchronous release on refresh/revoke, generation-bound display and guarded resolver.
- **D — cyclic browser memory/performance release gate:** merged as PR #191 (`152f6444`). Chromium/Firefox three-cycle smoke, pinned fullstack guest reconnect/accessEpoch/revoke/board-switch checks, JSON evidence and 12-cycle Chromium soak; guest offline cleanup fixed.

A's initial source lifetime limitations were addressed by B/C; D adds browser
verification and the guest offline cleanup regression guard.

## C3.1 — large-board browser baseline (09.10.2026)

- PR #192: 2×2 factorial Chromium profile for 300/600 pen strokes and 0/4 GIF, each with six different 1536×1536 PNG sources. Real BoardDocument 1.6, Konva, pen and wheel UI interactions. See [large-board performance report](docs/LARGE_BOARD_BROWSER_PROFILE_2026-10-09.md).
- Main regression candidate: GIF animation repaints the committed Layer with all visible ink/media; with 600 strokes and 4 GIF, zoom frame interval p95 is 66.7 ms, compared with 33.3 ms without GIF.
- C3.2 proposed engineering block: profile and optimize animation-driven redraw while preserving exact z-order, hit tests, transforms, permission-scoped media lifetime and undo. Evaluate ordered static render runs, bounded cache and selective repaint; establish before/after in the same browser workload before shipping. A global GIF throttling cap is not an accepted substitute for isolation of work.


### C3.2-B — isolate static and animated paint runs (09.10.2026)

- Draft PR #194, branch `perf/c3-2-static-animated-render-runs` based on `main` (independent of pending C3.2-A / PR #193).
- Cause: GIF animation invalidates the shared committed Konva Layer and repaints unchanged pen paths and static images. Partition visible BoardRenderItems into consecutive static/GIF render runs with independent Konva Layers, preserving exact object z-order and existing renderer/hit/transform/media-lifecycle code. Limit to six layers, reverting to the original single Layer for highly alternating documents.
- Regressions: 7 focused paint-run unit tests for ordering, fallback and GIF-only scenes; Chromium/Firefox smoke for 5 interleaved runs, resource readiness and GIF-only draw activity. Full CI checks passed on code SHA `0f9fdf2` including format/lint/typecheck/unit/performance budgets/build and existing resource/fullstack checks; media-profile 12/12 Chromium cases passed on both attempts. See [large-board browser report](docs/LARGE_BOARD_BROWSER_PROFILE_2026-10-09.md).
- On 600 strokes + six PNG + four GIF: baseline zoom drawImage 540/540; C3.2-B 250/250 (~53.7% fewer calls). Pen input-to-paint p95 baseline 30.9/32.7 ms; candidate 15.4/13.0 ms. GIF-triggered static repaints are isolated in the normal run-separation path.
- Zoom rAF frame-gap p95 baseline 66.7/49.9 ms versus C3.2-B 66.6/50.0 ms: no demonstrated latency-p95 improvement for wheel zoom. The original requirement for sustained zoom p95 reduction remains open; keep PR in draft pending a zoom-specific improvement or explicit acceptance of the narrower confirmed outcome. High-DPI full-size Layer memory and exact mixed-content pixel equivalence also need release-gate attention.
- Follow-up: optimize static-content viewport redraw during wheel interaction (bounded path cache / bitmap composition or equivalent), retain arbitrary z-order and precise hit/transform behavior, and repeat paired browser profiling including cross-browser visual checks.


### C3.2-B wheel-zoom vector-ink raster cache (09.10.2026)

- PR #194 adds transient 4-million-pixel-budget Konva caching for contiguous pen-stroke runs during wheel zoom, and passes stable `zoom=1` to the pen renderer so unchanged stroke geometry is not regenerated on viewport updates. The existing ordered static/GIF Layer split remains intact.
- Hit canvases are cached with Konva child color keys. Caches are cleared on wheel commit/cancel, authoritative viewport synchronization, object changes, selection previews and unmount. GIF, PNG/JPEG and media permission lifecycles retain their original renderers.
- Before this incremental wheel cache (C3.2-B `0f9fdf2`), 600 pen + 6 PNG + 4 GIF zoom rAF p95 was 66.6/50.0 ms; with wheel cache (runtime SHA `6be6728`), independent successful CI media-profile attempts report **33.5/33.4 ms**. Zoom `drawImage` was 250/250 before and 258/258 after; the added drawImage is the cached ink bitmap, replacing repeated vector path work. Pen input-to-paint p95 15.4/13.0 ms before and 15.4/17.7 ms after: **no confirmed further pen latency gain**.
- Every attempt completed all 12 Chromium media-profile cases. Current runtime quality gate, unit tests, lint, typecheck, build, performance budgets, fullstack/resource checks and Chromium/Firefox `@smoke` all passed. A focused post-wheel hit-test regression is added in the final documentation/testing commit; it needs its own passing CI before merge.
- The heavy-scene zoom p95 decrease is reproduced on the same CI workload, with limited n=2, 48-frame samples. Pixel-equivalence under complex alpha/masks and other hardware remains unmeasured; keep rollback path and avoid claims of universal 60-fps performance. See [browser evidence](docs/LARGE_BOARD_BROWSER_PROFILE_2026-10-09.md).


### C3.2-B release gate: four Chromium CI profiles and acceptance (09.10.2026)

- Final code head for the regression/browser release gate: `027378ef9aca3f20f9f4dbb391f8ffffbc96c57b`. Entire GitHub CI completed, including 36 Chromium smoke tests, 36 Firefox smoke tests, 12 media-profile tests, TypeScript/lint/unit/build/performance-budget, authenticated uploads, resource soak and formula gates; Trivy neutral, production image skipped.
- Repeated `large600-animated` wheel zoom p95 with transient ink cache, same scenario and code: **33.5 / 33.4 / 50.0 / 16.7 ms** across four successful jobs (first two on precursor code `6be6728`, last two on `027378e` with only test/docs changes). Previous C3.2-B without wheel ink cache: **66.6 / 50.0 ms**. Initial C3.1 baseline: **66.7 / 49.9 ms**. `drawImage` count with wheel cache was 258 / 258 / 262 / 262 versus 250 / 250 before wheel cache: expected additional ink-cache blits.
- User-requested release decision: accept measured reduction in heavy-scene wheel zoom p95 and cross-browser correctness as sufficient for merging PR #194. Do not claim fixed 60 fps: frame-gap variance and 50 ms outlier remain possible. Follow-up separate performance work: high-DPI memory, deeper scene-graph/path profiling, production-like endurance, complex alpha overlap pixel equivalence and main-branch recheck.

### C3.2-A integration on C3.2-B main (09.10.2026)

- Reconcile PR #193 with the merged C3.2-B wheel ink cache and ordered static/GIF render runs from PR #194. During wheel gestures, temporarily activate the existing 24-fps GIF coordinator pacing; restore default cadence on wheel commit, cancellation, authoritative viewport replacement or component unmount.
- Keep C3.2-B's bounded pixel budget, cache cleanup, z-order, hit testing, transforms, and media-asset permission lifecycle intact. No persistent-format or API changes.
- Cross-browser smoke of GIF resuming after repeated zoom plus full CI and repeated Chromium large-board profile are merge gates. Measured C3.2-A alone previously reduced GIF draw calls without proving improved zoom p95; assess combined changes against merged C3.2-B baseline before accepting.
