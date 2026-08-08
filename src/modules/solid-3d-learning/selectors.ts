import type {
  BoardDocument,
  Solid3DLearningAttempt,
  Solid3DId,
} from "../../core/public";

export function selectSolidLearningAttempts(
  document: BoardDocument,
  solidId?: Solid3DId,
): readonly Solid3DLearningAttempt[] {
  return Object.values(document.solidLearningAttempts)
    .filter(
      (attempt): attempt is Solid3DLearningAttempt => attempt !== undefined,
    )
    .filter((attempt) => solidId === undefined || attempt.solidId === solidId)
    .sort(
      (left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt),
    );
}

export function selectActiveSolidLearningAttempt(
  document: BoardDocument,
  solidId: Solid3DId,
): Solid3DLearningAttempt | null {
  return (
    selectSolidLearningAttempts(document, solidId).find(
      ({ phase }) => phase !== "completed",
    ) ?? null
  );
}
