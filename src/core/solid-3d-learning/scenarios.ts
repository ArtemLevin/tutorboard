import type { Solid3DDefinition, SolidPointAnchor } from "../solid-3d/public";

export interface LearningPredictionPrompt {
  readonly id: string;
  readonly label: string;
  readonly kind: "vertex-count" | "polygon-kind" | "edges" | "parallel-sides";
}
export interface LearningMeasurementTask {
  readonly id: string;
  readonly kind: "area" | "perimeter" | "length" | "angle";
  readonly label: string;
  readonly formulaIds: readonly string[];
  readonly unit: string;
  readonly tolerance: number;
}
export interface LearningQuizItem {
  readonly id: string;
  readonly prompt: string;
  readonly options: readonly string[];
  readonly correctOption: number;
}
export interface Solid3DLearningScenario {
  readonly id: string;
  readonly version: string;
  readonly title: string;
  readonly goal: string;
  readonly difficulty: "basic" | "intermediate" | "advanced";
  readonly expectedMinutes: number;
  readonly skill: string;
  readonly supportedSolidKinds: readonly Solid3DDefinition["kind"][];
  readonly seedAnchors: readonly SolidPointAnchor[];
  readonly predictionPrompts: readonly LearningPredictionPrompt[];
  readonly measurementTasks: readonly LearningMeasurementTask[];
  readonly hintLadders: Readonly<
    Record<string, readonly [string, string, string]>
  >;
  readonly followUpQuiz: readonly LearningQuizItem[];
}

const standardPrompts: readonly LearningPredictionPrompt[] = [
  {
    id: "vertex-count",
    kind: "vertex-count",
    label: "Сколько вершин будет у сечения?",
  },
  {
    id: "polygon-kind",
    kind: "polygon-kind",
    label: "Какой многоугольник получится?",
  },
  { id: "edges", kind: "edges", label: "Какие рёбра пересечёт плоскость?" },
];
const standardHints = {
  construction: [
    "Найдите грань, на которой уже лежат две точки.",
    "Подсветите грань и проверьте её граничные рёбра.",
    "Проведите след между двумя соседними точками этой грани.",
  ],
} as const;
const standardQuiz: readonly LearningQuizItem[] = [
  {
    id: "trace",
    prompt: "Что называют следом секущей плоскости на грани?",
    options: ["Линию пересечения плоскостей", "Любое ребро", "Диагональ тела"],
    correctOption: 0,
  },
  {
    id: "transition",
    prompt: "Через что построение переходит на соседнюю грань?",
    options: ["Через общее ребро", "Через центр тела", "Через любую вершину"],
    correctOption: 0,
  },
];
const areaTask: LearningMeasurementTask = {
  formulaIds: ["polygon-area", "triangulation"],
  id: "section-area",
  kind: "area",
  label: "Вычислите площадь сечения",
  tolerance: 0.01,
  unit: "ед²",
};

