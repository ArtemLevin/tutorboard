# TutorBoard — Development Backlog

**Документ:** `03_TUTORBOARD_BACKLOG.md`  
**Дата актуализации:** 10.08.2026  
**Репозиторий:** `ArtemLevin/tutorboard`  
**Базовая ветка:** `main`  
**Базовый HEAD на момент составления:** `133958596dec64ad597614acb597b7ae165d9e91`  
**Связанный документ:** `01_TUTORBOARD_PROJECT_STATE.md`

---

# 1. Назначение документа

Этот документ определяет очередь дальнейшей разработки TutorBoard после завершения серии 3D-релизов до PR #109.

Backlog используется как единая точка планирования для:

- определения приоритетов;
- декомпозиции работ на отдельные PR;
- контроля архитектурных зависимостей;
- фиксации критериев готовности;
- предотвращения бесконтрольного расширения scope;
- оценки production readiness;
- планирования следующих функциональных фаз TutorBoard.

Основной принцип дальнейшей разработки:

> Сначала укрепляется существующее ядро, затем расширяются математические и образовательные возможности продукта.

---

# 2. Стратегические направления

Разработка разделяется на шесть последовательных направлений.

| Направление | Цель | Приоритет |
|---|---|---|
| Core stabilization | стабилизировать текущий production baseline | P0 |
| Smart Ink | повысить качество рукописного ввода | P1 |
| 3D Geometry | превратить 3D в полноценную лабораторию стереометрии | P1 |
| GeometryOS | добавить управление существующими построениями | P1 |
| Coordinate Lab | развить графики, уравнения и неравенства | P2 |
| Lesson Intelligence | связать действия на доске с данными урока | P2 |

---

# 3. Общие правила для backlog

Каждая функциональная поставка должна:

1. выполняться в отдельной feature/fix-ветке;
2. оформляться отдельным Pull Request;
3. сохранять обратную совместимость BoardDocument либо содержать явную миграцию;
4. проходить `npm run check`;
5. проходить Chromium browser smoke;
6. проходить Firefox browser smoke для пользовательских функций;
7. сопровождаться regression-тестами;
8. сохранять command-only mutation boundary;
9. соблюдать архитектурные границы `core / modules / adapters / app`;
10. обновлять документацию при изменении публичного поведения;
11. удалять временные CI workflow до попадания изменений в итоговый `main`;
12. иметь понятный rollback path для production-функций.

---

# 4. Definition of Done

Задача считается завершённой после выполнения всех применимых условий:

- реализация находится в `main`;
- TypeScript typecheck проходит;
- ESLint проходит;
- Prettier check проходит;
- unit/integration tests проходят;
- performance budgets проходят;
- architecture check проходит;
- production build проходит;
- browser smoke проходит;
- новые пользовательские сценарии имеют E2E coverage;
- изменения persistence имеют round-trip тест;
- новая команда имеет reducer/codec validation;
- документация соответствует фактической реализации;
- feature flag корректно работает в development/test/production;
- временные debug-файлы и workflow удалены;
- Pull Request объединён после успешных release gates.

---

# 5. EPIC A — Core Stabilization

**Приоритет:** P0  
**Цель:** получить устойчивый baseline для дальнейшего расширения TutorBoard.

---

## TB-110 — 3D viewport lifecycle hardening

**Предлагаемый PR:** `#110`  
**Приоритет:** P0  
**Тип:** fix / architecture

### Проблема

В `Solid3DViewport` основной lifecycle effect зависит от `record.projection`.

Persistent rotation также обслуживается отдельным effect, который способен обновлять quaternion существующего `runtime.root`.

Требуется исключить лишнее уничтожение и повторное создание WebGL renderer при обычном изменении ориентации модели.

### Задачи

- разделить lifecycle renderer и обновление model transform;
- создавать renderer только при реальной необходимости;
- исключить пересоздание renderer при изменении quaternion;
- проверить camera mode lifecycle;
- проверить `resetToken`;
- проверить смену определения тела;
- проверить cleanup OrbitControls;
- проверить cleanup rotation gizmo;
- проверить cleanup geometry/materials;
- проверить `forceContextLoss`;
- добавить instrumentation для тестов жизненного цикла.

