# Фаза 2. TutorBoard Technical Spike

## Детальный план разработки архитектурного прототипа

**Статус документа:** план реализации  
**Целевой репозиторий:** отдельный репозиторий `TutorBoard`  
**Тип этапа:** Technical Spike / Architecture Validation  
**Основной интегрируемый сервис:** GeometryOS  
**Основной стек:** TypeScript, React, Vite, Konva, Zustand, IndexedDB  
**Рекомендуемая продолжительность:** 3–5 недель  
**Рекомендуемый формат:** последовательность небольших pull request с обязательной фиксацией архитектурных выводов  
**Главный результат:** доказанный вертикальный сценарий «текст → GeometryOS → GIR → интерактивные объекты доски → локальное редактирование → сохранение состояния»

---

# 1. Резюме

Фаза 2 не предназначена для создания полноценной образовательной платформы, многопользовательской доски или законченного продукта. Её задача — проверить, способен ли текущий контракт GeometryOS и формат GIR служить источником интерактивных геометрических объектов на бесконечном полотне TutorBoard.

К концу фазы должен работать следующий сценарий:

1. Пользователь открывает TutorBoard.
2. На бесконечном полотне доступны pan, zoom, перо и несколько базовых фигур.
3. Пользователь вводит запрос:

   > Построй треугольник ABC и высоту AH.

4. TutorBoard отправляет запрос в GeometryOS.
5. GeometryOS возвращает результат генерации и канонический GIR.
6. TutorBoard преобразует GIR в собственную модель объектов доски.
7. На полотне появляются:
   - интерактивные точки `A`, `B`, `C`, `H`;
   - отрезки `AB`, `BC`, `CA`, `AH`;
   - подписи точек;
   - связи между объектами.
8. Пользователь может выделять и перемещать построение.
9. Локальное состояние доски сохраняется и восстанавливается после перезагрузки страницы.
10. Команда проекта фиксирует, какие изменения необходимы:
    - в GIR;
    - в GeometryOS;
    - в модели доски;
    - в правилах синхронизации математического и визуального состояния.

Фаза считается успешной не тогда, когда интерфейс выглядит как законченный продукт, а когда получены доказательные ответы на архитектурные вопросы.

---

# 2. Цели фазы

## 2.1. Главная цель

Проверить архитектурный стык:

```text
Пользовательский текст
        ↓
TutorBoard
        ↓ HTTP API v1
GeometryOS
        ↓
Canonical GIR
        ↓ adapter
TutorBoard Board Model
        ↓
Interactive Canvas Objects
```

## 2.2. Технические цели

Необходимо доказать, что:

1. TutorBoard способен использовать опубликованный OpenAPI-контракт GeometryOS.
2. Результат GeometryOS можно детерминированно преобразовать в объекты доски.
3. Объекты, созданные из GIR, можно выделять и перемещать без разрушения структуры документа.
4. Математическое описание и визуальное представление можно хранить раздельно.
5. Пользовательские визуальные изменения можно классифицировать.
6. Локальное состояние можно сохранять и версионировать.
7. Интеграционные ошибки можно диагностировать по `request_id`.
8. Текущий GIR либо достаточен, либо его недостатки можно сформулировать в виде конкретных изменений следующей версии.

## 2.3. Исследовательские цели

Фаза должна ответить на вопросы:

- Нужны ли стабильные визуальные идентификаторы в GIR?
- Должны ли координаты входить в GIR или храниться только в TutorBoard?
- Нужно ли разделять математическую точку и её визуальное представление?
- Как представить перемещение группы объектов?
- Что происходит при перемещении отдельной зависимой точки?
- Как синхронизировать повторный ответ GeometryOS с уже изменённым объектом доски?
- Какие изменения являются математическими?
- Какие изменения являются только визуальными?
- Нужно ли TutorBoard хранить исходный GIR целиком?
- Должен ли объект доски знать идентификатор GIR-сущности?
- Где проходит граница ответственности GeometryOS и TutorBoard?

---

# 3. Что входит в фазу

Реализуются только следующие возможности:

1. Бесконечное полотно.
2. Pan.
3. Zoom.
4. Перо.
5. Базовые фигуры.
6. Вставка SVG.
7. Запрос в GeometryOS.
8. Преобразование GIR в объекты доски.
9. Выделение.
10. Перемещение.
11. Сохранение локального состояния.

## 3.1. Базовые фигуры

Для spike достаточно:

- линия;
- прямоугольник;
- эллипс;
- текст;
- свободный штрих;
- вставленное SVG-изображение;
- геометрическая точка;
- геометрический отрезок;
- подпись геометрической точки;
- группа объектов.

## 3.2. Поддерживаемый GeometryOS-сценарий

Обязательный сценарий:

```text
Построй треугольник ABC и высоту AH.
```

Дополнительные проверочные сценарии, если они уже поддерживаются GeometryOS:

- треугольник и медиана;
- треугольник и биссектриса;
- построение с уточнением;
- неподдерживаемое построение;
- тайм-аут GeometryOS;
- неготовность GeometryOS;
- повторный запрос с тем же текстом.

---

# 4. Что не входит в фазу

Следующие возможности намеренно запрещены в рамках Technical Spike:

- регистрация и аутентификация;
- роли преподавателя и ученика;
- backend TutorBoard;
- облачное хранение;
- синхронизация между устройствами;
- совместное редактирование;
- WebSocket;
- CRDT;
- история уроков;
- аудио и видео;
- комментарии;
- чат;
- полноценный текстовый редактор;
- экспорт PDF;
- импорт документов;
- шаблоны уроков;
- мобильная версия;
- полноценная accessibility-система;
- плагины;
- маркетплейс;
- production deployment;
- аналитика пользователей;
- биллинг;
- полноценный undo/redo на все операции;
- математическое решение задач;
- автоматическое доказательство;
- произвольные геометрические конструкции;
- обратная отправка визуально изменённой доски в GeometryOS;
- двусторонняя real-time синхронизация GIR.

Любая новая идея должна пройти проверку:

> Нужна ли эта функция для проверки архитектурного стыка TutorBoard ↔ GeometryOS?

Если ответ отрицательный, функция переносится в backlog следующей фазы.

---

# 5. Критерии успеха

## 5.1. Функциональные критерии

Фаза успешна, если:

