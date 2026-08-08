# План разработки интерактивного 3D-просмотра объёмных фигур

**Репозиторий:** `ArtemLevin/tutorboard`  
**Документ:** `3D_DEV_PLAN.md`  
**Дата базовой редакции:** 6 августа 2026 года  
**Статус:** реализовано в TutorBoard; production-включение управляется feature flag
**Целевая функция:** открытие объёмной фигуры в отдельном 3D-окне внутри доски с вращением, масштабированием, постановкой точек и автоматическим построением сечения по трём точкам.

## Статус реализации

План реализован сквозным вертикальным срезом. Добавлены `BoardDocument 1.3`,
канонический `Solid3DRecord`, точное ядро сечений выпуклых многогранников,
аналитические сечения сферы, цилиндра, конуса и усечённого конуса, Three.js
adapter, лениво загружаемый редактор, создание точек raycasting-ом и атомарная
проекция сечения на доску. Контракты board/v1, миграции, clipboard,
persistence, undo/redo и server-sync reader обновлены для новой версии.

Production-поставка закрыта флагом `VITE_FEATURE_SOLID_3D`; development и tests
включают функцию по умолчанию. Подробности границ и эксплуатации приведены в
`docs/architecture/SOLID_3D.md` и `docs/adr/ADR-030-solid-3d-viewer.md`.

---

## 1. Цель

TutorBoard должен позволять преподавателю или ученику:

1. создать либо распознать объёмную фигуру на основной доске;
2. открыть эту фигуру в отдельном интерактивном 3D-окне по образцу редактора координатных графиков;
3. вращать модель, изменять масштаб и положение камеры;
4. ставить именованные точки на вершинах, рёбрах, гранях и поддерживаемых криволинейных поверхностях;
5. выбрать три точки, однозначно задающие секущую плоскость;
6. автоматически получить сечение тела;
7. сохранить точки и определение сечения в документе;
8. перенести двумерную проекцию сечения на основную доску одной атомарной командой;
9. синхронизировать результат между участниками занятия;
10. сохранить совместимость с undo/redo, IndexedDB, snapshots, clipboard, экспортом и server sync.

Функция предназначена прежде всего для школьной стереометрии: кубов, параллелепипедов, призм, пирамид, тетраэдров, цилиндров, конусов и сфер.

---

## 2. Исходное состояние TutorBoard

На момент составления плана в проекте уже имеются:

- `BoardDocument 1.2`;
- command-only mutation boundary;
- ordered command envelope `1.3`;
- локальное append-only хранение через Dexie;
- undo/redo, clipboard, snapshots и server sync;
- отдельная панель редактирования координатных графиков;
- каталог плоских и объёмных фигур;
- создание объёмных школьных проекций по текстовому запросу;
- Smart Ink для распознавания нескольких классов объёмных фигур;
- групповые трансформации объёмных проекций;
- пунктирное отображение скрытых рёбер;
- добавление точек по контуру через `Shift + ЛКМ`;
- экспорт SVG, PNG и PDF;
- Chromium/Firefox browser gates;
- архитектурные проверки границ `core`, `modules`, `adapters` и `app`.

Текущие объёмные фигуры на доске представляют собой двумерные линии, эллипсы, подписи и группы. Для точного 3D-просмотра требуется добавить каноническую пространственную модель, связанную с этой проекцией.

---

## 3. Основное архитектурное решение

### 3.1. Единый семантический источник

Каждая поддерживаемая объёмная фигура должна иметь `Solid3DDefinition` — каноническое описание тела в локальной трёхмерной системе координат.

Из него создаются два представления:

```text
Solid3DDefinition
        ├──→ трёхмерная топология и поверхность
        └──→ двумерная школьная проекция на BoardDocument
```

Такое разделение предотвращает расхождение между изображением на доске и моделью в 3D-окне.

### 3.2. Граница ответственности

```text
core/solid-3d
    математическая модель, топология, плоскости, пересечения, сечения

modules/solid-3d
    пользовательские сценарии, команды, selectors, создание и обновление моделей

adapters/solid-3d-three
    WebGL/Three.js, камера, raycasting, визуализация и управление ресурсами

app/solid-3d
    окно редактора, панели инструментов, сообщения, клавиатурный workflow
```

`core/solid-3d` должен оставаться детерминированным и независимым от React, Konva, Three.js, DOM и сетевых запросов.

### 3.3. 3D-движок

Рекомендуемый движок — `three` с прямой интеграцией через отдельный adapter.

Причины выбора:

- зрелая WebGL-реализация;
- `OrbitControls`;
- `Raycaster`;
- ортографическая и перспективная камеры;
- clipping planes;
- `BufferGeometry`;
- поддержка прозрачных материалов;
- полноценная работа в Chromium и Firefox;
- явное управление lifecycle и освобождением ресурсов.