### Тесты

- 100 последовательных open/close циклов 3D;
- 100 поворотов тела без создания нового renderer;
- camera rotate без изменения model quaternion;
- model rotate без сброса camera state;
- context lost → retry;
- resize после retry;
- смена orthographic/perspective;
- unmount во время активного viewport.

### Acceptance criteria

- изменение persistent rotation сохраняет существующий WebGL context;
- закрытие окна освобождает Three.js resources;
- повторное открытие работает стабильно;
- Chrome и Firefox проходят 3D smoke;
- утечка обработчиков событий отсутствует.

---

## TB-111 — Documentation and contract alignment

**Предлагаемый PR:** `#111`  
**Приоритет:** P0  
**Тип:** documentation / maintenance  
**Зависимость:** TB-110 желательно завершить первой.

### Задачи

Обновить:

- `README.md`;
- `docs/architecture/SOLID_3D.md`;
- Smart Ink documentation;
- BoardDocument compatibility documentation;
- feature flag documentation;
- 3D section workflow;
- toolbar description;
- production rollout notes.

### Требуется зафиксировать

- `BoardDocument 1.4`;
- `solidLearningAttempts`;
- explicit section preview/save workflow;
- constrained sections;
- persistent model rotation;
- Construction Studio;
- текущий набор semantic solids;
- отсутствие отдельной кнопки «Фигуры»;
- актуальную схему Smart Ink auto-accept.

### Acceptance criteria

Архитектурная документация описывает фактическое состояние `main`.

---

## TB-112 — Unified durability smoke

**Приоритет:** P0  
**Тип:** test / reliability

### Целевой сценарий

```text
create object
→ autosave
→ reload
→ restore
→ edit
→ offline queue
→ reconnect
→ server sync
→ undo
→ reload
```

### Области покрытия

- обычные Board objects;
- Smart Ink replacement;
- coordinate plot;
- GeometryOS import;
- 3D model;
- saved section;
- projected section;
- learning attempt.

### Acceptance criteria

Критический пользовательский state survives полный persistence/sync lifecycle.

---

# 6. EPIC B — Smart Ink 2

**Приоритет:** P1  
**Цель:** превратить Smart Ink в устойчивый геометрический рукописный интерфейс.

---

## TB-120 — Smart Ink recognizer arbitration

**Предлагаемый PR:** `#112`  
**Приоритет:** P1  
**Зависимость:** Core stabilization.

### Проблема

Сейчас recognizer'ы работают последовательно.

Пример потенциальной ошибки:

```text
рукописная стрелка
↓
primitive recognizer
↓
уверенно определяет line
↓
arrow recognizer уже не получает stroke
```

### Целевая архитектура

```text
stroke
   ↓
┌─────────────────────┐
│ Primitive recognizer│
│ Arrow recognizer    │
│ Future recognizers  │
└─────────────────────┘
   ↓
candidate normalization
   ↓
candidate ranking
   ↓
ambiguity policy
   ↓
replacement
```

### Задачи

- создать общий candidate contract;
- запускать допустимые recognizer'ы параллельно на одном stroke;
- нормализовать confidence;
- добавить arbitration layer;
- учитывать confidence margin;
- добавить ambiguity rejection;
- добавить diagnostics;
- сохранить deterministic behavior.

### Acceptance criteria

Стрелка имеет возможность выиграть у line candidate при более качественном fit.

---

## TB-121 — Smart Ink arrow hardening

**Предлагаемый PR:** `#113A`  
**Приоритет:** P1

### Задачи

Поддержать:

- стрелку вправо;
- стрелку влево;
- стрелку вверх;
- стрелку вниз;
- диагональные стрелки;
- длинное древко;
- короткое древко;
- асимметричный наконечник;
- слегка изогнутое рукописное древко.

### Отрицательные примеры

- линия;
- угол;
- галочка;
- буква V;
- буква Y;
- треугольник;
- случайный stroke.