- полотно визуально не ограничено фиксированной страницей;
- pan работает мышью;
- zoom работает относительно позиции курсора;
- координаты объектов не изменяются из-за изменения viewport;
- пользователь может рисовать пером;
- пользователь может создать несколько базовых фигур;
- SVG вставляется как объект доски;
- запрос отправляется в GeometryOS;
- `success`-ответ преобразуется в интерактивные объекты;
- `needs_clarification` отображается отдельно от ошибки;
- domain `error` не трактуется как авария HTTP;
- Problem Details обрабатывается отдельно;
- созданное построение можно выделить;
- созданное построение можно переместить;
- состояние восстанавливается после перезагрузки;
- сохранённая схема имеет версию;
- corrupted local state не приводит к белому экрану.

## 5.2. Архитектурные критерии

Должны быть зафиксированы решения:

- модель координат;
- модель идентификаторов;
- модель объектов доски;
- правила GIR → Board;
- правила группировки;
- семантика перемещения;
- классификация изменений;
- формат локального документа;
- стратегия миграции локального состояния;
- минимальные изменения GIR;
- минимальные изменения GeometryOS API.

## 5.3. Критерии качества

- TypeScript strict mode;
- отсутствуют `any` в core-моделях и интеграционном слое;
- канонические идентификаторы не создаются в React-компонентах;
- canvas renderer не является источником истины;
- состояние доски хранится вне Konva-node;
- GeometryOS DTO не используется как внутренняя модель доски;
- преобразование GIR вынесено в чистый adapter;
- критические преобразования покрыты unit-тестами;
- вертикальный сценарий покрыт интеграционным тестом;
- состояние сохраняется без сериализации canvas runtime-объектов.

---

# 6. Основные гипотезы

## H1. GIR можно преобразовать в интерактивную модель

**Гипотеза:** текущих сущностей и связей GIR достаточно, чтобы создать точки, отрезки и подписи.

**Проверка:**
- получить GIR треугольника с высотой;
- построить индекс сущностей;
- получить объекты доски;
- связать их с GIR IDs;
- отрисовать;
- выполнить выбор и перемещение.

**Признак провала:** для однозначного создания объектов приходится анализировать SVG или угадывать смысл по текстовым подписям.

## H2. Координаты можно хранить отдельно от математического GIR

**Гипотеза:** GIR описывает математические сущности, а TutorBoard хранит визуальное размещение.

**Проверка:**
- один GIR отображается в разных позициях полотна;
- повторная загрузка сохраняет пользовательское размещение;
- математические связи остаются неизменными;
- визуальный offset не изменяет исходный GIR.

**Признак провала:** без изменения GIR невозможно восстановить или интерпретировать расположение объектов.

## H3. Стабильные GIR IDs достаточны для привязки

**Гипотеза:** текущие IDs позволяют создать устойчивое соответствие:

```text
GIR entity ID ↔ Board semantic object
```

**Проверка:**
- повторно обработать тот же GIR;
- найти существующие объекты;
- не создавать дубликаты;
- сохранить visual overrides.

**Признак провала:** идентификаторы нестабильны между эквивалентными ответами или отсутствуют у важных элементов.

## H4. Групповое перемещение является визуальной операцией

**Гипотеза:** перенос всего построения на `dx`, `dy` не меняет математическую семантику.

**Проверка:**
- сохранить исходный GIR;
- переместить группу;
- убедиться, что изменилось только visual state;
- повторно открыть документ.

**Признак провала:** координаты являются частью математического контракта и должны изменяться синхронно.

## H5. Перемещение отдельной точки требует отдельной политики

**Гипотеза:** drag отдельной математической точки нельзя автоматически считать простой визуальной операцией.

**Проверка:**
- переместить вершину треугольника;
- определить, что происходит с зависимыми отрезками и высотой;
- классифицировать изменение.

Возможные результаты:

1. Запретить individual drag в spike.
2. Разрешить visual-only offset подписи.
3. Разрешить изменение layout coordinates без изменения GIR.
4. Считать перемещение математической редакцией.
5. Отправлять изменённую модель на повторную нормализацию в будущем.

---

# 7. Рекомендуемый технологический стек

## 7.1. Базовый стек

```text
TypeScript
React
Vite
Konva / react-konva
Zustand
IndexedDB
Dexie
Vitest
Testing Library
Playwright
```

## 7.2. Почему этот стек подходит для spike

### React + TypeScript

Подходит для:

- панели инструментов;
- формы GeometryOS;
- инспектора выделения;
- явного управления состоянием;
- строгих DTO и domain types.

### Vite

Подходит как минимальный frontend build tool без необходимости вводить серверный фреймворк.

### Konva / react-konva

Используется как renderer и interaction adapter:

- Stage;
- Layer;
- Line;
- Circle;
- Rect;
- Text;
- Path/Image;
- pointer events;
- selection transformer.

Важно: Konva не должен быть моделью документа.

### Zustand

Используется для runtime state:

- текущий инструмент;
- viewport;
- selection;
- document commands;
- integration status.

### IndexedDB + Dexie

Используется для локального сохранения:

- документов;
- версий схемы;
- metadata;
- snapshots;
- recovery state.

Не использовать `localStorage` для основного документа: он синхронный, ограниченный и плохо подходит для расширяемой схемы.

## 7.3. Альтернативы

До PR с полотном провести короткий ADR:

| Вариант | Плюсы | Минусы |
|---|---|---|
| Konva | удобные интерактивные shapes, React binding | собственная scene graph |
| Fabric.js | развитая object model | сильнее навязывает собственную сериализацию |
| SVG DOM | простая семантика и тестирование | сложнее масштабировать свободное рисование |
| Canvas API | полный контроль | слишком много infrastructure-кода |
| tldraw/Excalidraw engine | много готовых функций | spike перестаёт проверять собственную модель |

Рекомендуемый выбор для фазы: **Konva как renderer, собственная Board Model как source of truth**.

---

# 8. Архитектурные принципы

## 8.1. Собственная модель доски

Нельзя хранить документ как:

```ts
Konva.Node[]
```

или:

```ts
stage.toJSON()
```

Canvas library — только способ отображения.

Правильная схема:

```text
BoardDocument
    ↓ selectors
Render Model
    ↓
Konva Components
```

## 8.2. GeometryOS DTO не является Board Model

Нельзя напрямую сохранять response GeometryOS как состояние UI.

Правильная схема:

```text
GeometryOS DTO
    ↓ validation
Canonical GIR
    ↓ GirToBoardAdapter
BoardObject[]
```

