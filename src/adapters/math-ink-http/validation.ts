import { z } from "zod";

export const mathInkProxyResultSchemaVersion =
  "tutorboard.math-ink-proxy-result/0.1" as const;

const diagnosticSchema = z
  .object({
    code: z.string().min(1).max(128),
    message: z.string().min(1).max(1_000),
    severity: z.enum(["error", "info", "warning"]),
  })
  .strict();

const candidateSchema = z
  .object({
    confidence: z.number().min(0).max(1).optional(),
    expression: z.string().min(1).max(4_096),
    format: z.enum(["jiix", "latex", "plot-expression"]),
  })
  .strict();

export const mathInkProxyResultSchema = z
  .object({
    candidates: z.array(candidateSchema).max(8),
    diagnostics: z.array(diagnosticSchema).max(16),
    provider: z.literal("mathpix"),
    providerRequestId: z.string().min(1).max(256).nullable(),
    providerVersion: z.string().min(1).max(128),
    requestId: z.string().min(1).max(256),
    schemaVersion: z.literal(mathInkProxyResultSchemaVersion),
    status: z.enum(["ambiguous", "recognized", "unrecognized"]),
  })
  .strict();

export const mathInkProblemSchema = z
  .object({
    code: z.string().min(1).max(128),
    detail: z.string().min(1).max(2_000),
    requestId: z.string().min(1).max(256).optional(),
    retryable: z.boolean(),
    status: z.number().int().min(400).max(599),
    title: z.string().min(1).max(256),
    type: z.string().min(1).max(512),
  })
  .strict();

export type MathInkProxyResultDto = z.infer<typeof mathInkProxyResultSchema>;
export type MathInkProblemDto = z.infer<typeof mathInkProblemSchema>;
