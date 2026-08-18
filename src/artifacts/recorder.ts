import type { CapabilityDefinition } from "../capabilities/auto-loan-offer-review.js";
import type { ProposedAction } from "../llm/types.js";
import type { CapabilityArtifact } from "./schema.js";

type RecordedStep = {
  id: string;
  phase: string;
  intent: string;
  risk: "safe" | "approval_required" | "blocked";
  action: ProposedAction;
  checkpoint?: { type: "text_visible" | "text_absent" | "url_contains"; value: unknown };
};

export function recordCapabilityArtifact(input: {
  capability: CapabilityDefinition;
  goal: string;
  params: Record<string, unknown>;
  steps: RecordedStep[];
  outputs: Record<string, unknown>;
}): CapabilityArtifact {
  return {
    schema_version: "1.0",
    capability: input.capability.capability,
    surface: input.capability.surface,
    contract: input.capability.contract,
    safety: input.capability.safety,
    phases: input.capability.phases,
    steps: input.steps.map((step) => ({
      id: step.id,
      phase: step.phase,
      intent: step.intent,
      risk: step.risk,
      action: {
        type: step.action.type,
        value: step.action.value,
        output_key: step.action.output_key,
        target: step.action.target ? {
          id: step.id,
          description: step.action.target.description,
          fingerprint: {
            semantic: step.action.target.semantic,
            visual: step.action.target.visual,
            structure: step.action.target.structure
          },
          confidence: { minimum: 0.85, signals: ["role_name_match", "visible_text_match", "unique_match"] }
        } : undefined
      },
      checkpoint: step.checkpoint
    })),
    known_outcomes: input.capability.known_outcomes,
    handoff: input.capability.handoff,
    compatibility: input.capability.compatibility,
    variant_overlays: input.capability.variant_overlays,
    evidence: { source_goal: input.goal }
  };
}
