# C3.9-S5 — план ограниченного кэша одного pen-run и A0/A2

Дата: 11.10.2026. Статус: **проектный план; A2 ещё не реализован; A0/A2 ещё не измерены**.
База реализации: main SHA 8a24b882b2a84472bc530691e47171a7775e74a6. Исходная задача: [Issue #201](https://github.com/ArtemLevin/tutorboard/issues/201). Предшествующее исследование: [S4 PR #218](https://github.com/ArtemLevin/tutorboard/pull/218) и [его отчёт](https://github.com/ArtemLevin/tutorboard/blob/perf/c39-s4-scene-hit-causal/docs/C39_S4_SCENE_HIT_CAUSAL_2026-10-11.md). A1 PR #217 и S2 PR #216 получили NO-GO и исключены.

## 1. Цель и критерий успеха

На досках с 5 000 / 10 000 рукописных штрихов и 10 статическими PNG/JPEG уменьшить задержки wheel zoom благодаря частичному пространственному кэшированию **ровно одного непрерывного pen-only run**, при сохранении порядка наложения, исходных Konva hit IDs, выделения/перемещения, ластика, undo/redo, сохранения и восстановлений. Остальные объекты и pen-runs сохраняют текущий путь отрисовки. Реализация — opt-in эксперимент, production по умолчанию использует стабильный vector path.

Основание S4: синхронные drawScene+drawHit составили 15,6% всех длительностей активных frame gaps на 5k и 17,3% на 10k; viewport persistence независимо 12,5% и 16,6%; 90/114 и 129/184 кадров >100 мс пересекались с вызовом scene/hit. Это корреляция JS-интервалов, **не ожидаемая величина ускорения p95**. Сохранять отдельное измерение persist и compositor.

**Release GO:** на каждом из двух независимых браузерных runner активный p95 в обеих основных нагрузках 5k/10k снижается минимум на 20% по медиане шести соседних A0/A2 пар; частота >100 мс падает; 3k/offscreen без воспроизводимой регрессии >10%; все pixel/hit/undo/memory gates зелёные. При невыполнении хотя бы одного обязательного условия — NO-GO / INCONCLUSIVE, PR Draft, Issue #201 открыта.

## 2. Что есть в текущем коде

- src/core/board/selectors.ts строит scene.items в порядке BoardDocument.order; createBoardVisibilityIndex повторно использует видимый список лишь при совпадении membership и порядка.
- src/adapters/canvas-konva/BoardStage.tsx передаёт видимые элементы в batchBoardRenderItems и partitionCommittedPaintRuns; один статический Layer перерисовывается при изменении transform родительской группы.
- src/adapters/canvas-konva/board-scene-content.tsx выделяет **непрерывные** ink run с помощью groupInkRenderRuns; BoardSceneRun оставляет их на исходной позиции между объектами других типов. Разбиение на batch по 250 — React-оптимизация, отдельные области canvas оно не создаёт.
- src/adapters/canvas-konva/wheel-ink-cache.ts содержит WheelInkCacheCoordinator, idle prewarm и node.cache(scene+hit), ограничение 4 000 000 физических scene-пикселей; wheel input всегда вызывает begin(..., {buildIfUnprepared:false}). Конкурирующий кэш должен учитывать этот владелец ресурсов.
- Исторические тесты: tests/unit/adapters/canvas-konva/wheel-ink-cache.test.ts, committed-paint-runs.test.ts, tests/unit/core/scene-selector.test.ts, tests/e2e/c39-large-board-profile.spec.ts. Следовать существующему поведению и observable contracts.

## 3. Архитектурное решение и подготовительный feasibility gate

### 3.1 Выбор единственного интервала

По исходному document order выбрать самый длинный допустимый contiguous интервал drawing.pen-stroke между любыми non-pen элементами. Не пересортировывать штрихи по географическим ячейкам; выбирать только статичные pen paths без неподдерживаемого blend/effect/transform preview; минимум 80 объектов. Границы и identity run фиксировать для wheel-сессии. Все неподдерживаемые элементы сохраняют исходный Konva renderer, другие ink runs также vector. В каждом кадре порядок pen → image → pen строго соответствует A0.

Оригинальные Konva nodes и object IDs должны оставаться единственным интерактивным представлением штрихов. Нельзя иметь две живые копии shape с одинаковым id и нельзя отключать hit graph для ускорения.

### 3.2 Блок S5.1: feasibility spike до production-адаптера

На **точно закреплённой в package.json версии Konva 10.3.0** построить небольшой браузерный reproducer с пересекающими две тайловые области штрихами, полупрозрачной заливкой, pen–image–pen и исходными object IDs.

Проверить: (1) как Konva Group.cache и hitCanvasPixelRatio сохраняют colorKey исходных дочерних shape; (2) можно ли сделать несколько clipped scene/hit-буферов на одном run без клонирования live nodes; (3) как действуют getIntersection, Transformer и stage.find; (4) пересечения tile edges, alpha compositing, порядок; (5) атомарный переход vector → подготовленные tiles → vector.

Исходный Konva Group.cache хранит crop одной группы, поэтому для нескольких одновременно видимых tile требуется доказанное решение. Допускается один ограниченный alternative spike с offscreen clip/replay, если оригинальный Konva hit ownership остаётся каноническим. **Feasibility GO**: точные hit IDs, правильная видимость/слои, нет дублирующих interactive nodes и пустых регионов, ресурсный учёт осуществим. **Feasibility NO-GO**: при требовании небезопасных private Konva monkey patches, невозможности hit parity или дублировании shapes; оформить reproducer и перейти к persist/compositor вместо разработки A2.

## 4. Bounded partial tile planner (S5.2)

Только после feasibility GO создать renderer-local immutable snapshot выбранного run и spatial index консервативных item bounding boxes (включая transform, pen width, cap/join, smoothing, shadow/filter halo). False positives разрешены; false negatives запрещены. Tile grid привязана к stable world coordinates, корректно работает с отрицательными x/y, resize, DPR1/2 и zoom 0.1–8.

Старт: 256 CSS-пикселей по стороне при reference zoom, halo >=3 CSS px с увеличением под реальный stroke/filter extent. Для каждого tile выбрать пересекающие stroke по исходным индексам, нарисовать в прежнем порядке. Halo используется лишь для вычисления, композитится непересекающаяся half-open interior. При crossing stroke и alpha-overlap не должно быть двойного смешения, обрезания или seam. На scale/DPR, где bitmap raster resampling нарушает визуальную точность, использовать новую подготовку idle или vector fallback.

Частично готовые плитки не создают дыр: недостающие области рисуются через clip в исходном vector run только если доказана эквивалентность, иначе до готовности всего минимального набора остаётся исходный vector. Сначала ограничить эксперимент **1–2 tiles**, расширять по фактическому выигрышу и памяти.

## 5. Canvas budget и жизненный цикл (S5.2–S5.3)

Не увеличивать maximumWheelCachePixels=4_000_000. Ввести единый accounting/lease для существующего WheelInkCache и будущих scene/hit/filter/scratch tiles: либо mutual exclusion с обязательным release старого кэша до выделения нового. Учесть retained + in-flight allocation, buffer/filter canvases, DPR, actual backing-store dimensions, GPU memory как отдельный риск. Экспериментальный стартовый общий лимит: **16 MiB отслеживаемых RGBA canvas surfaces** и не более 8 retained tiles; это верхняя граница, а не право аллоцировать все восемь.

Минимальная оценка для 256+3 halo, DPR2: scene 524² и hit 262² → 1 372 880 байт/tile; 8 retained + 1 scratch = 12 355 920 байт ещё без filter buffer и GPU копий. Полный DPR2 экран 1240×820 требует 4 067 200 scene pixels до hit, поэтому full-viewport cache не допускается. Если runtime не может доказать соблюдение общего лимита, всё освободить и вернуть vector fallback. Учитывать LRU/eviction, failed allocation, max peak, active count и post-clear zero; idle-подготовка максимум одной tile за callback при достаточном timeRemaining, без синхронной подготовки в wheel handler.

Для callback/lease использовать scene/run generation token, документ и DPR. Invalidate при stroke add/delete/change, частичном стирании, групповых трансформациях, selection/transform preview, undo/redo, collaboration update, authoritative viewport, DPR/resize, clear, board switch, visibility change, StrictMode/unmount и expiration. Dirty tile invalidation: объединение old/new bounds + halo; изменение порядка инвалидирует весь run. Устаревший async/idle результат никогда не монтируется.

## 6. Реализация A2 и переключение режимов (S5.3)

Добавить экспериментальные модули src/adapters/canvas-konva/spatial-ink-tile-plan.ts и spatial-ink-cache.ts. Точки интеграции: board-scene-content.tsx (ровно один pen run), BoardStage.tsx (preview viewport, lifecycle, trace), wheel-ink-cache.ts (единый lease/budget). Избегать изменений src/core/board/selectors.ts, модели документов, авторизации и БД.

Две ветви выполнения одного **и того же candidate bundle**: A0 — полностью исходный renderer; A2 — guarded tile path. Runtime opt-in доступен лишь в специальной тестовой сборке, включение пользователем через URL/query или DOM в production исключить. При unsupported item / нет готовых tiles / превышен бюджет / сменился generation → исходный vector без пропадания объектов и без async гонок. A0 отдельно сравнить с текущим main в функциональном snapshot smoke.

## 7. Тестовые барьеры до A/B (S5.4)

| Уровень | Набор | Строгий результат |
| --- | --- | --- |
| Unit | world-grid отрицательные координаты, half-open tile borders, halo, large bounds, stroke-трансформации, stable order, invalidation, LRU, cross-DPR bytes | No missed stroke, no overbudget, детерминированный план |
| Integration | cache lease, duplicate prepare, stale generation, disposal, overflow, idle cancel, StrictMode, 48 wheel sessions, clear/reopen | Correct resource cleanup, zero retained после очистки |
| Browser pixel | DPR1 и DPR2, прозрачность, пересечения tile edges, pen/image/pen, длинная линия через несколько tiles, dash/wavy/sketch, scale/group transform, смена zoom | A0/A2 snapshot equality в фиксированных масках с допустимой погрешностью, предварительно оценённой по A0/A0 noise |
| Browser hit | Концы/середина/границы strokes, перекрытия верхнего объекта, getIntersection, selection/drag, групповая трансформация, partial eraser во время/после wheel | Тот же original ID, без duplicate nodes; те же документы после операции |
| History/storage | undo/redo цепочки, save/restore из Dexie, reimport, board switch, simultaneous remote edit/revoke | Тот же persisted Document, порядок, IDs и права; никаких stale bitmap |
| Media/lifecycle | 4 PNG+6 JPEG, отдельный GIF interleave fidelity, revoke, unmount, hidden/resume, device resize, low-memory fallback | Правильный z-order, zero leaks, без пропавших/чужих media |

Pixel tolerance измерить и зафиксировать на A0↔A0 в одном движке **до** появления результатов A2; порог нельзя расширять для сокрытия регрессии. Hit IDs и документная семантика проверяются без допусков.

## 8. Воспроизводимое A0/A2-сравнение (S5.5)

**Протокол:** один immutable A2 SHA, одна версия кода тестов и инструментирования, один browser artifact для A0/A2 в рамках runner; раздельные browser contexts и очистка предыдущих IndexedDB/кэшей. Фиксировать main reference SHA, actual candidate SHA, dependency lock, browser revision, OS, arch, DPR2 и viewport 1240×820. У каждого scenario — SHA-256 всего документа с **байтами** PNG/JPEG, одинаковый порядок объектов, 18 реальных wheel inputs и фактические timestamps. Недопустимо подменять контроль более старым тестовым harness.

- **Матрица:** static-3000-10-images (guard), static-5000-10-images, static-10000-10-images (primary), static-10000-offscreen (guard). Каждый включает ровно 4 PNG + 6 JPEG. Данные из IndexedDB revision restore, сравнивать hashes, codecs, visible membership, tile activation.
- **Независимые наблюдения:** 2 GitHub runner × 3 полных ABBA цикла/runner, по 4 позиции A0–A2–A2–A0; это 6 соседних пар/runner/scene, 12 пар/scene итого. Второй runner вправе использовать зеркальный BAAB для балансировки дрейфа, но парсер обязан проверить явно заданную последовательность.
- **Отделение persistence:** отдельно activeWithPersist, activeWithoutPersist, commit, settling; количество intermediate/final viewport persist и wheel session IDs. Слишком разные количества промежуточных commit между arm отмечать как несопоставимость. Не отбрасывать неудобные пары и не считать frame-level кадры независимыми статистическими наблюдениями.
- **Метрики каждого arm:** active p50/p95/p99/max, counts/rates >50 и >100 мс, pen input-to-paint p95, Chrome Long Tasks, trace scene/hit/persist/React, compositor events и drift, tile prepare duration/hit vs fallback fraction, evictions, retained/peak canvas bytes и heap. Сохранять per-run JSON и raw traces, указывать CI job ID, exact SHA, experiment flag и документные hashes.
- **Integrity gates:** полные 12 arm × 4 cases на каждом runner; zero trace overflow; одинаковые fixture/browser/DPR/viewport/wheel inputs, корректная clock alignment; tile activation >0 в A2 и 0 в A0; при несовпадении трактовать как INCONCLUSIVE и повторить полную серию после исправления. Изменение реализации между сравниваемыми запусками запрещено.
- **Decision:** для 5k и 10k на **каждом** runner median paired relative active p95 ≥20% и средняя частота >100ms у A2 меньше; 3k и offscreen не хуже 10% по медиане, без подтверждённой tail/input regression. Pixel/hit/undo/persist/memory/full CI обязательны. Публиковать разброс и интервалы неопределённости по paired runs, без bootstrap отдельных rAF gaps.

A2, уменьшающий лишь число draw calls или время scene/hit JS при неизменном/худшем active p95, получает **NO-GO**. Если выигрыш p95 воспроизводим лишь на одном runner, также NO-GO/INCONCLUSIVE. После каждого изменения candidate SHA нужны новые полные 2-runner ABBA.

## 9. Пошаговый порядок, файлы и отчётность

1. **S5.0 frozen reference:** зафиксировать baseline SHA/fixture/browser, написать проверку A0 parity и критерий пригодности pen-run. Результат: воспроизводимый A0.
2. **S5.1 feasibility:** proof в одном настоящем Konva браузерном тесте. Результат: GO или NO-GO до основной реализации.
3. **S5.2 pure logic:** spatial bounds/tile planner/shared allocator и focused unit tests. Результат: correctness+budget gates.
4. **S5.3 adapter:** один opt-in run с idle lifecycle, atomic fallback; без изменений схемы/контрактов. Результат: runnable A2.
5. **S5.4 fidelity:** pixel/hit/eraser/undo/restore/permission and soak. Результат: green cross-browser release-oriented tests.
6. **S5.5 measurement:** workflow .github/workflows/c39-s5-a0-a2.yml и parser scripts/c39/summarize-s5-a0-a2.mjs; собственные unit parser tests. Результат: 2 независимых ABBA, raw evidence.
7. **S5.6 release review:** документ docs/C39_S5_A2_EVIDENCE_2026-10-11.md, PLAN.md, Issue #201, diff review, GO/NO-GO и отдельный rollback plan. Результат: разрешение либо запрет production merge.

Ожидаемые проверки при реализации: npm ci; npm ci --prefix tools/geometryos-contract; npm run format:check; npm run lint; npm run typecheck; npm run test; npm run performance; npm run architecture; npm run build; npm run check; npm run e2e:smoke -- --project=chromium; npm run e2e:smoke -- --project=firefox; npm run e2e:media-profile -- --project=chromium --retries=0; npm run e2e:media-cache-soak; focused pixel/hit e2e; двух-runner A0/A2 workflow; применимые production-image/security/Smart Ink/Formula/GeometryOS/fullstack gates.

**Планирование не является подтверждением тестов.** Реализация должна отдельно перечислять фактически выполненные команды и их исходы. main и Issue #201 оставлять как есть до доказанного GO.
