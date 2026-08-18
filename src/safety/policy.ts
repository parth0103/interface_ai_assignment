type PolicyProfile = "demo" | "production-strict";
type Risk = "safe" | "approval_required" | "blocked";

export type SafetyInput = {
  origin: string;
  actionType: string;
  intent: string;
  risk: Risk;
};

export type SafetyDecision =
  | { decision: "allow" }
  | { decision: "needs_human"; code: string; message: string }
  | { decision: "blocked"; code: string; message: string };

const allowedActions = new Set(["navigate", "click", "type", "select", "extract", "assert", "wait"]);
const blockedIntents = new Set([
  "submit_final_application",
  "approve_loan",
  "disburse_funds",
  "run_credit_pull",
  "change_pricing",
  "change_loan_amount",
  "change_loan_term",
  "override_eligibility",
  "accept_member_signature"
]);
const approvalRequiredIntents = new Set([
  "advance_warned_offer_to_review",
  "acknowledge_disclosure_warning",
  "resolve_ambiguous_member_match"
]);

export type SafetyPolicy = {
  evaluate(input: SafetyInput): SafetyDecision;
};

export function createDefaultSafetyPolicy(profile: PolicyProfile): SafetyPolicy {
  return {
    evaluate(input) {
      if (!input.origin.startsWith("http://localhost:3000")) {
        return { decision: "blocked", code: "origin_not_allowed", message: `Origin is not allowlisted: ${input.origin}` };
      }
      if (!allowedActions.has(input.actionType)) {
        return { decision: "blocked", code: "action_not_allowed", message: `Action is not allowlisted: ${input.actionType}` };
      }
      if (input.risk === "blocked" || blockedIntents.has(input.intent)) {
        return { decision: "blocked", code: "policy_violation", message: `Blocked forbidden loan action: ${input.intent}` };
      }
      if (input.risk === "approval_required" || approvalRequiredIntents.has(input.intent)) {
        return { decision: "needs_human", code: "human_approval_required", message: `Human approval required for: ${input.intent}` };
      }
      if (profile === "production-strict" && input.intent === "advance_to_review") {
        return { decision: "needs_human", code: "human_approval_required", message: "Production strict policy requires approval before final review." };
      }
      return { decision: "allow" };
    }
  };
}
