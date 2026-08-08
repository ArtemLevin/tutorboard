import type { SolidReasoningStep } from "./types";

export interface ProofRule {
  readonly id: string;
  readonly title: string;
  readonly minimumPremises: number;
  readonly template: string;
}

export const solidProofRules: readonly ProofRule[] = [
  {
    id: "same-face",
    minimumPremises: 2,
    title: "Принадлежность одной грани",
    template:
      "Две точки принадлежат одной грани, поэтому соединяющий их отрезок лежит в этой грани.",
  },
  {
    id: "plane-intersection",
    minimumPremises: 2,
    title: "Пересечение плоскостей",
    template:
      "Две плоскости пересекаются по прямой, проходящей через их общие точки.",
  },
  {
    id: "parallel-faces",
    minimumPremises: 2,
    title: "Параллельные грани",
    template: "Следы одной плоскости в параллельных гранях параллельны.",
  },
  {
    id: "similarity",
    minimumPremises: 2,
    title: "Подобие",
    template: "Соответствующие углы равны, поэтому треугольники подобны.",
  },
  {
    id: "pythagoras",
    minimumPremises: 2,
    title: "Теорема Пифагора",
    template:
      "В прямоугольном треугольнике квадрат гипотенузы равен сумме квадратов катетов.",
  },
];

export function validateReasoningStep(
  step: SolidReasoningStep,
  establishedStatementIds: ReadonlySet<string>,
): { readonly accepted: boolean; readonly message: string } {
  const rule = solidProofRules.find(({ id }) => id === step.ruleId);
  if (rule === undefined)
    return { accepted: false, message: "Выбрано неизвестное правило." };
  if (step.premiseIds.length < rule.minimumPremises)
    return {
      accepted: false,
      message: `Для правила «${rule.title}» требуется предпосылок: ${String(rule.minimumPremises)}.`,
    };
  if (step.premiseIds.some((id) => !establishedStatementIds.has(id)))
    return {
      accepted: false,
      message: "Сначала обоснуйте все используемые утверждения.",
    };
  return { accepted: true, message: rule.template };
}

export function renderRussianProof(
  steps: readonly SolidReasoningStep[],
): string {
  return steps
    .filter(({ accepted }) => accepted)
    .map((step, index) => {
      const rule = solidProofRules.find(({ id }) => id === step.ruleId);
      return `${String(index + 1)}. ${rule?.template ?? step.statementId}`;
    })
    .join("\n");
}
