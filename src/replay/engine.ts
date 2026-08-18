import type { CapabilityArtifact } from "../artifacts/schema.js";
import { parseCapabilityArtifact } from "../artifacts/schema.js";
import { applyVariantOverlay } from "../artifacts/overlays.js";
import { createEvidenceLogger } from "../evidence/logger.js";
import { performInteractiveHandoff } from "../handoff/manager.js";
import type { RunResult } from "../shared/result.js";
import { substituteParams } from "../shared/params.js";
import type { SafetyPolicy } from "../safety/policy.js";
import type { Observation, SurfaceAdapter } from "../surface/types.js";
import { detectOutcome } from "./outcome-detector.js";
import { resolveTarget } from "./target-resolver.js";

export type ReplayOptions = {
  artifact: CapabilityArtifact;
  params: Record<string, unknown>;
  surface: SurfaceAdapter;
  policy: SafetyPolicy;
  evidenceRoot: string;
  runId: string;
  tenantProfile?: string;
  allowDraft: boolean;
  interactiveHandoff?: boolean;
  waitForHandoffResume?: () => Promise<string>;
};

type Checkpoint = { type: string; value: unknown };

function toResolvedAction(step: CapabilityArtifact["steps"][number], locator: string, params: Record<string, unknown>) {
  const value = String(substituteParams(step.action.value, params) ?? "");
  if (step.action.type === "click") return { type: "click" as const, locator };
  if (step.action.type === "type") return { type: "type" as const, locator, value };
  if (step.action.type === "select") return { type: "select" as const, locator, value };
  if (step.action.type === "extract") return { type: "extract" as const, locator, output_key: step.action.output_key ?? step.id };
  if (step.action.type === "assert") return { type: "assert" as const, text: value };
  if (step.action.type === "wait") return { type: "wait" as const, ms: Number(value || 500) };
  return { type: "wait" as const, ms: 0 };
}

function checkpointMatches(checkpoint: unknown, observation: Observation): boolean {
  if (!checkpoint || typeof checkpoint !== "object") return true;
  const typed = checkpoint as Checkpoint;
  if (typed.type === "text_visible") {
    const expected = String(typed.value);
    return observation.visual.visible_text_blocks.some((block) => block.includes(expected));
  }
  if (typed.type === "text_absent") {
    const forbidden = String(typed.value);
    return observation.visual.visible_text_blocks.every((block) => !block.includes(forbidden));
  }
  if (typed.type === "url_contains") return observation.state.url.includes(String(typed.value));
  return false;
}

function missingDeclaredOutputs(artifact: CapabilityArtifact, outputs: Record<string, unknown>): string[] {
  return Object.keys(artifact.contract.outputs ?? {}).filter((key) => !(key in outputs));
}

