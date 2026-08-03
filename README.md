# TutorBoard

> Интерактивное образовательное полотно и клиентское ядро экосистемы Tutor Assistant.

TutorBoard — браузерное приложение на TypeScript для проведения и сопровождения занятий: бесконечное полотно, рукописные заметки, фигуры, математические построения, учебные материалы и последующая совместная работа преподавателя и ученика.

Главная архитектурная идея проекта:

```text
GeometryOS отвечает за математическую семантику.
TutorBoard отвечает за интерактивное представление и пользовательское состояние.
tutor-assistant-web отвечает за пользователей, занятия, доступ, хранение и бизнес-процессы.
```

Архитектурный Technical Spike и продуктовые фазы 3–8 завершены в коде.
Development сохраняет автономный режим; production открывает lesson-bound
совместную доску через платформу:

```text
текстовый запрос
    ↓
TutorBoard
    ↓ same-origin /api/v1/geometryos
tutor-assistant-web
    ↓ internal HTTP API v1
GeometryOS
    ↓
канонический GIR 0.2
    ↓
Layout Document 0.1
    ↓
GIR + Layout → Board adapter
    ↓
BoardDocument
    ↓
интерактивные объекты на полотне
```

Обязательный вертикальный сценарий первой фазы TutorBoard:

> Построй треугольник ABC и высоту AH.

После выполнения запроса на полотне должны появиться интерактивные точки, отрезки и подписи, которые можно выделить, переместить и сохранить локально.

---

## Статус

| Компонент                | Текущее состояние                                                                                                     | Ближайшая поставка                           |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| GeometryOS               | API v1/GIR `0.2.0`, Layout Document `0.1.0` и стабильный `POST /api/v1/layout` опубликованы                           | Consumer integration hardening               |
| TutorBoard               | Phases 3–8: server sync, collaboration, evidence UI и immutable production image                                      | Staging/release approval                      |
| tutor-assistant-web      | Board persistence/API, WebSocket rooms, GeometryOS gateway, immutable evidence, portal и blue/green routing            | Staging load/restore drill                    |
| tutor-assistant          | Desktop recording/transcription application                                                                           | Lesson evidence integration на поздних фазах |
| students-26-27           | Репозиторий учебных страниц и опубликованных файлов                                                                   | Consumer lesson artifacts                    |
| Latexed / DocumentEngine | Проверка, компиляция и экспорт TEX/PDF/HTML                                                                           | Post-lesson material pipeline                |

### Что уже работает в TutorBoard

- infinite canvas, pan, pointer-centred zoom и adaptive grid;
- компактная панель с группами «Рисование», «Фигуры», «Математика», «ИИ» и
  «Медиа»;
- pen, line, rectangle, ellipse, triangle и правильные n-угольники;
- импорт PNG/JPEG/SVG и анимированных GIF;
- эфемерная лазерная указка для объяснений без изменения документа;
- click/Shift/marquee selection, movement, lock и delete;
- versioned `BoardDocument 1.0` и command-only mutation boundary;
- bounded undo/redo, clipboard, layers, groups and visual styling;
- deterministic `.tutorboard.json` import/export и SVG/PNG/PDF snapshots;
- viewport culling, incremental selectors и 5,000-object CI benchmark;
- keyboard workflow, shortcut help, reduced motion и visible focus;
- offline product shell с routes, settings, notifications и diagnostics;
- append-only Dexie revisions, autosave, optimistic conflict и recovery;
- lesson-bound bootstrap через `lessonId`/`documentId`;
- копирование ссылки на lesson-bound доску, WebSocket presence, удалённые
  курсоры и одновременное редактирование;
- same-origin HTTP `BoardSyncRepository` с session CSRF;
- durable очередь неподтверждённых команд и offline → reconnect;
- pull/push server revisions, SHA-256 verification и rebase после `409`;
- bounded deny-by-default SVG import;
- pinned OpenAPI/GIR/fixture artifacts и generated runtime validation;
- bounded GeometryOS HTTP adapter с typed generate/layout results и request correlation;
- deterministic GIR semantic mapping;
- Layout-to-Board placement в редактируемые line/ellipse/text objects;
- единая атомарная `core.geometry.import` command с provenance и persistence
  round-trip;
- GeometryOS prompt panel с loading, clarification, domain failure, retry,
  cancellation и request-ID diagnostics;
- автоматическое центрирование и выделение импортированного построения.