## 8.3. Математическое и визуальное состояние разделены

```text
Semantic state:
- GIR
- entity IDs
- constraints
- provenance

Visual state:
- position
- scale
- viewport
- style
- z-order
- selection
- label offset
```

## 8.4. Все изменения проходят через команды

Компоненты не должны напрямую изменять массив объектов.

```ts
dispatch({
  type: "board/objectMoved",
  objectIds,
  delta,
});
```

## 8.5. Идентификаторы создаются на domain boundary

- `documentId`;
- `boardObjectId`;
- `semanticSourceId`;
- `groupId`;
- `importOperationId`.

React keys не являются domain IDs.

---

# 9. Целевая архитектура

```text
┌────────────────────────────────────────────┐
│                  UI Shell                  │
│ Toolbar | Prompt Panel | Inspector | HUD  │
└───────────────────┬────────────────────────┘
                    │ commands/selectors
┌───────────────────▼────────────────────────┐
│             Application Layer              │
│ tools | selection | viewport | import flow │
└──────────────┬─────────────┬───────────────┘
               │             │
┌──────────────▼──────┐  ┌───▼──────────────────┐
│   Board Domain      │  │ GeometryOS Client    │
│ document / objects  │  │ OpenAPI DTO boundary │
│ groups / overrides  │  │ request_id / errors  │
└──────────────┬──────┘  └───┬──────────────────┘
               │              │
┌──────────────▼──────┐  ┌────▼─────────────────┐
│ Canvas Adapter      │  │ GIR → Board Adapter  │
│ react-konva         │  │ mapping/provenance   │
└──────────────┬──────┘  └──────────────────────┘
               │
┌──────────────▼──────────────────────────────┐
│ Persistence Adapter: IndexedDB / Dexie      │
└─────────────────────────────────────────────┘
```

---

# 10. Структура репозитория

```text
tutorboard/
├── .github/
│   └── workflows/
│       └── ci.yml
├── docs/
│   ├── architecture/
│   │   ├── BOARD_MODEL.md
│   │   ├── COORDINATE_SYSTEMS.md
│   │   ├── GIR_MAPPING.md
│   │   └── CHANGE_CLASSIFICATION.md
│   ├── adr/
│   │   ├── ADR-001-canvas-renderer.md
│   │   ├── ADR-002-board-document-model.md
│   │   ├── ADR-003-coordinate-spaces.md
│   │   ├── ADR-004-local-persistence.md
│   │   └── ADR-005-gir-board-boundary.md
│   └── spike/
│       ├── HYPOTHESES.md
│       ├── EXPERIMENT_LOG.md
│       └── PHASE_2_REPORT.md
├── public/
├── src/
│   ├── app/
│   │   ├── App.tsx
│   │   ├── routes/
│   │   └── providers/
│   ├── board/
│   │   ├── domain/
│   │   │   ├── BoardDocument.ts
│   │   │   ├── BoardObject.ts
│   │   │   ├── BoardCommand.ts
│   │   │   ├── BoardEvent.ts
│   │   │   └── identifiers.ts
│   │   ├── application/
│   │   │   ├── boardStore.ts
│   │   │   ├── commands/
│   │   │   ├── selectors/
│   │   │   └── tools/
│   │   ├── canvas/
│   │   │   ├── BoardStage.tsx
│   │   │   ├── layers/
│   │   │   ├── objects/
│   │   │   ├── selection/
│   │   │   └── coordinates/
│   │   └── persistence/
│   │       ├── database.ts
│   │       ├── documentRepository.ts
│   │       └── migrations/
│   ├── geometryos/
│   │   ├── client/
│   │   │   ├── GeometryOsClient.ts
│   │   │   ├── errors.ts
│   │   │   └── requestId.ts
│   │   ├── contracts/
│   │   │   └── generated/
│   │   ├── adapter/
│   │   │   ├── girToBoard.ts
│   │   │   ├── mappingContext.ts
│   │   │   └── visualLayout.ts
│   │   └── fixtures/
│   ├── features/
│   │   ├── prompt/
│   │   ├── pen/
│   │   ├── shapes/
│   │   ├── svg-import/
│   │   └── selection/
│   ├── shared/
│   │   ├── result/
│   │   ├── validation/
│   │   └── testing/
│   └── main.tsx
├── tests/
│   ├── integration/
│   └── e2e/
├── package.json
├── tsconfig.json
├── vite.config.ts
└── README.md
```

---

# 11. Модель документа

## 11.1. BoardDocument

```ts
type BoardDocument = {
  schemaVersion: "0.1";
  id: DocumentId;
  title: string;
  createdAt: string;
  updatedAt: string;
  viewport: ViewportState;
  objects: Record<BoardObjectId, BoardObject>;
  order: BoardObjectId[];
  groups: Record<GroupId, BoardGroup>;
  geometryImports: Record<GeometryImportId, GeometryImportRecord>;
};
```

## 11.2. BoardObject union

```ts
type BoardObject =
  | PenStrokeObject
  | LineObject
  | RectangleObject
  | EllipseObject
  | TextObject
  | SvgObject
  | GeometryPointObject
  | GeometrySegmentObject
  | GeometryLabelObject;
```

## 11.3. Общие поля

```ts
type BoardObjectBase = {
  id: BoardObjectId;
  type: string;
  position: Vec2;
  rotation: number;
  scale: Vec2;
  locked: boolean;
  visible: boolean;
  zIndex: number;
  groupId: GroupId | null;
  source: BoardObjectSource;
  style: ObjectStyle;
};
```

## 11.4. Source metadata

```ts
type BoardObjectSource =
  | {
      kind: "user";
    }
  | {
      kind: "geometryos";
      importId: GeometryImportId;
      girEntityId: string;
      girEntityType: string;
    };
```

Source metadata необходимо для:

- traceability;
- повторного импорта;
- диагностики;
- анализа GIR coverage;
- отличия пользовательских объектов от GeometryOS-объектов.

---

# 12. Модель GeometryImportRecord

```ts
type GeometryImportRecord = {
  id: GeometryImportId;
  createdAt: string;
  prompt: string;
  requestId: string | null;
  geometryOsApiVersion: "1.0.0";
  girSchemaVersion: "0.2.0";
  rawResponse: unknown;
  canonicalGir: GirDocument;
  rootGroupId: GroupId;
  boardObjectIds: BoardObjectId[];
  mapping: Record<string, BoardObjectId[]>;
  visualTransform: Transform2D;
  visualOverrides: Record<BoardObjectId, VisualOverride>;
};
```