export async function runReplay(options: ReplayOptions): Promise<RunResult> {
  const parsed = parseCapabilityArtifact(options.artifact);
  if (parsed.capability.status === "draft" && !options.allowDraft) {
    return { status: "blocked", capability_id: parsed.capability.id, run_id: options.runId, code: "draft_not_allowed", message: "Draft artifact replay requires --allow-draft.", evidence: {} };
  }
  const artifact = applyVariantOverlay(parsed, options.tenantProfile);
  const logger = await createEvidenceLogger(options.evidenceRoot, options.runId);
  await logger.event({ event: "replay_started", actor: "replay", status: "ok", params: options.params });
  const outputs: Record<string, unknown> = {};
  const resumeCheckpoint = artifact.handoff.resume_checkpoint && typeof artifact.handoff.resume_checkpoint === "object"
    ? artifact.handoff.resume_checkpoint as Checkpoint
    : { type: "text_visible", value: "Dashboard" };

  async function handleNeedsHuman(step: CapabilityArtifact["steps"][number], code: string, message: string): Promise<RunResult | "step_completed"> {
    if (!options.interactiveHandoff) {
      const result: RunResult = { status: "needs_human", capability_id: artifact.capability.id, run_id: options.runId, step_id: step.id, code, message, evidence: { log: logger.path("run-log.jsonl") } };
      await logger.result(result);
      return result;
    }
    const handoff = await performInteractiveHandoff({
      dir: `${options.evidenceRoot}/handoff-${step.id}`,
      intervention_id: `${options.runId}_${step.id}`,
      reason: code,
      step_id: step.id,
      message,
      surface: options.surface,
      resume_checkpoint: resumeCheckpoint,
      waitForResume: options.waitForHandoffResume
    });
    if (!handoff.resume_verified) {
      const result: RunResult = {
        status: "failure",
        capability_id: artifact.capability.id,
        run_id: options.runId,
        step_id: step.id,
        code: "handoff_resume_checkpoint_not_met",
        message: `Human handoff resumed, but checkpoint ${resumeCheckpoint.type} was not observed.`,
        evidence: { log: logger.path("run-log.jsonl") }
      };
      await logger.result(result);
      return result;
    }
    await logger.event({ event: "handoff_resumed", actor: "human", status: "ok", step_id: step.id, reason_summary: message, params: options.params });
    return "step_completed";
  }

  for (const step of artifact.steps) {
    const observation = await options.surface.observe({ recent_actions: [step.id] });
    const knownOutcome = detectOutcome(observation, artifact.known_outcomes);
    if (knownOutcome.status !== "continue") {
      if (knownOutcome.status === "needs_human") {
        const handoff = await handleNeedsHuman(step, knownOutcome.code, knownOutcome.message);
        if (handoff === "step_completed") continue;
        return handoff;
      }
      const result: RunResult = { status: knownOutcome.status, capability_id: artifact.capability.id, run_id: options.runId, step_id: step.id, code: knownOutcome.code, message: knownOutcome.message, evidence: { log: logger.path("run-log.jsonl") } };
      await logger.result(result);
      return result;
    }

    const safety = options.policy.evaluate({ origin: new URL(observation.state.url).origin, actionType: step.action.type, intent: step.intent, risk: step.risk });
    if (safety.decision === "blocked") {
      const result: RunResult = { status: "blocked", capability_id: artifact.capability.id, run_id: options.runId, step_id: step.id, code: safety.code, message: safety.message, evidence: { log: logger.path("run-log.jsonl") } };
      await logger.result(result);
      return result;
    }
    if (safety.decision === "needs_human") {
      const handoff = await handleNeedsHuman(step, safety.code, safety.message);
      if (handoff === "step_completed") continue;
      return handoff;
    }

    if (!step.action.target) {
      const result: RunResult = { status: "failure", capability_id: artifact.capability.id, run_id: options.runId, step_id: step.id, code: "invalid_artifact_step", message: `Step ${step.id} is missing a target.`, evidence: { log: logger.path("run-log.jsonl") } };
      await logger.result(result);
      return result;
    }
    const resolution = resolveTarget(step.action.target, observation);
    if (resolution.status === "ambiguous") {
      const handoff = await handleNeedsHuman(step, resolution.code, resolution.message);
      if (handoff === "step_completed") continue;
      return handoff;
    }
    if (resolution.status === "not_found") {
      const result: RunResult = { status: "failure", capability_id: artifact.capability.id, run_id: options.runId, step_id: step.id, code: "surface_drift_detected", message: resolution.message, evidence: { log: logger.path("run-log.jsonl") } };
      await logger.result(result);
      return result;
    }

    const actionResult = await options.surface.act(toResolvedAction(step, resolution.locator, options.params));
    if (!actionResult.ok) {
      const result: RunResult = { status: "failure", capability_id: artifact.capability.id, run_id: options.runId, step_id: step.id, code: "action_failed", message: actionResult.message ?? `Action ${step.action.type} failed.`, evidence: { log: logger.path("run-log.jsonl") } };
      await logger.result(result);
      return result;
    }
    Object.assign(outputs, actionResult.extracted ?? {});
    await logger.event({ event: "action_executed", actor: "replay", phase: step.phase, step_id: step.id, intent: step.intent, action_type: step.action.type, target_id: step.action.target.id, risk: step.risk, status: "ok", params: options.params });
    if (step.checkpoint) {
      const checkpointObservation = await options.surface.observe({ recent_actions: [step.id, "checkpoint"] });
      if (!checkpointMatches(step.checkpoint, checkpointObservation)) {
        const result: RunResult = { status: "failure", capability_id: artifact.capability.id, run_id: options.runId, step_id: step.id, code: "checkpoint_not_met", message: `Checkpoint ${step.checkpoint.type} was not observed after ${step.id}.`, evidence: { log: logger.path("run-log.jsonl") } };
        await logger.result(result);
        return result;
      }
    }
  }

  const missingOutputs = missingDeclaredOutputs(artifact, outputs);
  if (missingOutputs.length > 0) {
    const result: RunResult = { status: "failure", capability_id: artifact.capability.id, run_id: options.runId, code: "missing_declared_outputs", message: `Replay completed without declared outputs: ${missingOutputs.join(", ")}.`, evidence: { log: logger.path("run-log.jsonl") } };
    await logger.result(result);
    return result;
  }

  const result: RunResult = { status: "success", capability_id: artifact.capability.id, run_id: options.runId, message: "Replay completed.", outputs, evidence: { log: logger.path("run-log.jsonl") } };
  await logger.result(result);
  return result;
}
