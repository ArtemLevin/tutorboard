export function ownValue<Key extends PropertyKey, Value>(
  record: Readonly<Partial<Record<Key, Value>>>,
  key: Key,
): Value | undefined {
  return Object.hasOwn(record, key) ? record[key] : undefined;
}

/** Structural equality for JSON-shaped domain values, independent of key order. */
export function boardValuesEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) {
    return true;
  }
  if (
    typeof left !== "object" ||
    left === null ||
    typeof right !== "object" ||
    right === null
  ) {
    return false;
  }
  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((value, index) => boardValuesEqual(value, right[index]))
    );
  }
  const leftRecord = left as Readonly<Record<string, unknown>>;
  const rightRecord = right as Readonly<Record<string, unknown>>;
  const leftKeys = Object.keys(leftRecord).sort();
  const rightKeys = Object.keys(rightRecord).sort();
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every(
      (key, index) =>
        key === rightKeys[index] &&
        boardValuesEqual(leftRecord[key], rightRecord[key]),
    )
  );
}
