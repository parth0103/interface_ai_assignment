import { recordCapabilityArtifact } from "../artifacts/recorder.js";
import type { CapabilityArtifact } from "../artifacts/schema.js";
import type { CapabilityDefinition } from "../capabilities/auto-loan-offer-review.js";
import { createEvidenceLogger } from "../evidence/logger.js";
import type { LLMClient, ProposedAction } from "../llm/types.js";
import { resolveTarget } from "../replay/target-resolver.js";
import type { SafetyPolicy } from "../safety/policy.js";
import type { ActionResult, ResolvedAction, SurfaceAdapter } from "../surface/types.js";

type DiscoveryOptions = {
  goal: string;
  target: string;
  params: Record<string, unknown>;
  capability: CapabilityDefinition;
  llm: LLMClient;
  surface: SurfaceAdapter;
  policy: SafetyPolicy;
  evidenceRoot: string;
  runId: string;
  maxSteps: number;
};

export type DiscoveryResult =
  | { status: "success"; artifact: CapabilityArtifact }
  | { status: "needs_human" | "failure" | "blocked"; code: string; message: string };

type RecordedDiscoveryStep = {
  id: string;
  phase: string;
  intent: string;
  risk: "safe";
  action: ProposedAction;
  checkpoint?: { type: "text_visible" | "text_absent" | "url_contains"; value: unknown };
};

function toResolvedAction(action: ProposedAction, locator: string): ResolvedAction {
  if (action.type === "click") return { type: "click", locator };
  if (action.type === "type") return { type: "type", locator, value: String(action.value ?? "") };
  if (action.type === "select") return { type: "select", locator, value: String(action.value ?? "") };
  if (action.type === "extract") return { type: "extract", locator, output_key: action.output_key ?? "value" };
  if (action.type === "assert") return { type: "assert", text: String(action.value ?? "") };
  if (action.type === "wait") return { type: "wait", ms: Number(action.value ?? 500) };
  return { type: "wait", ms: 0 };
}

function inferPhase(intent: string): string {
  if (/offer/.test(intent)) return "open_offer";
  if (/review|vehicle|continue/.test(intent)) return "advance_to_review";
  if (/extract/.test(intent)) return "extract_outputs";
  return "find_member";
}

function defaultCheckpoint(action: ProposedAction): { type: "text_visible"; value: unknown } | undefined {
  const visual = action.target?.visual?.anchor_text;
  if (typeof visual === "string") return { type: "text_visible", value: visual };
  const name = action.target?.semantic?.name;
  if (typeof name === "string") return { type: "text_visible", value: name };
  return undefined;
}

export async function runDiscovery(options: DiscoveryOptions): Promise<DiscoveryResult> {
  const logger = await createEvidenceLogger(options.evidenceRoot, options.runId);
  await options.surface.open(options.target);
  const recentActions: string[] = [];
  const recordedSteps: RecordedDiscoveryStep[] = [];

  for (let stepIndex = 0; stepIndex < options.maxSteps; stepIndex += 1) {
    const observation = await options.surface.observe({ recent_actions: recentActions });
    const decision = await options.llm.decide({ goal: options.goal, observation, params: options.params, recentActions });
    await logger.event({
      event: "llm_decision",
      actor: "gemini",
      status: "ok",
      step_id: `discovery_${stepIndex}`,
      reason_summary: decision.reason_summary,
      params: options.params
    });

    if (decision.decision === "finish") {
      const artifact = recordCapabilityArtifact({
        capability: options.capability,
        goal: options.goal,
        params: options.params,
        steps: recordedSteps,
        outputs: decision.outputs
      });
      return { status: "success", artifact };
    }

    if (decision.decision === "escalate") {
      return { status: "needs_human", code: decision.code, message: decision.message };
    }

    const safety = options.policy.evaluate({
      origin: new URL(observation.state.url).origin,
      actionType: decision.action.type,
      intent: decision.action.intent,
      risk: "safe"
    });
    if (safety.decision === "blocked") return { status: "blocked", code: safety.code, message: safety.message };
    if (safety.decision === "needs_human") return { status: "needs_human", code: safety.code, message: safety.message };

    if (!decision.action.target && !["assert", "wait"].includes(decision.action.type)) {
      return { status: "failure", code: "missing_target", message: "LLM action did not include a target." };
    }

    let actionResult: ActionResult = { ok: true };
    if (decision.action.target) {
      const resolution = resolveTarget({
        id: decision.action.intent,
        description: decision.action.target.description,
        fingerprint: {
          semantic: decision.action.target.semantic,
          visual: decision.action.target.visual,
          structure: decision.action.target.structure
        },
        confidence: { minimum: 0.85, signals: ["role_name_match", "visible_text_match", "unique_match"] }
      }, observation);
      if (resolution.status !== "resolved") {
        return {
          status: resolution.status === "ambiguous" ? "needs_human" : "failure",
          code: resolution.code,
          message: resolution.message
        };
      }
      actionResult = await options.surface.act(toResolvedAction(decision.action, resolution.locator));
    } else {
      actionResult = await options.surface.act(toResolvedAction(decision.action, ""));
    }

    if (!actionResult.ok) {
      return { status: "failure", code: "action_failed", message: actionResult.message ?? `Action ${decision.action.type} failed.` };
    }

    const stepId = decision.action.intent;
    recentActions.push(stepId);
    recordedSteps.push({
      id: stepId,
      phase: inferPhase(decision.action.intent),
      intent: decision.action.intent,
      risk: "safe",
      action: decision.action,
      checkpoint: defaultCheckpoint(decision.action)
    });
  }

  return { status: "failure", code: "max_steps_exceeded", message: "Discovery exceeded max_steps." };
}