---

## TB-122 — Extended Smart Ink geometry vocabulary

**Предлагаемый PR:** `#113B+`  
**Приоритет:** P1

### Первая группа

- line;
- ray;
- segment;
- arrow;
- angle.

### Вторая группа

- triangle;
- rectangle;
- square;
- trapezoid;
- parallelogram;
- rhombus.

### Третья группа

- circle;
- ellipse.

### Дальнейшее развитие

- parallel marker;
- perpendicular marker;
- coordinate axes;
- geometric annotation symbols.

### Архитектурное требование

При появлении постоянных polygon primitives желательно переводить Smart Ink triangle и другие многоугольники с pen-stroke representation на семантические Board objects.

---

## TB-123 — Smart Ink corpus v2

**Приоритет:** P1

### Целевой объём

Для каждого основного класса:

- минимум 100–150 проверенных positive samples;
- разные размеры;
- разные ориентации;
- разная скорость рисования;
- разная степень аккуратности.

Negative corpus:

- минимум 200 samples;
- рукописный текст;
- каракули;
- случайные линии;
- частичные фигуры;
- смешанные жесты.

### Браузеры

- Chromium;
- Firefox.

### Устройства ввода

- mouse;
- touch/pen при наличии оборудования.

### Метрики

Для каждого класса:

- precision;
- recall;
- false positive rate;
- confusion matrix.

---

# 7. EPIC C — 3D Geometry Laboratory

**Приоритет:** P1  
**Цель:** сделать 3D сильным инструментом преподавания стереометрии.

---

## TB-130 — Section construction UX

**Предлагаемый PR:** `#114`  
**Приоритет:** P1

### Задачи

Добавить:

- более заметный режим preview;
- ghost plane;
- подпись плоскости `α`;
- визуальный статус выбранных точек;
- подсветку рёбер;
- подсветку граней;
- hover states;
- визуальный distinction preview/saved section;
- быстрый deselect точки;
- понятное сообщение при вырожденном сечении;
- удобный список сохранённых сечений.

### Целевой workflow

```text
поставить/выбрать точки
→ увидеть плоскость
→ увидеть сечение
→ сохранить
→ назвать
→ исследовать
→ вывести на доску
```

---

## TB-131 — Advanced section constraints

**Предлагаемый PR:** `#115`  
**Приоритет:** P1  
**Зависимость:** TB-130.

### Требуемые конструкции

Поддержать плоскость:

- через три точки;
- через ребро и точку;
- через две пересекающиеся прямые;
- через две параллельные прямые;
- через точку параллельно грани;
- через точку перпендикулярно ребру;
- через прямую перпендикулярно плоскости;
- параллельно основанию;
- через диагональ грани и внешнюю вершину.

### Семантика

Constraint должен сохранять математическое условие.

После изменения размеров тела плоскость должна перестраиваться по constraint, сохраняя исходный геометрический смысл.

---

## TB-132 — Persistent 3D ↔ 2D section linkage

**Предлагаемый PR:** `#116`  
**Приоритет:** P1  
**Зависимость:** TB-131.

### Цель

Проецируемое сечение должно иметь связь с исходной 3D-моделью.

### Необходимые данные

Сохранить:

```text
sourceSolidId
sourceSectionId
projectionVersion
vertexCorrespondence
```

### Возможности

- определить источник 2D-сечения;
- повторно открыть соответствующий 3D объект;
- обновить 2D-проекцию после изменения 3D-модели;
- сохранить пользовательские visual overrides при допустимых изменениях.

### Важное UX-решение

Обновление существующей 2D-проекции должно выполняться явным пользовательским действием, чтобы изменение 3D-модели сохраняло подготовленный преподавателем чертёж до подтверждения обновления.

---

## TB-133 — 3D measurement toolkit

**Приоритет:** P1/P2

Добавить инструменты измерения:

- длина ребра;
- расстояние между точками;
- угол между прямыми;
- угол между прямой и плоскостью;
- угол между плоскостями;
- площадь грани;
- площадь сечения;
- периметр сечения.

### Режим отображения

