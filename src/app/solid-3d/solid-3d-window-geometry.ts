/** Local workspace coordinates; camera/document state is deliberately excluded. */
export interface Solid3DWindowRect {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export interface Solid3DWorkspaceSize {
  readonly width: number;
  readonly height: number;
}

const INSET = 16;
const MIN_WIDTH = 380;
const MIN_HEIGHT = 340;

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

export function clampSolid3DWindowRect(
  rect: Solid3DWindowRect,
  workspace: Solid3DWorkspaceSize,
): Solid3DWindowRect {
  const maxWidth = Math.max(0, workspace.width - INSET * 2);
  const maxHeight = Math.max(0, workspace.height - INSET * 2);
  const width = clamp(rect.width, Math.min(MIN_WIDTH, maxWidth), maxWidth);
  const height = clamp(rect.height, Math.min(MIN_HEIGHT, maxHeight), maxHeight);
  return {
    left: clamp(rect.left, INSET, Math.max(INSET, workspace.width - width - INSET)),
    top: clamp(rect.top, INSET, Math.max(INSET, workspace.height - height - INSET)),
    width,
    height,
  };
}

export function initialSolid3DWindowRect(
  workspace: Solid3DWorkspaceSize,
  expanded = false,
): Solid3DWindowRect {
  const width = expanded ? 1120 : 610;
  return clampSolid3DWindowRect(
    {
      left: workspace.width - width - INSET,
      top: INSET,
      width,
      height: Math.min(760, workspace.height - INSET * 2),
    },
    workspace,
  );
}