## 12.1. Зачем хранить rawResponse

В spike raw response полезен для:

- воспроизведения ошибок adapter;
- сравнения изменения контрактов;
- анализа потерянной информации;
- формирования следующей версии GIR.

В production может быть принято другое решение из-за объёма и приватности.

## 12.2. Зачем хранить canonicalGir

Board objects не должны быть единственным оставшимся представлением результата GeometryOS.

Canonical GIR нужен для:

- восстановления mapping;
- сравнения импортов;
- будущей математической редакции;
- диагностики;
- миграции.

---

# 13. Системы координат

Это ключевой раздел spike.

## 13.1. Coordinate spaces

Необходимо явно разделить:

```text
Screen Space
Viewport Space
World / Board Space
Geometry Local Space
Object Local Space
```

### Screen Space

Координаты pointer относительно DOM/canvas.

### World Space

Координаты документа, не зависящие от pan/zoom.

### Geometry Local Space

Локальная система координат импортированной геометрической группы.

### Object Local Space

Координаты внутри конкретного объекта.

## 13.2. Viewport transform

```ts
type ViewportState = {
  offset: Vec2;
  zoom: number;
};
```

Преобразование:

```text
screen = world * zoom + offset
world  = (screen - offset) / zoom
```

## 13.3. Geometry group transform

```ts
type Transform2D = {
  translation: Vec2;
  scale: Vec2;
  rotation: number;
};
```

На первом этапе разрешить только:

- translation;
- uniform scale при первоначальном размещении.

Rotation импортированной математической группы можно отложить.

## 13.4. Критическое правило

Pan/zoom никогда не должен записываться в координаты объектов.

---

# 14. Infinite canvas

## 14.1. Требования

- отсутствие фиксированного листа;
- world coordinates могут быть отрицательными;
- viewport хранится отдельно;
- grid необязателен;
- pan доступен отдельным инструментом и временной клавишей;
- zoom ориентирован на pointer;
- минимальный и максимальный zoom ограничены.

Рекомендуемые spike limits:

```text
minZoom = 0.1
maxZoom = 8
```

Это operational limits UI, а не контракт документа.

## 14.2. Pan

Поддержать:

- middle mouse drag;
- space + left mouse drag;
- отдельный hand tool.

## 14.3. Zoom

Поддержать wheel zoom:

1. получить pointer screen position;
2. преобразовать в world point до zoom;
3. изменить zoom;
4. пересчитать offset так, чтобы world point осталась под курсором.

## 14.4. Acceptance tests

- объект остаётся под курсором при zoom;
- последовательность zoom in/out не смещает объект;
- pan не изменяет object position;
- viewport сохраняется;
- reload восстанавливает viewport.

---

# 15. Инструменты

## 15.1. ToolState

```ts
type Tool =
  | "select"
  | "pan"
  | "pen"
  | "line"
  | "rectangle"
  | "ellipse"
  | "text"
  | "svg";
```

## 15.2. Interaction state machine

```ts
type InteractionState =
  | { kind: "idle" }
  | { kind: "panning"; start: Vec2 }
  | { kind: "drawingPen"; objectId: BoardObjectId }
  | { kind: "drawingShape"; objectId: BoardObjectId; start: Vec2 }
  | { kind: "selectingArea"; start: Vec2; current: Vec2 }
  | { kind: "draggingSelection"; start: Vec2; objectIds: BoardObjectId[] };
```

Не хранить interaction state внутри отдельных компонентов.

## 15.3. Перо

Pen stroke:

```ts
type PenStrokeObject = BoardObjectBase & {
  type: "pen-stroke";
  points: number[];
  pressure: number[] | null;
};
```

Для spike:

- сохранять points в world coordinates;
- sampling без сложного сглаживания;
- минимальное упрощение polyline допустимо;
- pressure optional.

---

# 16. Выделение и перемещение

## 16.1. Selection state

```ts
type SelectionState = {
  objectIds: BoardObjectId[];
  primaryObjectId: BoardObjectId | null;
};
```

Selection — runtime UI state, а не часть сохранённого документа.

## 16.2. Выделение GeometryOS-объекта

При клике на точку или сегмент возможны два режима:

### Atomic selection

Выбирается конкретная точка/отрезок.

### Semantic group selection

Выбирается всё импортированное построение.

Для первого spike рекомендуется:

- одиночный клик выбирает объект;
- двойной клик или click по group boundary выбирает импорт;
- drag по умолчанию перемещает root geometry group.

## 16.3. Group movement

Перемещение всей geometry group:

```ts
moveGeometryImport(importId, delta)
```

Изменяет:

```text
GeometryImportRecord.visualTransform.translation
```

Не изменяет:

- canonical GIR;
- mapping;
- semantic IDs.

## 16.4. Individual movement

В PR вертикального сценария individual drag математических точек должен быть:

```text
disabled or experimental
```

Разрешить:

- перемещение всей группы;
- перемещение label offset;
- перемещение user-created objects.

Отдельный эксперимент оценивает individual point drag.

---

# 17. Классификация изменений

## 17.1. Visual-only

Не меняют математический смысл:

- pan;
- zoom;
- перенос всей группы;
- изменение масштаба отображения;
- изменение цвета;
- изменение толщины линии;
- смещение подписи;
- изменение z-order;
- скрытие объекта;
- selection.

## 17.2. Potentially mathematical

Могут менять математический смысл:

- перемещение одной вершины;
- перемещение основания высоты;
- удаление сегмента;
- изменение endpoint сегмента;
- объединение точек;
- разрыв constraint;
- изменение принадлежности точки прямой.

## 17.3. Definitely mathematical

- добавление новой геометрической сущности;
- изменение типа constraint;
- замена высоты медианой;
- изменение связи `from_point`;
- изменение `foot`;
- переименование семантической точки, если имя входит в GIR identity.

## 17.4. Unknown

В spike допускается состояние:

```ts
type ChangeClassification = "visual" | "mathematical" | "unknown";
```

Unknown должен логироваться в experiment report.

---

# 18. GeometryOS client

## 18.1. Источник типов

Типы генерируются из:

```text
schemas/openapi.v1.json
```

Не дублировать DTO вручную.

## 18.2. Конфигурация

```ts
type GeometryOsConfig = {
  baseUrl: string;
  generateTimeoutMs: number;
};
```

Рекомендуемый client timeout для generate:

