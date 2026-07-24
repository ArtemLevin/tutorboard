import {
  type BoardDocument,
  type BoardObjectId,
  type CommandMetadata,
  type SvgObject,
  type Vec2,
} from "../../core/public";
import type { AddObjectsCommand } from "../../core/public";
import { sanitizeSvg, type SvgImportDiagnostic } from "./sanitizer";

export interface CreateSvgObjectInput {
  readonly id: BoardObjectId;
  readonly center: Vec2;
  readonly source: string;
}

export type CreateSvgObjectResult =
  | { readonly object: SvgObject; readonly status: "ok" }
  | { readonly diagnostic: SvgImportDiagnostic; readonly status: "error" };

export type StoredSvgDocumentValidation =
  | { readonly status: "ok" }
  | {
      readonly diagnostic: SvgImportDiagnostic;
      readonly objectId: BoardObjectId;
      readonly status: "error";
    };

export function createSvgObject(
  input: CreateSvgObjectInput,
): CreateSvgObjectResult {
  const sanitized = sanitizeSvg(input.source);
  if (sanitized.status === "error") {
    return sanitized;
  }
  return {
    status: "ok",
    object: {
      id: input.id,
      groupId: null,
      kind: "svg-import.svg",
      locked: false,
      position: {
        x: input.center.x - sanitized.value.size.width / 2,
        y: input.center.y - sanitized.value.size.height / 2,
      },
      rotation: 0,
      sanitizedSvg: sanitized.value.sanitizedSvg,
      sanitizerPolicyVersion: sanitized.value.sanitizerPolicyVersion,
      scale: { x: 1, y: 1 },
      size: sanitized.value.size,
      source: { kind: "user" },
      style: {
        fill: null,
        opacity: 1,
        stroke: null,
        strokeWidth: 0,
      },
      viewBox: sanitized.value.viewBox,
      visible: true,
    },
  };
}

export function createAddSvgObjectCommand(
  metadata: CommandMetadata,
  object: SvgObject,
): AddObjectsCommand {
  return { ...metadata, kind: "core.objects.add", objects: [object] };
}

export function validateStoredSvgDocument(
  document: BoardDocument,
): StoredSvgDocumentValidation {
  for (const objectId of document.order) {
    const object = document.objects[objectId];
    if (object?.kind !== "svg-import.svg") {
      continue;
    }
    const sanitized = sanitizeSvg(object.sanitizedSvg);
    if (sanitized.status === "error") {
      return { status: "error", objectId, diagnostic: sanitized.diagnostic };
    }
    if (
      sanitized.value.sanitizedSvg !== object.sanitizedSvg ||
      sanitized.value.sanitizerPolicyVersion !==
        object.sanitizerPolicyVersion ||
      sanitized.value.size.width !== object.size.width ||
      sanitized.value.size.height !== object.size.height ||
      sanitized.value.viewBox.x !== object.viewBox.x ||
      sanitized.value.viewBox.y !== object.viewBox.y ||
      sanitized.value.viewBox.width !== object.viewBox.width ||
      sanitized.value.viewBox.height !== object.viewBox.height
    ) {
      return {
        status: "error",
        objectId,
        diagnostic: {
          code: "svg.sanitization-mismatch",
          message: "Stored SVG does not match the active sanitizer policy.",
        },
      };
    }
  }
  return { status: "ok" };
}
