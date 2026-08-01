from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"Expected fragment not found: {label}")
    return text.replace(old, new, 1)


panel = Path("src/app/CoordinatePlotEditorPanel.tsx")
text = panel.read_text(encoding="utf-8")

text = replace_once(
    text,
    '''function fieldIssues(
  issues: readonly CoordinatePlotEditorIssue[],
  field: string,
): readonly CoordinatePlotEditorIssue[] {
  if (field === "") return issues;
  return issues.filter(
    (issue) => issue.field === field || issue.field.startsWith(`${field}.`),
  );
}''',
    '''function fieldIssues(
  issues: readonly CoordinatePlotEditorIssue[],
  field: string,
  includeDescendants = true,
): readonly CoordinatePlotEditorIssue[] {
  if (field === "") return issues;
  return issues.filter(
    (issue) =>
      issue.field === field ||
      (includeDescendants && issue.field.startsWith(`${field}.`)),
  );
}''',
    "field issue filtering",
)
text = replace_once(
    text,
    '''function IssueList({
  field,
  id,
  issues,
}: {
  readonly field: string;
  readonly id?: string;
  readonly issues: readonly CoordinatePlotEditorIssue[];
}): ReactElement | null {
  const relevant = fieldIssues(issues, field);''',
    '''function IssueList({
  field,
  id,
  includeDescendants = true,
  issues,
}: {
  readonly field: string;
  readonly id?: string;
  readonly includeDescendants?: boolean;
  readonly issues: readonly CoordinatePlotEditorIssue[];
}): ReactElement | null {
  const relevant = fieldIssues(issues, field, includeDescendants);''',
    "IssueList descendant control",
)
text = replace_once(
    text,
    '''function issueAttributes(
  issues: readonly CoordinatePlotEditorIssue[],
  field: string,
  issueId: string,
): {
  readonly "aria-describedby"?: string;
  readonly "aria-invalid"?: true;
} {
  return fieldIssues(issues, field).length === 0''',
    '''function issueAttributes(
  issues: readonly CoordinatePlotEditorIssue[],
  field: string,
  issueId: string,
  includeDescendants = true,
): {
  readonly "aria-describedby"?: string;
  readonly "aria-invalid"?: true;
} {
  return fieldIssues(issues, field, includeDescendants).length === 0''',
    "issue attribute descendant control",
)
text = replace_once(
    text,
    '''function ParameterEditor({
  definition,
  onChange,
  parameter,
}: {
  readonly definition: CoordinatePlotDefinition;
  readonly onChange: (definition: CoordinatePlotDefinition) => void;
  readonly parameter: PlotParameter;
}): ReactElement {
  const replace = (replacement: PlotParameter) =>''',
    '''function ParameterEditor({
  definition,
  issues,
  onChange,
  parameter,
}: {
  readonly definition: CoordinatePlotDefinition;
  readonly issues: readonly CoordinatePlotEditorIssue[];
  readonly onChange: (definition: CoordinatePlotDefinition) => void;
  readonly parameter: PlotParameter;
}): ReactElement {
  const index = definition.parameters.findIndex(({ id }) => id === parameter.id);
  const prefix = `parameters.${index}`;
  const nameIssueId = `plot-parameter-${index}-name-issues`;
  const rangeIssueId = `plot-parameter-${index}-range-issues`;
  const stepIssueId = `plot-parameter-${index}-step-issues`;
  const replace = (replacement: PlotParameter) =>''',
    "parameter editor diagnostics",
)
text = replace_once(
    text,
    '''          <input
            aria-label={`Имя параметра ${parameter.id}`}
            maxLength={32}''',
    '''          <input
            {...issueAttributes(
              issues,
              `${prefix}.name`,
              nameIssueId,
              false,
            )}
            aria-label={`Имя параметра ${parameter.id}`}
            maxLength={32}''',
    "parameter name ARIA",
)
text = replace_once(
    text,
    '''        <label>
          Min
          <input
            onChange={(event) =>''',
    '''        <label>
          Min
          <input
            {...issueAttributes(issues, prefix, rangeIssueId, false)}
            onChange={(event) =>''',
    "parameter minimum ARIA",
)
text = replace_once(
    text,
    '''        <label>
          Max
          <input
            onChange={(event) =>''',
    '''        <label>
          Max
          <input
            {...issueAttributes(issues, prefix, rangeIssueId, false)}
            onChange={(event) =>''',
    "parameter maximum ARIA",
)
text = replace_once(
    text,
    '''        <label>
          Шаг
          <input
            min="0"''',
    '''        <label>
          Шаг
          <input
            {...issueAttributes(
              issues,
              `${prefix}.step`,
              stepIssueId,
              false,
            )}
            min="0"''',
    "parameter step ARIA",
)
text = replace_once(
    text,
    '''      </div>
      {sliderAvailable ? (''',
    '''      </div>
      <IssueList
        field={`${prefix}.name`}
        id={nameIssueId}
        includeDescendants={false}
        issues={issues}
      />
      <IssueList
        field={prefix}
        id={rangeIssueId}
        includeDescendants={false}
        issues={issues}
      />
      <IssueList
        field={`${prefix}.step`}
        id={stepIssueId}
        includeDescendants={false}
        issues={issues}
      />
      {sliderAvailable ? (''',
    "parameter issue lists",
)
text = replace_once(
    text,
    '''                <ParameterEditor
                  definition={definition}
                  key={parameter.id}
                  onChange={onDefinitionChange}''',
    '''                <ParameterEditor
                  definition={definition}
                  issues={issues}
                  key={parameter.id}
                  onChange={onDefinitionChange}''',
    "parameter editor issue prop",
)
text = replace_once(
    text,
    '''            <IssueList field="parameters" issues={issues} />''',
    '''            <IssueList
              field="parameters"
              includeDescendants={false}
              issues={issues}
            />''',
    "parameter collection issues",
)
panel.write_text(text, encoding="utf-8")

