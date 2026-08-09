import { useEffect, useMemo, useState, type ReactElement } from "react";

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
  const current = useMemo(
    () => solid3DEulerDegreesFromQuaternion(solid3DModelQuaternion(record)),
    [record.projection.matrix],
  );
  const [draft, setDraft] = useState<Record<Axis, string>>(() => ({
    x: String(roundAngle(current.x)),
    y: String(roundAngle(current.y)),
    z: String(roundAngle(current.z)),
  }));

  useEffect(() => {
    setDraft({
      x: String(roundAngle(current.x)),
      y: String(roundAngle(current.y)),
      z: String(roundAngle(current.z)),
    });
  }, [current.x, current.y, current.z]);

  const commit = (axis: Axis): void => {
    const value = Number(draft[axis].replace(",", "."));
    if (!Number.isFinite(value)) {
      setDraft((state) => ({ ...state, [axis]: String(roundAngle(current[axis])) }));
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
    <section aria-labelledby="solid-3d-orientation-title" className="solid-3d-orientation">
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
      <p>Поворот сохраняется вместе с моделью и не зависит от положения камеры.</p>
      <div className="solid-3d-orientation-grid">
        {(["x", "y", "z"] as const).map((axis) => (
          <div className="solid-3d-orientation-axis" key={axis}>
            <label>
              <span>{axis.toUpperCase()}°</span>
              <input
                aria-label={`Поворот ${axis.toUpperCase()}`}
                disabled={readOnly}
                inputMode="decimal"
                onBlur={() => commit(axis)}
                onChange={(event) =>
                  setDraft((state) => ({
                    ...state,
                    [axis]: event.currentTarget.value,
                  }))
                }
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    commit(axis);
                    event.currentTarget.blur();
                  }
                }}
                type="text"
                value={draft[axis]}
              />
            </label>
            <div className="solid-3d-orientation-nudges">
              <button disabled={readOnly} onClick={() => rotate(axis, -15)} type="button">
                −15°
              </button>
              <button disabled={readOnly} onClick={() => rotate(axis, 15)} type="button">
                +15°
              </button>
              <button
                disabled={readOnly}
                onClick={() =>
                  onRecordChange(
                    withSolid3DModelEulerDegrees(record, { ...current, [axis]: 90 }),
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
