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

function parameterizeValue(value: unknown, params: Record<string, unknown>): unknown {
  if (typeof value === "string") {
    let parameterized = value;
    for (const [key, paramValue] of Object.entries(params)) {
      if (["string", "number", "boolean"].includes(typeof paramValue)) {
        const paramText = String(paramValue);
        if (paramText) parameterized = parameterized.split(paramText).join(`{{${key}}}`);
      }
    }
    return parameterized;
  }
  if (Array.isArray(value)) return value.map((item) => parameterizeValue(item, params));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, parameterizeValue(nested, params)]));
  }
  for (const [key, paramValue] of Object.entries(params)) {
    if (["string", "number", "boolean"].includes(typeof paramValue) && String(value) === String(paramValue)) {
      return `{{${key}}}`;
    }
  }
  return value;
}

function parameterizeStructure(value: unknown, params: Record<string, unknown>): unknown {
  if (typeof value === "string") {
    const matchingKeys = Object.entries(params)
      .filter(([, paramValue]) => ["string", "number", "boolean"].includes(typeof paramValue) && value.includes(String(paramValue)))
      .map(([key]) => `{{${key}}}`);
    return matchingKeys.length > 0 ? matchingKeys.join(" ") : parameterizeValue(value, params);
  }
  if (Array.isArray(value)) return value.map((item) => parameterizeStructure(item, params));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, parameterizeStructure(nested, params)]));
  }
  return value;
}

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
        value: parameterizeValue(step.action.value, input.params),
        output_key: step.action.output_key,
        target: step.action.target ? {
          id: step.id,
          description: String(parameterizeValue(step.action.target.description, input.params)),
          fingerprint: {
            semantic: parameterizeValue(step.action.target.semantic, input.params) as Record<string, unknown> | undefined,
            visual: parameterizeValue(step.action.target.visual, input.params) as Record<string, unknown> | undefined,
            structure: parameterizeStructure(step.action.target.structure, input.params) as Record<string, unknown> | undefined
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
    evidence: { source_goal: parameterizeValue(input.goal, input.params) }
  };
}
