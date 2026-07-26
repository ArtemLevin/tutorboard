export const defaultHistoryLimit = 100;

export interface DocumentHistory<Value> {
  readonly future: readonly Value[];
  readonly limit: number;
  readonly past: readonly Value[];
  readonly present: Value;
}

export function createDocumentHistory<Value>(
  present: Value,
  limit = defaultHistoryLimit,
): DocumentHistory<Value> {
  if (!Number.isSafeInteger(limit) || limit < 1) {
    throw new RangeError("History limit must be a positive safe integer.");
  }
  return { future: [], limit, past: [], present };
}

export function commitDocumentHistory<Value>(
  history: DocumentHistory<Value>,
  next: Value,
): DocumentHistory<Value> {
  if (Object.is(history.present, next)) {
    return history;
  }
  return {
    ...history,
    future: [],
    past: [...history.past, history.present].slice(-history.limit),
    present: next,
  };
}

export function undoDocumentHistory<Value>(
  history: DocumentHistory<Value>,
): DocumentHistory<Value> {
  const previous = history.past.at(-1);
  if (previous === undefined) {
    return history;
  }
  return {
    ...history,
    future: [history.present, ...history.future],
    past: history.past.slice(0, -1),
    present: previous,
  };
}

export function redoDocumentHistory<Value>(
  history: DocumentHistory<Value>,
): DocumentHistory<Value> {
  const next = history.future[0];
  if (next === undefined) {
    return history;
  }
  return {
    ...history,
    future: history.future.slice(1),
    past: [...history.past, history.present].slice(-history.limit),
    present: next,
  };
}
