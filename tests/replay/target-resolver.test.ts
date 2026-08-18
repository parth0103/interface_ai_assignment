import { describe, expect, it } from "vitest";
import { resolveTarget } from "../../src/replay/target-resolver.js";
import type { Observation } from "../../src/surface/types.js";

const observation: Observation = {
  state: { surface_kind: "browser", url: "http://localhost:3000", title: "Member Profile", recent_actions: [] },
  visual: { screenshot_path: "shot.png", send_to_llm: false, viewport: { width: 1280, height: 720 }, visible_text_blocks: ["Member Profile", "Accounts", "Loans", "Offers"] },
  accessibility: { controls: [{ role: "tab", name: "Offers", enabled: true }] },
  structure: { tables: [], forms: [], regions: [{ name: "profile_tabs", text: "Accounts Loans Offers" }] },
  policy: {}
};

describe("target resolver", () => {
  it("resolves a unique semantic role/name target to a Playwright locator", () => {
    const result = resolveTarget({
      id: "offers_tab",
      description: "Offers tab",
      fingerprint: { semantic: { role: "tab", name: "Offers" } },
      confidence: { minimum: 0.85, signals: ["role_name_match", "unique_match"] }
    }, observation);
    expect(result).toEqual({ status: "resolved", locator: "role=tab[name=\"Offers\"]", score: 1 });
  });

  it("returns needs_human for ambiguous targets", () => {
    const ambiguous = { ...observation, accessibility: { controls: [{ role: "link", name: "Open Member", enabled: true }, { role: "link", name: "Open Member", enabled: true }] } };
    const result = resolveTarget({
      id: "open_member",
      description: "Open Member link",
      fingerprint: { semantic: { role: "link", name: "Open Member" } },
      confidence: { minimum: 0.85, signals: ["role_name_match", "unique_match"] }
    }, ambiguous);
    expect(result.status).toBe("ambiguous");
  });
});
