import { documentId, type DocumentId } from "../../core/public";

const identifierPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const standaloneBoardPathPattern = /^\/b\/([^/]+)\/?$/u;

export type BoardLaunchContext =
  | {
      readonly kind: "legacy-lesson";
      readonly documentId: DocumentId;
      readonly lessonId: string;
    }
  | {
      readonly boardId: DocumentId;
      readonly kind: "standalone";
    }
  | { readonly kind: "local" };

function validIdentifier(value: string): boolean {
  return identifierPattern.test(value);
}

export function readBoardLaunchContext(
  location: Pick<Location, "pathname" | "search">,
): BoardLaunchContext {
  const standalone = standaloneBoardPathPattern.exec(location.pathname);
  if (standalone !== null) {
    const rawBoardId = standalone[1];
    if (rawBoardId === undefined || !validIdentifier(rawBoardId)) {
      throw new Error("Standalone board path contains an invalid board id.");
    }
    return { boardId: documentId(rawBoardId), kind: "standalone" };
  }

  const parameters = new URLSearchParams(location.search);
  const lessonId = parameters.get("lessonId");
  const rawDocumentId = parameters.get("documentId");
  if (lessonId === null && rawDocumentId === null) {
    return { kind: "local" };
  }
  if (
    lessonId === null ||
    rawDocumentId === null ||
    !validIdentifier(lessonId) ||
    !validIdentifier(rawDocumentId)
  ) {
    throw new Error(
      "lessonId and documentId must be valid lesson board identifiers.",
    );
  }
  return {
    documentId: documentId(rawDocumentId),
    kind: "legacy-lesson",
    lessonId,
  };
}
