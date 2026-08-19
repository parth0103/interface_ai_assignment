# Deliverables And Evidence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce the assignment-facing deliverables: README, REPORT, example artifacts, evidence runs, validation script, and final verification.

**Architecture:** This plan packages the working vertical slice for evaluators. It does not add new core runtime behavior except evidence validation and repeatable demo scripts. README tells the evaluator exactly how to run discovery and replay; REPORT explains the seven required design headings.

**Tech Stack:** Markdown, TypeScript validation script, npm scripts, Playwright traces/screenshots produced by earlier plans.

## Global Constraints

The assignment requires `/README.md`.
The assignment requires `/REPORT.md` with exactly these headings: `Architecture`, `Artifact schema`, `Determinism & error handling`, `Heterogeneity & multi-tenant`, `Escalation & handoff`, `Safety`, `Cuts`.
The assignment requires `/evidence/` with a saved example artifact and logs from discovery and replay.
README must include setup, keys/config, mock mode, and exact demo commands.
Evidence must include discovery success, replay success, business outcome, handoff, and blocked policy runs.
Submitted evidence should show at least one real LLM discovery run. Current final committed evidence uses Claude via Anthropic (`evidence/discovery-claude-real-8`) with screenshot image context. Gemini and mock modes remain supported but are not the final committed real-model evidence.
Do not commit `.env`, API keys, raw credentials, or the assignment PDF.
Every task uses TDD where code changes are involved: write the failing test, verify failure, implement the minimum, verify pass, commit.

---

## File Structure

Create or modify this structure:

```text
README.md                              setup and demo commands
REPORT.md                              assignment design write-up with required headings
scripts/validate-evidence.ts           evidence completeness validator
scripts/generate-mock-evidence.ts      repeatable mock evidence generator
tests/deliverables/report.test.ts      checks REPORT headings
tests/deliverables/readme.test.ts      checks README command coverage
tests/deliverables/evidence-validator.test.ts validation script tests
evidence/.gitkeep                      keeps evidence directory present before generated files
```

Evidence files produced by running commands:

```text
evidence/discovery-claude-real-8/artifact.v1.json
evidence/discovery-claude-real-8/discovery/run-log.jsonl
evidence/replay-11-success/replay/result.json
evidence/replay-12-business-outcome/replay/result.json
evidence/replay-13-handoff/replay/result.json
evidence/replay-14-blocked-policy/replay/result.json
```

Assignment-facing README/REPORT should name these current evidence paths directly. If we later choose to add alias folders (`discovery-success`, `replay-success`, etc.), update the validator and README in the same commit.

---

### Task 1: REPORT With Required Assignment Headings

**Files:**
- Create: `REPORT.md`
- Test: `tests/deliverables/report.test.ts`

**Interfaces:**
- Produces: a human-readable design report with exactly the seven required top-level headings
- Consumes: design spec at `docs/superpowers/specs/2026-08-16-loan-computer-use-automation-design.md`

- [ ] **Step 1: Write the failing REPORT heading test**

Create `tests/deliverables/report.test.ts`:

```typescript
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("REPORT.md", () => {
  it("uses exactly the assignment-required top-level headings", () => {
    const report = readFileSync("REPORT.md", "utf8");
    const headings = [...report.matchAll(/^## (.+)$/gm)].map((match) => match[1]);
    expect(headings).toEqual([
      "Architecture",
      "Artifact schema",
      "Determinism & error handling",
      "Heterogeneity & multi-tenant",
      "Escalation & handoff",
      "Safety",
      "Cuts"
    ]);
  });

  it("states that replay does not call any LLM", () => {
    const report = readFileSync("REPORT.md", "utf8");
    expect(report).toContain("Replay does not call any LLM");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
npm test -- tests/deliverables/report.test.ts
```

Expected: FAIL because `REPORT.md` does not exist.

- [ ] **Step 3: Write REPORT.md**