`@react-three/fiber` в начальную поставку включать не требуется. Прямая интеграция даёт более прозрачную границу между доменной моделью и renderer runtime.

3D-подсистема загружается лениво после первого открытия окна.

---

## 4. Целевой пользовательский сценарий

### 4.1. Открытие

Для выделенной объёмной фигуры доступны действия:

```text
ПКМ → Открыть в 3D
```

и кнопка в панели настроек выделенного объекта или группы.

Действие отображается, когда выбранный объект связан с `Solid3DRecord`.

Для старой группы без пространственной модели показывается отдельное действие поздней фазы:

```text
Распознать как объёмную фигуру
```

### 4.2. Окно

Открывается плавающее окно поверх основной доски по композиционной модели редактора координатных графиков.

Окно содержит:

- заголовок и тип фигуры;
- 3D viewport;
- режим вращения;
- режим постановки точек;
- счётчик точек текущего сечения `0 / 3`, `1 / 3`, `2 / 3`, `3 / 3`;
- список установленных точек;
- удаление и переименование точек;
- отмену последнего действия;
- очистку выбранных точек;
- переключатель секущей плоскости;
- переключатель контура и заливки сечения;
- сброс камеры;
- ортографическую и перспективную камеры;
- кнопку переноса сечения на доску;
- закрытие окна.

### 4.3. Управление мышью

В режиме просмотра:

- `ЛКМ + drag` — вращение;
- колесо — масштабирование;
- `ПКМ + drag` или средняя кнопка — смещение камеры;
- двойной клик — центрирование фигуры.

В режиме постановки точек:

- ЛКМ — создание точки;
- drag существующей точки — изменение её положения;
- колесо — масштабирование;
- `ПКМ + drag` — вращение;
- `Delete` — удаление выбранной точки;
- `Escape` — отмена текущего действия.

### 4.4. Сенсорное управление

- один палец — действие текущего режима;
- два пальца — масштабирование и смещение;
- длительное нажатие — контекстное действие точки.

### 4.5. Автоматическое сечение

После появления третьей допустимой точки:

1. вычисляется секущая плоскость;
2. выполняется пересечение с телом;
3. показываются полупрозрачная плоскость, заливка и контур сечения;
4. обновляются площадь и периметр, когда они применимы;
5. сохраняется определение сечения;
6. пользователю становится доступна кнопка «Отобразить сечение на доске».

---

## 5. Границы поставок

### 5.1. MVP: выпуклые многогранники

Первая production-поставка поддерживает:

1. куб;
2. прямоугольный параллелепипед;
3. тетраэдр;
4. треугольную призму;
5. призму с выпуклым многоугольным основанием;
6. правильную четырёхугольную пирамиду;
7. пирамиду с выпуклым многоугольным основанием.

Для этих тел сечение строится точным пересечением плоскости с рёбрами и гранями.

### 5.2. Аналитическая поставка

Следующая поставка добавляет:

- цилиндр;
- конус;
- усечённый конус;
- сферу.

Для криволинейных тел потребуется отдельный analytic section engine, который классифицирует и вычисляет окружности, эллипсы и другие допустимые кривые пересечения.

### 5.3. Отложенные сценарии

- импорт произвольных mesh-моделей;
- пользовательские текстуры;
- пользовательские shaders;
- свободное редактирование топологии;
- автоматическое восстановление точной модели из любого старого рисунка;
- невыпуклые многогранники;
- булевы операции над телами;
- физическая симуляция.

---

## 6. Доменная модель

### 6.1. Версия документа

Планируемое изменение:

```text
BoardDocument 1.2 → BoardDocument 1.3
```

В документ добавляется словарь пространственных моделей:

```ts
interface BoardDocument {
  // existing fields
  readonly solidModels: Readonly<
    Partial<Record<Solid3DId, Solid3DRecord>>
  >;
}
```

Миграция `1.2 → 1.3` добавляет пустой объект:

```ts
solidModels: {}
```

### 6.2. Solid3DRecord

```ts
interface Solid3DRecord {
  readonly id: Solid3DId;
  readonly rootGroupId: GroupId;
  readonly boardObjectIds: readonly BoardObjectId[];

  readonly source:
    | {
        readonly kind: "text-template";
        readonly templateId: string;
      }
    | {
        readonly kind: "smart-ink";
        readonly recognizerVersion: string;
      }
    | {
        readonly kind: "geometryos";
        readonly importId: GeometryImportId;
      };

  readonly definition: Solid3DDefinition;
  readonly projection: Solid3DBoardProjection;

  readonly points: readonly Solid3DPoint[];
  readonly sections: readonly Solid3DSectionDefinition[];

  readonly schemaVersion: "1.0";
}
```

`rootGroupId` связывает пространственную модель с группой двумерных объектов.

