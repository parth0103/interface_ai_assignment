import { z } from "zod";

export const runStatusSchema = z.enum(["success", "business_outcome", "needs_human", "failure", "blocked"]);
export const riskSchema = z.enum(["safe", "approval_required", "blocked"]);
export const actionTypeSchema = z.enum(["navigate", "click", "type", "select", "extract", "assert", "wait"]);

export const targetFingerprintSchema = z.object({
  semantic: z.record(z.unknown()).optional(),
  visual: z.record(z.unknown()).optional(),
  structure: z.record(z.unknown()).optional(),
  adapter_hints: z.record(z.record(z.unknown())).optional()
});

export const checkpointSchema = z.object({
  type: z.enum(["text_visible", "text_absent", "url_contains"]),
  value: z.unknown()
});

export const artifactStepSchema = z.object({
  id: z.string().min(1),
  phase: z.string().min(1),
  intent: z.string().min(1),
  risk: riskSchema,
  action: z.object({
    type: actionTypeSchema,
    target: z.object({
      id: z.string().min(1),
      description: z.string().min(1),
      fingerprint: targetFingerprintSchema,
      confidence: z.object({
        minimum: z.number().min(0).max(1),
        signals: z.array(z.string())
      }).optional()
    }).optional(),
    value: z.unknown().optional(),
    output_key: z.string().optional()
  }),
  checkpoint: checkpointSchema.optional(),
  recovery: z.array(z.record(z.unknown())).optional()
});

export const capabilityArtifactSchema = z.object({
  schema_version: z.literal("1.0"),
  capability: z.object({
    id: z.string(),
    name: z.string(),
    status: z.enum(["draft", "reviewed", "approved", "deprecated"]),
    risk_level: z.enum(["low", "moderate", "high"])
  }),
  surface: z.object({
    kind: z.string(),
    app_family: z.string(),
    supported_adapters: z.array(z.string())
  }),
  contract: z.object({
    inputs: z.record(z.record(z.unknown())),
    outputs: z.record(z.record(z.unknown()))
  }),
  safety: z.record(z.unknown()),
  phases: z.array(z.object({ id: z.string(), description: z.string() })),
  steps: z.array(artifactStepSchema),
  known_outcomes: z.array(z.object({
    code: z.string(),
    status: runStatusSchema,
    detect: z.record(z.unknown()),
    message: z.string().optional()
  })),
  handoff: z.object({
    mode: z.string().optional(),
    resume_checkpoint: checkpointSchema.optional()
  }),
  compatibility: z.object({
    app_family: z.string(),
    base_variant: z.string(),
    tested_variants: z.array(z.string()),
    required_features: z.array(z.string())
  }),
  variant_overlays: z.record(z.unknown()),
  evidence: z.record(z.unknown())
});

export type ArtifactStep = z.infer<typeof artifactStepSchema>;
export type CapabilityArtifact = z.infer<typeof capabilityArtifactSchema>;

export function parseCapabilityArtifact(value: unknown): CapabilityArtifact {
  return capabilityArtifactSchema.parse(value);
}