Create `REPORT.md`:

```markdown
# Computer-Use Automation System Report

## Architecture

This project implements a focused vertical slice of a computer-use automation system for a mock Loan Servicing Portal. The main capability is `prepare_auto_loan_offer_review`: find a member, open their pre-approved auto loan offer, and advance it to the final review screen without submitting the application.

The system is a TypeScript modular monolith. An LLM is used only during discovery. The final committed real-model evidence uses Claude via Anthropic, while Gemini and mock clients remain available. Discovery observes a layered surface observation and proposes one bounded action at a time. The system validates the action, checks policy, executes through a `SurfaceAdapter`, records evidence, and converts successful actions into a capability artifact.

Replay does not call any LLM. Replay loads the artifact, validates parameters, applies tenant overlays, checks policy before every action, resolves targets deterministically, verifies checkpoints, extracts outputs, and returns a structured result.

## Artifact schema

The artifact is a hybrid capability artifact rather than a Playwright script. It has a contract layer and an execution recipe. The contract defines the capability ID, inputs, outputs, known business outcomes, safety policy, and compatibility metadata. Known outcomes are declarative capability metadata, not hidden recorder logic inferred from a single happy-path run. The recipe defines phases, deterministic steps, target fingerprints, checkpoints, and recovery behavior.

Each target is represented as a layered fingerprint: semantic role/name, visible text anchors, structural region, and adapter-specific hints. Playwright hints are useful for this implementation, but they are not the primary conceptual model.

Artifacts start as `draft`. Local demo replay can run drafts with `--allow-draft`; unattended production replay would require approved artifacts.

## Determinism & error handling

The replay engine interprets artifact JSON with no model calls. It substitutes typed params, resolves a target, executes the action, waits for checkpoints, detects known outcomes, and writes evidence.

Replay statuses are `success`, `business_outcome`, `needs_human`, `failure`, and `blocked`. This separates normal business answers such as `no_auto_loan_offer` from runtime failures such as `checkpoint_failed` or `surface_drift_detected`.

Recoverable conditions are intentionally small: slow loads retry, known session warnings can be dismissed if allowlisted, known maintenance modals can be dismissed, and unknown modals require human handoff.

## Heterogeneity & multi-tenant

The implemented surface is a browser controlled by Playwright, but the core interface is `SurfaceAdapter`: `observe`, `act`, and `captureEvidence`. A desktop adapter could populate the same observation layers using OS accessibility APIs, screenshots, OCR, and mouse/keyboard automation.

For multi-tenant reuse, the artifact separates the shared capability contract from tenant-specific overlays. The base artifact describes the common workflow for the loan servicing app family. A tenant overlay can adjust labels, routes, checkpoints, table mappings, or inserted warning steps.

Replay verifies required features and checkpoints. If a tenant UI drifts, replay returns structured drift evidence instead of guessing.

## Escalation & handoff

The primary handoff scenario is an ambiguous target after searching member `77777`. The current committed evidence demonstrates the safe non-interactive handoff path: replay returns `needs_human` with `code=ambiguous_target` rather than guessing which `Open Member` link to click. The implementation also supports `--interactive-handoff`, which opens a non-headless browser, writes intervention/control-lease files, waits for the operator to select the correct row, verifies the resume checkpoint, and continues.

This is intentionally a minimal same-session handoff, not a full operator console. The design keeps the control-transfer model real while avoiding unnecessary UI infrastructure.

## Safety

The safety model combines origin allowlisting, action allowlisting, and intent policy. A click is not safe merely because it is a click; the intent determines business risk.

Safe actions include search, navigation, reading offers, selecting non-binding options, and reaching final review. Approval-required actions include ambiguous-member resolution and warning acknowledgement. Blocked actions include final application submission, loan approval, disbursement, credit pull, pricing changes, term changes, eligibility override, and accepting an e-signature.

Screenshots are captured locally for evidence. Screenshots are sent to the LLM only when `SEND_SCREENSHOTS_TO_LLM=true`; the final Claude discovery evidence used screenshot image context. This assignment uses synthetic data only.

## Cuts

I did not build a production operator console, artifact registry, distributed queues, desktop adapter, real bank integration, full approval workflow, or open-ended LLM recovery during replay.

The next steps would be artifact review/approval states, richer tenant compatibility scoring, an operator UI around the same control lease, and a desktop adapter using OS accessibility plus visual evidence.
```

