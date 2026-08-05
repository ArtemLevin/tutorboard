import { z } from "zod";

import type { BoardCommand } from "../commands";
import {
  isValidIdentifier,
  type ActorId,
  type BoardObjectId,
  type CommandId,
  type GeometryImportId,
  type GroupId,
} from "../../identifiers";
import type { BoardGroup } from "../../groups";
import { strokeStyles, type BoardObject } from "../../objects";
import type { GeometryImportRecord } from "../../geometry-imports";
import type { CoordinatePlotDefinition } from "../../coordinate-plot";
import { boardDocumentSchema } from "../../validation/schema";

export const boardCommandSchemaVersion = "1.0" as const;
export const maximumBoardCommandTargets = 10_000;
export const maximumBoardCommandObjects = 5_000;
export const maximumBoardCommandJsonBytes = 2 * 1024 * 1024;

const identifierSchema = z
  .string()
  .min(1)
  .max(256)
  .refine(isValidIdentifier, "Invalid or unsafe identifier.");
const actorIdSchema = identifierSchema.transform((value) => value as ActorId);
const commandIdSchema = identifierSchema.transform(
  (value) => value as CommandId,
);
const boardObjectIdSchema = identifierSchema.transform(
  (value) => value as BoardObjectId,
);
const groupIdSchema = identifierSchema.transform((value) => value as GroupId);
const geometryImportIdSchema = identifierSchema.transform(
  (value) => value as GeometryImportId,
);
const timestampSchema = z.iso.datetime({ offset: true });
const finiteNumberSchema = z.number().finite();
const vec2Schema = z
  .object({ x: finiteNumberSchema, y: finiteNumberSchema })
  .strict();
const positiveVec2Schema = z
  .object({
    x: finiteNumberSchema.positive(),
    y: finiteNumberSchema.positive(),
  })
  .strict();
const transformSchema = z
  .object({
    rotation: finiteNumberSchema,
    scale: positiveVec2Schema,
    translation: vec2Schema,
  })
  .strict();
const styleOverrideSchema = z
  .object({
    fill: z.string().max(256).nullable().optional(),
    opacity: finiteNumberSchema.min(0).max(1).optional(),
    stroke: z.string().max(256).nullable().optional(),
    strokeWidth: finiteNumberSchema.nonnegative().optional(),
    strokeStyle: z.enum(strokeStyles).optional(),
  })
  .strict();

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function forwardIssues(
  context: z.RefinementCtx,
  issues: readonly {
    readonly message: string;
    readonly path: readonly PropertyKey[];
  }[],
): void {
  for (const issue of issues) {
    context.addIssue({
      code: "custom",
      message: issue.message,
      path: issue.path,
    });
  }
}

const boardObjectSchema = z.unknown().transform((value, context) => {
  if (!record(value) || typeof value.id !== "string") {
    context.addIssue({
      code: "custom",
      message: "Board object requires an identifier.",
    });
    return z.NEVER;
  }
  const parsed = boardDocumentSchema.shape.objects.safeParse({
    [value.id]: value,
  });
  if (!parsed.success) {
    forwardIssues(
      context,
      parsed.error.issues.map((issue) => ({
        ...issue,
        path: issue.path.slice(1),
      })),
    );
    return z.NEVER;
  }
  const object = parsed.data[value.id as BoardObjectId];
  if (object === undefined) {
    context.addIssue({
      code: "custom",
      message: "Board object could not be decoded.",
    });
    return z.NEVER;
  }
  return object satisfies BoardObject;
});

const boardGroupSchema = z.unknown().transform((value, context) => {
  if (!record(value) || typeof value.id !== "string") {
    context.addIssue({
      code: "custom",
      message: "Board group requires an identifier.",
    });
    return z.NEVER;
  }
  const parsed = boardDocumentSchema.shape.groups.safeParse({
    [value.id]: value,
  });
  if (!parsed.success) {
    forwardIssues(
      context,
      parsed.error.issues.map((issue) => ({
        ...issue,
        path: issue.path.slice(1),
      })),
    );
    return z.NEVER;
  }
  const group = parsed.data[value.id as GroupId];
  if (group === undefined) {
    context.addIssue({
      code: "custom",
      message: "Board group could not be decoded.",
    });
    return z.NEVER;
  }
  return group satisfies BoardGroup;
});

const geometryImportSchema = z.unknown().transform((value, context) => {
  if (!record(value) || typeof value.id !== "string") {
    context.addIssue({
      code: "custom",
      message: "Geometry import requires an identifier.",
    });
    return z.NEVER;
  }
  const parsed = boardDocumentSchema.shape.geometryImports.safeParse({
    [value.id]: value,
  });
  if (!parsed.success) {
    forwardIssues(
      context,
      parsed.error.issues.map((issue) => ({
        ...issue,
        path: issue.path.slice(1),
      })),
    );
    return z.NEVER;
  }
  const imported = parsed.data[value.id as GeometryImportId];
  if (imported === undefined) {
    context.addIssue({
      code: "custom",
      message: "Geometry import could not be decoded.",
    });
    return z.NEVER;
  }
  return imported satisfies GeometryImportRecord;
});

