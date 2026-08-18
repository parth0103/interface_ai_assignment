import { describe, expect, it } from "vitest";
import { recordCapabilityArtifact } from "../../src/artifacts/recorder.js";
import { autoLoanOfferReviewCapability } from "../../src/capabilities/auto-loan-offer-review.js";

describe("artifact recorder", () => {
  it("combines validated discovery actions with explicit capability metadata", () => {
    const artifact = recordCapabilityArtifact({
      capability: autoLoanOfferReviewCapability,
      goal: "Find member 24816",
      params: { member_id: "24816", vehicle_type: "used" },
      steps: [
        {
          id: "open_member_search",
          phase: "find_member",
          intent: "open_member_search",
          risk: "safe",
          action: { type: "click", intent: "open_member_search", target: { description: "Member Search link", semantic: { role: "link", name: "Member Search" } } },
          checkpoint: { type: "text_visible", value: "Member Search" }
        }
      ],
      outputs: { review_status: "ready_for_final_review" }
    });

    expect(artifact.capability.status).toBe("draft");
    expect(artifact.steps[0].action.target?.fingerprint.semantic).toEqual({ role: "link", name: "Member Search" });
    expect(artifact.known_outcomes).toEqual(autoLoanOfferReviewCapability.known_outcomes);
    expect(JSON.stringify(artifact)).not.toContain("Maya Chen");
  });
});