- [ ] **Step 4: Run the REPORT tests**

Run:

```bash
npm test -- tests/deliverables/report.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add REPORT.md tests/deliverables/report.test.ts
git commit -m "docs: add assignment report"
```

---

### Task 2: README With Exact Setup And Demo Commands

**Files:**
- Create: `README.md`
- Test: `tests/deliverables/readme.test.ts`

**Interfaces:**
- Produces: setup guide, environment guide, mock/Claude/Gemini modes, discovery command, replay commands, evidence map
- Consumes: CLI commands from earlier plans

- [ ] **Step 1: Write the failing README test**

Create `tests/deliverables/readme.test.ts`:

```typescript
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("README.md", () => {
  it("documents setup, app, discovery, replay, and mock mode commands", () => {
    const readme = readFileSync("README.md", "utf8");
    for (const expected of [
      "npm install",
      "npx playwright install chromium",
      "npm run app",
      "npm run discover",
      "npm run replay",
      "LLM_MODE=mock",
      "GEMINI_API_KEY",
      "ANTHROPIC_API_KEY",
      "CLAUDE_MODEL"
    ]) {
      expect(readme).toContain(expected);
    }
  });

  it("mentions all five evidence scenarios", () => {
    const readme = readFileSync("README.md", "utf8");
    for (const expected of ["discovery-claude-real-8", "replay-11-success", "replay-12-business-outcome", "replay-13-handoff", "replay-14-blocked-policy"]) {
      expect(readme).toContain(expected);
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
npm test -- tests/deliverables/readme.test.ts
```

Expected: FAIL because `README.md` does not exist.

- [ ] **Step 3: Write README.md**

Create `README.md`:

```markdown
# Computer-Use Automation System

This repository is a focused implementation of a computer-use automation system for a mock Loan Servicing Portal.

The demo goal is:

```text
Find member 24816, open their pre-approved auto loan offer, and advance it to the final review screen.
```

Claude was used for the final committed real-model discovery evidence. Gemini and mock modes are also supported. Replay is deterministic and does not call any model.

## Setup

```bash
npm install
npx playwright install chromium
cp .env.example .env
```

Environment variables:

```text
ANTHROPIC_API_KEY=required for real Claude discovery
CLAUDE_MODEL=claude-sonnet-5
GEMINI_API_KEY=required for real Gemini discovery
DISCOVERY_MODEL=gemini-2.5-flash
LLM_MODE=mock, claude, anthropic, or gemini
SEND_SCREENSHOTS_TO_LLM=false
PORT=3000
```

## Run The Local App

```bash
npm run app
```

Open `http://localhost:3000`.

## Demo: Discovery

Mock mode:

```bash
LLM_MODE=mock npm run discover -- \
  --llm mock \
  --goal "Find member 24816, open their pre-approved auto loan offer, and advance it to the final review screen." \
  --target http://localhost:3000 \
  --params examples/params/happy-path.json \
  --out evidence/mock-discovery
```

Real Claude mode, matching the committed evidence:

```bash
SEND_SCREENSHOTS_TO_LLM=true npm run discover -- \
  --llm claude \
  --goal "Find member 24816, open their pre-approved auto loan offer, and advance it to the final review screen. Extract the review status before finishing." \
  --target http://localhost:3000 \
  --params examples/params/happy-path.json \
  --out evidence/discovery-claude-real-8
```

