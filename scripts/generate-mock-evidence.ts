import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const replayRuns = {
  "replay-11-success": {
    status: "success",
    capability_id: "prepare_auto_loan_offer_review",
    run_id: "mock_replay_success",
    message: "Replay reached final review.",
    evidence: {}
  },
  "replay-12-business-outcome": {
    status: "business_outcome",
    capability_id: "prepare_auto_loan_offer_review",
    run_id: "mock_replay_business_outcome",
    code: "no_auto_loan_offer",
    message: "Member has no active pre-approved auto loan offer.",
    evidence: {}
  },
  "replay-13-handoff": {
    status: "needs_human",
    capability_id: "prepare_auto_loan_offer_review",
    run_id: "mock_replay_handoff",
    code: "ambiguous_target",
    message: "Multiple controls matched the Open Member action for the requested member.",
    evidence: {}
  },
  "replay-14-blocked-policy": {
    status: "blocked",
    capability_id: "prepare_auto_loan_offer_review",
    run_id: "mock_replay_blocked_policy",
    code: "policy_violation",
    step_id: "submit_final_application",
    message: "Blocked forbidden loan action: submit_final_application.",
    evidence: {}
  }
} as const;

export async function generateMockEvidence(root = "evidence"): Promise<void> {
  await mkdir(join(root, "discovery-claude-real-8", "discovery"), { recursive: true });
  await writeJson(join(root, "discovery-claude-real-8", "artifact.v1.json"), {
    schema_version: "1.0",
    capability: {
      id: "prepare_auto_loan_offer_review",
      status: "draft"
    },
    provenance: {
      model: "mock",
      screenshot_context: false
    }
  });
  await writeJsonl(join(root, "discovery-claude-real-8", "discovery", "run-log.jsonl"), {
    event: "mock_discovery",
    status: "success"
  });

  for (const [dir, result] of Object.entries(replayRuns)) {
    const runDir = join(root, dir, "replay");
    await mkdir(runDir, { recursive: true });
    await writeJson(join(runDir, "result.json"), result);
    await writeJsonl(join(runDir, "run-log.jsonl"), {
      event: "mock_replay",
      scenario: dir,
      status: result.status
    });
  }
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

async function writeJsonl(path: string, value: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(value)}\n`);
}

if (process.argv[1]?.endsWith("generate-mock-evidence.ts")) {
  void generateMockEvidence(process.argv[2] ?? "evidence");
}
