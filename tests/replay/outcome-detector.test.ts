import { describe, expect, it } from "vitest";
import { detectOutcome } from "../../src/replay/outcome-detector.js";
import type { Observation } from "../../src/surface/types.js";

function observationWithText(text: string): Observation {
  return {
    state: { surface_kind: "browser", url: "http://localhost:3000", title: "Page", recent_actions: [] },
    visual: { screenshot_path: "shot.png", send_to_llm: false, viewport: { width: 1, height: 1 }, visible_text_blocks: [text] },
    accessibility: { controls: [] },
    structure: { tables: [], forms: [], regions: [{ name: "body", text }] },
    policy: {}
  };
}

describe("outcome detector", () => {
  it("detects a known business outcome by visible text", () => {
    const result = detectOutcome(observationWithText("No active pre-approved auto loan offers"), [
      { code: "no_auto_loan_offer", status: "business_outcome", detect: { type: "text_visible", value: "No active pre-approved auto loan offers" }, message: "No offer" }
    ]);
    expect(result).toMatchObject({ status: "business_outcome", code: "no_auto_loan_offer" });
  });

  it("detects an explicit regex outcome rule", () => {
    const result = detectOutcome(observationWithText("Unexpected Confirmation Required"), [
      { code: "unknown_confirmation", status: "needs_human", detect: { type: "text_regex", pattern: "confirmation required" }, message: "Confirmation requires human review." }
    ]);
    expect(result).toMatchObject({ status: "needs_human", code: "unknown_confirmation" });
  });

  it("does not treat generic required-field copy as an unknown modal", () => {
    const result = detectOutcome(observationWithText("Member ID is required"), []);
    expect(result).toEqual({ status: "continue" });
  });

  it("detects a dialog outcome from structured regions", () => {
    const observed = {
      ...observationWithText("Dashboard"),
      structure: { tables: [], forms: [], regions: [{ name: "dialog", text: "Unexpected Confirmation Required" }] }
    };
    const result = detectOutcome(observed, [
      { code: "unknown_modal", status: "needs_human", detect: { type: "dialog_visible", title_contains: "Confirmation" }, message: "Unknown modal requires human review." }
    ]);
    expect(result).toMatchObject({ status: "needs_human", code: "unknown_modal" });
  });
});
