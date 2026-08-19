import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runDiscovery } from "../../src/agent/discovery-agent.js";
import { autoLoanOfferReviewCapability } from "../../src/capabilities/auto-loan-offer-review.js";
import { MockLLMClient } from "../../src/llm/mock.js";
import { createDefaultSafetyPolicy } from "../../src/safety/policy.js";
import type { ActionResult, EvidenceRef, Observation, ObservationContext, ResolvedAction, SurfaceAdapter } from "../../src/surface/types.js";

class FakeSurface implements SurfaceAdapter {
  actions: ResolvedAction[] = [];

  async open(): Promise<void> {}

  async observe(_context: ObservationContext): Promise<Observation> {
    return {
      state: { surface_kind: "browser", url: "http://localhost:3000", title: "Dashboard", recent_actions: [] },
      visual: { screenshot_path: "shot.png", send_to_llm: false, viewport: { width: 1, height: 1 }, visible_text_blocks: ["Dashboard", "Member Search", "Review Status: Ready for final review"] },
      accessibility: { controls: [{ role: "link", name: "Member Search", enabled: true }, { role: "textbox", name: "Member ID", enabled: true }] },
      structure: { tables: [], forms: [], regions: [] },
      policy: {}
    };
  }

  async act(action: ResolvedAction): Promise<ActionResult> {
    this.actions.push(action);
    return { ok: true };
  }

  async captureEvidence(label: string): Promise<EvidenceRef> {
    return { path: `${label}.png`, kind: "screenshot" };
  }
}

class SequenceSurface implements SurfaceAdapter {
  actions: ResolvedAction[] = [];

  constructor(private readonly observations: Observation[]) {}

  async open(): Promise<void> {}

  async observe(_context: ObservationContext): Promise<Observation> {
    return this.observations.shift() ?? this.observations[this.observations.length - 1] ?? {
      state: { surface_kind: "browser", url: "http://localhost:3000", title: "Dashboard", recent_actions: [] },
      visual: { screenshot_path: "shot.png", send_to_llm: false, viewport: { width: 1, height: 1 }, visible_text_blocks: ["Dashboard"] },
      accessibility: { controls: [] },
      structure: { tables: [], forms: [], regions: [] },
      policy: {}
    };
  }

  async act(action: ResolvedAction): Promise<ActionResult> {
    this.actions.push(action);
    return { ok: true };
  }

  async captureEvidence(label: string): Promise<EvidenceRef> {
    return { path: `${label}.png`, kind: "screenshot" };
  }
}

function observedPage(title: string, text: string[], controls: Observation["accessibility"]["controls"]): Observation {
  return {
    state: { surface_kind: "browser", url: "http://localhost:3000", title, recent_actions: [] },
    visual: { screenshot_path: "shot.png", send_to_llm: false, viewport: { width: 1, height: 1 }, visible_text_blocks: text },
    accessibility: { controls },
    structure: { tables: [], forms: [], regions: [] },
    policy: {}
  };
}

const noOutputCapability = {
  ...autoLoanOfferReviewCapability,
  contract: { ...autoLoanOfferReviewCapability.contract, outputs: {} }
};