const coordinatePlotDefinitionSchema = z
  .unknown()
  .transform((value, context) => {
    const objectId = "object:command-codec-coordinate-plot";
    const parsed = boardDocumentSchema.shape.objects.safeParse({
      [objectId]: {
        definition: value,
        groupId: null,
        id: objectId,
        kind: "math.coordinate-plot",
        locked: false,
        position: { x: 0, y: 0 },
        rotation: 0,
        scale: { x: 1, y: 1 },
        source: { kind: "user" },
        style: {
          fill: null,
          opacity: 1,
          stroke: "#000000",
          strokeWidth: 1,
        },
        visible: true,
      },
    });
    if (!parsed.success) {
      forwardIssues(
        context,
        parsed.error.issues.map((issue) => ({
          ...issue,
          path: issue.path.slice(2),
        })),
      );
      return z.NEVER;
    }
    const object = parsed.data[objectId as BoardObjectId];
    if (object?.kind !== "math.coordinate-plot") {
      context.addIssue({
        code: "custom",
        message: "Coordinate plot definition could not be decoded.",
      });
      return z.NEVER;
    }
    return object.definition satisfies CoordinatePlotDefinition;
  });

const metadata = {
  actorId: actorIdSchema,
  id: commandIdSchema,
  timestamp: timestampSchema,
} as const;
const objectIdsSchema = z
  .array(boardObjectIdSchema)
  .max(maximumBoardCommandTargets);
const groupIdsSchema = z.array(groupIdSchema).max(maximumBoardCommandTargets);
const importIdsSchema = z
  .array(geometryImportIdSchema)
  .max(maximumBoardCommandTargets);
const objectsSchema = z
  .array(boardObjectSchema)
  .min(1)
  .max(maximumBoardCommandObjects);
const groupsSchema = z.array(boardGroupSchema).max(maximumBoardCommandObjects);
const importsSchema = z
  .array(geometryImportSchema)
  .max(maximumBoardCommandObjects);

export const boardCommandSchema = z.discriminatedUnion("kind", [
  z
    .object({
      ...metadata,
      atIndex: z.number().int().nonnegative().optional(),
      kind: z.literal("core.objects.add"),
      objects: objectsSchema,
    })
    .strict(),
  z
    .object({
      ...metadata,
      kind: z.literal("core.objects.replace"),
      originals: objectsSchema,
      replacements: objectsSchema,
    })
    .strict(),
  z
    .object({
      ...metadata,
      geometryImportIds: importIdsSchema,
      groupIds: groupIdsSchema,
      kind: z.literal("core.clipboard.cut"),
      objectIds: objectIdsSchema,
    })
    .strict(),
  z
    .object({
      ...metadata,
      geometryImports: importsSchema,
      groups: groupsSchema,
      kind: z.literal("core.clipboard.paste"),
      objects: objectsSchema,
    })
    .strict(),
  z
    .object({
      ...metadata,
      group: boardGroupSchema,
      kind: z.literal("core.groups.add"),
    })
    .strict(),
  z
    .object({
      ...metadata,
      groupIds: groupIdsSchema,
      kind: z.literal("core.groups.remove"),
    })
    .strict(),
  z
    .object({
      ...metadata,
      group: boardGroupSchema,
      importRecord: geometryImportSchema,
      kind: z.literal("core.geometry.import"),
      objects: objectsSchema,
    })
    .strict(),
  z
    .object({
      ...metadata,
      delta: vec2Schema,
      importId: geometryImportIdSchema,
      kind: z.literal("core.geometry.translate"),
    })
    .strict(),
  z
    .object({
      ...metadata,
      delta: vec2Schema,
      importId: geometryImportIdSchema,
      kind: z.literal("core.geometry.label-offset"),
      objectId: boardObjectIdSchema,
    })
    .strict(),
  z
    .object({
      ...metadata,
      importId: geometryImportIdSchema,
      kind: z.literal("core.geometry.style-override"),
      objectId: boardObjectIdSchema,
      style: styleOverrideSchema,
    })
    .strict(),
  z
    .object({
      ...metadata,
      delta: vec2Schema,
      kind: z.literal("core.objects.move"),
      objectIds: objectIdsSchema,
    })
    .strict(),
  z
    .object({
      ...metadata,
      delta: vec2Schema,
      groupId: groupIdSchema,
      kind: z.literal("core.groups.move"),
    })
    .strict(),
  z
    .object({
      ...metadata,
      groupId: groupIdSchema,
      kind: z.literal("core.groups.set-transform"),
      transform: transformSchema,
    })
    .strict(),
  z
    .object({
      ...metadata,
      kind: z.literal("core.objects.delete"),
      objectIds: objectIdsSchema,
    })
    .strict(),
  z
    .object({
      ...metadata,
      kind: z.literal("core.layers.reorder"),
      mode: z.enum(["back", "backward", "forward", "front"]),
      objectIds: objectIdsSchema,
    })
    .strict(),
  z
    .object({
      ...metadata,
      kind: z.literal("core.layers.set-visibility"),
      objectIds: objectIdsSchema,
      visible: z.boolean(),
    })
    .strict(),
  z
    .object({
      ...metadata,
      delta: vec2Schema,
      groupIds: groupIdsSchema,
      kind: z.literal("core.selection.move"),
      objectIds: objectIdsSchema,
    })
    .strict(),
  z
    .object({
      ...metadata,
      groupIds: groupIdsSchema,
      kind: z.literal("core.selection.set-lock"),
      locked: z.boolean(),
      objectIds: objectIdsSchema,
    })
    .strict(),
  z
    .object({
      ...metadata,
      kind: z.literal("core.selection.set-style"),
      objectIds: objectIdsSchema,
      style: styleOverrideSchema,
    })
    .strict(),
  z
    .object({
      ...metadata,
      kind: z.literal("core.viewport.set"),
      viewport: boardDocumentSchema.shape.viewport,
    })
    .strict(),
  z
    .object({
      ...metadata,
      kind: z.literal("core.document.rename"),
      title: z.string().min(1).max(256),
    })
    .strict(),
  z
    .object({
      ...metadata,
      kind: z.literal("core.text.update"),
      objectId: boardObjectIdSchema,
      text: z.string().max(100_000),
    })
    .strict(),
  z
    .object({
      ...metadata,
      expected: coordinatePlotDefinitionSchema,
      kind: z.literal("core.coordinate-plot.update"),
      objectId: boardObjectIdSchema,
      replacement: coordinatePlotDefinitionSchema,
    })
    .strict(),
]);