```text
20–25 секунд
```

Он должен быть больше server-side soft timeout.

## 18.3. Request ID

TutorBoard создаёт:

```text
X-Request-ID: tutorboard-<uuid>
```

И сохраняет request ID в `GeometryImportRecord`.

## 18.4. Обработка результатов

```ts
switch (response.status) {
  case "success":
    importGir(response.gir);
    break;
  case "needs_clarification":
    showClarification(response.ambiguities);
    break;
  case "error":
    showDomainError(response.warnings);
    break;
}
```

## 18.5. Обработка HTTP ошибок

Отдельно обработать:

- network failure;
- abort;
- `413`;
- `422`;
- `500`;
- `503`;
- `504`;
- invalid response;
- incompatible schema version.

Problem Details не должен смешиваться с domain `status="error"`.

---

# 19. GIR → Board Adapter

## 19.1. Ответственность

Adapter должен:

1. Проверить schema version.
2. Построить индекс GIR entities.
3. Создать local mapping context.
4. Вычислить или принять layout.
5. Создать semantic board objects.
6. Создать labels.
7. Создать geometry group.
8. Вернуть diagnostics.
9. Не обращаться к React, Konva и IndexedDB.

## 19.2. Интерфейс

```ts
type GirToBoardResult = {
  importRecord: GeometryImportRecord;
  objects: BoardObject[];
  group: BoardGroup;
  diagnostics: MappingDiagnostic[];
};

function girToBoard(
  gir: GirDocument,
  options: GirToBoardOptions,
): Result<GirToBoardResult, GirMappingError>;
```

## 19.3. Mapping context

```ts
type MappingContext = {
  importId: GeometryImportId;
  groupId: GroupId;
  girToBoardIds: Map<string, BoardObjectId[]>;
  coordinates: Map<string, Vec2>;
};
```

## 19.4. Детерминированные board IDs

В spike возможна формула:

```text
boardObjectId = hash(importId + girEntityId + role)
```

Например:

```text
geometry:<importId>:point:A
geometry:<importId>:segment:AB
geometry:<importId>:label:A
```

Плюс:

- GIR entity ID хранится отдельно;
- label не обязан иметь собственный GIR entity;
- роль `label` должна быть явно указана.

## 19.5. Диагностика

```ts
type MappingDiagnostic = {
  severity: "info" | "warning" | "error";
  code: string;
  girEntityId: string | null;
  message: string;
};
```

Примеры:

- `missing_visual_coordinate`;
- `unsupported_entity`;
- `missing_reference`;
- `duplicate_gir_id`;
- `label_created_from_name`;
- `layout_fallback_used`.

---

# 20. Где брать координаты

Данный вопрос является центральным результатом spike.

## 20.1. Вариант A: координаты приходят из GIR

Плюсы:

- один источник;
- простой adapter;
- воспроизводимое построение.

Минусы:

- смешение математики и визуализации;
- пользовательские перемещения требуют override;
- разные доски могут хотеть разные layout.

## 20.2. Вариант B: координаты приходят как отдельный layout-представитель GeometryOS

```text
GIR + layout/render metadata
```

Плюсы:

- математический GIR остаётся чистым;
- layout можно версионировать;
- GeometryOS сохраняет контроль над каноническим построением.

Минусы:

- сложнее API;
- нужен stable visual identity.

## 20.3. Вариант C: TutorBoard сам вычисляет координаты

Плюсы:

- полная независимость UI;
- гибкость.

Минусы:

- дублирование GeometryOS layout logic;
- расхождение SVG и интерактивного построения;
- сложная математика переносится во frontend.

## 20.4. Рекомендуемая гипотеза

Для spike:

```text
GIR = математическая семантика
GeometryOS layout metadata = канонические локальные координаты
TutorBoard transform/override = пользовательское визуальное состояние
```

Если текущий API не возвращает structured layout coordinates, адаптер временно может:

1. использовать координаты, уже присутствующие в GIR;
2. либо использовать минимальный deterministic fallback для поддерживаемого треугольника;
3. но не извлекать координаты из SVG как основную архитектуру.

SVG parsing допускается только как сравнительный эксперимент.

---

# 21. SVG insertion

## 21.1. Два разных сценария

### Обычная вставка SVG

SVG — единый непрозрачный объект:

```ts
type SvgObject = {
  type: "svg";
  source: string;
  bounds: Rect;
};
```

### GeometryOS SVG preview

SVG используется только как reference preview рядом с интерактивным GIR.

Нельзя использовать preview SVG как замену GIR → Board mapping.

## 21.2. Безопасность

- запрещать внешние scripts;
- удалять event handlers;
- запрещать remote references;
- ограничивать размер;
- ограничивать сложность;
- не исполнять произвольный SVG DOM.

В spike можно использовать browser-native decoding только после sanitization.

---

# 22. Локальное сохранение

## 22.1. Storage contract

```ts
type StoredDocumentRecord = {
  id: DocumentId;
  schemaVersion: "0.1";
  revision: number;
  updatedAt: string;
  document: BoardDocument;
};
```

## 22.2. IndexedDB tables

```text
documents
settings
recovery
```

Возможная схема:

```ts
db.version(1).stores({
  documents: "id, updatedAt",
  settings: "key",
  recovery: "documentId, updatedAt",
});
```

## 22.3. Autosave

- debounce 500–1000 ms;
- сохранять только после document mutation;
- не сохранять pointer move;
- viewport можно сохранять реже;
- показывать status:
  - `saved`;
  - `saving`;
  - `error`.

## 22.4. Recovery

При ошибке сериализации или записи:

- не разрушать активный документ;
- записать diagnostic;
- показать понятное сообщение;
- предоставить экспорт JSON;
- сохранить последнюю успешную revision.

## 22.5. Миграции

С первого дня использовать:

```text
schemaVersion
```

и registry migrations:

```ts
const migrations: Record<string, Migration> = {
  "0.1->0.2": migrate01to02,
};
```

---

# 23. Командная модель

## 23.1. BoardCommand

```ts
type BoardCommand =
  | AddObjectsCommand
  | MoveObjectsCommand
  | MoveGeometryImportCommand
  | UpdateStyleCommand
  | DeleteObjectsCommand
  | SetViewportCommand
  | ImportGeometryCommand;
```

## 23.2. Почему команды нужны уже в spike

Даже без полноценного undo/redo команды позволяют:

- централизовать invariants;
- логировать эксперименты;
- классифицировать изменения;
- в будущем добавить history;
- отделить UI от mutation logic.

## 23.3. BoardEvent

```ts
type BoardEvent = {
  id: string;
  timestamp: string;
  commandType: string;
  classification: ChangeClassification;
  affectedObjectIds: BoardObjectId[];
};
```

Полный event sourcing не нужен. Достаточно опционального in-memory experiment log.

---

# 24. Вертикальный сценарий

## 24.1. Сценарий пользователя

Пользователь вводит:

```text
Построй треугольник ABC и высоту AH
```

## 24.2. Шаг 1. TutorBoard создаёт request context

```ts
const requestId = createRequestId();
```

Состояние UI:

```text
idle → requesting
```

## 24.3. Шаг 2. HTTP request

```json
{
  "input_type": "text",
  "input": "Построй треугольник ABC и высоту AH",
  "output": ["svg"],
  "mode": "strict"
}
```

## 24.4. Шаг 3. Ответ GeometryOS

TutorBoard проверяет:

- HTTP status;
- content type;
- request ID;
- discriminated response status;
- schema version;
- presence of GIR.

## 24.5. Шаг 4. Adapter

```text
GIR
 ↓
entity index
 ↓
point coordinates
 ↓
segments
 ↓
labels
 ↓
group
 ↓
BoardDocument mutation
```

## 24.6. Шаг 5. Первоначальное размещение

Geometry local bounds центрируются относительно текущего viewport:

```text
targetWorldCenter = viewport center
```

Создаётся translation transform.

## 24.7. Шаг 6. Render

Появляются:

- point A;
- point B;
- point C;
- point H;
- segment AB;
- segment BC;
- segment CA;
- segment AH;
- labels A, B, C, H.

## 24.8. Шаг 7. Selection

После импорта root group автоматически выделяется.

## 24.9. Шаг 8. Move

Пользователь переносит всё построение.

Изменяется:

```text
visualTransform.translation
```

Canonical GIR остаётся прежним.

## 24.10. Шаг 9. Persistence

Autosave сохраняет:

- GIR;
- mapping;
- objects;
- transform;
- viewport.

## 24.11. Шаг 10. Reload

После reload:

- документ читается;
- schema version проверяется;
- objects восстанавливаются;
- group остаётся интерактивной;
- request ID и prompt доступны в inspector.

---

# 25. План реализации по pull request

## PR 1. Repository foundation

**Цель:** создать отдельный TutorBoard repository и базовый quality gate.

### Изменения

- Vite + React + TypeScript;
- strict TypeScript;
- ESLint;
- formatting;
- Vitest;
- Testing Library;
- Playwright skeleton;
- CI;
- architecture folders;
- README;
- initial ADRs;
- environment configuration.

### Acceptance criteria

- dev server запускается;
- production build создаётся;
- typecheck зелёный;
- tests зелёные;
- CI зелёный;
- нет business logic.

## PR 2. Board domain model

**Цель:** создать собственную сериализуемую модель документа.

### Изменения

- branded IDs;
- `BoardDocument`;
- `BoardObject` union;
- groups;
- viewport;
- commands;
- reducer/store;
- selectors;
- schema validation;
- fixture document.

### Tests

- object insertion;
- move;
- group move;
- invalid references;
- serialization round-trip;
- unique IDs;
- z-order.

### Acceptance criteria

- модель не импортирует React/Konva/Dexie;
- документ JSON-serializable;
- strict exhaustive switch;
- canvas отсутствует.

## PR 3. Infinite canvas foundation

**Цель:** подключить canvas renderer без превращения его в source of truth.

### Изменения

- `BoardStage`;
- viewport transform;
- pan;
- pointer-centered zoom;
- grid/debug origin;
- world/screen conversion;
- resize observer;
- renderer registry.

### Tests

- coordinate conversion;
- zoom invariant;
- pan invariant;
- viewport persistence DTO.

### Acceptance criteria

- объект не смещается при zoom;
- pan не меняет world coordinates;
- canvas отражает BoardDocument.

## PR 4. Pen and primitive shapes

**Цель:** проверить ручное создание объектов.

### Изменения

- tool state machine;
- select/pan/pen/line/rectangle/ellipse/text;
- toolbar;
- object creation commands;
- style defaults.

### Tests

- pointer sequence → command;
- pen points in world space;
- shape normalization;
- tool switching;
- cancel interaction.

### Acceptance criteria

- инструменты не мутируют Konva node напрямую;
- все результаты сохраняются в BoardDocument.

## PR 5. Selection and movement

**Цель:** реализовать минимальное редактирование.

### Изменения

- click selection;
- shift multi-selection;
- selection rectangle;
- drag selection;
- group movement;
- keyboard delete;
- inspector IDs/source.

### Tests

- select one;
- multi-select;
- move;
- cancel move;
- locked objects;
- group delta.

### Acceptance criteria

- movement is one command;
- viewport-independent delta;
- selection runtime-only.

## PR 6. Local persistence

**Цель:** доказать offline local document lifecycle.

### Изменения

- Dexie database;
- document repository;
- autosave;
- restore;
- schema version;
- recovery;
- JSON export/import for diagnostics.

### Tests

- repository contract;
- round-trip;
- corrupted record;
- migration registry;
- autosave debounce.

### Acceptance criteria

- reload восстанавливает доску;
- canvas runtime objects не сериализуются;
- ошибка storage не ломает UI.

## PR 7. SVG insertion

**Цель:** поддержать вставку внешнего визуального артефакта и отделить её от GIR mapping.

### Изменения

- sanitized SVG input;
- SVG object;
- bounds;
- move/select;
- size limits;
- invalid SVG error.

### Tests

- safe SVG;
- script removal;
- external reference rejection;
- serialization.

### Acceptance criteria

- SVG — единый board object;
- SVG не используется как semantic geometry source.

## PR 8. GeometryOS generated client

**Цель:** подключить стабильный HTTP API без GIR mapping.

### Изменения

- OpenAPI artifact import;
- generated TypeScript types;
- client;
- request ID;
- timeout/abort;
- result union handling;
- Problem Details;
- dev GeometryOS base URL;
- fixture/mocked client.

### Tests

- success;
- clarification;
- domain error;
- 422;
- 503;
- 504;
- invalid response;
- request ID.

### Acceptance criteria

- client не импортирует board domain;
- DTO остаётся на integration boundary;
- UI показывает три domain outcomes раздельно.

