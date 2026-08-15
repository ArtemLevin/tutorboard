import { z } from "zod";

export const standaloneBoardCapabilities = [
  "board.read",
  "board.write",
  "board.snapshot.write",
  "collaboration.connect",
  "board.export",
  "board.history.read",
  "board.invites.manage",
  "board.archive",
  "board.delete",
] as const;

export type StandaloneBoardCapability =
  (typeof standaloneBoardCapabilities)[number];

const identifierSchema = z.string().min(1).max(128);
const opaqueSecurityValueSchema = z.string().min(8).max(512);
const capabilitySchema = z.enum(standaloneBoardCapabilities);
const capabilitiesSchema = z
  .array(capabilitySchema)
  .min(1)
  .max(standaloneBoardCapabilities.length)
  .superRefine((capabilities, context) => {
    if (new Set(capabilities).size !== capabilities.length) {
      context.addIssue({
        code: "custom",
        message: "Board capabilities must not contain duplicates.",
      });
    }
    if (!capabilities.includes("board.read")) {
      context.addIssue({
        code: "custom",
        message: "Every standalone board context requires board.read.",
      });
    }
    if (
      capabilities.includes("board.snapshot.write") &&
      !capabilities.includes("board.write")
    ) {
      context.addIssue({
        code: "custom",
        message: "board.snapshot.write requires board.write.",
      });
    }
    if (
      capabilities.includes("collaboration.connect") &&
      !capabilities.includes("board.read")
    ) {
      context.addIssue({
        code: "custom",
        message: "collaboration.connect requires board.read.",
      });
    }
  });

const commonContextShape = {
  accessEpoch: opaqueSecurityValueSchema,
  actorId: identifierSchema,
  boardId: identifierSchema,
  cacheScopeId: opaqueSecurityValueSchema,
  capabilities: capabilitiesSchema,
  csrfToken: opaqueSecurityValueSchema,
  displayName: z.string().min(1).max(160),
  schemaVersion: z.literal("1.0"),
} as const;

export const standaloneTeacherContextSchema = z
  .object({
    ...commonContextShape,
    organizationId: identifierSchema,
    principalType: z.literal("teacher"),
    role: z.enum(["admin", "tutor"]),
    userId: identifierSchema,
  })
  .strict();

const guestForbiddenCapabilities = new Set<StandaloneBoardCapability>([
  "board.export",
  "board.history.read",
  "board.invites.manage",
  "board.archive",
  "board.delete",
]);

export const standaloneGuestContextSchema = z
  .object({
    ...commonContextShape,
    principalType: z.literal("guest"),
    role: z.literal("student"),
  })
  .strict()
  .superRefine((value, context) => {
    for (const capability of value.capabilities) {
      if (guestForbiddenCapabilities.has(capability)) {
        context.addIssue({
          code: "custom",
          message: `Guest context cannot grant ${capability}.`,
          path: ["capabilities"],
        });
      }
    }
  });

export const standaloneBoardAccessContextSchema = z.discriminatedUnion(
  "principalType",
  [standaloneTeacherContextSchema, standaloneGuestContextSchema],
);

export type StandaloneBoardAccessContext = z.infer<
  typeof standaloneBoardAccessContextSchema
>;

export function parseStandaloneBoardAccessContext(
  value: unknown,
): StandaloneBoardAccessContext {
  return standaloneBoardAccessContextSchema.parse(value);
}