### 6.3. Solid3DDefinition

```ts
type Solid3DDefinition =
  | CubeDefinition
  | CuboidDefinition
  | TetrahedronDefinition
  | PrismDefinition
  | PyramidDefinition
  | CylinderDefinition
  | ConeDefinition
  | TruncatedConeDefinition
  | SphereDefinition;
```

Примеры:

```ts
interface CubeDefinition {
  readonly kind: "cube";
  readonly edgeLength: number;
}

interface CuboidDefinition {
  readonly kind: "cuboid";
  readonly size: Vec3;
}

interface PrismDefinition {
  readonly kind: "prism";
  readonly base: readonly Vec2[];
  readonly height: number;
}

interface PyramidDefinition {
  readonly kind: "pyramid";
  readonly base: readonly Vec2[];
  readonly apex: Vec3;
}
```

Координаты задаются в локальной системе фигуры. Центр модели располагается около начала координат для устойчивого вращения камеры.

### 6.4. Топология многогранника

```ts
interface SolidTopology {
  readonly vertices: readonly SolidVertex[];
  readonly edges: readonly SolidEdge[];
  readonly faces: readonly SolidFace[];
}

interface SolidVertex {
  readonly id: string;
  readonly label: string;
  readonly position: Vec3;
}

interface SolidEdge {
  readonly id: string;
  readonly startVertexId: string;
  readonly endVertexId: string;
}

interface SolidFace {
  readonly id: string;
  readonly vertexIds: readonly string[];
  readonly edgeIds: readonly string[];
}
```

Топология генерируется детерминированно из `Solid3DDefinition`.

### 6.5. Точки пользователя

```ts
interface Solid3DPoint {
  readonly id: SolidPointId;
  readonly label: string;
  readonly position: Vec3;
  readonly anchor: SolidPointAnchor;
}
```

```ts
type SolidPointAnchor =
  | {
      readonly kind: "vertex";
      readonly vertexId: string;
    }
  | {
      readonly kind: "edge";
      readonly edgeId: string;
      readonly parameter: number;
    }
  | {
      readonly kind: "face";
      readonly faceId: string;
      readonly localCoordinates: Vec2;
    }
  | {
      readonly kind: "analytic-surface";
      readonly surfaceId: string;
      readonly parameters: readonly number[];
    };
```

Якорь сохраняет смысл положения точки при повторном открытии, изменении размеров модели, синхронизации и миграциях.

### 6.6. Определение сечения

```ts
interface Solid3DSectionDefinition {
  readonly id: SolidSectionId;
  readonly pointIds: readonly [
    SolidPointId,
    SolidPointId,
    SolidPointId,
  ];
  readonly algorithmVersion: "polyhedron-plane/1";
  readonly visible: boolean;
}
```

Контур вычисляется детерминированно. Допускается проверяемый кэш результата с версией алгоритма и контрольной суммой исходных данных.

### 6.7. Проекция на доску

```ts
interface Solid3DBoardProjection {
  readonly kind: "orthographic" | "oblique" | "perspective";
  readonly matrix: readonly number[];
  readonly viewportScale: number;
  readonly origin: Vec2;
  readonly hiddenEdgePolicy: "dashed" | "hidden";
}
```

Проекция используется для:

- создания исходного 2D-изображения;
- отображения сечения на основной доске;
- вычисления видимых и скрытых сегментов;
- сохранения соответствия между локальными 3D-координатами и world coordinates доски.

---

## 7. Предлагаемая структура файлов

```text
src/
├── core/
│   └── solid-3d/
│       ├── ids.ts
│       ├── vectors.ts
│       ├── definitions.ts
│       ├── topology.ts
│       ├── validation.ts
│       ├── planes.ts
│       ├── anchors.ts
│       ├── polyhedron-section.ts
│       ├── analytic-section.ts
│       ├── projection.ts
│       ├── diagnostics.ts
│       └── public.ts
│
├── modules/
│   └── solid-3d/
│       ├── commands.ts
│       ├── selectors.ts
│       ├── creation.ts
│       ├── point-placement.ts
│       ├── section-workflow.ts
│       ├── board-projection.ts
│       └── public.ts
│
├── adapters/
│   └── solid-3d-three/
│       ├── Solid3DViewport.tsx
│       ├── renderer.ts
│       ├── scene-builder.ts
│       ├── orbit-controller.ts
│       ├── raycast.ts
│       ├── labels.ts
│       ├── render-scheduler.ts
│       ├── webgl-capabilities.ts
│       ├── resource-disposal.ts
│       └── public.ts
│
└── app/
    └── solid-3d/
        ├── Solid3DEditorPanel.tsx
        ├── Solid3DToolbar.tsx
        ├── Solid3DPointList.tsx
        ├── Solid3DSectionPanel.tsx
        ├── useSolid3DEditor.ts
        ├── state.ts
        └── solid-3d.css
```

