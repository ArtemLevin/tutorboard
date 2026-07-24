const isoTimestampPattern =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

export function isIsoTimestamp(value: string): boolean {
  return isoTimestampPattern.test(value) && !Number.isNaN(Date.parse(value));
}
