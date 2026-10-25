/** Verify a live desktop challenge before creating a board in the teacher session. */
export async function verifyTutorAssistantHandoff(handoff: {
  readonly callback: string;
}): Promise<void> {
  const url = new URL(handoff.callback);
  url.pathname = "/prepare";
  const response = await fetch(url.href, {
    cache: "no-store",
    credentials: "omit",
    mode: "cors",
    headers: { Accept: "application/json" },
  });
  if (!response.ok)
    throw new Error("Tutor Assistant недоступен для подтверждения доски.");
  const body: unknown = await response.json();
  if (
    typeof body !== "object" ||
    body === null ||
    !("valid" in body) ||
    body.valid !== true
  ) {
    throw new Error("Неверный ответ Tutor Assistant при подтверждении доски.");
  }
}
