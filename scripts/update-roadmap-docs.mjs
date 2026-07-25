import fs from "node:fs";

function replaceSection(filePath, startMarker, endMarker, replacement) {
  const source = fs.readFileSync(filePath, "utf8");
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  if (start < 0 || end < 0) {
    throw new Error(`Unable to locate section markers in ${filePath}.`);
  }
  fs.writeFileSync(
    filePath,
    `${source.slice(0, start)}${replacement.trimEnd()}\n\n${source.slice(end)}`,
  );
}

function replaceExact(filePath, before, after) {
  const source = fs.readFileSync(filePath, "utf8");
  const occurrences = source.split(before).length - 1;
  if (occurrences !== 1) {
    throw new Error(
      `Expected exactly one occurrence in ${filePath}, received ${occurrences}.`,
    );
  }
  fs.writeFileSync(filePath, source.replace(before, after));
}

const planStatus = `## 2. Текущее состояние и ближайшая последовательность

### 2.1. Доставленный baseline

TutorBoard завершил основную инфраструктурную часть Technical Spike:

| Этап | Статус | Доставленный результат |
|---|---|---|
| PR 2.0 | завершён | architecture contract, invariant registry и project skills |
| Gate 0 | завершён | проверены API v1, GIR \`0.2.0\`, fixtures, Problem Details, request ID и probes GeometryOS |
| PR 2.1 | завершён | React/Vite/strict TypeScript foundation и enforceable module boundaries |
| PR 2.2 | завершён | \`BoardDocument\`, commands, reducer, validation, serialization и recovery contract |
| PR 2.3 | завершён | заменяемый Konva adapter, infinite canvas, pan/zoom и coordinate boundary |
| PR 2.4 | завершён | pen, line, rectangle, ellipse и text tools |
| PR 2.5 | завершён | selection, marquee, movement, delete, lock и inspector |
| PR 2.6 | завершён | Dexie revisions, autosave, optimistic conflict и explicit recovery |
| PR 2.7 | завершён | bounded deny-by-default SVG import и stored-object revalidation |
| PR 2.8 | завершён | pinned/generated GeometryOS client, runtime validators и bounded HTTP adapter |
| PR 2.8.1 | смёржен | producer repin на \`49e98394d0c9cdeaf7fdaf45b712dbee3a04a74c\`, новый OpenAPI/fixtures и live-contract job |

Текущий stored contract — \`BoardDocument 0.2\`. Canvas runtime, selection,
preview и transport state не сериализуются. Canonical GIR хранится отдельно от
Board objects и не восстанавливается из SVG или пользовательских transforms.

### 2.2. Подтверждённые блокеры

1. **Live GeometryOS gate ещё не зелёный.** В финальном pull-request run PR 2.8.1
   обычные Quality gate и Browser smoke прошли, но новый job
   \`GeometryOS live browser contract\` завершился ошибкой. До зелёного запуска
   нельзя считать доказанным реальный browser flow CORS/request correlation.
2. **GeometryOS не публикует Layout Document 0.1.** API v1 возвращает canonical
   GIR и SVG/TikZ, но не версионированные координаты с provenance. SVG не может
   использоваться как semantic source согласно \`GEO-009\`.
3. **GeometryOS client ещё не скомпонован с UI.** HTTP adapter существует, но
   prompt flow, clarification UI, retry identity и atomic import появятся только
   в следующих PR.
4. **Общий vertical slice не закрыт.** Цепочка
   \`text → GIR → Layout Document → BoardDocument → canvas\` пока не доказана.

### 2.3. Обязательный execution order

#### TutorBoard PR 2.8.2 — восстановить зелёный live-contract gate

Scope:

- воспроизвести и исправить причину падения pinned-container smoke;
- сохранить exact producer commit и default-deny CORS policy;
- проверить allowed preflight, denied origin, отсутствие credentials,
  browser-visible \`X-Request-ID\` и runtime validation ответа;
- не менять BoardDocument, canvas, UI и geometry import contracts.

Exit criteria:

- Quality gate, Browser smoke и GeometryOS live browser contract зелёные;
- diagnostics не содержат prompt, response body или credentials;
- normal CI не обращается к mutable GeometryOS branch.

#### GeometryOS G-10 — чистый Layout Document 0.1

Выполняется в репозитории GeometryOS и является внешней зависимостью TutorBoard.
Нужны versioned coordinate space, canonical GIR SHA-256, provenance, stable
synthetic IDs, completeness/reference invariants, typed \`success\` /
\`unsupported\` / \`invalid_scene\`, schema, fixtures и exact benchmarks.

G-10 не включает HTTP endpoint и не меняет GIR \`0.2.0\`.

#### TutorBoard PR 2.9A — pure GIR semantic adapter

Может выполняться параллельно с GeometryOS G-10 после зелёного PR 2.8.2.

Scope:

- runtime GIR validation boundary;
- entity index и reference resolver;
- stable Board IDs и deterministic root group ID;
- mapping GIR ID → Board object ID;
- provenance и explicit unsupported diagnostics;
- pure \`GeometryImportSemanticPlan\` без React, HTTP, persistence и coordinates.

Enforcement: \`GEO-003\`–\`GEO-010\`, architecture tests и deterministic fixtures.

#### GeometryOS G-11 — HTTP Layout API

Предпочтительный контракт: \`POST /api/v1/layout\` для уже существующего canonical
GIR. Endpoint должен публиковать Layout Document 0.1, typed unsupported/invalid
outcomes, request ID, readiness, timeout budget, OpenAPI и TutorBoard fixtures.

#### TutorBoard PR 2.9B — Layout-to-Board и атомарный import

Scope:

- vendored/generated Layout Document types и runtime validator;
- Layout coordinates → local geometry group coordinates;
- geometry object renderers и bounds;
- один namespaced atomic import command;
- import record, group, objects, order, mapping и provenance добавляются целиком
  либо document остаётся неизменным;
- migration только если stored union действительно меняется.

#### TutorBoard PR 2.10 — полный GeometryOS vertical slice

Prompt → readiness → generate → layout → import → select → move → autosave →
reload. Обязательный fixture: «Построй треугольник ABC и высоту AH».

#### TutorBoard PR 2.11 — visual versus mathematical movement

Разрешить group translation, label offsets и style overrides. Individual drag
constrained geometry points остаётся запрещённым до отдельного semantic edit
contract. Visual operations не изменяют canonical GIR.

#### TutorBoard PR 2.12 — закрытие Technical Spike

Подготовить Phase 2 report, coordinate/mapping/change-classification ADRs,
зафиксировать временные ограничения и сформировать Phase 3 backlog.

#### GeometryOS G-13 — release 0.3.0

После стабилизации Layout API выпустить GeometryOS \`0.3.0\`, включив layout
schema/fixtures в release bundle и опубликовав consumer upgrade guide.

### 2.4. Правила параллельной разработки

- PR 2.8.2 блокирует live UI integration, но не чистую документацию и анализ.
- TutorBoard PR 2.9A может идти параллельно с GeometryOS G-10, поскольку не
  владеет coordinates и не вызывает HTTP.
- PR 2.9B начинается только после принятия G-10 и опубликованного G-11 contract.
- PR 2.10 начинается только после зелёных 2.9A, G-11 и 2.9B.
- TutorBoard не создаёт общий layout solver и не парсит SVG ради семантики.
- GeometryOS не хранит BoardDocument, viewport или пользовательские overrides.

### 2.5. Следующие продуктовые фазы

После PR 2.12 выполняется Phase 3 Product Foundation:

1. contract freeze и \`BoardDocument 1.0\`;
2. undo/redo с одним history item на gesture/import;
3. clipboard и deterministic ID remapping;
4. layers/object manager;
5. styling и visual overrides;
6. text/math labels;
7. deterministic document import/export;
8. performance baseline и viewport culling;
9. accessibility baseline;
10. product shell, diagnostics и feature flags.

Дальнейший порядок: tutor-assistant-web gateway integration → server revisions и
offline synchronization → collaboration protocol → lesson evidence → production
readiness → advanced semantic geometry/AI. CRDT, semantic point drag и
production direct-browser access к GeometryOS не выбираются заранее.

### 2.6. No-go gates

Запрещено объявлять Technical Spike завершённым, пока:

- live GeometryOS browser contract не зелёный;
- Layout Document не versioned и runtime-validated;
- import не атомарен;
- canonical GIR/provenance не переживают save/reload;
- visual movement policy не зафиксирована;
- обязательный triangle-altitude E2E не проходит через реальный BoardDocument.
`;

