import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createIntervention, performInteractiveHandoff, recordHumanResume } from "../../src/handoff/manager.js";
import type { ActionResult, EvidenceRef, Observation, ObservationContext, ResolvedAction, SurfaceAdapter } from "../../src/surface/types.js";

class FakeSurface implements SurfaceAdapter {
  async open(): Promise<void> {}
  async observe(_context: ObservationContext): Promise<Observation> {
    return {
      state: { surface_kind: "browser", url: "http://localhost:3000/member/123", title: "Member Profile", recent_actions: [] },
      visual: { screenshot_path: "after.png", send_to_llm: false, viewport: { width: 1, height: 1 }, visible_text_blocks: ["Member Profile", "Auto Loan Offers"] },
      accessibility: { controls: [] },
      structure: { tables: [], forms: [], regions: [{ name: "body", text: "Member Profile Auto Loan Offers" }] },
      policy: {}
    };
  }
  async act(_action: ResolvedAction): Promise<ActionResult> { return { ok: true }; }
  async captureEvidence(label: string): Promise<EvidenceRef> { return { path: `${label}.png`, kind: "screenshot" }; }
}

describe("handoff manager", () => {
  it("writes intervention and human resume records", async () => {
    const dir = await mkdtemp(join(tmpdir(), "handoff-"));
    try {
      const interventionPath = await createIntervention({
        dir,
        intervention_id: "int_001",
        reason: "ambiguous_member_match",
        step_id: "select_member_result",
        before_screenshot: "before.png",
        message: "Multiple member records matched."
      });
      await recordHumanResume({
        dir,
        intervention_id: "int_001",
        reason: "ambiguous_member_match",
        before_screenshot: "before.png",
        after_screenshot: "after.png",
        human_summary: "Operator selected the Avery Patel row with DOB ending 1991.",
        resume_checkpoint: { type: "text_visible", value: "Member Profile" },
        resume_verified: true
      });
      expect(JSON.parse(await readFile(interventionPath, "utf8")).controller).toBe("human");
      expect(await readFile(join(dir, "human-resume.json"), "utf8")).toContain("DOB ending 1991");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("performs a same-session handoff and returns control to automation", async () => {
    const dir = await mkdtemp(join(tmpdir(), "handoff-"));
    try {
      await performInteractiveHandoff({
        dir,
        intervention_id: "int_002",
        reason: "ambiguous_member_match",
        step_id: "select_member_result",
        message: "Multiple member records matched.",
        surface: new FakeSurface(),
        resume_checkpoint: { type: "text_visible", value: "Member Profile" },
        waitForResume: async () => "Operator selected the Avery Patel row."
      });
      const resume = JSON.parse(await readFile(join(dir, "human-resume.json"), "utf8"));
      expect(resume.human_summary).toContain("Avery Patel");
      expect(resume.resume_verified).toBe(true);
      expect(JSON.parse(await readFile(join(dir, "control-lease.json"), "utf8")).controller).toBe("automation");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
