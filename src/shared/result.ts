export type RunStatus = "success" | "business_outcome" | "needs_human" | "failure" | "blocked";

export type EvidenceRefs = {
  log?: string;
  result?: string;
  screenshot?: string;
  trace?: string;
  intervention?: string;
  drift_report?: string;
};

export type RunResult = {
  status: RunStatus;
  capability_id: string;
  run_id: string;
  step_id?: string;
  code?: string;
  message: string;
  outputs?: Record<string, unknown>;
  evidence: EvidenceRefs;
};
