import { describe, expect, it } from "vitest";

import {
  actorId,
  commandId,
  createEmptyBoardDocument,
  documentId,
  reduceBoardDocument,
} from "../../../../../src/core/public";

describe("BoardCommand timestamp ordering", () => {
  it("accepts a command created by a client whose clock is behind", () => {
    const document = createEmptyBoardDocument({
      createdAt: "2026-08-05T08:00:00.000Z",
      id: documentId("document:clock-skew"),
      title: "Clock skew",
    });
    const future = reduceBoardDocument(document, {
      actorId: actorId("actor:fast-clock"),
      id: commandId("command:future-clock"),
      kind: "core.document.rename",
      timestamp: "2026-08-05T12:00:00.000Z",
      title: "Fast clock",
    });
    expect(future.ok).toBe(true);
    if (!future.ok) throw new Error(future.error.message);

    const past = reduceBoardDocument(future.document, {
      actorId: actorId("actor:slow-clock"),
      id: commandId("command:past-clock"),
      kind: "core.document.rename",
      timestamp: "2026-08-05T07:00:00.000Z",
      title: "Slow clock accepted",
    });

    expect(past).toMatchObject({
      document: {
        title: "Slow clock accepted",
        updatedAt: "2026-08-05T12:00:00.000Z",
      },
      ok: true,
    });
  });
});