Архитектурный gate должен запрещать:

- импорт Three.js в `core` и `modules`;
- импорт React в `core`;
- доступ adapter к persistence и server sync;
- прямую мутацию `BoardDocument` из UI;
- сетевые запросы из 3D renderer;
- использование времени или случайных значений внутри reducer.

---

## 8. Создание пространственной модели

### 8.1. Локальный каталог фигур

Объёмные элементы каталога получают поле:

```ts
interface TextShapeDefinition {
  // existing fields
  readonly solid3d?: Solid3DDefinition;
}
```

При размещении одной атомарной командой создаются:

1. двумерные линии, эллипсы и подписи;
2. `BoardGroup`;
3. `Solid3DRecord`;
4. связи между объектами, группой и пространственной моделью.

Предпочтительный pipeline:

```text
Solid3DDefinition
    ↓
generateSolidTopology()
    ↓
projectSolidToBoard()
    ↓
BoardObject[] + BoardGroup + Solid3DRecord
```

### 8.2. Smart Ink

Составное предложение Smart Ink расширяется:

```ts
interface SmartInkCompositeProposal {
  // existing fields
  readonly solid3d?: {
    readonly definition: Solid3DDefinition;
    readonly fittedProjection: Solid3DBoardProjection;
  };
}
```

Команда принятия предложения одновременно:

- заменяет исходные штрихи;
- создаёт каноническую 2D-проекцию;
- создаёт `Solid3DRecord`;
- сохраняет один undo-шаг.

Для распознанных рисунков размеры могут быть нормализованными:

```text
куб: сторона 1
цилиндр: радиус 1, высота 2
конус: радиус 1, высота 2
```

Масштаб и положение двумерной проекции сохраняются отдельно.

### 8.3. GeometryOS

При наличии пространственной семантики в GeometryOS adapter формирует `Solid3DDefinition` из валидированного ответа. Связь с canonical GIR сохраняется через provenance.

До появления соответствующего контракта GeometryOS локальные шаблоны остаются основным источником точной 3D-модели.

### 8.4. Старые документы

Миграция старых документов создаёт пустой `solidModels`.

Действие «Открыть в 3D» доступно только для групп с пространственной моделью.

Отдельный будущий workflow может предлагать распознавание старой группы как конкретного тела с явным подтверждением пользователем.

---

## 9. 3D renderer и камера

### 9.1. Камеры

Поддерживаются:

- ортографическая камера — основной учебный режим;
- перспективная камера — дополнительный режим пространственного восприятия.

Начальный ракурс рассчитывается из bounding box модели.

### 9.2. Визуальные слои

Сцена содержит:

1. полупрозрачные грани тела;
2. контрастные рёбра;
3. опциональные скрытые рёбра;
4. вершины и подписи;
5. пользовательские точки;
6. секущую плоскость;
7. контур и заливку сечения;
8. hover-подсветку текущего target;
9. вспомогательные оси по отдельному переключателю.

### 9.3. Render scheduler

Renderer работает по требованию:

- кадры во время вращения, зума, перемещения или анимации;
- один кадр после изменения props;
- остановка цикла в состоянии покоя;
- ограничение `devicePixelRatio`;
- один активный WebGL viewer на приложение.

### 9.4. Lifecycle

При закрытии окна освобождаются:

- geometry;
- material;
- texture resources, если они появятся внутри приложения;
- renderer;
- controls;
- observers;
- DOM listeners;
- animation frame;
- labels overlay;
- WebGL context resources.

Обязательна обработка `webglcontextlost` с доступным сообщением и безопасным закрытием viewport.

---

## 10. Постановка и перемещение точек

### 10.1. Raycasting

Three.js `Raycaster` возвращает пересечение луча с поверхностью.

Далее применяется screen-space snapping:

```text
вершина: 12 px
ребро:    8 px
грань:    поверхность под указателем
```

Порог должен учитывать тип устройства и масштаб интерфейса.

### 10.2. Приоритет привязки

1. ближайшая вершина;
2. ближайшее ребро;
3. точка на грани;
4. точка на аналитической поверхности.

### 10.3. Имена

Точки получают автоматические метки:

```text
A, B, C, D, ..., Z, A1, B1, ...
```

Пользователь может переименовать точку. Метка проходит нормализацию, ограничение длины и проверку уникальности внутри фигуры.

### 10.4. Состояния редактора

```ts
type Solid3DEditorMode =
  | "orbit"
  | "place-point"
  | "move-point"
  | "inspect-section";
```

### 10.5. UX после постановки

После каждого клика:

