import type { ReactElement } from "react";

import {
  identitySolid3DQuaternion,
  solid3DEulerDegreesFromQuaternion,
  solid3DModelQuaternion,
  withSolid3DModelEulerDegrees,
  withSolid3DModelQuaternion,
  type Solid3DRecord,
} from "../../core/public";
import "./Solid3DOrientationEditor.css";

export interface Solid3DOrientationEditorProps {
  readonly onRecordChange: (replacement: Solid3DRecord) => void;
  readonly readOnly: boolean;
  readonly record: Solid3DRecord;
}

type Axis = "x" | "y" | "z";

const roundAngle = (value: number): number => Math.round(value * 100) / 100;

export function Solid3DOrientationEditor({
  onRecordChange,
  readOnly,
  record,
}: Solid3DOrientationEditorProps): ReactElement {
  const current = solid3DEulerDegreesFromQuaternion(
    solid3DModelQuaternion(record.projection),
  );

  const commit = (axis: Axis, input: HTMLInputElement): void => {
    const value = Number(input.value.replace(",", "."));
    if (!Number.isFinite(value)) {
      input.value = String(roundAngle(current[axis]));
      return;
    }
    onRecordChange(
      withSolid3DModelEulerDegrees(record, { ...current, [axis]: value }),
    );
  };

  const rotate = (axis: Axis, delta: number): void => {
    onRecordChange(
      withSolid3DModelEulerDegrees(record, {
        ...current,
        [axis]: current[axis] + delta,
      }),
    );
  };

  return (
    <section
      aria-labelledby="solid-3d-orientation-title"
      className="solid-3d-orientation"
    >
      <div className="solid-3d-orientation-heading">
        <h3 id="solid-3d-orientation-title">Ориентация тела</h3>
        <button
          disabled={readOnly}
          onClick={() =>
            onRecordChange(
              withSolid3DModelQuaternion(record, identitySolid3DQuaternion),
            )
          }
          type="button"
        >
          Сбросить
        </button>
      </div>
      <p>
        Поворот сохраняется вместе с моделью и не зависит от положения камеры.
      </p>
      <div className="solid-3d-orientation-grid">
        {(["x", "y", "z"] as const).map((axis) => (
          <div className="solid-3d-orientation-axis" key={axis}>
            <label>
              <span>{axis.toUpperCase()}°</span>
              <input
                aria-label={`Поворот ${axis.toUpperCase()}`}
                defaultValue={String(roundAngle(current[axis]))}
                disabled={readOnly}
                inputMode="decimal"
                key={`${axis}:${String(roundAngle(current[axis]))}`}
                onBlur={(event) => commit(axis, event.currentTarget)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") event.currentTarget.blur();
                  if (event.key === "Escape") {
                    event.currentTarget.value = String(roundAngle(current[axis]));
                    event.currentTarget.blur();
                  }
                }}
                type="text"
              />
            </label>
            <div className="solid-3d-orientation-nudges">
              <button
                disabled={readOnly}
                onClick={() => rotate(axis, -15)}
                type="button"
              >
                −15°
              </button>
              <button
                disabled={readOnly}
                onClick={() => rotate(axis, 15)}
                type="button"
              >
                +15°
              </button>
              <button
                disabled={readOnly}
                onClick={() =>
                  onRecordChange(
                    withSolid3DModelEulerDegrees(record, {
                      ...current,
                      [axis]: 90,
                    }),
                  )
                }
                type="button"
              >
                90°
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