export const solidLearningScenarios: readonly Solid3DLearningScenario[] = [
  {
    id: "cube-three-vertices",
    version: "1.0",
    title: "Куб: три вершины",
    goal: "Предсказать и построить сечение через три вершины",
    difficulty: "basic",
    expectedMinutes: 8,
    skill: "construction",
    supportedSolidKinds: ["cube"],
    seedAnchors: [
      { kind: "vertex", vertexId: "vertex:0" },
      { kind: "vertex", vertexId: "vertex:2" },
      { kind: "vertex", vertexId: "vertex:5" },
    ],
    predictionPrompts: standardPrompts,
    measurementTasks: [],
    hintLadders: standardHints,
    followUpQuiz: standardQuiz,
  },
  {
    id: "cube-vertex-midpoints",
    version: "1.0",
    title: "Куб: вершина и середины",
    goal: "Перейти между гранями через середины рёбер",
    difficulty: "basic",
    expectedMinutes: 10,
    skill: "construction",
    supportedSolidKinds: ["cube"],
    seedAnchors: [
      { kind: "vertex", vertexId: "vertex:0" },
      { kind: "edge", edgeId: "edge:1:2", parameter: 0.5 },
      { kind: "edge", edgeId: "edge:4:5", parameter: 0.5 },
    ],
    predictionPrompts: standardPrompts,
    measurementTasks: [],
    hintLadders: standardHints,
    followUpQuiz: standardQuiz,
  },
  {
    id: "cube-hexagon",
    version: "1.0",
    title: "Куб: шестиугольное сечение",
    goal: "Исследовать сечение, пересекающее шесть рёбер",
    difficulty: "advanced",
    expectedMinutes: 15,
    skill: "spatial-prediction",
    supportedSolidKinds: ["cube"],
    seedAnchors: [
      { kind: "edge", edgeId: "edge:0:1", parameter: 0.5 },
      { kind: "edge", edgeId: "edge:2:3", parameter: 0.5 },
      { kind: "edge", edgeId: "edge:4:7", parameter: 0.5 },
    ],
    predictionPrompts: standardPrompts,
    measurementTasks: [],
    hintLadders: standardHints,
    followUpQuiz: standardQuiz,
  },
  {
    id: "cuboid-parallel-face",
    version: "1.0",
    title: "Параллелепипед: параллельно грани",
    goal: "Установить форму сечения, параллельного грани",
    difficulty: "basic",
    expectedMinutes: 8,
    skill: "parallelism",
    supportedSolidKinds: ["cuboid"],
    seedAnchors: [
      { kind: "edge", edgeId: "edge:0:4", parameter: 0.5 },
      { kind: "edge", edgeId: "edge:1:5", parameter: 0.5 },
      { kind: "edge", edgeId: "edge:2:6", parameter: 0.5 },
    ],
    predictionPrompts: standardPrompts,
    measurementTasks: [],
    hintLadders: standardHints,
    followUpQuiz: standardQuiz,
  },
  {
    id: "triangular-prism-side-edges",
    version: "1.0",
    title: "Призма: боковые рёбра",
    goal: "Построить сечение призмы по трём точкам",
    difficulty: "intermediate",
    expectedMinutes: 12,
    skill: "construction",
    supportedSolidKinds: ["prism"],
    seedAnchors: [
      { kind: "edge", edgeId: "edge:0:3", parameter: 0.3 },
      { kind: "edge", edgeId: "edge:1:4", parameter: 0.55 },
      { kind: "edge", edgeId: "edge:2:5", parameter: 0.75 },
    ],
    predictionPrompts: standardPrompts,
    measurementTasks: [],
    hintLadders: standardHints,
    followUpQuiz: standardQuiz,
  },
  {
    id: "square-pyramid-side-edges",
    version: "1.0",
    title: "Пирамида: боковые рёбра",
    goal: "Построить сечение четырёхугольной пирамиды",
    difficulty: "intermediate",
    expectedMinutes: 12,
    skill: "construction",
    supportedSolidKinds: ["pyramid"],
    seedAnchors: [
      { kind: "edge", edgeId: "edge:0:4", parameter: 0.4 },
      { kind: "edge", edgeId: "edge:1:4", parameter: 0.5 },
      { kind: "edge", edgeId: "edge:2:4", parameter: 0.6 },
    ],
    predictionPrompts: standardPrompts,
    measurementTasks: [],
    hintLadders: standardHints,
    followUpQuiz: standardQuiz,
  },
  {
    id: "tetrahedron-quadrilateral",
    version: "1.0",
    title: "Тетраэдр: четырёхугольник",
    goal: "Получить четырёхугольное сечение тетраэдра",
    difficulty: "advanced",
    expectedMinutes: 14,
    skill: "construction",
    supportedSolidKinds: ["tetrahedron"],
    seedAnchors: [
      { kind: "edge", edgeId: "edge:0:1", parameter: 0.5 },
      { kind: "edge", edgeId: "edge:0:2", parameter: 0.5 },
      { kind: "edge", edgeId: "edge:1:3", parameter: 0.5 },
    ],
    predictionPrompts: standardPrompts,
    measurementTasks: [],
    hintLadders: standardHints,
    followUpQuiz: standardQuiz,
  },
  {
    id: "cube-section-area",
    version: "1.0",
    title: "Куб: площадь сечения",
    goal: "Связать построение с вычислением площади",
    difficulty: "intermediate",
    expectedMinutes: 15,
    skill: "calculation",
    supportedSolidKinds: ["cube"],
    seedAnchors: [
      { kind: "vertex", vertexId: "vertex:0" },
      { kind: "vertex", vertexId: "vertex:2" },
      { kind: "vertex", vertexId: "vertex:5" },
    ],
    predictionPrompts: standardPrompts,
    measurementTasks: [areaTask],
    hintLadders: standardHints,
    followUpQuiz: standardQuiz,
  },
  {
    id: "cube-dynamic-section",
    version: "1.0",
    title: "Куб: движение точки",
    goal: "Найти изменяющиеся и сохраняющиеся свойства",
    difficulty: "advanced",
    expectedMinutes: 18,
    skill: "research",
    supportedSolidKinds: ["cube"],
    seedAnchors: [
      { kind: "edge", edgeId: "edge:0:1", parameter: 0.2 },
      { kind: "edge", edgeId: "edge:2:3", parameter: 0.5 },
      { kind: "edge", edgeId: "edge:4:7", parameter: 0.7 },
    ],
    predictionPrompts: standardPrompts,
    measurementTasks: [areaTask],
    hintLadders: standardHints,
    followUpQuiz: standardQuiz,
  },
  {
    id: "analytic-axial-section",
    version: "1.0",
    title: "Цилиндр и конус: осевое сечение",
    goal: "Исследовать осевое сечение тела вращения",
    difficulty: "intermediate",
    expectedMinutes: 10,
    skill: "research",
    supportedSolidKinds: ["cylinder", "cone"],
    seedAnchors: [],
    predictionPrompts: standardPrompts,
    measurementTasks: [areaTask],
    hintLadders: standardHints,
    followUpQuiz: standardQuiz,
  },
];

export function validateSolidLearningScenario(
  scenario: Solid3DLearningScenario,
): readonly string[] {
  const issues: string[] = [];
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(scenario.id))
    issues.push("scenario.id");
  if (scenario.supportedSolidKinds.length === 0)
    issues.push("scenario.supportedSolidKinds");
  if (scenario.predictionPrompts.length === 0)
    issues.push("scenario.predictionPrompts");
  if (scenario.followUpQuiz.length < 2) issues.push("scenario.followUpQuiz");
  return issues;
}

export function scenariosForSolidKind(
  kind: Solid3DDefinition["kind"],
): readonly Solid3DLearningScenario[] {
  return solidLearningScenarios.filter(({ supportedSolidKinds }) =>
    supportedSolidKinds.includes(kind),
  );
}