describe("runDiscovery", () => {
  it("executes bounded LLM actions and emits a draft artifact", async () => {
    const dir = await mkdtemp(join(tmpdir(), "discovery-"));
    try {
      const surface = new FakeSurface();
      const result = await runDiscovery({
        goal: "Find member 24816",
        target: "http://localhost:3000",
        params: { member_id: "24816", vehicle_type: "used" },
        capability: autoLoanOfferReviewCapability,
        llm: new MockLLMClient([
          { decision: "act", reason_summary: "Open search", action: { type: "click", intent: "open_member_search", target: { description: "Member Search link", semantic: { role: "link", name: "Member Search" } } } },
          { decision: "act", reason_summary: "Type member id", action: { type: "type", intent: "type_member_id", target: { description: "Member ID field", semantic: { role: "textbox", name: "Member ID" } }, value: "{{member_id}}" } },
          { decision: "act", reason_summary: "Extract review status", action: { type: "extract", intent: "extract_review_status", target: { description: "Review status text", visual: { anchor_text: "Review Status: Ready for final review" } }, output_key: "review_status" } },
          { decision: "finish", reason_summary: "Done", outputs: { review_status: "ready_for_final_review" } }
        ]),
        surface,
        policy: createDefaultSafetyPolicy("demo"),
        evidenceRoot: dir,
        runId: "run_discovery",
        maxSteps: 5
      });

      expect(result.status).toBe("success");
      if (result.status !== "success") throw new Error("Expected discovery success.");
      expect(result.artifact.capability.status).toBe("draft");
      expect(surface.actions).toHaveLength(3);
      expect(surface.actions[1]).toMatchObject({ type: "type", value: "24816" });
      expect(result.artifact.steps.find((step) => step.id === "extract_review_status")?.phase).toBe("extract_outputs");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("logs sanitized LLM decision metadata without raw model reasoning", async () => {
    const dir = await mkdtemp(join(tmpdir(), "discovery-"));
    try {
      const surface = new FakeSurface();
      const result = await runDiscovery({
        goal: "Find member 24816",
        target: "http://localhost:3000",
        params: { member_id: "24816", token: "secret" },
        capability: noOutputCapability,
        llm: new MockLLMClient([
          { decision: "act", reason_summary: "Open search", action: { type: "click", intent: "open_member_search", target: { description: "Member Search link", semantic: { role: "link", name: "Member Search" } } } },
          { decision: "finish", reason_summary: "Done", outputs: {} }
        ]),
        surface,
        policy: createDefaultSafetyPolicy("demo"),
        evidenceRoot: dir,
        runId: "run_discovery",
        maxSteps: 5
      });

      expect(result.status).toBe("success");
      const logLines = (await readFile(join(dir, "run_discovery", "run-log.jsonl"), "utf8")).trim().split("\n").map((line) => JSON.parse(line));
      expect(logLines[0]).toMatchObject({
        event: "discovery_started",
        actor: "llm",
        provider: "mock",
        model: "scripted-mock",
        screenshot_context: false,
        target: "http://localhost:3000"
      });
      expect(logLines[1]).toMatchObject({
        event: "llm_decision",
        actor: "llm",
        provider: "mock",
        model: "scripted-mock",
        decision: "act",
        action_type: "click",
        intent: "open_member_search",
        target_description: "Member Search link",
        observation_screenshot: "shot.png",
        status: "ok"
      });
      expect(JSON.stringify(logLines)).not.toContain("secret");
      expect(JSON.stringify(logLines)).not.toContain("24816");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("records post-action page state as the replay checkpoint", async () => {
    const dir = await mkdtemp(join(tmpdir(), "discovery-"));
    try {
      const surface = new SequenceSurface([
        observedPage("Member Search", ["Member Search", "Open Member"], [{ role: "link", name: "Open Member", enabled: true }]),
        observedPage("Member Profile", ["Member Profile"], []),
        observedPage("Member Profile", ["Member Profile"], [])
      ]);
      const result = await runDiscovery({
        goal: "Open member",
        target: "http://localhost:3000",
        params: {},
        capability: noOutputCapability,
        llm: new MockLLMClient([
          { decision: "act", reason_summary: "Open member", action: { type: "click", intent: "open_member_profile", target: { description: "Open Member link", semantic: { role: "link", name: "Open Member" } } } },
          { decision: "finish", reason_summary: "Done", outputs: { review_status: "ready_for_final_review" } }
        ]),
        surface,
        policy: createDefaultSafetyPolicy("demo"),
        evidenceRoot: dir,
        runId: "run_discovery",
        maxSteps: 5
      });

      if (result.status !== "success") throw new Error("Expected discovery success.");
      expect(result.artifact.steps[0].checkpoint).toEqual({ type: "text_visible", value: "Member Profile" });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("uses the actual visible title block when title casing differs", async () => {
    const dir = await mkdtemp(join(tmpdir(), "discovery-"));
    try {
      const surface = new SequenceSurface([
        observedPage("Member Profile", ["Member Profile", "Offers"], [{ role: "tab", name: "Offers", enabled: true }]),
        observedPage("Pre-approved Offers", ["Pre-approved offers"], []),
        observedPage("Pre-approved Offers", ["Pre-approved offers"], [])
      ]);
      const result = await runDiscovery({
        goal: "Open offers",
        target: "http://localhost:3000",
        params: {},
        capability: noOutputCapability,
        llm: new MockLLMClient([
          { decision: "act", reason_summary: "Open offers", action: { type: "click", intent: "open_offers_tab", target: { description: "Offers tab", semantic: { role: "tab", name: "Offers" } } } },
          { decision: "finish", reason_summary: "Done", outputs: { review_status: "ready_for_final_review" } }
        ]),
        surface,
        policy: createDefaultSafetyPolicy("demo"),
        evidenceRoot: dir,
        runId: "run_discovery",
        maxSteps: 5
      });

      if (result.status !== "success") throw new Error("Expected discovery success.");
      expect(result.artifact.steps[0].checkpoint).toEqual({ type: "text_visible", value: "Pre-approved offers" });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("can throttle between LLM decisions for rate-limited real models", async () => {
    const dir = await mkdtemp(join(tmpdir(), "discovery-"));
    try {
      const waits: number[] = [];
      const surface = new FakeSurface();
      const result = await runDiscovery({
        goal: "Find member 24816",
        target: "http://localhost:3000",
        params: { member_id: "24816" },
        capability: noOutputCapability,
        llm: new MockLLMClient([
          { decision: "act", reason_summary: "Open search", action: { type: "click", intent: "open_member_search", target: { description: "Member Search link", semantic: { role: "link", name: "Member Search" } } } },
          { decision: "act", reason_summary: "Type member", action: { type: "type", intent: "type_member_id", target: { description: "Member ID field", semantic: { role: "textbox", name: "Member ID" } }, value: "{{member_id}}" } },
          { decision: "finish", reason_summary: "Done", outputs: { review_status: "ready_for_final_review" } }
        ]),
        surface,
        policy: createDefaultSafetyPolicy("demo"),
        evidenceRoot: dir,
        runId: "run_discovery",
        maxSteps: 5,
        llmDelayMs: 25,
        wait: async (ms) => {
          waits.push(ms);
        }
      });

      expect(result.status).toBe("success");
      expect(waits).toEqual([25, 25]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("does not emit a successful artifact until declared outputs have extract steps", async () => {
    const dir = await mkdtemp(join(tmpdir(), "discovery-"));
    try {
      const surface = new FakeSurface();
      const result = await runDiscovery({
        goal: "Find member 24816",
        target: "http://localhost:3000",
        params: { member_id: "24816" },
        capability: autoLoanOfferReviewCapability,
        llm: new MockLLMClient([
          { decision: "finish", reason_summary: "Final Review is visible.", outputs: { review_status: "ready_for_final_review" } }
        ]),
        surface,
        policy: createDefaultSafetyPolicy("demo"),
        evidenceRoot: dir,
        runId: "run_discovery",
        maxSteps: 5
      });

      expect(result).toEqual({
        status: "failure",
        code: "missing_output_extraction",
        message: "Discovery cannot finish until declared outputs have extract steps: review_status."
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
