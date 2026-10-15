/** Tutor Assistant browser handoff. Only an authenticated teacher can create a board. */
export interface LessonBoardHandoff {
  readonly lessonId: string;
  readonly title: string;
  readonly callback: string;
}

const lessonIdPattern = /^[0-9a-f]{32}$/u;
const boardIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const tokenPattern = /^[A-Za-z0-9_-]{43}$/u;

export function validTutorBoardId(value: string): boolean {
  return boardIdPattern.test(value);
}

export function readLessonBoardHandoff(
  hash: string,
): LessonBoardHandoff | null {
  if (!hash.startsWith("#ta-start=") || hash.length > 4096) return null;
  const raw = hash.slice("#ta-start=".length);
  if (!/^[A-Za-z0-9_-]+$/u.test(raw)) return null;

  try {
    const decoded = atob(raw.replaceAll("-", "+").replaceAll("_", "/"));
    const bytes = Uint8Array.from(decoded, (character) =>
      character.charCodeAt(0),
    );
    const payload: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (typeof payload !== "object" || payload === null) return null;
    if (!("version" in payload) || payload.version !== 1) return null;
    if (!("lessonId" in payload) || typeof payload.lessonId !== "string")
      return null;
    if (!lessonIdPattern.test(payload.lessonId)) return null;
    if (!("title" in payload) || typeof payload.title !== "string") return null;
    if (payload.title.length < 1 || payload.title.length > 200) return null;
    if (!("callback" in payload) || typeof payload.callback !== "string")
      return null;
    const callback = new URL(payload.callback);
    const params = [...callback.searchParams.keys()];
    if (
      callback.protocol !== "http:" ||
      callback.hostname !== "127.0.0.1" ||
      callback.username !== "" ||
      callback.password !== "" ||
      callback.port === "" ||
      callback.pathname !== "/complete" ||
      callback.hash !== "" ||
      params.length !== 1 ||
      params[0] !== "nonce" ||
      !tokenPattern.test(callback.searchParams.get("nonce") ?? "")
    ) {
      return null;
    }
    return {
      lessonId: payload.lessonId,
      title: payload.title,
      callback: callback.href,
    };
  } catch {
    return null;
  }
}

export function handoffCompletionUrl(
  handoff: LessonBoardHandoff,
  boardId: string,
): string {
  if (!validTutorBoardId(boardId))
    throw new Error("Некорректный ID созданной доски.");
  const url = new URL(handoff.callback);
  url.searchParams.set("boardId", boardId);
  return url.href;
}