tests = Path("src/app/CoordinatePlotEditorPanel.accessibility.test.tsx")
test_text = tests.read_text(encoding="utf-8")
test_text = replace_once(
    test_text,
    '''import {
  createDefaultCoordinatePlotObject,
  type CoordinatePlotEditorIssue,
} from "../modules/coordinate-plot-editor/public";''',
    '''import {
  createDefaultCoordinatePlotObject,
  validateCoordinatePlotEditorDefinition,
  type CoordinatePlotEditorIssue,
} from "../modules/coordinate-plot-editor/public";''',
    "validation import",
)
test_text = replace_once(
    test_text,
    '''function renderPanel({
  dirty = true,
  issues = [],''',
    '''function renderPanel({
  definition = createDefinition(),
  dirty = true,
  issues = [],''',
    "test definition default",
)
test_text = replace_once(
    test_text,
    '''}: {
  readonly dirty?: boolean;
  readonly issues?: readonly CoordinatePlotEditorIssue[];''',
    '''}: {
  readonly definition?: CoordinatePlotDefinition;
  readonly dirty?: boolean;
  readonly issues?: readonly CoordinatePlotEditorIssue[];''',
    "test definition type",
)
test_text = replace_once(
    test_text,
    '''    <CoordinatePlotEditorPanel
      definition={createDefinition()}''',
    '''    <CoordinatePlotEditorPanel
      definition={definition}''',
    "test definition prop",
)
marker = '''  it("protects a dirty draft and supports all close decisions", () => {'''
addition = '''  it("links parameter diagnostics to name, range and step fields", () => {
    const definition: CoordinatePlotDefinition = {
      ...createDefinition(),
      parameters: [
        {
          id: plotParameterId("invalid-parameter"),
          max: -1,
          min: 1,
          name: "1bad",
          step: 0,
          value: 1,
        },
      ],
    };
    renderPanel({
      definition,
      issues: validateCoordinatePlotEditorDefinition(definition),
    });

    const name = screen.getByLabelText("Имя параметра invalid-parameter");
    const minimum = screen.getByLabelText("Min");
    const maximum = screen.getByLabelText("Max");
    const step = screen.getByLabelText("Шаг");

    for (const field of [name, minimum, maximum, step]) {
      expect(field).toHaveAttribute("aria-invalid", "true");
      const issueId = field.getAttribute("aria-describedby");
      expect(issueId).toBeTruthy();
      expect(document.getElementById(issueId ?? "")).not.toBeNull();
    }
  });

'''
test_text = replace_once(test_text, marker, addition + marker, "parameter ARIA test")
tests.write_text(test_text, encoding="utf-8")
