import { describe, expect, it } from "vitest";
import { parseCapabilityArtifact } from "../../src/artifacts/schema.js";

const validArtifact = {
  schema_version: "1.0",
  capability: { id: "prepare_auto_loan_offer_review", name: "Prepare Auto Loan Offer Review", status: "draft", risk_level: "moderate" },
  surface: { kind: "browser", app_family: "loan_servicing_portal", supported_adapters: ["browser.playwright"] },
  contract: {
    inputs: { member_id: { type: "string", required: true }, vehicle_type: { type: "string", required: true } },
    outputs: { review_status: { type: "string", sensitivity: "low" } }
  },
  safety: { policy_profile: "demo" },
  phases: [{ id: "find_member", description: "Find the member record" }],
  steps: [
    {
      id: "open_member_search",
      phase: "find_member",
      intent: "open_member_search",
      risk: "safe",
      action: {
        type: "click",
        target: {
          id: "member_search_link",
          description: "Member Search link",
          fingerprint: { semantic: { role: "link", name: "Member Search" } },
          confidence: { minimum: 0.85, signals: ["role_name_match", "unique_match"] }
        }
      },
      checkpoint: { type: "text_visible", value: "Member Search" }
    }
  ],
  known_outcomes: [],
  handoff: {},
  compatibility: { app_family: "loan_servicing_portal", base_variant: "default", tested_variants: ["default"], required_features: ["member_search"] },
  variant_overlays: {},
  evidence: {}
};

describe("capability artifact schema", () => {
  it("accepts a valid hybrid capability artifact", () => {
    expect(parseCapabilityArtifact(validArtifact).capability.id).toBe("prepare_auto_loan_offer_review");
  });

  it("rejects an artifact with an invalid replay status in known outcomes", () => {
    const invalid = { ...validArtifact, known_outcomes: [{ code: "bad", status: "maybe", detect: { type: "text_visible", value: "Bad" } }] };
    expect(() => parseCapabilityArtifact(invalid)).toThrow();
  });
});
