import { mkdtemp, rm } from "node:fs/promises";
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
});