- точка сохраняется через command pipeline;
- появляется маркер постоянного экранного размера;
- обновляется список точек;
- обновляется счётчик текущего сечения;
- после третьей точки запускается вычисление сечения.

---

## 11. Алгоритм сечения выпуклого многогранника

Пусть выбраны точки `P1`, `P2`, `P3`.

### 11.1. Построение плоскости

```text
u = P2 - P1
v = P3 - P1
n = normalize(u × v)
```

Если длина `u × v` меньше заданного epsilon, точки считаются коллинеарными.

Диагностика:

```text
Три выбранные точки лежат на одной прямой. Переместите одну из точек.
```

Уравнение плоскости:

```text
n · (x - P1) = 0
```

### 11.2. Пересечение с рёбрами

Для каждого ребра `AB` вычисляются знаковые расстояния:

```text
dA = planeDistance(A)
dB = planeDistance(B)
```

При противоположных знаках:

```text
t = dA / (dA - dB)
P = A + t(B - A)
```

Отдельно обрабатываются:

- вершина в плоскости;
- целое ребро в плоскости;
- плоскость совпадает с гранью;
- касание в одной точке;
- пересечение в виде одного отрезка;
- несколько совпадающих результатов в пределах epsilon.

### 11.3. Сборка контура

Полученные точки:

1. дедуплицируются;
2. переводятся в локальную двумерную систему плоскости;
3. сортируются вокруг центра;
4. получают стабильное направление обхода;
5. соединяются в замкнутый контур.

### 11.4. Результат

```ts
interface PolyhedronSectionResult {
  readonly kind: "empty" | "point" | "segment" | "polygon";
  readonly vertices: readonly Vec3[];
  readonly area: number | null;
  readonly perimeter: number | null;
  readonly plane: Plane3D;
  readonly diagnostics: readonly Solid3DDiagnostic[];
}
```

### 11.5. Обязательные тесты куба

- треугольное сечение;
- четырёхугольное сечение;
- пятиугольное сечение;
- шестиугольное сечение;
- плоскость через вершину;
- плоскость через ребро;
- плоскость, совпадающая с гранью;
- касательная плоскость;
- коллинеарные точки;
- две совпадающие точки;
- точки с численной погрешностью около вершины.

---

## 12. Аналитические сечения криволинейных тел

### 12.1. Сфера

Плоскость со сферой даёт:

- пустое пересечение;
- одну точку касания;
- окружность.

Результат хранит центр, радиус и локальный базис плоскости.

### 12.2. Цилиндр

Классификация включает:

- окружность;
- эллипс;
- прямоугольный контур при плоскости через ось для конечного цилиндра;
- вырожденные касательные случаи.

### 12.3. Конус

Классификация ограничивается конечным телом и может включать:

- окружность;
- эллипс;
- параболический либо гиперболический фрагмент в зависимости от постановки;
- треугольный контур при плоскости через ось конечного конуса;
- вырожденные случаи через вершину.

### 12.4. Представление кривой

```ts
type AnalyticSectionCurve =
  | CircleSection
  | EllipseSection
  | ConicArcSection
  | CompositeSection;
```

Canvas и Three.js получают детерминированную bounded-дискретизацию одной и той же аналитической модели.

---

## 13. Отображение сечения

В 3D-окне отображаются:

- три задающие точки;
- полупрозрачная секущая плоскость;
- контур сечения;
- полупрозрачная заливка;
- подписи вершин сечения;
- площадь и периметр;
- опциональные длины сторон;
- диагностическое сообщение для вырожденного результата.

Размер визуальной плоскости рассчитывается относительно bounding box тела.

Сечение пересчитывается после перемещения любой из трёх точек.

---

## 14. Перенос сечения на основную доску

Кнопка «Отобразить сечение на доске» выполняет:

1. преобразование 3D-вершин через `Solid3DBoardProjection`;
2. создание видимых линий;
3. определение скрытых сегментов;
4. создание пунктирных линий для скрытых участков согласно политике фигуры;
5. создание подписей;
6. объединение объектов в связанную группу;
7. добавление provenance с `solidId` и `sectionId`;
8. одну атомарную команду.

Автоматический расчёт сечения выполняется сразу после выбора третьей точки. Изменение основной доски происходит после явного действия пользователя.

Созданная проекция должна поддерживать:

- undo/redo;
- clipboard;
- delete;
- persistence;
- collaboration;
- SVG/PNG/PDF export;
- восстановление из snapshot.

---

## 15. Команды и reducer

Все постоянные изменения проходят через существующий валидируемый reducer.

Предлагаемые команды:

```ts
type Solid3DCommand =
  | CreateSolid3DCommand
  | UpdateSolid3DCommand
  | DeleteSolid3DCommand
  | ProjectSolid3DSectionCommand;
```

### 15.1. Создание