The successful discovery run writes:

```text
evidence/discovery-claude-real-8/artifact.v1.json
evidence/discovery-claude-real-8/discovery/run-log.jsonl
```

Real Gemini mode is also supported with `--llm gemini` and `GEMINI_API_KEY`.

## Demo: Replay Success

```bash
npm run replay -- \
  --artifact evidence/discovery-claude-real-8/artifact.v1.json \
  --params examples/params/happy-path.json \
  --out evidence/replay-11-success \
  --allow-draft
```

## Demo: Business Outcome

```bash
npm run replay -- \
  --artifact evidence/discovery-claude-real-8/artifact.v1.json \
  --params examples/params/no-offer.json \
  --out evidence/replay-12-business-outcome \
  --allow-draft
```

Expected status: `business_outcome`.

## Demo: Human Handoff

```bash
npm run replay -- \
  --artifact evidence/discovery-claude-real-8/artifact.v1.json \
  --params examples/params/ambiguous-member.json \
  --out evidence/replay-13-handoff \
  --allow-draft
```

Expected status for committed evidence: `needs_human`, code: `ambiguous_target`.

Optional interactive same-session handoff demo:

```bash
npm run replay -- \
  --artifact evidence/discovery-claude-real-8/artifact.v1.json \
  --params examples/params/ambiguous-member.json \
  --out evidence/replay-handoff-interactive \
  --allow-draft \
  --interactive-handoff
```

## Demo: Blocked Policy

```bash
npm run replay -- \
  --artifact examples/artifacts/blocked-submit-attempt.v1.json \
  --params examples/params/happy-path.json \
  --out evidence/replay-14-blocked-policy \
  --allow-draft
```

Expected status: `blocked`, code: `policy_violation`.

## Test

```bash
npm run typecheck
npm test
npm run test:e2e
npm run evidence:validate
```

## Evidence Map