Pinned consumer contract закреплён на GeometryOS commit
`fe5ece9f7138044d638114907fe9aaecfd14e924`: OpenAPI, GIR schema, Layout
Document `0.1.0` и исполняемые fixtures проверяются по SHA-256 и генерируют
compile-time DTOs вместе с standalone runtime validators.

### Критический путь

Source completion gate → draft PR двух репозиториев → immutable images →
staging smoke/load/restore drill → manual production approval.

PR 2.9 разделён намеренно и обе его части теперь реализованы:

- **2.9A** владеет pure GIR semantics, IDs, references, mapping и diagnostics;
- **2.9B** владеет Layout-to-Board placement, renderable geometry objects и
  атомарным document import;
- coordinates не вычисляются из SVG и не записываются обратно в canonical GIR.

### Следующие фазы

TutorBoard подключается к tutor-assistant-web через same-origin gateway и уже
поддерживает server revisions, offline synchronization и WebSocket
collaboration. Следующие поставки: lesson evidence и production hardening.
Advanced semantic drag и AI modifications начинаются после стабилизации этих
контрактов.

### Запуск серверного режима

Локальный режим остаётся default для development. Для открытия доски занятия:

```text
VITE_FEATURE_SERVER_SYNC=true
VITE_BOARD_API_BASE_URL=/api/v1
/?lessonId=lesson:...&documentId=document:...#/board
```

`VITE_BOARD_API_BASE_URL` принимает только same-origin path. Сессия и
`X-CSRF-Token` выдаются `tutor-assistant-web`; токены не хранятся в IndexedDB.
Подробные решения и ограничения зафиксированы в
`docs/adr/ADR-011-server-board-sync.md`.

## Зачем нужен TutorBoard

Сейчас экосистема уже умеет:

- записывать занятия и системный звук;
- локально транскрибировать аудио;
- хранить сведения об учениках и расписании;
- проводить видеозанятия через BigBlueButton;
- формировать evidence bundle занятия;
- генерировать PDF, HTML и TEX;
- публиковать материалы ученику;
- преобразовывать текстовое описание геометрии в GIR, SVG и TikZ.

Не хватает единого интерактивного пространства, в котором преподаватель и ученик смогут работать с этими данными непосредственно во время занятия.

TutorBoard закрывает этот разрыв:

- предоставляет бесконечное полотно;
- отображает рукописные и структурные объекты;
- превращает ответ GeometryOS в редактируемые геометрические объекты;
- связывает объекты доски с конкретным занятием;
- сохраняет визуальное состояние независимо от математической модели;
- в дальнейшем становится модулем виртуального класса tutor-assistant-web.

---

## Основные пользовательские сценарии

### 1. Ручная работа на доске

Преподаватель:

- перемещается по бесконечному полотну;
- масштабирует сцену;
- рисует пером;
- добавляет линии, прямоугольники, эллипсы и текст;
- вставляет SVG;
- выделяет, группирует и перемещает объекты;
- сохраняет документ.

### 2. Геометрическое построение через GeometryOS

Пользователь вводит естественно-языковую команду. TutorBoard отправляет её в GeometryOS, получает canonical GIR, затем versioned Layout Document и только после runtime validation создаёт собственные объекты доски одной атомарной import-командой.

Пример:

```text
Построй треугольник ABC и высоту AH
```

Результат:

- точки `A`, `B`, `C`, `H`;
- стороны `AB`, `BC`, `CA`;
- высота `AH`;
- подписи;
- связь каждого объекта с исходной GIR-сущностью;
- единая группа построения с собственным visual transform.

### 3. Работа в контексте занятия

В целевой архитектуре TutorBoard открывается из tutor-assistant-web:

```text
организация
    ↓
ученик
    ↓
занятие
    ↓
документ TutorBoard
```

Backend выдаёт пользователю права доступа, metadata занятия и идентификатор документа. TutorBoard загружает и сохраняет состояние через API платформы.

### 4. После занятия

Снимок доски и связанные данные могут войти в `LessonEvidenceBundle` вместе с:

- транскриптом;
- записью занятия;
- заметками;
- созданными материалами;
- GeometryOS GIR;
- визуальными изменениями доски.

Эти данные используются для генерации пособий, домашнего задания, разбора ошибок и публикации в кабинете ученика.

---

## Экосистема