## PR 9. GIR to Board mapping

**Цель:** создать чистый adapter для поддерживаемого GeometryOS-сценария.

### Изменения

- GIR validation boundary;
- entity index;
- mapping context;
- IDs;
- point objects;
- segment objects;
- labels;
- geometry group;
- provenance;
- diagnostics;
- deterministic fallback layout при необходимости.

### Tests

- triangle + altitude fixture;
- missing reference;
- unsupported entity;
- duplicate ID;
- deterministic mapping;
- semantic source metadata.

### Acceptance criteria

- adapter pure;
- не импортирует React/Konva/store;
- mapping воспроизводим;
- никакого SVG parsing как основного механизма.

## PR 10. Vertical slice

**Цель:** соединить весь пользовательский сценарий.

### Изменения

- prompt panel;
- generate action;
- loading state;
- result handling;
- add geometry import command;
- center in viewport;
- automatic selection;
- inspector;
- group movement;
- autosave;
- reload.

### E2E

1. открыть TutorBoard;
2. ввести prompt;
3. mock/live GeometryOS response;
4. увидеть A, B, C, H;
5. выбрать построение;
6. переместить;
7. reload;
8. проверить новую позицию.

### Acceptance criteria

- вертикальный сценарий работает;
- request ID доступен;
- canonical GIR сохранён;
- visual transform сохранён;
- GeometryOS API errors диагностируемы.

## PR 11. Mathematical versus visual movement experiment

**Цель:** дать ответ по семантике drag.

### Эксперименты

- group move;
- label move;
- individual vertex move;
- altitude foot move;
- delete semantic segment.

### Режим

Individual semantic edits могут оставаться за feature flag:

```text
VITE_ENABLE_SEMANTIC_DRAG_EXPERIMENT=true
```

### Результат

Создать:

```text
docs/spike/MOVEMENT_EXPERIMENT.md
```

с выводами и предложением следующего контракта.

## PR 12. Spike report and architectural decision

**Цель:** завершить фазу доказательным отчётом.

### Документы

- `PHASE_2_REPORT.md`;
- обновлённый `GIR_MAPPING.md`;
- proposed GIR changes;
- proposed Board Model changes;
- список принятых ADR;
- список отклонённых решений;
- Phase 3 backlog.

### Acceptance criteria

Все ключевые вопросы имеют статус:

```text
answered
partially answered
blocked
```

Без отчёта фаза не считается завершённой.

---

# 26. CI pipeline

```text
lint
format-check
typecheck
unit-tests
integration-tests
build
e2e-smoke
architecture-tests
```

## 26.1. Architecture tests

Проверить запреты:

```text
board/domain не импортирует React
board/domain не импортирует Konva
board/domain не импортирует Dexie
geometryos/client не импортирует board store
geometryos/adapter не импортирует React
canvas не импортирует IndexedDB напрямую
```

## 26.2. Contract test

Использовать TutorBoard fixtures GeometryOS:

- generate success;
- ambiguity;
- unsupported;
- Problem Details;
- readiness.

## 26.3. Live integration test

Отдельный необязательный workflow:

```text
GeometryOS container
TutorBoard dev/test server
Playwright vertical scenario
```

Он не должен заменять deterministic fixture tests.

---

# 27. Тестовая стратегия

## 27.1. Unit tests

Покрыть:

- coordinate transforms;
- reducers;
- commands;
- selectors;
- mapping;
- migrations;
- error classification;
- IDs;
- serialization.

## 27.2. Integration tests

Покрыть:

- prompt → mocked GeometryOS → import;
- store → renderer;
- store → persistence;
- persistence → restore;
- selection → move command.

## 27.3. E2E

Минимальные сценарии:

### Canvas smoke

- создать прямоугольник;
- pan;
- zoom;
- select;
- move;
- reload.

### GeometryOS vertical

- prompt;
- response;
- geometry objects;
- group move;
- reload.

### Error path

- GeometryOS unavailable;
- UI показывает retryable infrastructure error;
- текущая доска сохраняется.

---

# 28. Observability spike

Полноценная observability не нужна, но необходимо логировать:

```ts
type SpikeDiagnostic = {
  timestamp: string;
  category:
    | "geometryos-request"
    | "gir-mapping"
    | "persistence"
    | "interaction";
  code: string;
  requestId?: string;
  importId?: string;
  details: Record<string, unknown>;
};
```

Не логировать полный пользовательский prompt по умолчанию в production-like режиме.

Для development допустим opt-in debug panel.

---

# 29. UX каркас

Минимальная компоновка:

```text
┌──────────────────────────────────────────────┐
│ Toolbar                                      │
├───────────────┬──────────────────────────────┤
│ Prompt Panel  │                              │
│               │       Infinite Canvas        │
│ Result status │                              │
│               │                              │
├───────────────┴───────────────────┬──────────┤
│ Save status / zoom / coordinates  │Inspector │
└───────────────────────────────────┴──────────┘
```

## 29.1. Prompt panel

- textarea;
- generate button;
- request status;
- clarification block;
- domain error block;
- infrastructure error block;
- request ID.

## 29.2. Inspector

Для selected GeometryOS object:

- Board object ID;
- GIR entity ID;
- GIR entity type;
- import ID;
- classification;
- local position;
- group transform;
- source prompt;
- request ID.

Inspector в spike является архитектурным инструментом, а не production UX.

---

# 30. Риски

## 30.1. Canvas library lock-in

**Риск:** BoardDocument начинает повторять Konva API.

**Защита:** domain-модель не импортирует canvas library; renderer registry выполняет mapping.

## 30.2. GIR не содержит layout данных

**Риск:** невозможно детерминированно создать интерактивное построение.

**Защита:** документировать gap; временный fallback; proposed GeometryOS layout contract.

## 30.3. GIR IDs нестабильны

**Риск:** повторный import создаёт дубликаты и теряет overrides.

**Защита:** mapping experiment; proposed `visual_id` или stable entity identity.

## 30.4. Смешение математического и визуального состояния

**Риск:** любое перемещение требует изменения GIR.

**Защита:** geometry local coordinates + board transform + visual overrides.

## 30.5. Слишком ранний semantic editor

**Риск:** фаза превращается в создание CAD/geometry engine.

**Защита:** individual semantic drag experimental; group movement — основной сценарий.

## 30.6. Слишком широкий продуктовый scope

**Риск:** команда строит меню, аккаунты и уроки вместо проверки интеграции.

