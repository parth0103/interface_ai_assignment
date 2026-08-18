import { describe, expect, it } from "vitest";
import { buildDiscoveryPrompt } from "../../src/llm/prompt.js";
import type { Observation } from "../../src/surface/types.js";

const observation: Observation = {
  state: { surface_kind: "browser", url: "http://localhost:3000", title: "Dashboard", recent_actions: [] },
  visual: { screenshot_path: "evidence/shot.png", send_to_llm: false, viewport: { width: 1280, height: 720 }, visible_text_blocks: ["Dashboard", "Member Search"] },
  accessibility: { controls: [{ role: "link", name: "Member Search", enabled: true }] },
  structure: { tables: [], forms: [], regions: [] },
  policy: { blocked_intents: ["submit_final_application"] }
};

describe("discovery prompt", () => {
  it("includes the goal, visible controls, and JSON-only instruction", () => {
    const prompt = buildDiscoveryPrompt({ goal: "Find member 24816", observation, params: { member_id: "24816" }, recentActions: [] });
    expect(prompt).toContain("Find member 24816");
    expect(prompt).toContain("Member Search");
    expect(prompt).toContain("Return exactly one JSON object");
  });

  it("explains the observation layers and how to use them", () => {
    const prompt = buildDiscoveryPrompt({ goal: "Find member 24816", observation, params: { member_id: "24816" }, recentActions: [] });
    expect(prompt).toContain("Controls are accessibility-derived");
    expect(prompt).toContain("Prefer semantic targets");
    expect(prompt).toContain("Use Structure for tables, forms, regions");
  });

  it("references the configured response schema instead of duplicating it", () => {
    const prompt = buildDiscoveryPrompt({ goal: "Find member 24816", observation, params: { member_id: "24816" }, recentActions: [] });
    expect(prompt).toContain("configured response schema");
    expect(prompt).not.toContain("\"decision\":\"act\"");
  });

  it("does not include local screenshot path when screenshot upload is disabled", () => {
    const prompt = buildDiscoveryPrompt({ goal: "Find member 24816", observation, params: { member_id: "24816" }, recentActions: [] });
    expect(prompt).not.toContain("evidence/shot.png");
  });

  it("includes the screenshot path only when screenshot upload is enabled for the observation", () => {
    const prompt = buildDiscoveryPrompt({
      goal: "Find member 24816",
      observation: { ...observation, visual: { ...observation.visual, send_to_llm: true } },
      params: { member_id: "24816" },
      recentActions: []
    });

    expect(prompt).toContain("evidence/shot.png");
  });
});
