const identifierPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const unsafeRecordKeys = new Set(["__proto__", "constructor", "prototype"]);

declare const brand: unique symbol;

export type Brand<Value, Name extends string> = Value & {
  readonly [brand]: Name;
};

export type ActorId = Brand<string, "ActorId">;
export type BoardObjectId = Brand<string, "BoardObjectId">;
export type CommandId = Brand<string, "CommandId">;
export type DocumentId = Brand<string, "DocumentId">;
export type GeometryImportId = Brand<string, "GeometryImportId">;
export type GroupId = Brand<string, "GroupId">;

export function isValidIdentifier(value: string): boolean {
  return identifierPattern.test(value) && !unsafeRecordKeys.has(value);
}

function toIdentifier<Name extends string>(
  value: string,
  name: Name,
): Brand<string, Name> {
  if (!isValidIdentifier(value)) {
    throw new Error(`Invalid ${name}: ${value}`);
  }

  return value as Brand<string, Name>;
}

export function actorId(value: string): ActorId {
  return toIdentifier(value, "ActorId");
}

export function boardObjectId(value: string): BoardObjectId {
  return toIdentifier(value, "BoardObjectId");
}

export function commandId(value: string): CommandId {
  return toIdentifier(value, "CommandId");
}

export function documentId(value: string): DocumentId {
  return toIdentifier(value, "DocumentId");
}

export function geometryImportId(value: string): GeometryImportId {
  return toIdentifier(value, "GeometryImportId");
}

export function groupId(value: string): GroupId {
  return toIdentifier(value, "GroupId");
}
