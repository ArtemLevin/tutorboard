export function ownValue<Key extends PropertyKey, Value>(
  record: Readonly<Partial<Record<Key, Value>>>,
  key: Key,
): Value | undefined {
  return Object.hasOwn(record, key) ? record[key] : undefined;
}
