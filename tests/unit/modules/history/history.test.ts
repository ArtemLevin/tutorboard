import { describe, expect, it } from "vitest";

import {
  commitDocumentHistory,
  createDocumentHistory,
  redoDocumentHistory,
  resizeDocumentHistory,
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

  it("defaults to five retained actions and trims old snapshots when reduced", () => {
    let history = createDocumentHistory(0);
    expect(history.limit).toBe(5);
    for (let step = 1; step <= 12; step += 1) {
      history = commitDocumentHistory(history, step);
    }
    expect(history.past).toEqual([7, 8, 9, 10, 11]);
    history = resizeDocumentHistory(history, 3);
    expect(history.past).toEqual([9, 10, 11]);
    expect(history.limit).toBe(3);
    history = undoDocumentHistory(history);
    expect(history.present).toBe(11);
    expect(history.future).toEqual([12]);
    expect(resizeDocumentHistory(history, 1)).toMatchObject({
      past: [10],
      present: 11,
      future: [],
      limit: 1,
    });
    const withRedo = undoDocumentHistory(history);
    const balanced = resizeDocumentHistory(withRedo, 2);
    expect(balanced.past).toEqual([9]);
    expect(balanced.future).toEqual([11]);
    expect(resizeDocumentHistory(history, 3)).toBe(history);
    expect(() => resizeDocumentHistory(history, 0)).toThrow(RangeError);
  });

  it("returns the same reference for unavailable or duplicate transitions", () => {
    const history = createDocumentHistory({ value: 1 });

    expect(undoDocumentHistory(history)).toBe(history);
    expect(redoDocumentHistory(history)).toBe(history);
    expect(commitDocumentHistory(history, history.present)).toBe(history);
    expect(() => createDocumentHistory("invalid", 0)).toThrow(RangeError);
  });
});
