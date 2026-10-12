import type { ViewportState } from "../../../core/public";
import "./BoardTeacherFollowControls.css";

export interface TeacherFollowControlsState {
  readonly active: boolean;
  readonly teacherName: string;
  readonly viewport: ViewportState | null;
}

interface BoardTeacherFollowControlsProps {
  readonly state: TeacherFollowControlsState;
  readonly onStart: () => void;
  readonly onStop: () => void;
}

export function BoardTeacherFollowControls({
  state,
  onStart,
  onStop,
}: BoardTeacherFollowControlsProps) {
  return (
    <div
      aria-live="polite"
      className={state.active ? "board-teacher-follow is-active" : "board-teacher-follow"}
      data-follow-zoom={state.active ? state.viewport?.zoom : "off"}
      data-testid="teacher-follow"
    >
      {state.active ? (
        <>
          <span className="board-teacher-follow-label">
            Следуем за {state.teacherName}
          </span>
          <button
            aria-label="Отключить следование за преподавателем"
            onClick={onStop}
            type="button"
          >
            Отключить
          </button>
        </>
      ) : (
        <button
          aria-label="Следовать за преподавателем"
          onClick={onStart}
          type="button"
        >
          Следовать за преподавателем
        </button>
      )}
    </div>
  );
}