```text
┌─────────────────────────────────────────────────────────────┐
│                       Пользователи                          │
│        преподаватель · ученик · родитель · администратор   │
└──────────────────────────────┬──────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────┐
│                    tutor-assistant-web                      │
│                                                            │
│  identity · organizations · students · lessons · schedule  │
│  BBB · permissions · storage · jobs · evidence · delivery  │
└───────────────┬──────────────────────────┬──────────────────┘
                │                          │
        lesson/board context       post-lesson workflow
                │                          │
┌───────────────▼──────────────┐   ┌──────▼───────────────────┐
│          TutorBoard          │   │ tutor-assistant / workers│
│                              │   │                          │
│ TypeScript SPA               │   │ recording               │
│ infinite canvas              │   │ transcription           │
│ BoardDocument                │   │ evidence preparation     │
│ interactive geometry         │   │ material generation      │
└───────────────┬──────────────┘   └──────┬───────────────────┘
                │                          │
        geometry request                 │
                │                          │
┌───────────────▼──────────────┐   ┌──────▼───────────────────┐
│         GeometryOS           │   │ Latexed / DocumentEngine │
│                              │   │                          │
│ text → GIR                   │   │ TEX validation           │
│ validation/normalization     │   │ LaTeX compilation        │
│ layout                       │   │ PDF/HTML/TEX export       │
│ SVG/TikZ                     │   └──────┬───────────────────┘
└──────────────────────────────┘          │
                                         │
                                  ┌──────▼───────────────┐
                                  │ students-26-27       │
                                  │                      │
                                  │ published materials  │
                                  │ student web pages    │
                                  │ PDF/TEX/HTML/PNG      │
                                  └──────────────────────┘
```

---

## Границы ответственности репозиториев

### TutorBoard

