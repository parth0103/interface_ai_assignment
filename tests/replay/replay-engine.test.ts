import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runReplay } from "../../src/replay/engine.js";
import { createDefaultSafetyPolicy } from "../../src/safety/policy.js";
import type { SurfaceAdapter, Observation, ResolvedAction, ActionResult, EvidenceRef, ObservationContext } from "../../src/surface/types.js";

class FakeSurface implements SurfaceAdapter {
  actions: ResolvedAction[] = [];
  private observations: Observation[];
  private lastObservation: Observation;
  constructor(observations: Observation | Observation[]) {
    this.observations = Array.isArray(observations) ? [...observations] : [observations];
    this.lastObservation = this.observations[0] as Observation;
  }
  async open(): Promise<void> {}
  async observe(_context: ObservationContext): Promise<Observation> {
    const next = this.observations.shift();
    if (next) this.lastObservation = next;
    return this.lastObservation;
  }
  async act(action: ResolvedAction): Promise<ActionResult> { this.actions.push(action); return { ok: true, extracted: action.type === "extract" ? { review_status: "ready_for_final_review" } : undefined }; }
  async captureEvidence(label: string): Promise<EvidenceRef> { return { path: `${label}.png`, kind: "screenshot" }; }
}

function observation(text: string): Observation {
  return {
    state: { surface_kind: "browser", url: "http://localhost:3000", title: "Final Review", recent_actions: [] },
    visual: { screenshot_path: "shot.png", send_to_llm: false, viewport: { width: 1, height: 1 }, visible_text_blocks: [text] },
    accessibility: { controls: [{ role: "button", name: "Submit Final Application", enabled: true }, { role: "link", name: "Member Search", enabled: true }] },
    structure: { tables: [], forms: [], regions: [{ name: "body", text }] },
    policy: {}
  };
}

