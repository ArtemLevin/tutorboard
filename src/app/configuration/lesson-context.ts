import { documentId, type DocumentId } from "../../core/public";

const identifierPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;

export interface LessonBoardContext {
  readonly documentId: DocumentId;
  readonly lessonId: string;
}

export function readLessonBoardContext(
  search: string,
): LessonBoardContext | null {
  const parameters = new URLSearchParams(search);
  const lessonId = parameters.get("lessonId");
  const rawDocumentId = parameters.get("documentId");
  if (lessonId === null && rawDocumentId === null) {
    return null;
  }
  if (
    lessonId === null ||
    rawDocumentId === null ||
    !identifierPattern.test(lessonId) ||
    !identifierPattern.test(rawDocumentId)
  ) {
    throw new Error(
      "lessonId and documentId must be valid lesson board identifiers.",
    );
  }
  return { documentId: documentId(rawDocumentId), lessonId };
}