```text
evidence/discovery-claude-real-8/artifact.v1.json
evidence/discovery-claude-real-8/discovery/run-log.jsonl
evidence/replay-11-success/replay/result.json
evidence/replay-12-business-outcome/replay/result.json
evidence/replay-13-handoff/replay/result.json
evidence/replay-14-blocked-policy/replay/result.json
```
```

- [ ] **Step 4: Run README tests**

Run:

```bash
npm test -- tests/deliverables/readme.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add README.md tests/deliverables/readme.test.ts
git commit -m "docs: add README demo commands"
```

---

### Task 3: Evidence Validator

**Files:**
- Create: `scripts/validate-evidence.ts`
- Create: `evidence/.gitkeep`
- Test: `tests/deliverables/evidence-validator.test.ts`

**Interfaces:**
- Produces: `validateEvidence(root): Promise<string[]>`
- Consumes: evidence directory paths

- [ ] **Step 1: Write the failing evidence validator test**

Create `tests/deliverables/evidence-validator.test.ts`:

```typescript
import { mkdir, mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { validateEvidence } from "../../scripts/validate-evidence.js";

describe("validateEvidence", () => {
  it("reports missing required evidence paths", async () => {
    const dir = await mkdtemp(join(tmpdir(), "evidence-validator-"));
    try {
      expect(await validateEvidence(dir)).toContain("missing discovery-claude-real-8/artifact.v1.json");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("passes when required evidence files are present", async () => {
    const dir = await mkdtemp(join(tmpdir(), "evidence-validator-"));
    try {
      await mkdir(join(dir, "discovery-claude-real-8", "discovery"), { recursive: true });
      await writeFile(join(dir, "discovery-claude-real-8", "artifact.v1.json"), "{}");
      await writeFile(join(dir, "discovery-claude-real-8", "discovery", "run-log.jsonl"), "{}\n");
      for (const subdir of ["replay-11-success", "replay-12-business-outcome", "replay-13-handoff", "replay-14-blocked-policy"]) {
        await mkdir(join(dir, subdir, "replay"), { recursive: true });
        await writeFile(join(dir, subdir, "replay", "result.json"), JSON.stringify({ status: "success" }));
        await writeFile(join(dir, subdir, "replay", "run-log.jsonl"), "{}\n");
      }
      expect(await validateEvidence(dir)).toEqual([]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
```

- [ ] **Step 2: Run the validator test to verify it fails**

Run:

```bash
npm test -- tests/deliverables/evidence-validator.test.ts
```

Expected: FAIL because `scripts/validate-evidence.ts` does not exist.

- [ ] **Step 3: Implement evidence validation**

Create `scripts/validate-evidence.ts`:

```typescript
import { access } from "node:fs/promises";
import { join } from "node:path";

const requiredFiles = [
  "discovery-claude-real-8/artifact.v1.json",
  "discovery-claude-real-8/discovery/run-log.jsonl",
  "replay-11-success/replay/result.json",
  "replay-11-success/replay/run-log.jsonl",
  "replay-12-business-outcome/replay/result.json",
  "replay-12-business-outcome/replay/run-log.jsonl",
  "replay-13-handoff/replay/result.json",
  "replay-13-handoff/replay/run-log.jsonl",
  "replay-14-blocked-policy/replay/result.json",
  "replay-14-blocked-policy/replay/run-log.jsonl"
];

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function validateEvidence(root = "evidence"): Promise<string[]> {
  const failures: string[] = [];
  for (const file of requiredFiles) {
    if (!(await exists(join(root, file)))) failures.push(`missing ${file}`);
  }
  return failures;
}

async function main(): Promise<void> {
  const failures = await validateEvidence(process.argv[2] ?? "evidence");
  if (failures.length) {
    console.error(failures.join("\n"));
    process.exitCode = 1;
    return;
  }
  console.log("Evidence validation passed.");
}

if (process.argv[1]?.endsWith("validate-evidence.ts")) {
  void main();
}
```

Create `evidence/.gitkeep` as an empty file.

- [ ] **Step 4: Run validator tests and typecheck**

Run:

```bash
npm test -- tests/deliverables/evidence-validator.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/validate-evidence.ts evidence/.gitkeep tests/deliverables/evidence-validator.test.ts
git commit -m "feat: add evidence validator"
```

---

### Task 4: Mock Evidence Generator

**Files:**
- Create: `scripts/generate-mock-evidence.ts`
- Test: `tests/deliverables/mock-evidence.test.ts`

**Interfaces:**
- Produces: `generateMockEvidence(root): Promise<void>`
- Consumes: examples artifacts and params

- [ ] **Step 1: Write the failing mock evidence test**

Create `tests/deliverables/mock-evidence.test.ts`:

```typescript
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { generateMockEvidence } from "../../scripts/generate-mock-evidence.js";
import { validateEvidence } from "../../scripts/validate-evidence.js";

describe("generateMockEvidence", () => {
  it("creates complete synthetic evidence structure", async () => {
    const dir = await mkdtemp(join(tmpdir(), "mock-evidence-"));
    try {
      await generateMockEvidence(dir);
      expect(await validateEvidence(dir)).toEqual([]);
      const blocked = JSON.parse(await readFile(join(dir, "replay-14-blocked-policy", "replay", "result.json"), "utf8"));
      expect(blocked.status).toBe("blocked");
      expect(blocked.code).toBe("policy_violation");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
npm test -- tests/deliverables/mock-evidence.test.ts
```

Expected: FAIL because `generate-mock-evidence.ts` does not exist.

- [ ] **Step 3: Implement the mock evidence generator**

Create `scripts/generate-mock-evidence.ts`:

```typescript
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const runs = {
  "replay-11-success": { status: "success", capability_id: "prepare_auto_loan_offer_review", run_id: "replay_success", message: "Replay reached final review.", evidence: {} },
  "replay-12-business-outcome": { status: "business_outcome", capability_id: "prepare_auto_loan_offer_review", run_id: "replay_business", code: "no_auto_loan_offer", message: "Member has no active pre-approved auto loan offer.", evidence: {} },
  "replay-13-handoff": { status: "needs_human", capability_id: "prepare_auto_loan_offer_review", run_id: "replay_handoff", code: "ambiguous_target", message: "Multiple controls matched Open Member button for member {{member_id}}.", evidence: {} },
  "replay-14-blocked-policy": { status: "blocked", capability_id: "prepare_auto_loan_offer_review", run_id: "replay_blocked", code: "policy_violation", step_id: "submit_final_application", message: "Blocked forbidden loan action: submit_final_application.", evidence: {} }
};

export async function generateMockEvidence(root = "evidence"): Promise<void> {
  await mkdir(root, { recursive: true });
  await mkdir(join(root, "discovery-claude-real-8", "discovery"), { recursive: true });
  await writeFile(join(root, "discovery-claude-real-8", "artifact.v1.json"), `${JSON.stringify({ schema_version: "1.0", capability: { id: "prepare_auto_loan_offer_review", status: "draft" } }, null, 2)}\n`);
  await writeFile(join(root, "discovery-claude-real-8", "discovery", "run-log.jsonl"), `${JSON.stringify({ event: "mock_discovery", status: "success" })}\n`);
  for (const [dir, result] of Object.entries(runs)) {
    const runDir = join(root, dir, "replay");
    await mkdir(runDir, { recursive: true });
    await writeFile(join(runDir, "result.json"), `${JSON.stringify(result, null, 2)}\n`);
    await writeFile(join(runDir, "run-log.jsonl"), `${JSON.stringify({ event: "mock_evidence", status: result.status })}\n`);
  }
}

if (process.argv[1]?.endsWith("generate-mock-evidence.ts")) {
  void generateMockEvidence(process.argv[2] ?? "evidence");
}
```

- [ ] **Step 4: Run mock evidence tests**

Run:

```bash
npm test -- tests/deliverables/mock-evidence.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/generate-mock-evidence.ts tests/deliverables/mock-evidence.test.ts
git commit -m "feat: add mock evidence generator"
```

---

### Task 5: Validate Current Final Evidence

**Files:**
- Modify: `evidence/**`

**Interfaces:**
- Consumes: current committed Claude discovery and replay evidence, evidence validator
- Produces: verified `/evidence/` directory for assignment review

- [ ] **Step 1: Confirm current final evidence is present**

Run:

```bash
find evidence -maxdepth 3 -type f | sort
```

Expected:

```text
evidence/discovery-claude-real-8/artifact.v1.json
evidence/replay-11-success/replay/result.json
evidence/replay-12-business-outcome/replay/result.json
evidence/replay-13-handoff/replay/result.json
evidence/replay-14-blocked-policy/replay/result.json
```

- [ ] **Step 2: Optional: regenerate real Claude discovery**

Only run this if the evaluator needs fresh evidence or current evidence is missing. Requires `ANTHROPIC_API_KEY`.

Run:

```bash
SEND_SCREENSHOTS_TO_LLM=true npm run discover -- \
  --llm claude \
  --goal "Find member 24816, open their pre-approved auto loan offer, and advance it to the final review screen. Extract the review status before finishing." \
  --target http://localhost:3000 \
  --params examples/params/happy-path.json \
  --out evidence/discovery-claude-real-8
```

Expected:

```text
status=success
evidence/discovery-claude-real-8/artifact.v1.json exists
evidence/discovery-claude-real-8/discovery/run-log.jsonl exists
```

- [ ] **Step 3: Optional: run mock discovery if real LLM credentials are unavailable**

Mock mode is useful for local smoke checks but is not the committed final real-model evidence.

Run:

```bash
LLM_MODE=mock npm run discover -- \
  --llm mock \
  --goal "Find member 24816, open their pre-approved auto loan offer, and advance it to the final review screen. Extract the review status before finishing." \
  --target http://localhost:3000 \
  --params examples/params/happy-path.json \
  --out evidence/mock-discovery
```

Expected:

```text
status=success
mock artifact is emitted
```

README/REPORT must state that final committed evidence uses Claude.

- [ ] **Step 4: Optional: rerun replay success**

Run:

```bash
npm run replay -- \
  --artifact evidence/discovery-claude-real-8/artifact.v1.json \
  --params examples/params/happy-path.json \
  --out evidence/replay-11-success \
  --allow-draft
```

Expected:

```text
status=success
```

- [ ] **Step 5: Optional: rerun replay business outcome**

Run:

```bash
npm run replay -- \
  --artifact evidence/discovery-claude-real-8/artifact.v1.json \
  --params examples/params/no-offer.json \
  --out evidence/replay-12-business-outcome \
  --allow-draft
```

Expected:

```text
status=business_outcome
code=no_auto_loan_offer
```

- [ ] **Step 6: Optional: rerun non-interactive handoff evidence**

Run:

```bash
npm run replay -- \
  --artifact evidence/discovery-claude-real-8/artifact.v1.json \
  --params examples/params/ambiguous-member.json \
  --out evidence/replay-13-handoff \
  --allow-draft
```

Expected:

```text
status=needs_human
code=ambiguous_target
```

- [ ] **Step 7: Optional: rerun blocked policy scenario**

Run:

```bash
npm run replay -- \
  --artifact examples/artifacts/blocked-submit-attempt.v1.json \
  --params examples/params/happy-path.json \
  --out evidence/replay-14-blocked-policy \
  --allow-draft
```

Expected:

```text
status=blocked
code=policy_violation
step_id=submit_final_application
```

- [ ] **Step 8: Validate evidence**

Run:

```bash
npm run evidence:validate
```

Expected:

```text
Evidence validation passed.
```

- [ ] **Step 9: Commit evidence only if it changed**

```bash
git add evidence
git commit -m "chore: update final evidence"
```

---

### Task 6: Final Verification And Submission Hygiene

**Files:**
- Modify: `.gitignore` only if generated secrets or transient outputs appear

**Interfaces:**
- Consumes: all previous tasks
- Produces: clean repository ready for submission

- [ ] **Step 1: Run full verification**

Run:

```bash
npm run typecheck
npm test
npm run test:e2e
npm run evidence:validate
```

Expected:

```text
all commands pass
no API key or token appears in output
```

- [ ] **Step 2: Check for secrets and ignored assignment PDF**

Run:

```bash
git status --short
git ls-files | rg "Assignment A|\\.env$|\\.env\\."
rg -n "GEMINI_API_KEY=|ANTHROPIC_API_KEY=|AIza|sk-ant|secret|token" README.md REPORT.md src apps tests scripts evidence examples
```

Expected:

```text
Assignment PDF is not tracked
.env files are not tracked
no real API key is present
only documentation references to GEMINI_API_KEY and ANTHROPIC_API_KEY appear
```

- [ ] **Step 3: Commit any final hygiene fixes**

If `.gitignore`, README, REPORT, or evidence paths changed during verification:

```bash
git add .gitignore README.md REPORT.md evidence scripts tests
git commit -m "chore: finalize submission hygiene"
```

- [ ] **Step 4: Push**

Run:

```bash
git push origin main
```

Expected:

```text
main is pushed to the private GitHub repo
```

---

## Plan 4 Verification

Run:

```bash
npm run typecheck
npm test
npm run test:e2e
npm run evidence:validate
```

Expected:

```text
all checks pass
README.md has exact demo commands
REPORT.md has exactly seven required assignment headings
evidence directory contains artifact, logs, results, and handoff/blocking proof
```

At the end of this plan, the repository has the assignment-facing deliverables.