**Защита:** non-goals; PR acceptance; spike report как главная поставка.

## 30.7. Дублирование GeometryOS

**Риск:** frontend начинает вычислять высоты и constraints.

**Защита:** TutorBoard не решает геометрию; fallback layout не должен становиться математическим solver.

---

# 31. Необходимые ADR

## ADR-001. Canvas renderer

Решение:

```text
Konva используется как renderer и interaction adapter,
BoardDocument является source of truth.
```

## ADR-002. Board document model

Решение о discriminated union, IDs, groups и command boundary.

## ADR-003. Coordinate spaces

Решение о screen/world/geometry-local coordinates.

## ADR-004. Local persistence

Решение использовать IndexedDB и schema migrations.

## ADR-005. GIR boundary

Решение не использовать GeometryOS DTO как Board Model.

## ADR-006. Mathematical and visual changes

Предварительная классификация и политика unsupported edits.

---

# 32. Экспериментальный журнал

Каждый значимый эксперимент оформляется:

```markdown
## Experiment E-XXX

### Question
### Setup
### Input
### Observed result
### Failure modes
### Decision
### Required changes
### Confidence
```

Минимальный набор:

- E-001 GIR ID stability;
- E-002 coordinate source;
- E-003 group transform;
- E-004 label identity;
- E-005 repeated import;
- E-006 individual point drag;
- E-007 SVG versus semantic mapping;
- E-008 local persistence migration.

---

# 33. Вопросы, на которые обязан ответить итоговый отчёт

## 33.1. Хватает ли текущего GIR?

Ответ должен быть разбит:

- entities;
- constraints;
- identifiers;
- coordinates;
- labels;
- grouping;
- visual roles;
- versioning.

## 33.2. Нужны ли visual IDs?

Возможные решения:

1. Не нужны: Board IDs детерминированно выводятся из GIR IDs.
2. Нужны только для render/layout elements.
3. Нужны отдельные semantic и visual IDs.
4. Нужен отдельный layout document.

## 33.3. Где хранятся координаты?

Итог должен выбрать:

- GIR;
- GeometryOS layout metadata;
- TutorBoard;
- hybrid.

## 33.4. Как представить пользовательское перемещение?

Варианты:

- group transform;
- per-object visual override;
- modification of layout document;
- modification of GIR;
- command log.

## 33.5. Как синхронизировать GIR и canvas object?

Варианты:

- one-way import only;
- reimport with preserved overrides;
- patch-based;
- bidirectional;
- regenerate.

Для Phase 2 достаточно one-way import + сохранение mapping.

## 33.6. Что является математическим изменением?

Необходима decision matrix по типам операций.

---

# 34. Предлагаемое развитие контрактов после spike

Это не обязательные изменения, а ожидаемый результат анализа.

## 34.1. Возможный Layout Document

```ts
type GeometryLayout = {
  schemaVersion: "0.1";
  girSchemaVersion: "0.2.0";
  entities: Record<
    string,
    {
      visualId: string;
      position?: Vec2;
      labelAnchor?: Vec2;
      role: string;
    }
  >;
};
```

## 34.2. Возможный response GeometryOS

```json
{
  "status": "success",
  "gir": {},
  "layout": {},
  "svg": "<svg>...</svg>"
}
```

## 34.3. Возможная visual identity

```text
semantic entity ID
visual representation ID
board object ID
```

Они не обязательно должны совпадать.

---

# 35. План по неделям

## Неделя 1

- repository foundation;
- BoardDocument;
- architecture tests;
- canvas;
- coordinate model;
- pan/zoom.

## Неделя 2

- tools;
- pen;
- primitives;
- selection;
- movement;
- persistence.

## Неделя 3

- generated GeometryOS client;
- error handling;
- GIR adapter;
- vertical scenario.

## Неделя 4

- movement experiments;
- repeated import;
- diagnostics;
- live integration;
- spike report.

## Резервная неделя

- устранение contract gaps;
- GeometryOS follow-up PR;
- final architecture review.

---

# 36. Definition of Done фазы

Фаза 2 завершена, когда:

1. Создан отдельный репозиторий TutorBoard.
2. Все PR прошли CI.
3. Работает бесконечное полотно.
4. Работают pan и zoom.
5. Работают перо и базовые фигуры.
6. Работает SVG insertion.
7. Работает GeometryOS client.
8. GIR преобразуется в интерактивные объекты.
9. Работает selection.
10. Работает group movement.
11. Работает local persistence.
12. Вертикальный сценарий покрыт E2E.
13. Создан `PHASE_2_REPORT.md`.
14. Зафиксированы ADR.
15. Сформирован список изменений GIR/GeometryOS.
16. Сформирован Phase 3 backlog.
17. Команда может объяснить, какие данные являются:
    - математическими;
    - layout;
    - viewport;
    - пользовательскими visual overrides.
18. Нет незакрытого вопроса, который скрыт за временным UI-кодом.

---

# 37. Итоговая поставка

```text
TutorBoard repository
+ architecture decisions
+ interactive canvas spike
+ GeometryOS integration
+ GIR → Board adapter
+ local document persistence
+ vertical E2E scenario
+ Phase 2 architecture report
```

Главный артефакт фазы — не интерфейс, а доказанная архитектурная модель:

```text
Canonical GIR
    ≠
Board Document
    ≠
Canvas Runtime
```

Рекомендуемое разделение ответственности:

```text
GeometryOS
- понимает геометрический запрос;
- создаёт математическую модель;
- валидирует и нормализует GIR;
- при необходимости предоставляет канонический layout.

TutorBoard
- управляет полотном;
- хранит визуальные transforms и overrides;
- создаёт интерактивные представления;
- сохраняет пользовательский документ;
- классифицирует визуальные и математические изменения.

Canvas library
- отображает;
- сообщает pointer events;
- не является источником истины.
```

---

# 38. Справочная база технологического решения

При окончательном выборе библиотек необходимо сверяться с актуальными официальными документами:

1. Vite — официальный Getting Started и production build guide.
2. Konva — официальный React integration guide, shape/event model и transformer documentation.
3. Zustand — официальный API и selector model.
4. Dexie — официальная документация IndexedDB, versioned schema и migrations.

Версии зависимостей должны фиксироваться в lock-файле репозитория после создания проекта. Точные версии не фиксируются в этом архитектурном плане, потому что они должны выбираться и проверяться в момент bootstrap PR.
