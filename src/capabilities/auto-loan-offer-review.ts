import type { CapabilityArtifact } from "../artifacts/schema.js";

export type CapabilityDefinition = Pick<
  CapabilityArtifact,
  "capability" | "surface" | "contract" | "safety" | "phases" | "known_outcomes" | "handoff" | "compatibility" | "variant_overlays"
>;

export const autoLoanOfferReviewCapability: CapabilityDefinition = {
  capability: {
    id: "prepare_auto_loan_offer_review",
    name: "Prepare Auto Loan Offer Review",
    status: "draft",
    risk_level: "moderate"
  },
  surface: { kind: "browser", app_family: "loan_servicing_portal", supported_adapters: ["browser.playwright"] },
  contract: {
    inputs: {
      member_id: { type: "string", required: true },
      offer_type: { type: "string", required: true },
      vehicle_type: { type: "string", required: true }
    },
    outputs: {
      review_status: { type: "string", sensitivity: "low" }
    }
  },
  safety: { policy_profile: "demo" },
  phases: [
    { id: "find_member", description: "Find and open the member profile." },
    { id: "open_offer", description: "Open the active pre-approved auto loan offer." },
    { id: "advance_to_review", description: "Advance the offer to final review without submitting." },
    { id: "extract_outputs", description: "Extract final review fields." }
  ],
  known_outcomes: [
    { code: "member_not_found", status: "business_outcome", detect: { type: "text_visible", value: "No member found" }, message: "No member matched the supplied member_id." },
    { code: "no_auto_loan_offer", status: "business_outcome", detect: { type: "text_visible", value: "No active pre-approved auto loan offers" }, message: "Member has no active pre-approved auto loan offer." },
    { code: "ambiguous_member_match", status: "needs_human", detect: { type: "text_visible", value: "Multiple member records matched" }, message: "Multiple member records matched." }
  ],
  handoff: { mode: "same_session_cli", resume_checkpoint: { type: "text_visible", value: "Member Profile" } },
  compatibility: {
    app_family: "loan_servicing_portal",
    base_variant: "default",
    tested_variants: ["default"],
    required_features: ["member_search", "member_profile", "offers_tab", "auto_loan_offer_review"]
  },
  variant_overlays: {}
};
