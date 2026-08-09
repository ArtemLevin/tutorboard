import { useMemo, useState, type ReactElement } from "react";

import {
  solidEditableParameters,
  updateSolidParameter,
  validateSolid3DRecord,
  type Solid3DRecord,
  type SolidEditableParameter,
} from "../../core/public";
import { Solid3DConstructionEditor } from "./Solid3DConstructionEditor";
import { Solid3DOrientationEditor } from "./Solid3DOrientationEditor";
import "./Solid3DParameterEditor.css";

export interface Solid3DParameterEditorProps {
  readonly onRecordChange: (replacement: Solid3DRecord) => void;
  readonly readOnly: boolean;
  readonly record: Solid3DRecord;
}

function displayValue(value: number): string {
  return Number(value.toPrecision(10)).toString();
}

export function Solid3DParameterEditor({
  onRecordChange,
  readOnly,
  record,
}: Solid3DParameterEditorProps): ReactElement {
  const [error, setError] = useState<string | null>(null);
  const parameters = useMemo(
    () => solidEditableParameters(record.definition),
    [record.definition],
  );

  const commit = (
    descriptor: SolidEditableParameter,
    input: HTMLInputElement,
  ): void => {
    const value = Number(input.value);
    const replacement = updateSolidParameter(record, descriptor.key, value);
    if (replacement === null) {
      input.value = displayValue(descriptor.value);
      setError("Введите положительный допустимый размер.");
      return;
    }
    const diagnostics = validateSolid3DRecord(replacement);
    if (diagnostics.length > 0) {
      input.value = displayValue(descriptor.value);
      setError("Изменение нарушает геометрические ограничения тела.");
      return;
    }
    setError(null);
    onRecordChange(replacement);
  };

  return (
    <>
      <Solid3DConstructionEditor
        onRecordChange={onRecordChange}
        readOnly={readOnly}
        record={record}
      />
      <Solid3DOrientationEditor
        onRecordChange={onRecordChange}
        readOnly={readOnly}
        record={record}
      />
      <section
        aria-labelledby="solid-3d-parameters-title"
        className="solid-3d-parameters"
      >
        <h3 id="solid-3d-parameters-title">Размеры</h3>
        <div className="solid-3d-parameter-grid">
          {parameters.map((descriptor) => (
            <label key={`${descriptor.key}:${displayValue(descriptor.value)}`}>
              <span>{descriptor.label}</span>
              <input
                aria-label={descriptor.label}
                defaultValue={displayValue(descriptor.value)}
                disabled={readOnly}
                max={descriptor.max}
                min={descriptor.min}
                onBlur={(event) => commit(descriptor, event.currentTarget)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") event.currentTarget.blur();
                  if (event.key === "Escape") {
                    event.currentTarget.value = displayValue(descriptor.value);
                    setError(null);
                    event.currentTarget.blur();
                  }
                }}
                step={descriptor.step}
                type="number"
              />
            </label>
          ))}
        </div>
        <p className="solid-3d-parameter-help">
          Enter или переход к другому полю применяет размер одной операцией
          отмены.
        </p>
        {error === null ? null : (
          <p className="solid-3d-error" role="alert">
            {error}
          </p>
        )}
      </section>
    </>
  );
}
