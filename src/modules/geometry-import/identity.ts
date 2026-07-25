import {
  boardObjectId,
  groupId,
  type BoardObjectId,
  type GeometryImportId,
  type GroupId,
} from "../../core/public";

import type { GeometryImportDiagnostic } from "./contract";
import { diagnostic } from "./diagnostics";

export interface IdentityRegistry {
  readonly boardSeeds: Map<string, string>;
  readonly importId: GeometryImportId;
}

const base64UrlAlphabet =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

export function encodeComponent(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let encoded = "";
  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index] ?? 0;
    const second = bytes[index + 1];
    const third = bytes[index + 2];
    const chunk = (first << 16) | ((second ?? 0) << 8) | (third ?? 0);
    encoded += base64UrlAlphabet[(chunk >> 18) & 63];
    encoded += base64UrlAlphabet[(chunk >> 12) & 63];
    if (second !== undefined) {
      encoded += base64UrlAlphabet[(chunk >> 6) & 63];
    }
    if (third !== undefined) {
      encoded += base64UrlAlphabet[chunk & 63];
    }
  }
  return encoded;
}

function rawIdentity(importId: GeometryImportId, roleSeed: string): string {
  return `geo:${encodeComponent(importId)}:${roleSeed}`;
}

export function registerBoardObjectId(
  registry: IdentityRegistry,
  roleSeed: string,
  diagnostics: GeometryImportDiagnostic[],
  girEntityId: string,
): BoardObjectId | null {
  const raw = rawIdentity(registry.importId, roleSeed);
  let id: BoardObjectId;
  try {
    id = boardObjectId(raw);
  } catch {
    diagnostics.push(
      diagnostic("geometry-import.generated-id-too-long", "error", {
        girEntityId,
      }),
    );
    return null;
  }
  const existing = registry.boardSeeds.get(id);
  if (existing !== undefined && existing !== roleSeed) {
    diagnostics.push(
      diagnostic("geometry-import.board-id-collision", "error", {
        girEntityId,
      }),
    );
    return null;
  }
  registry.boardSeeds.set(id, roleSeed);
  return id;
}

export function createRootGroupId(
  importId: GeometryImportId,
  diagnostics: GeometryImportDiagnostic[],
): GroupId | null {
  try {
    return groupId(rawIdentity(importId, "root"));
  } catch {
    diagnostics.push(
      diagnostic("geometry-import.generated-id-too-long", "error"),
    );
    return null;
  }
}
