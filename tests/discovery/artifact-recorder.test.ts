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

  it("parameterizes action values and target metadata that contain run inputs", () => {
    const artifact = recordCapabilityArtifact({
      capability: autoLoanOfferReviewCapability,
      goal: "Find member 24816",
      params: { member_id: "24816", vehicle_type: "used" },
      steps: [
        {
          id: "type_member_id",
          phase: "find_member",
          intent: "type_member_id",
          risk: "safe",
          action: {
            type: "type",
            intent: "type_member_id",
            value: "24816",
            target: {
              description: "Open Member link for member 24816",
              semantic: { role: "textbox", name: "Member ID" },
              structure: { row: "24816 - Maya Chen" }
            }
          }
        }
      ],
      outputs: {}
    });

    expect(artifact.steps[0].action.value).toBe("{{member_id}}");
    expect(artifact.steps[0].action.target?.description).toBe("Open Member link for member {{member_id}}");
    expect(artifact.steps[0].action.target?.fingerprint.structure).toEqual({ row: "{{member_id}}" });
    expect(JSON.stringify(artifact)).not.toContain("24816");
    expect(JSON.stringify(artifact)).not.toContain("Maya Chen");
  });
});