```ts
interface CreateSolid3DCommand extends CommandMetadata {
  readonly kind: "core.solid-3d.create";
  readonly model: Solid3DRecord;
  readonly group: BoardGroup;
  readonly objects: readonly BoardObject[];
}
```

### 15.2. Обновление

```ts
interface UpdateSolid3DCommand extends CommandMetadata {
  readonly kind: "core.solid-3d.update";
  readonly solidId: Solid3DId;
  readonly expected: Solid3DRecord;
  readonly replacement: Solid3DRecord;
}
```

Stale-safe обновление обеспечивает:

- атомарность;
- проверку ожидаемого состояния;
- простой inverse command;
- совместимость с collaborative undo;
- безопасный rebase.

### 15.3. Проекция сечения

```ts
interface ProjectSolid3DSectionCommand extends CommandMetadata {
  readonly kind: "core.solid-3d.project-section";
  readonly solidId: Solid3DId;
  readonly sectionId: SolidSectionId;
  readonly group: BoardGroup;
  readonly objects: readonly BoardObject[];
}
```

### 15.4. Локальное UI-состояние

В документ не входят:

- положение камеры;
- текущий zoom 3D viewport;
- размер окна;
- hover;
- активное перетаскивание;
- transient preview точки;
- открытость панели.

Эти данные остаются локальными и не создают команды при каждом движении указателя.

---

## 16. Контракты, хранение и синхронизация

Изменение затронет:

```text
contracts/board/v1/board-document.schema.json
contracts/board/v1/board-command-envelope.schema.json
contracts/board/v1/board-snapshot.schema.json
contracts/board/v1/fixtures/*
contracts/board/v1/manifest.json
```

Потребуются:

- schema update для `BoardDocument 1.3`;
- runtime codec для `Solid3DRecord`;
- runtime codec новых command kinds;
- migration `1.2 → 1.3`;
- clipboard ID remapping;
- persistence round-trip;
- snapshot round-trip;
- canonical JSON и SHA-256;
- pending queue support;
- remote batch validation;
- quarantine compatibility;
- rebase tests;
- cross-repository contract tests.

### 16.1. tutor-assistant-web

Парная серверная поставка должна добавить:

- tolerant reader `BoardDocument 1.3`;
- разрешение новых command kinds;
- обновлённые fixtures;
- snapshot restore для `1.2` и `1.3`;
- cross-repository writer/reader tests;
- staging load/restore drill.

Камера и transient viewer state на сервер не отправляются.

---

## 17. Feature flags

Добавить build-time флаг:

```text
VITE_FEATURE_SOLID_3D=true | false
```

Предлагаемая матрица:

```text
development: true
CI browser gate: true
production image до approval: false
production image после approval: true
```

При отключённом флаге:

- 3D bundle не загружается;
- действие «Открыть в 3D» скрыто;
- документы с `solidModels` продолжают корректно читаться и сохраняться;
- двумерные проекции остаются доступными.

---

## 18. Последовательность PR

### PR 1. Technical Spike и ADR

Цели:

- проверить Three.js в текущем Vite/React окружении;
- отобразить куб;
- реализовать вращение и zoom;
- проверить Chromium и Firefox;
- проверить lazy loading;
- проверить `webglcontextlost`;
- измерить bundle delta;
- зафиксировать архитектурные границы;
- принять решение о `BoardDocument 1.3`.

Поставка:

- `docs/adr/ADR-XXX-solid-3d-viewer.md`;
- технический отчёт;
- минимальный disposable prototype либо foundation adapter.

### PR 2. Pure geometry core

Реализовать:

- `Vec2`, `Vec3`, `Plane3D`;
- определения выпуклых многогранников;
- генерацию топологии;
- валидацию;
- anchors;
- плоскость по трём точкам;
- сечение многогранника;
- стабильную сортировку;
- площадь и периметр;
- diagnostic codes;
- unit и property-style tests.

Three.js в этом PR отсутствует.

### PR 3. BoardDocument 1.3 и команды

Реализовать:

- `solidModels`;
- migration;
- JSON Schema;
- fixtures;
- codecs;
- reducer commands;
- inverse commands;
- clipboard;
- Dexie;
- snapshots;
- HTTP transport;
- server sync;
- paired reader в `tutor-assistant-web`.

PR проводится как coordinated cross-repository change.

### PR 4. Семантические тела из каталога и Smart Ink

Реализовать:

- `solid3d` в текстовых шаблонах;
- генерацию 2D-проекции из 3D-определения;
- создание `Solid3DRecord` одной командой;
- Smart Ink proposal extension;
- принятие распознанной модели;
- selector `findSolidModelByObjectId`;
- действие «Открыть в 3D»;
- доступное сообщение для групп без модели.

### PR 5. 3D-окно и renderer adapter

Реализовать:

- lazy-loaded `Solid3DEditorPanel`;
- Three.js renderer;
- ортографическую и перспективную камеры;
- OrbitControls;
- рёбра, грани и подписи;
- reset view;
- resize observer;
- render-on-demand;
- WebGL fallback;
- resource disposal;
- извлечение state из большого `App.tsx`.

### PR 6. Расстановка точек

Реализовать:

- Raycaster;
- snapping;
- vertex/edge/face anchors;
- маркеры;
- автоматические имена;
- список точек;
- переименование;
- удаление;
- drag точки;
- keyboard workflow;
- persistence и collaboration.

### PR 7. Автоматические сечения многогранников

Реализовать:

- workflow `0/3 → 3/3`;
- collinearity validation;
- секущую плоскость;
- contour;
- fill;
- площадь и периметр;
- перемещение исходных точек;
- вырожденные случаи;
- undo/redo;
- E2E matrix.

### PR 8. Проекция сечения на доску

Реализовать:

- преобразование координат;
- visible/hidden edge classification;
- подписи;
- связанную группу;
- atomic command;
- export parity;
- persistence;
- collaboration;
- browser tests.

### PR 9. Сфера, цилиндр и конус

Реализовать:

- analytic section engine;
- классификацию кривых;
- bounded deterministic sampling;
- Three.js renderer;
- Canvas projection;
- тесты всех граничных случаев.

### PR 10. Production gate

Добавить:

- feature flag matrix;
- Chromium/Firefox E2E;
- visual regression;
- memory/resource leak checks;
- WebGL fallback checks;
- performance budgets;
- bundle budget;
- immutable production image;
- dependency audit;
- Trivy gate;
- release notes;
- staging collaboration and restore drill;
- manual production approval.

---

## 19. Тестовая стратегия

### 19.1. Unit tests

Проверить:

- topology каждого тела;
- ориентацию граней;
- уникальность IDs;
- anchors;
- snapping math;
- плоскость по трём точкам;
- collinearity;
- пересечение каждого ребра;
- дедупликацию;
- стабильный порядок вершин;
- площадь и периметр;
- epsilon boundaries;
- serialization;
- migrations;
- command validation;
- inverse commands;
- clipboard remapping.

### 19.2. Integration tests

Сценарий 1:

```text
текстовый куб
→ Solid3DRecord
→ открытие 3D-окна
→ три точки
→ сечение
→ сохранение
→ повторное открытие
```

Сценарий 2:

```text
Smart Ink
→ распознавание объёмной фигуры
→ принятие
→ 3D-просмотр
→ IndexedDB round-trip
```

Сценарий 3:

```text
клиент A создаёт точки
→ push
→ клиент B получает модель и сечение
→ клиент B добавляет проекцию на доску
```

Сценарий 4:

```text
BoardDocument 1.2
→ migration 1.3
→ edit
→ snapshot
→ restore
```

### 19.3. Browser E2E

Chromium и Firefox:

- открытие окна;
- lazy bundle load;
- вращение;
- zoom;
- pan camera;
- reset view;
- постановка трёх точек;
- автоматическое появление сечения;
- drag точки;
- удаление;
- переименование;
- undo/redo;
- закрытие и повторное открытие;
- проекция на доску;
- export SVG/PNG/PDF;
- offline persistence;
- collaboration;
- WebGL unavailable;
- context loss;
- reduced motion;
- keyboard navigation;
- отсутствие конфликтов с жестами основной доски.

### 19.4. Visual regression

Эталонные сцены:

- куб в ортографической камере;
- куб в перспективной камере;
- треугольное сечение;
- шестиугольное сечение;
- призма;
- пирамида;
- скрытые рёбра;
- hover и selected point;
- light/dark appearance, когда это поддерживается общей темой.

---

## 20. Производительность

### 20.1. Лимиты

```text
вершин модели:             до 256
рёбер:                     до 512
граней:                    до 256
пользовательских точек:    до 32
сечений на одну фигуру:    до 8
длина подписи:             до 32 символов
один активный WebGL viewer
```

### 20.2. Целевые бюджеты

- открытие уже загруженного viewer: визуальный первый кадр до 150 мс на reference CI hardware;
- вычисление сечения MVP-тела: до 16 мс для стандартных тел;
- интерактивное вращение: целевой уровень 60 FPS, допустимый p95 frame time до 24 мс на reference hardware;
- отсутствие постоянного render loop в состоянии покоя;
- рост initial application bundle ограничен lazy-loader stub;
- 3D chunk имеет отдельный bundle budget;
- повторные циклы открытия/закрытия не увеличивают число WebGL contexts и listeners.

---

## 21. Безопасность и устойчивость

Требования:

- только конечные числа;
- bounded coordinate range;
- bounded arrays;
- strict Zod/runtime validation;
- запрет пользовательского shader-кода;
- отсутствие внешних моделей и текстур в MVP;
- отсутствие сетевых запросов из adapter;
- безопасная обработка malformed documents;
- quarantine для повреждённых pending commands;
- deterministic canonical JSON;
- строгая проверка document hash после remote batches;
- корректное восстановление после WebGL context loss;
- сохранение работоспособности основной доски при ошибке 3D viewer.

---

## 22. Доступность

3D viewport должен сопровождаться доступными альтернативами:

- понятное имя области;
- текстовое описание тела;
- список вершин, рёбер, граней и установленных точек;
- кнопки вращения по фиксированным шагам для клавиатуры;
- кнопки zoom in/out;
- reset view;
- режимы с явными labels;
- aria-live для результата сечения и ошибок;
- видимый focus;
- поддержка `Escape`;
- reduced motion;
- контрастные маркеры, отличающиеся формой и подписью;
- доступ к координатам и anchors через список точек.

Клавиатурный пользователь должен иметь возможность выбрать три существующие вершины или точки из списка и построить сечение без pointer interaction.

---

## 23. Наблюдаемость и диагностика

Development diagnostics должны показывать:

- тип фигуры;
- число вершин, рёбер и граней;
- текущий camera mode;
- renderer backend;
- DPR;
- frame time last/mean/p95;
- число draw calls;
- число geometries/materials;
- raycast target type;
- время вычисления сечения;
- число deduplicated intersections;
- algorithm version;
- WebGL context state.

Диагностика исключает содержимое пользовательских уроков и чувствительные данные.

---

## 24. Документация

В ходе реализации обновляются:

- `README.md`;
- feature flag reference;
- architecture boundaries;
- BoardDocument schema documentation;
- command protocol documentation;
- local development guide;
- browser support matrix;
- release checklist;
- tutor-assistant-web integration documentation;
- ADR по 3D renderer;
- ADR по semantic solid model;
- ADR по section algorithms.

---

## 25. Definition of Done

Функция готова к production, когда выполнены все условия:

1. Новая поддерживаемая объёмная фигура получает каноническую `Solid3DDefinition`.
2. Каждый объект её группы позволяет открыть связанную модель в 3D.
3. Окно поддерживает вращение, zoom, pan и reset camera.
4. Поддерживаются ортографическая и перспективная камеры.
5. Пользователь ставит, перемещает, переименовывает и удаляет точки.
6. Точки привязываются к вершинам, рёбрам и граням.
7. После трёх допустимых точек сечение появляется автоматически.
8. Коллинеарные, совпадающие и вырожденные точки корректно диагностируются.
9. Сечение выпуклого многогранника вычисляется детерминированно.
10. Точки и определения сечений проходят через undo/redo, persistence и server sync.
11. Камера остаётся локальным UI-состоянием и не создаёт поток команд.
12. Сечение переносится на основную доску одной атомарной командой.
13. SVG, PNG и PDF содержат добавленную двумерную проекцию.
14. `BoardDocument 1.2` открывается после миграции в `1.3`.
15. Контракты TutorBoard и tutor-assistant-web проходят совместную проверку.
16. Chromium и Firefox входят в обязательный release gate.
17. Закрытие viewer освобождает ресурсы и обработчики.
18. Ошибка WebGL не нарушает работу основной доски.
19. Feature flag позволяет безопасно отключить UI при сохранении reader compatibility.
20. Staging collaboration, snapshot restore и production image gates успешно завершены.

---

## 26. Рекомендуемый первый production-инкремент

Первый инкремент включает:

- куб;
- прямоугольный параллелепипед;
- тетраэдр;
- треугольную призму;
- пирамиду;
- семантическую модель `Solid3DRecord`;
- отдельное 3D-окно;
- ортографическую камеру;
- вращение и zoom;
- постановку точек на вершинах, рёбрах и гранях;
- точные сечения многогранников;
- локальное состояние камеры;
- синхронизируемые точки и определения сечений;
- проекцию результата на доску;
- Chromium/Firefox browser gate;
- cross-repository contract gate.

Сферу, цилиндр, конус и усечённый конус следует поставлять отдельным PR-пакетом после стабилизации модели многогранников и пользовательского workflow.

---

## 27. Итоговая последовательность зависимостей

```text
Technical Spike
      ↓
Pure Solid Geometry Core
      ↓
BoardDocument 1.3 + Commands + Cross-repo Reader
      ↓
Semantic Solid Creation
      ↓
Three.js Viewer
      ↓
Point Placement
      ↓
Polyhedron Sections
      ↓
Projection to Board
      ↓
Analytic Curved Solids
      ↓
Production Gate
```

Каждый этап должен завершаться самостоятельным PR с измеримыми acceptance criteria, документацией, unit/integration tests и соответствующим browser либо contract gate.
