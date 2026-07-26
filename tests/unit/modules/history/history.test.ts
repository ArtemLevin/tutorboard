import { describe, expect, it } from "vitest";

import {
  commitDocumentHistory,
  createDocumentHistory,
  redoDocumentHistory,
  undoDocumentHistory,
} from "../../../../src/modules/history/public";

describe("document history", () => {
  it("commits one item per completed application transaction", () => {
    const initial = createDocumentHistory("empty", 3);
    const afterGesture = commitDocumentHistory(initial, "gesture");
    const afterImport = commitDocumentHistory(afterGesture, "import");

    expect(afterImport).toEqual({
      future: [],
      limit: 3,
      past: ["empty", "gesture"],
      present: "import",
    });
    expect(undoDocumentHistory(afterImport).present).toBe("gesture");
    expect(redoDocumentHistory(undoDocumentHistory(afterImport)).present).toBe(
      "import",
    );
  });

  it("bounds retained snapshots and clears redo on a divergent commit", () => {
    let history = createDocumentHistory(0, 2);
    history = commitDocumentHistory(history, 1);
    history = commitDocumentHistory(history, 2);
    history = commitDocumentHistory(history, 3);

    expect(history.past).toEqual([1, 2]);
    const undone = undoDocumentHistory(history);
    expect(undone.future).toEqual([3]);
    expect(commitDocumentHistory(undone, 20)).toEqual({
      future: [],
      limit: 2,
      past: [1, 2],
      present: 20,
    });
  });

  it("returns the same reference for unavailable or duplicate transitions", () => {
    const history = createDocumentHistory({ value: 1 });

    expect(undoDocumentHistory(history)).toBe(history);
    expect(redoDocumentHistory(history)).toBe(history);
    expect(commitDocumentHistory(history, history.present)).toBe(history);
    expect(() => createDocumentHistory("invalid", 0)).toThrow(RangeError);
  });
});