replaceSection(
  "PLAN.md",
  "## 2. Текущее состояние и ближайшая последовательность",
  "## 3. Целевая архитектура",
  planStatus,
);

replaceExact(
  "README.md",
  `текстовый запрос
    ↓
TutorBoard
    ↓ HTTP API v1
GeometryOS
    ↓
канонический GIR
    ↓
GIR → Board adapter
    ↓
интерактивные объекты на полотне`,
  `текстовый запрос
    ↓
TutorBoard
    ↓ HTTP API v1
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
интерактивные объекты на полотне`,
);

const readmeStatus = `## Статус

| Компонент | Текущее состояние | Ближайшая поставка |
|---|---|---|
| GeometryOS | API v1/GIR \`0.2.0\`, OpenAPI, Problem Details и TutorBoard fixtures стабильны; machine-readable Layout Document отсутствует | G-10 Layout Document 0.1, затем G-11 \`POST /api/v1/layout\` |
| TutorBoard | \`BoardDocument 0.2\`, infinite canvas, tools, selection, Dexie recovery, safe SVG и pinned GeometryOS client доставлены | PR 2.8.2 live gate repair, затем PR 2.9A semantic adapter |
| tutor-assistant-web | Серверная платформа пользователей, занятий, BBB, evidence, материалов и production-операций | Поздняя Phase 4 integration через gateway |
| tutor-assistant | Desktop recording/transcription application | Lesson evidence integration на поздних фазах |
| students-26-27 | Репозиторий учебных страниц и опубликованных файлов | Consumer lesson artifacts |
| Latexed / DocumentEngine | Проверка, компиляция и экспорт TEX/PDF/HTML | Post-lesson material pipeline |

### Что уже работает в TutorBoard

- infinite canvas, pan, pointer-centred zoom и adaptive grid;
- pen, line, rectangle, ellipse и text;
- click/Shift/marquee selection, movement, lock и delete;
- versioned \`BoardDocument 0.2\` и command-only mutation boundary;
- append-only Dexie revisions, autosave, optimistic conflict и recovery;
- bounded deny-by-default SVG import;
- pinned OpenAPI/GIR/fixture artifacts и generated runtime validation;
- bounded GeometryOS HTTP adapter с typed results и request correlation.

PR 2.8.1 смёржен и закрепил GeometryOS commit
\`49e98394d0c9cdeaf7fdaf45b712dbee3a04a74c\`. При этом последний PR-run
показал незакрытый integration gate: Quality gate и обычный Browser smoke
прошли, а \`GeometryOS live browser contract\` завершился ошибкой. Поэтому
реальный browser CORS/request-ID flow считается недоказанным до PR 2.8.2.

### Критический путь

\`TutorBoard 2.8.2 live gate\`
→ \`GeometryOS G-10 Layout Contract\`
→ \`TutorBoard 2.9A semantic adapter\`
→ \`GeometryOS G-11 Layout API\`
→ \`TutorBoard 2.9B atomic import\`
→ \`TutorBoard 2.10 vertical slice\`
→ \`TutorBoard 2.11 movement policy\`
→ \`TutorBoard 2.12 Phase 2 report\`.

PR 2.9 разделён намеренно:

- **2.9A** владеет pure GIR semantics, IDs, references, mapping и diagnostics;
- **2.9B** владеет Layout-to-Board placement, renderable geometry objects и
  атомарным document import;
- coordinates не вычисляются из SVG и не записываются обратно в canonical GIR.

### Следующие фазы

После Technical Spike: \`BoardDocument 1.0\`, undo/redo, clipboard, layers,
styling, math labels, deterministic import/export, performance, accessibility и
product shell. Затем TutorBoard подключается к tutor-assistant-web через gateway,
получает server revisions/offline synchronization, collaboration, lesson
evidence и production hardening. Advanced semantic drag и AI modifications
начинаются только после стабилизации этих контрактов.
`;

replaceSection("README.md", "## Статус", "## Зачем нужен TutorBoard", readmeStatus);

replaceExact(
  "README.md",
  "Пользователь вводит естественно-языковую команду. TutorBoard отправляет её в GeometryOS, получает GIR и создаёт собственные объекты доски.",
  "Пользователь вводит естественно-языковую команду. TutorBoard отправляет её в GeometryOS, получает canonical GIR, затем versioned Layout Document и только после runtime validation создаёт собственные объекты доски одной атомарной import-командой.",
);

replaceExact(
  "README.md",
  "- канонический layout;",
  "- версионированный initial layout с provenance;",
);

console.log("Updated PLAN.md and README.md with the joint TutorBoard/GeometryOS roadmap.");