```text
точное значение
≈
численное значение
```

при наличии математически точного результата.

---

## TB-134 — Stereo problem presets

**Приоритет:** P2

Создать библиотеку типовых школьных моделей:

- куб;
- прямоугольный параллелепипед;
- правильная треугольная призма;
- правильная четырёхугольная призма;
- правильная треугольная пирамида;
- правильная четырёхугольная пирамида;
- тетраэдр;
- цилиндр;
- конус;
- сфера.

Для каждой модели предоставить типовые сценарии сечений.

---

# 8. EPIC D — GeometryOS Interactive Editing

**Приоритет:** P1  
**Цель:** перейти от генерации построения к управлению существующей математической сценой.

---

## TB-140 — Geometry modification command model

**Предлагаемый PR:** `#117`  
**Приоритет:** P1

### Целевая схема

```text
natural language
↓
intent
↓
geometry mutation plan
↓
GeometryOS
↓
validated semantic result
↓
Board command
```

### Начальные команды

- провести высоту из A;
- построить медиану;
- построить биссектрису;
- отметить середину AB;
- провести параллельную прямую;
- провести перпендикуляр;
- построить окружность с центром O;
- построить вписанную окружность;
- построить описанную окружность;
- построить касательную.

---

## TB-141 — Context-aware text commands

**Приоритет:** P1

GeometryOS prompt должен получать контекст выбранной конструкции.

Пример:

```text
[выделен треугольник ABC]

"Проведи высоту из B"
```

Система должна разрешить ссылку `B` относительно выбранного semantic geometry group.

### Acceptance criteria

Команда модифицирует выбранное построение атомарно и сохраняет provenance.

---

## TB-142 — Geometry command preview

**Приоритет:** P2

Перед сложной модификацией можно показывать transient preview.

Использовать прежде всего для неоднозначных операций.

Пример:

```text
"построй окружность через эту точку"
```

Если математическая постановка имеет несколько решений, интерфейс должен показать варианты.

---

# 9. EPIC E — Coordinate Mathematics Laboratory

**Приоритет:** P2  
**Цель:** расширить координатную плоскость до полноценного математического исследовательского инструмента.

---

## TB-150 — Unified mathematical expression input

**Предлагаемый PR:** `#118`  
**Приоритет:** P2

### Цель

Пользователь вводит целое выражение.

Примеры:

```text
y = x^2 - 4x + 3

x^2 + y^2 = 25

y >= 2x - 3

(x - 2)^2 + (y + 1)^2 <= 9
```

### Требуется поддержать

- explicit functions;
- equations;
- inequalities;
- implicit curves;
- closed regions.

---

## TB-151 — Multiple expressions

**Приоритет:** P2

Добавить список выражений:

```text
1. y = x²
2. y = 2x + 3
3. x² + y² = 16
```

Для каждого:

- visibility;
- style;
- remove;
- reorder;
- edit.

---

## TB-152 — Graphical inequalities and regions

**Предлагаемый PR:** `#119`  
**Приоритет:** P2

### Требования

- `<` и `>` → dashed boundary;
- `<=` и `>=` → solid boundary;
- корректная заливка области;
- intersection нескольких условий;
- bounded rendering;
- clipping;
- deterministic export.

---

## TB-153 — Function investigation mode

**Приоритет:** P2

Для поддерживаемых функций автоматически определять и отображать:

- нули;
- промежутки знакопостоянства;
- экстремумы;
- интервалы возрастания;
- интервалы убывания;
- точки пересечения;
- асимптоты;
- касательные в выбранной точке.

---

## TB-154 — Interactive solution tools

**Приоритет:** P2

Добавить действия:

- найти пересечение;
- найти корни;
- определить координаты точки;
- провести касательную;
- определить значение функции;
- показать решение неравенства;
- измерить расстояние.

---

# 10. EPIC F — Lesson Intelligence

**Приоритет:** P2  
**Цель:** превратить TutorBoard в источник структурированных данных об учебной деятельности.

---

## TB-160 — Lesson event model

**Предлагаемый PR:** `#120`  
**Приоритет:** P2

