import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  HandwrittenFunctionInterpretation,
  HandwrittenFunctionSessionState,
} from "../modules/handwritten-function/public";
import { handwrittenFunctionInterpretationSchemaVersion } from "../modules/handwritten-function/public";
import { HandwrittenFunctionPanel } from "./HandwrittenFunctionPanel";

const collecting: HandwrittenFunctionSessionState = {
  activeStroke: null,
  kind: "collecting",
  sessionId: "session:test",
  startedAtMs: 10,
  strokes: [
    {
      id: "stroke:test",
      points: [
        { timeMs: 10, x: 1, y: 1 },
        { timeMs: 20, x: 2, y: 2 },
      ],
    },
  ],
  updatedAtMs: 20,
};

const interpretation: HandwrittenFunctionInterpretation = {
  candidates: [
    {
      candidateIndex: 0,
      confidence: 0.91,
      expression: "a*x^2+b",
      normalizedExpression: "a*x^2+b",
      parameters: ["a", "b"],
      sourceExpression: "a*x^2+b",
      sourceFormat: "plot-expression",
    },
    {
      candidateIndex: 1,
      confidence: 0.87,
      expression: "a*x^3+b",
      normalizedExpression: "a*x^3+b",
      parameters: ["a", "b"],
      sourceExpression: "a*x^3+b",
      sourceFormat: "plot-expression",
    },
  ],
  diagnostics: [],
  schemaVersion: handwrittenFunctionInterpretationSchemaVersion,
  selected: null,
  status: "ambiguous",
};

function renderPanel(
  overrides: Partial<React.ComponentProps<typeof HandwrittenFunctionPanel>> = {},
) {
  const props: React.ComponentProps<typeof HandwrittenFunctionPanel> = {
    canBuild: true,
    canRecognize: true,
    diagnostic: null,
    draftCandidate: interpretation.candidates[0]!,
    draftExpression: "a*x^2+b",
    draftIssue: null,
    interpretation,
    onBuild: vi.fn(),
    onCandidateSelect: vi.fn(),
    onClear: vi.fn(),
    onDraftChange: vi.fn(),
    onKeepInk: vi.fn(),
    onRecognize: vi.fn(),
    recognizerAvailable: true,
    session: collecting,
    sourcePersisted: false,
    ...overrides,
  };
  render(<HandwrittenFunctionPanel {...props} />);
  return props;
}

afterEach(cleanup);

describe("HandwrittenFunctionPanel", () => {
  it("shows collecting state, candidates and parameters", () => {
    renderPanel();

    expect(
      screen.getByRole("complementary", { name: "Рукописная функция" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Штрихов: 1")).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: "Варианты распознавания" }),
    ).toBeInTheDocument();
    expect(screen.getByText("a, b")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Построить график" }),
    ).toBeEnabled();
  });

  it("routes candidate selection and edited expression input", () => {
    const props = renderPanel();

    fireEvent.click(screen.getByRole("button", { name: /a\*x\^3\+b/ }));
    expect(props.onCandidateSelect).toHaveBeenCalledWith("a*x^3+b");

    fireEvent.change(screen.getByRole("textbox", { name: "Функция y =" }), {
      target: { value: "x^2-1" },
    });
    expect(props.onDraftChange).toHaveBeenCalledWith("x^2-1");
  });

  it("supports manual entry when a recognizer is unavailable", () => {
    renderPanel({
      draftCandidate: null,
      draftExpression: "",
      interpretation: null,
      recognizerAvailable: false,
    });

    expect(
      screen.getByText(/Автоматический распознаватель пока не подключён/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Сохранить штрихи" }),
    ).toBeEnabled();
  });

  it("blocks build for invalid drafts and reports the issue", () => {
    renderPanel({
      canBuild: false,
      draftCandidate: null,
      draftIssue: "Выражение содержит ошибку.",
    });

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Выражение содержит ошибку.",
    );
    expect(
      screen.getByRole("button", { name: "Построить график" }),
    ).toBeDisabled();
  });

  it("locks recognition controls while an operation is running", () => {
    renderPanel({
      session: {
        bounds: {
          height: 1,
          maxX: 2,
          maxY: 2,
          minX: 1,
          minY: 1,
          width: 1,
        },
        kind: "recognizing",
        recognitionId: "recognition:test",
        sessionId: "session:test",
        startedAtMs: 10,
        strokes: collecting.strokes,
        updatedAtMs: 20,
      },
    });

    expect(
      screen.getByRole("button", { name: "Распознавание…" }),
    ).toBeDisabled();
    expect(screen.getByRole("textbox", { name: "Функция y =" })).toBeDisabled();
  });
});