describe("runReplay", () => {
  it("blocks forbidden intents before clicking", async () => {
    const dir = await mkdtemp(join(tmpdir(), "replay-"));
    try {
      const surface = new FakeSurface(observation("Final Review Ready for final review"));
      const result = await runReplay({
        artifact: {
          schema_version: "1.0",
          capability: { id: "prepare_auto_loan_offer_review", name: "Prepare", status: "draft", risk_level: "moderate" },
          surface: { kind: "browser", app_family: "loan_servicing_portal", supported_adapters: ["browser.playwright"] },
          contract: { inputs: {}, outputs: {} },
          safety: {},
          phases: [{ id: "blocked", description: "Blocked" }],
          steps: [{
            id: "submit_final_application",
            phase: "blocked",
            intent: "submit_final_application",
            risk: "blocked",
            action: { type: "click", target: { id: "submit", description: "Submit Final Application", fingerprint: { semantic: { role: "button", name: "Submit Final Application" } }, confidence: { minimum: 0.85, signals: [] } } }
          }],
          known_outcomes: [],
          handoff: {},
          compatibility: { app_family: "loan_servicing_portal", base_variant: "default", tested_variants: ["default"], required_features: [] },
          variant_overlays: {},
          evidence: {}
        },
        params: {},
        surface,
        policy: createDefaultSafetyPolicy("demo"),
        evidenceRoot: dir,
        runId: "run_blocked",
        allowDraft: true
      });
      expect(result.status).toBe("blocked");
      expect(surface.actions).toHaveLength(0);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("pauses for same-session handoff and resumes replay when interactive handoff is enabled", async () => {
    const dir = await mkdtemp(join(tmpdir(), "replay-"));
    try {
      const surface = new FakeSurface([
        observation("Multiple member records matched"),
        observation("Dashboard Member Search")
      ]);
      const result = await runReplay({
        artifact: {
          schema_version: "1.0",
          capability: { id: "prepare_auto_loan_offer_review", name: "Prepare", status: "draft", risk_level: "moderate" },
          surface: { kind: "browser", app_family: "loan_servicing_portal", supported_adapters: ["browser.playwright"] },
          contract: { inputs: {}, outputs: {} },
          safety: {},
          phases: [{ id: "find_member", description: "Find member" }],
          steps: [{
            id: "open_member_search",
            phase: "find_member",
            intent: "open_member_search",
            risk: "safe",
            action: { type: "click", target: { id: "member_search", description: "Member Search link", fingerprint: { semantic: { role: "link", name: "Member Search" } }, confidence: { minimum: 0.85, signals: [] } } }
          }],
          known_outcomes: [
            { code: "ambiguous_member_match", status: "needs_human", detect: { type: "text_visible", value: "Multiple member records matched" }, message: "Multiple member records matched." }
          ],
          handoff: { mode: "same_session_cli", resume_checkpoint: { type: "text_visible", value: "Dashboard" } },
          compatibility: { app_family: "loan_servicing_portal", base_variant: "default", tested_variants: ["default"], required_features: [] },
          variant_overlays: {},
          evidence: {}
        },
        params: {},
        surface,
        policy: createDefaultSafetyPolicy("demo"),
        evidenceRoot: dir,
        runId: "run_handoff",
        allowDraft: true,
        interactiveHandoff: true,
        waitForHandoffResume: async () => "Operator selected the correct member row."
      });
      expect(result.status).toBe("success");
      expect(surface.actions).toHaveLength(0);
      expect(await readFile(join(dir, "handoff-open_member_search", "human-resume.json"), "utf8")).toContain("correct member row");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("returns extracted outputs declared by the capability contract", async () => {
    const dir = await mkdtemp(join(tmpdir(), "replay-"));
    try {
      const surface = new FakeSurface([observation("Ready for final review"), observation("Ready for final review")]);
      const result = await runReplay({
        artifact: {
          schema_version: "1.0",
          capability: { id: "prepare_auto_loan_offer_review", name: "Prepare", status: "draft", risk_level: "moderate" },
          surface: { kind: "browser", app_family: "loan_servicing_portal", supported_adapters: ["browser.playwright"] },
          contract: { inputs: {}, outputs: { review_status: { type: "string", sensitivity: "low" } } },
          safety: {},
          phases: [{ id: "review", description: "Review" }],
          steps: [{
            id: "extract_review_status",
            phase: "review",
            intent: "extract_review_status",
            risk: "safe",
            action: { type: "extract", output_key: "review_status", target: { id: "status", description: "Review status", fingerprint: { semantic: { role: "link", name: "Member Search" } }, confidence: { minimum: 0.85, signals: [] } } },
            checkpoint: { type: "text_visible", value: "Ready for final review" }
          }],
          known_outcomes: [],
          handoff: {},
          compatibility: { app_family: "loan_servicing_portal", base_variant: "default", tested_variants: ["default"], required_features: [] },
          variant_overlays: {},
          evidence: {}
        },
        params: {},
        surface,
        policy: createDefaultSafetyPolicy("demo"),
        evidenceRoot: dir,
        runId: "run_extract",
        allowDraft: true
      });
      expect(result.status).toBe("success");
      expect(result.outputs).toEqual({ review_status: "ready_for_final_review" });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("fails when a step checkpoint is not observed after the action", async () => {
    const dir = await mkdtemp(join(tmpdir(), "replay-"));
    try {
      const surface = new FakeSurface([observation("Dashboard Member Search"), observation("Still loading")]);
      const result = await runReplay({
        artifact: {
          schema_version: "1.0",
          capability: { id: "prepare_auto_loan_offer_review", name: "Prepare", status: "draft", risk_level: "moderate" },
          surface: { kind: "browser", app_family: "loan_servicing_portal", supported_adapters: ["browser.playwright"] },
          contract: { inputs: {}, outputs: {} },
          safety: {},
          phases: [{ id: "find_member", description: "Find member" }],
          steps: [{
            id: "open_member_search",
            phase: "find_member",
            intent: "open_member_search",
            risk: "safe",
            action: { type: "click", target: { id: "member_search", description: "Member Search link", fingerprint: { semantic: { role: "link", name: "Member Search" } }, confidence: { minimum: 0.85, signals: [] } } },
            checkpoint: { type: "text_visible", value: "Member Search Results" }
          }],
          known_outcomes: [],
          handoff: {},
          compatibility: { app_family: "loan_servicing_portal", base_variant: "default", tested_variants: ["default"], required_features: [] },
          variant_overlays: {},
          evidence: {}
        },
        params: {},
        surface,
        policy: createDefaultSafetyPolicy("demo"),
        evidenceRoot: dir,
        runId: "run_checkpoint_failure",
        allowDraft: true
      });
      expect(result.status).toBe("failure");
      expect(result.code).toBe("checkpoint_not_met");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
