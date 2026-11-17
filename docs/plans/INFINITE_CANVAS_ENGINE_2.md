# TutorBoard — Infinite Canvas Engine 2.0 (ICE 2.0)

> **Статус:** proposed / plan only, 17.11.2026. Production-код, формат документа, серверные контракты и runtime-флаги этим планом не изменяются.
>
> **Репозиторий:** [ArtemLevin/tutorboard](https://github.com/ArtemLevin/tutorboard).
> **Основа планирования:** \`main\` \`10d716b7ac66a8fa2b9d0dbbbd3dd9fc455a32e8\` (при начале каждой реализации повторно проверять актуальный HEAD).
> **Связанные задачи:** [#201 — C3.9 latency](https://github.com/ArtemLevin/tutorboard/issues/201), [PLAN.md](../../PLAN.md).
> **Характер внедрения:** изолированные PR ICE-00…ICE-12, измеримый GO/NO-GO, сохранение Konva как обратимого fallback.

## 1. Цель, границы и принципы

**Цель:** получить отзывчивое бесконечное полотно с большими объёмами рукописных штрихов и разнородных объектов; промежуточный обязательный benchmark — 5 000/10 000 штрихов, исследовательская целевая нагрузка — 30 000/100 000. Работа со 100k рассматривается как **цель, требующая доказательства**, а не обещанная характеристика. Стоимость очередного кадра должна максимально зависеть от видимой/изменённой геометрии.

**Основные механизмы:** incremental scene deltas, spatial indexing, bounded tiled rendering, dirty-region invalidation, GPU geometry batching, при необходимости OffscreenCanvas/Workers и LOD. Достаточность каждого механизма подтверждается отдельно; запуск всех подходов заранее не санкционируется.

**Рамки первой фазы:** без изменения \`BoardDocument\`/command schema, существующих сериализованных байтов, server collaboration, авторизации, ограничений импорта, undo/recovery или форматов экспорта. Tile/GPU/Worker данные исключительно производные и пересоздаваемые. Большой документ, требующий новой схемы хранения или серверных лимитов, относится к самостоятельному ICE-11 с версионированным rollout.

**Безусловные инварианты:**

1. \`BoardDocument\` — единственный domain source of truth. Рендереры потребляют immutable \`BoardSceneReadModel\`/read-модели и выдают intent; никакие Konva/Three/Pixi/Canvas/WebGL nodes не сериализуются.
2. \`BoardDocument.order\` — единственный источник z-order; нельзя ради оптимизации переместить все GIF/ink поверх остальных объектов. Прозрачность, clip, transform, группы и GeometryOS overrides должны сохраняться.
3. Координаты: \`screen = world * zoom + offset\`; world — безграничные логические координаты; DPR влияет на raster backing, но не на сохранённые значения или hit coordinates.
4. Wet Ink остаётся независимым low-latency overlay: coalesced/predicted events, pressure, pointer capture/cancel и flush на завершении жеста сохраняются. Подготовка графики не блокирует input handlers.
5. Точный hit-testing/partial eraser/selection всегда адресуют исходный object ID. Spatial index выступает broad phase; подтверждение hit осуществляется точной геометрией/корректным hit backend.
6. Безопасность неизменна: внешний ввод/импорт валидируется полностью; только сертифицированные owned immutable snapshots могут пользоваться оптимизированными доверенными путями. Никаких пропусков Zod/semantic validation на недоверенных границах.
7. История, undo/redo, clear, reconnect, read-only/guest, offline queue, кроссбраузерное поведение и экспорт должны оставаться корректными.
8. Любой новый runtime — optional, bounded, cancellable, с \`dispose\` и fail-safe возвратом к Konva. Не собирать ученический контент в telemetry; внутренние показатели остаются в developer/teacher diagnostics.

## 2. Имеющийся фундамент и запреты на повторение неудачных экспериментов

На \`main\` уже присутствуют: \`src/adapters/canvas-konva/BoardStage.tsx\`, \`board-scene-content.tsx\`, \`wet-ink-renderer.ts\`, \`wheel-ink-cache.ts\`, \`committed-paint-runs.ts\`, \`src/core/board/selectors.ts\`, Worker-адаптер вычисления документа и тесты C3.9. Существуют memoization неизменных объектов, viewport culling, ink run caching, incremental Wet Ink и owned immutable snapshots. Новый трек **сначала использует эти возможности**, а затем проверяет оставшиеся узкие места.

Ниже приведены доказательства с их ограничениями:

- [C3.9-S3 анализ](../C39_S3_ANALYSIS_PLAN_2026-10-10.md): на dense 5k/10k растра и сохранения viewport остаются значимые задержки; прежняя синхронная холодная растеризация на wheel дала **NO-GO**.
- [C3.9-S4 trace / PR #218](https://github.com/ArtemLevin/tutorboard/pull/218): scene/hit работа пересекает многие долгие кадры; причинное устранение всего хвоста **не доказано**.
- [S5.1–S5.4 / PR #220, #224, #225](https://github.com/ArtemLevin/tutorboard/pull/224): Konva \`Group.cache()\` с crop не поддерживает наивное многотайловое разрезание перекрывающего штриха; в экспериментах были pixel/hit расхождения, включая DPR2. Существующий DPR2 fallback не является ускорением.
- [Stable culling ABBA / PR #233](https://github.com/ArtemLevin/tutorboard/pull/233): стабильность групп сама по себе не дала необходимого >=20% сквозного выигрыша. Не принимать оптимизацию по одному CPU-счётчику.
- [Immutable snapshots](../architecture/IMMUTABLE_SNAPSHOTS_AND_INCREMENTAL_SYNC.md): повторная валидация owned viewport уже значительно ускорена в reducer, но сквозной frame p95 может оставаться высоким. Повторно «оптимизировать» уже решённый участок без нового профиля бессмысленно.
- [ADR-001](../adr/0001-canvas-renderer.md) и [CANVAS_ADAPTER](../architecture/CANVAS_ADAPTER.md) допускают замену рендерера без миграции документа.
- [LAYERS](../architecture/LAYERS.md), [COORDINATE_SYSTEMS](../architecture/COORDINATE_SYSTEMS.md), [LOCAL_PERSISTENCE](../architecture/LOCAL_PERSISTENCE.md) и [ADR-032](../adr/ADR-032-board-media-assets.md) определяют существующие ограничения.

**Запреты:** не включать NO-GO Draft PR автоматически; не выполнять большое \`cache()\` синхронно из wheel/pointer; не наращивать число полноэкранных Konva Layers без бюджета; не упрощать live-render ценой потери точности; не отключать hit canvas без доказанного безошибочного восстановления при первом pointer event; не менять исходную геометрию и хеши ради кэша.

## 3. Целевая архитектура (предлагаемая, не утверждённый API)

\`\`\`text
BoardDocument (canonical, immutable)
  ├── commands / sync / persistence / undo / export  [existing, unchanged]
  └── BoardSceneReadModel / SceneDelta
       ├── SpatialSceneIndex (bounds, identity, visibility, z-runs)
       ├── RenderScheduler (input priority, versions, cancellation)
       ├── TileCache (world tiles × resolution bucket × ordered run)
       │     └── optional off-thread raster/geometry preparation
       ├── GPUGeometryBackend (optional, bounded batching)
       └── Konva fallback + WetInk / interaction overlays
\`\`\`

Предлагаемые модули — только точки проектирования; окончательные имена утверждаются в ICE-00/03:
- \`src/core/scene/{scene-delta,scene-index,spatial-index}.ts\` — чистые вычисления без DOM/GPU/renderer imports.
- \`src/adapters/canvas-tiles/*\` — плиточный backend, bounded cache, image/alpha/fidelity semantics.
- \`src/adapters/canvas-gpu/*\` — условный WebGL2/PixiJS backend после spike.
- \`src/adapters/scene-worker/*\` — optional off-thread preparations, независимый lifecycle от \`board-document-worker\`.
- \`src/app/board/*\` — composition/feature flags/gesture intent, без владения графическими ресурсами core.

**Пределы composition:** tiling не равно созданию нового Konva Layer для каждого тайла. Расположение объектов между растровыми runs обязано быть эквивалентно \`BoardDocument.order\`. Неподдерживаемые смеси прозрачности/масок/трансформов идут по проверенному векторному fallback. Вместе scene/hit/scratch/CPU bitmap/GPU textures учитываются до выделения памяти; одна RGBA поверхность требует минимум \`width × height × 4\` байт без накладных расходов.

## 4. Последовательность PR и exit criteria

### ICE-00 — Architecture & performance contract (docs only)

- Зафиксировать renderer ownership и read-model/scene-delta контракты, жизненный цикл, область кеширования, точность, поддерживаемые браузеры и бюджет памяти.
- Подготовить ADR, memory/quality/rollback matrix, указать ownership тестов и feature flags. Проверить влияние C3.9 и существующих Draft PR.
- Установить одинаковые правила для teacher/guest, multi-board, disposal и runtime fallback.

**Exit:** ADR согласован; дифф только documentation; нет утверждений о уже достигнутом ускорении.

### ICE-01 — Reproducible performance laboratory (instrumentation/tests only)

- Расширить \`tests/e2e/c39-large-board-profile.spec.ts\`, \`tests/fixtures/*\` и profile scripts вместо создания не связанного с C3.9 измерителя.
- Нагрузки: 1k, 3k + media, 5k + 10 images, 10k + 10 images, 30k, 100k, 10k mixed (plots/GIF/text), 2-user endurance. Для каждого отдельно total count/actual visible count, stroke complexity, z-order (2 runs / 3–6 / >6), DPR1/2, warm/cold cache.
- Измерять input delivery, pointer-to-paint p50/p95, rAF frame p50/p95/p99/max, >25/>50/>100ms, wheel preview/persist/settling, React/Konva scene+hit, compositor, long tasks, rendered objects, bitmap/GPU memory (если доступна).
- Фиксировать source SHA, браузер/OS/GPU backend, viewport, fixture hash и траекторию; trace-on для диагностики, trace-off для release-метрики. Минимум два независимых runner, контрбалансированные ABBA; не выводить уверенный p99 из 48 кадров.
- Сохранять bounded machine-readable summaries; no student payloads, no production tracing by default.

**Exit:** воспроизводимый и документированный baseline 5k/10k, понятная неопределённость для 30k/100k, первичная causal hypothesis; production behavior неизменён.

### ICE-02 — SceneDelta & spatial index

- Превратить существующую immutable scene selection в воспроизводимый event/diff для изменённых object IDs и old/new world bounds; не дублировать \`BoardDocument\`.
- Исследовать R-tree/spatial hash для viewport broad phase, eraser, selection; согласовать z-order и точный narrow phase. Сравнить со штатным индексом видимости по реальным сценам.
- Обрабатывать add/delete/move/style/visibility/order, group transformations, GeometryOS visual overrides, undo/redo, clear, remote ops, board replacement и viewport-only (без изменения geometry rev).
- Восстановить индекс после authoritative replacement, не удерживать закрытые документы; immutable ownership гарантирует invalidation, недоверенные snapshots проходят strict reader.

**Exit:** равенство эталонным selectable IDs/bounds/z-order и точным результатам взаимодействия; измерено снижение CPU/аллокатора или зарегистрирован NO-GO; отсутствие роста памяти.

### ICE-03 — Renderer abstraction / feature flag

- Ввести обратимые режимы \`konva\` (default), \`hybrid\` (opt-in), \`gpu\` (research only).
- Установить API уровня \`mount/applySceneDelta/setViewport/resize/invalidate/dispose\`; вводом и командами продолжает владеть app/controller.
- Описать loss/restore graphics context, device capability/low-memory fallback, cancel/teardown; запретить сериализовать feature flags.
- Smoke switching, cross-render coordinate parity, no asset/DOM/React ownership leaks.

**Exit:** стабильный Konva полностью доступен и идентичен baseline; новый adapter меняется без миграции/серверной зависимости.

### ICE-04 — Bounded tiled rendering spike

- Сравнить 256/512 logical tile sizes и zoom/DPR resolution buckets на безопасных статических pen-only ordered runs. Ключ: scene epoch, render-run identity, tile coord, resolution bucket, DPR, content revision.
- Определить dirty tiles из union(old bounds, new bounds) с padding; проводить tile raster в ограниченных порциях за пределами wheel/input.
- Сохранить точные alpha compositing, seams, transformed groups, overlapping strokes, media z-barriers; не вырезать crossing strokes через \`Group.cache()\` с потерей второй половины.
- Консервативно обходить unsupported content через vector Konva. Отрисовка тайлов остаётся независимо проверяемым transient результатом.

**Exit:** корректные изображения при DPR1/2, точные object ID на первом клике/стирании после zoom, отсутствие швов; при ошибке/нехватке ресурсов полный fallback.

### ICE-05 — Dirty-region cache manager & budgets

- Общая LRU/admission политика для scene/hit/scratch/pixel/GPU памяти, согласованная с существующими 4M physical scene pixels wheel cache.
- Бюджет рассчитывается **до** аллокации и запрещает удвоение ресурсов двух несовместимых кэшей; GPU bytes и transient buffers учитываются отдельно, неизвестные расходы отражаются с запасом.
- Приоритет: active pen > pointer/hit > visible viewport > adjacent prewarm; отменять superseded revisions, zoom bucket, resize, board switch/unmount, revoke.
- 48+ wheel cycles, clear, undo/redo, reopen/reconnect, loss/restore; не допускается неограниченное накопление.

**Exit:** bounded retained resources и стабильность latency во время подготовки; ни одной синхронной тяжёлой cache build в input handler.

### ICE-06 — Mandatory tiled A/B decision gate

- Сопоставить A=\`konva\`, B=\`hybrid\` на production builds в независимых ABBA; одинаковые source scene, input, output viewport, visible counts, DPR1/2 и image decode.
- Перед performance: строгие pixel/alpha/hit/erase/history/collaboration/cross-browser checks. Новый GPU backend может требовать обоснованного отдельного fidelity tolerance **до** теста; никакое тихое ослабление прежнего порога не допускается.
- Gate на 5k и 10k: медианный paired end-to-end active p95 выигрыш >=20% **на каждом из двух независимых runner**, снижение >100ms rate, отсутствие значимого ухудшения first-input, input-to-paint, commit, памяти/ресурсов, и всех correctness tests.
- Отдельно публиковать p95/p99 uncertainty, raw traces, корректность реально исполненной wheel траектории и число sample frames.

**Exit:** \`GO\` для ограниченного opt-in hybrid либо \`NO-GO\` с причиной. Никакого включения по одной частной microbenchmark метрике.

### ICE-07 — GPU geometry batching (conditional spike)

- Сравнить WebGL2/PixiJS и custom GPU geometry renderer; Three.js уже обслуживает 3D и остаётся кандидатом лишь при измеренном 2D преимуществе.
- Batch совместимые ordered ink runs, сохранить object ID mapping и точную pressure-width/cap/join/opacity/style geometry; обновлять changed buffer ranges, исключить per-stroke draw calls.
- Изучить texture atlas, index/vertex memory, контекстные потери, shader precision, multi-media alpha и ограничение GPU buffers; предусмотреть исходный vector path.

**Exit:** устойчивый выигрыш на тех же A/B сценах, correctness и memory pass, только затем интеграция.

### ICE-08 — Off-main-thread rendering preparation (conditional)

- Подготовка геометрии/tiles в отдельном Worker, опциональный \`OffscreenCanvas\` в поддерживаемых браузерах; не смешивать с существующим документным Worker.
- Chunk/batch messages, transferable buffers, version/epoch keys и cancellation; discard stale results после edit/undo/board switch.
- Fallback при отсутствии Worker/OffscreenCanvas; вход, интерактивный hit и сохраняемые документы продолжают работать.

**Exit:** уменьшение main-thread long tasks/end-to-end latency без потерь input/events и без memory amplification.

### ICE-09 — Level of Detail / zoom buckets (conditional)

- Исследовать низко-/средне-/высокодетализированные производные representations только для завершённой статической геометрии.
- При редактировании, hit и PDF/export всегда использовать точный исходный вектор; сглаживание и переход buckets не должны менять координаты.
- Проверить близкие штрихи текста, тонкие линии, dash/wavy/sketch, давление, zoom transitions, DPR2, atlas eviction.

**Exit:** доказанное улучшение zoom/pan при сохранении визуального и семантического качества.

### ICE-10 — Interaction & collaboration integration

- Матрица: pen + Wet Ink/coalesced/predicted, Smart Ink, partial/full erase, click/marquee/selection/Transformer, text/formulas, piecewise coordinate plot, GeometryOS imports/visualOverrides, 3D, PNG/JPEG/GIF/SVG, z-order.
- Undo/redo, clear atomic, local Dexie recover, multi-board switch, teacher/guest, offline queue/reconnect, read-only/revoke, export PNG/PDF/JSON.
- Проверять точное первое pointer interaction во время прогрева, отмену/потерю capture, stale tiles после remote edits.

**Exit:** все релевантные functional browser gates пройдены при opt-in hybrid; сравнимые визуальные и доменные результаты.

### ICE-11 — Large-document storage scaling (conditional, separate protocol decision)

- Профилировать parse/clone/freeze, 30k/100k scene memory, serialization/hash, undo graph, sync pending queue и restart/recovery.
- Если нужно, отдельно спроектировать chunked persistence/virtual document residency, generation tracking, robust full reconstruction, migration and backend handshake.
- Не обходить действующие границы публичного JSON импорта, размеров команд, graph Undo или server staging; версионированная схема/транспорт требует согласованного frontend/backend rollout и пилота старых клиентов.

**Exit:** доказанная корректность и производительность на согласованном large-document сценарии; миграция не попадает в PR рендеринга.

### ICE-12 — Pilot & rollout

- Internal opt-in → controlled teacher/guest pilot → supported-hardware canary → broad rollout только после production release gate.
- Verify loss-of-context/unsupported GPU fallback, long multi-hour lessons, resource cleanup, low-memory/high-DPR devices, error boundaries, offline/reconnect, read-only/revoke.
- Feature flag for rollback; fallback не меняет данные/команды; наблюдаемая регрессия вызывает отключение нового backend.
- Ученический UI не показывает debug metrics/технические флаги.

**Exit:** post-merge verification on exact SHA, validated rollback, acceptance report, обновлённые ADR/PLAN; #201 не закрывать без выполнения его общего C3.9-E/F gate.

## 5. Зависимости и контрольные точки

\`\`\`text
ICE-00 → ICE-01 → ICE-02 → ICE-03 → ICE-04 → ICE-05 → ICE-06
                                                 |
                                GO only ──────────┘
                                                 v
                                    ICE-07 / 08 / 09 (each conditional)
                                                 |
                                               ICE-10
                                                 |
                                  ICE-11 (only if required)
                                                 |
                                               ICE-12
\`\`\`

- **M0 — baseline:** ICE-00/01, без изменения production.
- **M1 — incremental scene:** ICE-02/03, сохранён Konva fallback.
- **M2 — tiled MVP:** ICE-04/05, correctness + resource bounds.
- **M3 — performance gate:** ICE-06, принимает GO/NO-GO на независимых browser измерениях.
- **M4 — conditional enhancements:** ICE-07/08/09 только по доказанному bottleneck.
- **M5 — integration / pilot:** ICE-10/11/12.

Ни один этап не считается завершённым по успешной сборке без нужных функциональных/измерительных gate.

## 6. Acceptance metrics (targets, not achieved results)

| Показатель | Предлагаемый ориентир | Как подтверждать |
|---|---:|---|
| 5k и 10k heavy board | >=20% median paired active p95 improvement | >=2 независимых runner, ABBA; корректность обеих версий |
| Pan | p95 <=16.7 ms frame interval | device-profile и trace-off browser |
| Wheel zoom | p95 <=33.3 ms, stretch <=16.7 ms | separate preview/persist/settling + total |
| Pen Wet Ink | input-to-paint p95 <=20 ms | real/coalesced high-rate input; без конкурирующего long task |
| Long stalls | нет воспроизводимых >100 ms при типовых жестах | counts/rates/max с CI + реальным Windows устройством |
| 30k/100k | полный редактируемый сценарий без аварий, метрики отдельно | staged, explicit success thresholds after baseline |
| Resource retention | bounded by documented shared budget; zero stale leases | 48+ cycles, clear/undo/switch/reconnect/dispose |
| Correctness | сохранены scene/order/alpha/hit/history/document bytes | golden screenshots, domain asserts, Chromium/Firefox |

\`p99\` отчёт обязателен, но статистический вывод о хвосте допустим лишь на достаточных независимых повторах; выбранные заранее сцены и sample-count нельзя подгонять под лучший результат. Характеристики на shared CI runner не являются гарантией для всех GPU.

## 7. Матрица проверки и release workflow

**Обязательные доменные случаи:** single/multi-stroke, partial eraser на границе tile, group/GeometryOS transform, stroke hover/hit после wheel, alpha over media, alternating GIF/ink >6 paint runs, plot sampling, group reorder, undo/redo, clear/restore, read-only, revocation и 2-client sync/recovery. Проверять идентичность после DPR/zoom/resize/switch; исключить незавершённые promises и bitmap URLs.

**Для PR:** \`inspect → reproduce → regression → minimal implementation → focused test → npm run check → Chromium/Firefox E2E → production A/B → review → GO/NO-GO → post-merge verification\`.

Точки входа существующих проверок: \`npm run check\`, \`npm run e2e:smoke\`, \`npm run e2e:c39-profile\`, \`npm run e2e:media-profile\`, \`npm run e2e:media-cache-soak\`, \`npm run e2e:plot-production\`, \`npm run e2e:plot-visual\`. Запуски профилей используют имеющиеся env flags по соответствующим workflows; новые команды добавлять только вместе с тестами. Проверять фактический маршрут GitHub Actions path filters, чтобы renderer-only изменения не обходили benchmark.

Обязательный evidence package каждого экспериментального PR: baseline/candidate SHA и build identity, fixture hash, архив trace-off raw samples, отдельная trace-on диагностика, результаты pixels/hit, memory budget accounting, browser/OS/GPU information, failed/unknown cases, самостоятельное self-review, решение GO/NO-GO, откат. Неполные результаты фиксировать как \`INCONCLUSIVE\`.

## 8. Стартовая работа и правило пересмотра

**Первое исполняемое изменение после принятия этого плана — ICE-00 + ICE-01**: оформить ADR/contract и воспроизводимый baseline. Затем ICE-02/03 и ограниченный ICE-04 prototype. Сначала доказать 5k/10k пользу, затем идти к 30k/100k.

Перед любым ICE PR повторно прочитать текущие \`PLAN.md\`, [#201](https://github.com/ArtemLevin/tutorboard/issues/201), соответствующие Draft/merged PR, адаптеры и CI; существующие результаты могут быть заменены новыми. Подтверждённые изменения в исходной C3.9 цепочке учитываются без дублирования работ. Каждый ICE PR остаётся малым и обратимым; rollback через feature flag/revert без потери данных.

**Definition of done программы:** новый движок прошёл корректность, измеренную сквозную отзывчивость, memory/lifecycle проверки и controlled pilot; исторические протоколы/документы читаются исходным Konva и новым backend. До этого статус — \`research / pilot\`.
