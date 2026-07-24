export function mediaType(value: string | null): string | null {
  if (value === null) {
    return null;
  }
  const [type] = value.split(";", 1);
  return type?.trim().toLowerCase() || null;
}

export function isJsonMediaType(value: string | null): boolean {
  const type = mediaType(value);
  return type === "application/json" || type?.endsWith("+json") === true;
}

export function isProblemMediaType(value: string | null): boolean {
  return mediaType(value) === "application/problem+json";
}
