import { describe, expect, it } from "vitest";
import { createDefaultSafetyPolicy } from "../../src/safety/policy.js";

describe("safety policy", () => {
  it("allows safe read and navigation intents on localhost", () => {
    const policy = createDefaultSafetyPolicy("demo");
    expect(policy.evaluate({ origin: "http://localhost:3000", actionType: "click", intent: "view_member_offers", risk: "safe" })).toEqual({ decision: "allow" });
  });

  it("blocks forbidden loan intents before action execution", () => {
    const policy = createDefaultSafetyPolicy("demo");
    expect(policy.evaluate({ origin: "http://localhost:3000", actionType: "click", intent: "submit_final_application", risk: "blocked" })).toMatchObject({
      decision: "blocked",
      code: "policy_violation"
    });
  });

  it("requires human control for ambiguous member resolution", () => {
    const policy = createDefaultSafetyPolicy("demo");
    expect(policy.evaluate({ origin: "http://localhost:3000", actionType: "click", intent: "resolve_ambiguous_member_match", risk: "approval_required" })).toMatchObject({
      decision: "needs_human",
      code: "human_approval_required"
    });
  });

  it("blocks actions outside the allowed origin", () => {
    const policy = createDefaultSafetyPolicy("demo");
    expect(policy.evaluate({ origin: "https://example.com", actionType: "click", intent: "view_member_offers", risk: "safe" })).toMatchObject({
      decision: "blocked",
      code: "origin_not_allowed"
    });
  });
});