### События

Ввести педагогически значимые события:

```text
student.object.created
student.object.deleted
student.object.moved
student.answer.corrected
student.undo.used
student.hint.requested
student.construction.completed
student.geometry.command.used
student.smart_ink.corrected
student.graph.created
student.section.created
```

### Требования

Событие должно содержать:

- lesson ID;
- actor;
- timestamp;
- relevant object IDs;
- semantic metadata;
- correlation ID.

---

## TB-161 — Board activity timeline

**Приоритет:** P2

Создать timeline урока.

Пример:

```text
17:05 построен треугольник
17:07 проведена высота
17:09 удалена ошибочная линия
17:10 использован undo
17:12 построено правильное решение
```

---

## TB-162 — Lesson replay

**Приоритет:** P2/P3

Восстанавливать изменение доски во времени.

Режимы:

- play;
- pause;
- scrub timeline;
- jump to event.

---

## TB-163 — Competency evidence export

**Приоритет:** P2

Экспортировать данные TutorBoard в Lesson Evidence Bundle.

Цель:

```text
transcript
+
board timeline
+
student actions
+
geometry semantics
+
teacher notes
↓
competency analysis
```

---

# 11. EPIC G — UX and Teacher Productivity

**Приоритет:** P2

---

## TB-170 — Contextual object actions

По клику/ПКМ на математический объект показывать релевантные действия.

Пример для вершины:

```text
Провести высоту
Провести медиану
Провести биссектрису
Построить окружность
```

Для отрезка:

```text
Найти середину
Провести перпендикуляр
Продлить
Измерить длину
```

---

## TB-171 — Command palette

Добавить глобальную палитру команд.

Пример запуска:

```text
Ctrl + K
```

Команды:

- очистить доску;
- экспортировать PDF;
- построить график;
- открыть 3D;
- включить Smart Ink;
- выполнить текстовое построение;
- открыть настройки.

---

## TB-172 — Teacher presentation mode

Режим для демонстрации ученику:

- крупнее основные элементы;
- минимизированные панели;
- скрытые технические controls;
- быстрый laser pointer;
- удобное переключение между board/graph/3D.

---

# 12. EPIC H — Performance and Scale

**Приоритет:** постоянный.

---

## TB-180 — Large document performance

Проверять:

- 5 000 objects;
- 10 000 objects;
- большое количество pen strokes;
- несколько coordinate plots;
- изображения;
- semantic constructions.

### Метрики

- initial render;
- zoom/pan FPS;
- selection latency;
- autosave duration;
- serialization duration;
- memory use.

---

## TB-181 — 3D resource performance

Benchmarks:

- repeated model replacement;
- complex prism with 32-sided base;
- multiple section previews;
- analytic surfaces;
- resize;
- rotation;
- hover highlighting.

---

## TB-182 — Bundle review

Контролировать:

- initial JS bundle;
- lazy 3D bundle;
- Three.js loading;
- PDF export dependencies;
- GeometryOS adapter;
- optional features.

---

# 13. EPIC I — Accessibility

**Приоритет:** постоянный.

### Требования

- keyboard navigation;
- visible focus;
- screen-reader names;
- dialog focus management;
- reduced motion;
- accessible fallback для WebGL;
- textual representation 3D;
- accessible graph descriptions;
- shortcuts help.

Особое внимание уделять новым 3D и mathematical laboratory workflows.

---

# 14. EPIC J — Security and Production Hardening

**Приоритет:** постоянный.

### Проверять

- SVG sanitization;
- imported files;
- server sync validation;
- command validation;
- BoardDocument validation;
- same-origin API restrictions;
- CSRF lifecycle;
- WebSocket authorization;
- bounded parser inputs;
- formula recognition gateway;
- GeometryOS payload limits;
- dependencies через `npm audit`;
- production image через Trivy.

---

# 15. Рекомендуемая очередь ближайших PR

## Release train A — Stabilization

```text
#110  WebGL lifecycle hardening
#111  Documentation / BoardDocument alignment
#112  Unified durability smoke
```