Репозиторий: [ArtemLevin/tutorboard](https://github.com/ArtemLevin/tutorboard)

Отвечает за:

- frontend на TypeScript;
- бесконечное полотно;
- инструменты рисования;
- модель `BoardDocument`;
- viewport, selection и interaction state;
- визуальные transforms и overrides;
- GIR → Board adapter;
- локальное сохранение;
- будущую синхронизацию документов;
- совместное редактирование на следующих фазах.

Не должен:

- решать геометрические задачи;
- дублировать семантическую валидацию GeometryOS;
- хранить пользователей и права доступа как собственный backend;
- компилировать LaTeX;
- управлять BigBlueButton;
- становиться источником истины для данных занятия.

### GeometryOS

Репозиторий: [ArtemLevin/geometryos](https://github.com/ArtemLevin/geometryos)

GeometryOS — GIR-first геометрический компилятор:

```text
text → draft GIR → validate → normalize → validate → layout → SVG/TikZ
```

Отвечает за:

- интерпретацию геометрического запроса;
- каноническую математическую модель;
- GIR schema;
- семантическую валидацию;
- нормализацию;
- версионированный initial layout с provenance;
- SVG и TikZ;
- API v1;
- Problem Details, request ID и timeouts;
- OpenAPI и consumer contracts для TutorBoard.

GeometryOS не является canvas engine и не хранит пользовательское состояние доски.

### tutor-assistant-web

Репозиторий: [ArtemLevin/tutor-assistant-web](https://github.com/ArtemLevin/tutor-assistant-web)

Это основная серверная и операционная платформа экосистемы.

Отвечает за:

- организации и пользователей;
- роли `admin`, `tutor`, `student`, `parent`;
- tenant isolation;
- карточки учеников;
- расписание и занятия;
- BigBlueButton;
- приглашения и публичные ссылки;
- записи и транскрипты;
- фоновые очереди;
- `LessonEvidenceBundle`;
- артефакты и object storage;
- проверку, публикацию и доставку материалов;
- audit, observability, security и production deployment.

Планируемая интеграция: tutor-assistant-web создаёт контекст доски, выдаёт access token и сохраняет документы TutorBoard. TutorBoard остаётся отдельным frontend-модулем или отдельным SPA, но не отдельной бизнес-платформой.

### tutor-assistant

Репозиторий: [ArtemLevin/tutor-assistant](https://github.com/ArtemLevin/tutor-assistant)

Локальный desktop-контур преподавателя:

```text
recording → transcription → review → lesson metadata → publication
```

Отвечает за:

- захват микрофона и системного звука;
- локальную транскрибацию;
- проверку текста;
- подготовку metadata занятия;
- работу с локальными файлами;
- публикацию подтверждённых данных;
- локальную диагностику аудио и окружения.

В перспективе desktop-приложение сможет прикреплять к занятию ссылку на TutorBoard-документ или импортировать его snapshot, но не должно содержать вторую реализацию полотна.

### students-26-27

Репозиторий: [ArtemLevin/students-26-27](https://github.com/ArtemLevin/students-26-27)

Текущий контур хранения и публикации учебных материалов:

- страницы учеников;
- PDF/TEX/HTML;
- плакаты и изображения;
- heatmap компетенций;
- подтверждённые транскрипты и материалы занятий.

В долгосрочной архитектуре он может остаться экспортным/static publishing контуром, тогда как source of truth для занятий и публикаций будет находиться в tutor-assistant-web.

### latex-for-everyone / Latexed

Репозиторий: [ArtemLevin/latex-for-everyone](https://github.com/ArtemLevin/latex-for-everyone)

DocumentEngine для:

- редактирования LaTeX;
- проверки и компиляции;
- безопасного создания PDF;
- экспорта HTML/TEX/PDF;
- серверного document workflow.

TutorBoard не вызывает LaTeX compiler во время обычного canvas interaction. Экспорт и подготовка итоговых материалов выполняются через tutor-assistant-web и DocumentEngine.

---

## Ключевое архитектурное разделение

```text
Canonical GIR
    ≠
BoardDocument
    ≠
Canvas Runtime
```

### Canonical GIR

Математическое представление:

- точки;
- линии и отрезки;
- отношения;
- constraints;
- стабильные entity IDs;
- версия схемы.

### BoardDocument

Сериализуемый документ TutorBoard:

- пользовательские фигуры;
- интерактивные представления GIR-сущностей;
- группы;
- visual transforms;
- стили;
- z-order;
- imports;
- metadata документа;
- версия схемы.

### Canvas Runtime

Временное состояние renderer:

- DOM/canvas nodes;
- pointer capture;
- hover;
- active drag;
- selection handles;
- animation state.

Canvas runtime никогда не является source of truth и не сериализуется как документ.

---

## Модель геометрического импорта

TutorBoard сохраняет не только нарисованные объекты, но и происхождение геометрии:

```ts
type GeometryImportRecord = {
  id: GeometryImportId;
  prompt: string;
  requestId: string | null;
  geometryOsApiVersion: "1.0.0";
  girSchemaVersion: "0.2.0";
  canonicalGir: GirDocument;
  rootGroupId: GroupId;
  boardObjectIds: BoardObjectId[];
  mapping: Record<string, BoardObjectId[]>;
  visualTransform: Transform2D;
  visualOverrides: Record<BoardObjectId, VisualOverride>;
};
```

Это позволяет:

- отличать математическую семантику от размещения;
- переносить всё построение без изменения GIR;
- сохранять связь `GIR entity ID ↔ Board object`;
- повторно импортировать GIR;
- диагностировать потерю информации;
- подготовить будущую синхронизацию.

---

## Математические и визуальные изменения

### Визуальные изменения

Не меняют математическую модель:

- pan и zoom;
- перенос всего построения;
- цвет и толщина;
- смещение подписи;
- z-order;
- скрытие;
- selection.

### Потенциально математические изменения

Требуют отдельной политики:

- перемещение одной вершины;
- перемещение основания высоты;
- удаление семантического сегмента;
- изменение endpoint;
- изменение constraint;
- переименование сущности.

Technical Spike должен определить, какие операции остаются visual overrides, какие запрещаются, а какие требуют изменения GIR или нового GeometryOS endpoint.

---

## Технологический стек

### Основной frontend

- TypeScript;
- React;
- Vite;
- Konva / react-konva;
- Zustand;
- IndexedDB;
- Dexie;
- Zod или эквивалентная runtime validation boundary.

### Проверки

- ESLint;
- formatter;
- TypeScript strict mode;
- Vitest;
- Testing Library;
- Playwright;
- architecture boundary tests;
- generated OpenAPI client smoke.

### Почему полный TypeScript

Интерактивное полотно требует тесной работы с browser APIs, pointer events, Canvas, SVG, IndexedDB и будущей совместной синхронизацией. GeometryOS и backend-платформа остаются на Python, а OpenAPI и GIR образуют строгую границу между языками.

---

## Планируемая структура репозитория

```text
tutorboard/
├── .github/workflows/
├── docs/
│   ├── adr/
│   ├── architecture/
│   ├── spike/
│   ├── DEVELOPMENT_PLAN.md
│   └── PHASE_2_TECHNICAL_SPIKE_PLAN.md
├── src/
│   ├── app/
│   ├── board/
│   │   ├── domain/
│   │   ├── application/
│   │   ├── canvas/
│   │   └── persistence/
│   ├── geometryos/
│   │   ├── client/
│   │   ├── contracts/
│   │   └── adapter/
│   ├── features/
│   └── shared/
├── tests/
│   ├── integration/
│   └── e2e/
├── package.json
├── tsconfig.json
└── vite.config.ts
```

---

## Принципы разработки

1. **BoardDocument — source of truth.** Renderer только отображает документ.
2. **GeometryOS DTO не становится UI-моделью.** Между ними находится чистый adapter.
3. **Strict TypeScript.** `any` запрещён в domain и integration layers.
4. **Сначала контракт, затем UI.** IDs, coordinate spaces и commands проектируются до компонентов.
5. **Каждый PR проверяет одну гипотезу.** Technical Spike не превращается в бесконтрольный MVP.
6. **Сохранение данных версионируется с первого дня.** Любой stored document содержит `schemaVersion`.
7. **Математическое и визуальное состояние разделены.** Пользовательское перемещение не должно незаметно менять GIR.
8. **OpenAPI генерирует client types.** DTO GeometryOS не дублируются вручную.
9. **Нет скрытой логики в React-компонентах.** Изменения проходят через commands/application layer.
10. **Архитектурный вывод является поставкой.** Фаза завершается отчётом и ADR, а не только демонстрацией UI.

---

## Локальная разработка

Для локальной разработки требуется Node.js 24 и npm 11:

```bash
npm ci
npm run dev
npm run lint
npm run typecheck
npm run test
npm run architecture
npm run build
npm run e2e
```

`npm run check` запускает весь non-browser quality gate. Перед `npm run e2e`
нужно выполнить `npm run build`; Playwright поднимает production preview.

Создайте локальную конфигурацию из `.env.example`. Все переменные `VITE_*`
попадают в браузерный bundle и не должны содержать секреты.

Для live-интеграции GeometryOS запускается отдельно:

```bash
# repository geometryos
uv sync --frozen --dev
make api
```

Ожидаемый URL разработки:

```text
TutorBoard: http://localhost:5173
GeometryOS: http://localhost:8000
```

Текущая build-time конфигурация:

```text
VITE_APP_STAGE=development | test | production
VITE_GEOMETRYOS_BASE_URL=/api/v1/geometryos/
VITE_FEATURE_DEV_DIAGNOSTICS=true
VITE_FEATURE_DOCUMENT_SNAPSHOTS=true
VITE_FEATURE_GEOMETRY_PROMPT=true
```

`VITE_GEOMETRYOS_BASE_URL` используется только для локальной browser-интеграции
flow и не должен содержать credentials, query или fragment. Production route
через platform gateway остаётся отдельным решением поздней фазы.

---

## Документация

- [Полный план разработки](docs/DEVELOPMENT_PLAN.md)
- [Phase 2: Technical Spike](docs/PHASE_2_TECHNICAL_SPIKE_PLAN.md)

Планируемые документы:

- `docs/architecture/BOARD_MODEL.md`;
- `docs/architecture/COORDINATE_SYSTEMS.md`;
- `docs/architecture/GIR_MAPPING.md`;
- `docs/architecture/CHANGE_CLASSIFICATION.md`;
- `docs/spike/EXPERIMENT_LOG.md`;
- `docs/spike/PHASE_2_REPORT.md`;
- ADR по renderer, persistence, IDs, coordinate spaces и sync model.

---

## Roadmap

Крупные этапы:

1. GeometryOS integration-ready baseline — выполнен.
2. TutorBoard Technical Spike.
3. Product foundation.
4. Интеграция с tutor-assistant-web.
5. Уроки и сохранение server-side документов.
6. Совместное редактирование и virtual classroom.
7. Post-lesson evidence и генерация материалов.
8. Production hardening.
9. Расширенная математическая и AI-функциональность.

Подробная PR-последовательность и критерии перехода между фазами описаны в [docs/DEVELOPMENT_PLAN.md](docs/DEVELOPMENT_PLAN.md).

---

## Текущее продуктовое решение

TutorBoard развивается как **полностью TypeScript-клиент**.

Python сохраняется в:

- GeometryOS;
- tutor-assistant-web;
- tutor-assistant desktop;
- transcription и background workers;
- DocumentEngine.

Такое разделение позволяет использовать сильные стороны обеих платформ:

> Python отвечает за математику, данные, AI и серверные процессы. TypeScript отвечает за интерактивное браузерное полотно.
