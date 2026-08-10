# TutorBoard — текущее состояние проекта

**Дата среза:** 10.08.2026  
**Репозиторий:** `ArtemLevin/tutorboard`  
**Ветка:** `main`  
**Текущий HEAD:** `133958596dec64ad597614acb597b7ae165d9e91`  
**Последняя поставка:** PR #109 — `3D-4D: finalize merged 3D-4 release hardening`

---

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

На момент среза открытых pull request нет.

Последняя последовательность крупных поставок:

| PR | Назначение | Состояние |
|---|---|---|
| #100 | Smart Ink: прямые стороны распознанного треугольника | merged |
| #101 | удаление иконки «Фигуры» из toolbar | merged |
| #102 | durability, sync integrity, strict inequality boundaries, 3D semantics | merged |
| #103 | расширение semantic 3D geometry kernel | merged |
| #104 | semantic interaction для analytic 3D surfaces | merged |
| #105 | parametric editing 3D-тел и stable topology anchors | merged |
| #106 | persistent model rotation и semantic highlights | merged |
| #107 | Construction Studio и параметризованные 3D-запросы | merged |
| #108 | generalized constrained section workflow | merged |
| #109 | release hardening 3D-4 | merged |

Последний commit:

```text
133958596dec64ad597614acb597b7ae165d9e91
3D-4D: finalize merged 3D-4 release hardening (#109)
```

---

## 4. CI/CD и release gates

Для текущего HEAD успешно завершены основные workflow.

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
head: 133958596dec64ad597614acb597b7ae165d9e91
state date: 2026-08-10
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
