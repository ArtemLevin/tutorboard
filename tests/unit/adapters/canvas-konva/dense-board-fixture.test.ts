import { describe, expect, it } from "vitest";

import { validateBoardDocument } from "../../../../src/core/public";
import { createDenseBoardDocument } from "../../../fixtures/dense-board";

describe("dense board browser fixture", () => {
  it("contains valid canonical Vector Ink and embedded images", () => {
    const input = createDenseBoardDocument();
    const result = validateBoardDocument(input);
    expect(result.valid).toBe(true);
    if (!result.valid) throw new Error(JSON.stringify(result.issues));
    expect(result.document.order).toHaveLength(310);
  });
});