export interface BoardCommandCodecIssue {
  readonly code: string;
  readonly message: string;
  readonly path: string;
}

export type BoardCommandReadResult =
  | { readonly command: BoardCommand; readonly status: "ok" }
  | {
      readonly issues: readonly BoardCommandCodecIssue[];
      readonly raw: unknown;
      readonly status: "invalid-command";
    };

export type BoardCommandJsonReadResult =
  | { readonly command: BoardCommand; readonly status: "ok" }
  | { readonly raw: string; readonly status: "invalid-json" }
  | {
      readonly issues: readonly BoardCommandCodecIssue[];
      readonly raw: string;
      readonly status: "invalid-command";
    }
  | { readonly raw: string; readonly status: "too-large" };

function issuePath(path: readonly PropertyKey[]): string {
  return path
    .map((segment) =>
      typeof segment === "symbol" ? segment.description : segment,
    )
    .join(".");
}

function codecIssues(error: z.ZodError): readonly BoardCommandCodecIssue[] {
  return error.issues.map((issue) => ({
    code: issue.code,
    message: issue.message,
    path: issuePath(issue.path),
  }));
}

export function readBoardCommand(raw: unknown): BoardCommandReadResult {
  const parsed = boardCommandSchema.safeParse(raw);
  return parsed.success
    ? { command: parsed.data as BoardCommand, status: "ok" }
    : {
        issues: codecIssues(parsed.error),
        raw,
        status: "invalid-command",
      };
}

function utf8Length(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

export function readBoardCommandJson(raw: string): BoardCommandJsonReadResult {
  if (utf8Length(raw) > maximumBoardCommandJsonBytes) {
    return { raw, status: "too-large" };
  }
  let value: unknown;
  try {
    value = JSON.parse(raw) as unknown;
  } catch {
    return { raw, status: "invalid-json" };
  }
  const parsed = readBoardCommand(value);
  return parsed.status === "ok"
    ? parsed
    : {
        issues: parsed.issues,
        raw,
        status: "invalid-command",
      };
}

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (!record(value)) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .flatMap((key) =>
        value[key] === undefined ? [] : [[key, canonicalValue(value[key])]],
      ),
  );
}

export function canonicalBoardCommandJson(command: BoardCommand): string {
  const parsed = readBoardCommand(command);
  if (parsed.status !== "ok") {
    throw new TypeError("Cannot serialize an invalid BoardCommand.");
  }
  return JSON.stringify(canonicalValue(parsed.command));
}

export function serializeBoardCommand(command: BoardCommand):
  | { readonly json: string; readonly ok: true }
  | {
      readonly issues: readonly BoardCommandCodecIssue[];
      readonly ok: false;
    } {
  const parsed = readBoardCommand(command);
  return parsed.status === "ok"
    ? { json: JSON.stringify(canonicalValue(parsed.command)), ok: true }
    : { issues: parsed.issues, ok: false };
}

export async function boardCommandSha256(
  command: BoardCommand,
): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalBoardCommandJson(command));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}