Результат:

> устойчивый baseline текущего TutorBoard.

---

## Release train B — Smart Ink 2

```text
#113  Recognizer arbitration
#114  Arrow hardening
#115  Extended geometric vocabulary
#116  Corpus v2 and calibration
```

Результат:

> Smart Ink становится полноценным геометрическим инструментом.

---

## Release train C — 3D Geometry Lab

```text
#117  Section UX
#118  Advanced constraints
#119  Persistent 3D ↔ 2D linkage
#120  Measurement toolkit
```

Результат:

> интерактивная лаборатория школьной стереометрии.

---

## Release train D — GeometryOS Interaction

```text
#121  Geometry mutation contract
#122  Context-aware commands
#123  Geometry modification UX
```

Результат:

> текстовое управление существующими построениями.

---

## Release train E — Coordinate Lab

```text
#124  Unified expression input
#125  Multiple expressions
#126  Inequalities and regions
#127  Function investigation
```

Результат:

> полноценная координатная математическая лаборатория.

---

## Release train F — Lesson Intelligence

```text
#128  Lesson event model
#129  Activity timeline
#130  Evidence export
#131  Replay
```

Результат:

> действия ученика на доске становятся частью аналитики урока.

---

# 16. Приоритет ближайшего цикла

На момент составления документа рекомендуется следующий порядок.

## P0

### 1. WebGL lifecycle hardening

Причина:

3D-подсистема недавно получила большое количество изменений, поэтому renderer lifecycle следует стабилизировать до следующего расширения функциональности.

### 2. Documentation alignment

Причина:

архитектурные документы должны снова стать надёжным источником истины.

### 3. Unified durability smoke

Причина:

TutorBoard уже содержит локальное хранение, server sync, collaboration, 3D и сложные semantic objects. Требуется единый интеграционный regression scenario.

---

## P1

### 4. Smart Ink arbitration

Позволяет строить дальнейшие recognizer'ы на устойчивом общем механизме.

### 5. 3D section UX

Даёт высокую образовательную ценность поверх уже существующего математического ядра.

### 6. Advanced section constraints

Расширяет TutorBoard в сторону реальных задач школьной стереометрии.

### 7. GeometryOS mutation commands

Создаёт фундамент для естественно-языкового управления доской.

---

## P2

- Coordinate Lab;
- function investigation;
- lesson event model;
- activity timeline;
- evidence integration;
- presentation mode;
- competency analytics.

---

# 17. Что пока следует отложить

Следующие направления разумно запускать после стабилизации P0/P1:

- сложные AI-agent workflows внутри TutorBoard;
- автоматическое доказательство геометрических утверждений;
- генерация учебных задач непосредственно доской;
- полноценный CAS внутри frontend;
- большое количество новых 3D-тел без учебных сценариев;
- сложные физические симуляции;
- plugin architecture для сторонних разработчиков;
- публичный marketplace инструментов.

Эти направления способны существенно увеличить complexity cost до завершения основного образовательного ядра.

---

# 18. Целевое состояние после выполнения backlog

TutorBoard должен обеспечивать следующий полный workflow:

```text
Урок
  ↓
ручное рисование / Smart Ink
  ↓
структурные математические объекты
  ↓
GeometryOS
  ↓
2D / графики / 3D
  ↓
интерактивное исследование
  ↓
совместная работа
  ↓
сохранение и синхронизация
  ↓
Lesson Evidence
  ↓
анализ действий ученика
  ↓
материалы после урока
```

В целевом состоянии TutorBoard представляет собой единую интерактивную математическую среду преподавателя и ученика, объединяющую свободную доску, семантическую геометрию, графики, стереометрию и данные образовательного процесса.

---

# 19. Следующая рекомендуемая задача

Первой задачей этого backlog рекомендуется выполнить:

**TB-110 — 3D viewport lifecycle hardening.**

После её завершения:

```text
TB-111
→ TB-112
→ Smart Ink 2 / 3D Geometry Lab
```

Это создаёт устойчивую основу для следующего крупного функционального цикла TutorBoard.
