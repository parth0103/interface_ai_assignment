# Core Replay And Artifacts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the model-free core: typed artifacts, safety policy, evidence logging, target resolution, outcome detection, same-session handoff primitives, and deterministic replay.

**Architecture:** This plan implements the production path first. Replay reads a capability artifact, validates params, applies policy, resolves targets, executes through a surface adapter, verifies checkpoints, and returns structured results without importing or calling any LLM client.

**Tech Stack:** TypeScript, Zod, Playwright, Vitest, Node filesystem APIs.

## Global Constraints

Replay must not call Gemini or any LLM provider.
Replay must check safety before every action.
Replay statuses are exactly `success`, `business_outcome`, `needs_human`, `failure`, and `blocked`.
Interactive handoff must pause the same live session, transfer control to a human, record the human action, and resume before returning `success`.
Primary target strategy is semantic/visual/structural fingerprints with Playwright hints as fallback.
Raw coordinates are not the primary replay strategy.
Artifacts store output definitions and step metadata, not raw borrower PII.
Logs redact run params such as `member_id` to `****16`.
Blocked loan intents stop before clicking.
Every task uses TDD: write the failing test, verify failure, implement the minimum, verify pass, commit.

---

## File Structure

Create this structure:

```text
src/shared/result.ts                  replay result and event status types
src/shared/params.ts                  parameter substitution and redaction helpers
src/artifacts/schema.ts               Zod schemas and TypeScript artifact types
src/artifacts/overlays.ts             tenant overlay application
src/safety/policy.ts                  configurable allowlist and risk decisions
src/evidence/logger.ts                JSONL/result/screenshot path helpers
src/surface/types.ts                  generic SurfaceAdapter and observation types
src/surface/browser.ts                Playwright BrowserSurfaceAdapter
src/replay/target-resolver.ts         target fingerprint scoring
src/replay/outcome-detector.ts        business outcomes, recoveries, handoff/failure detection
src/handoff/manager.ts                control lease and intervention file writer
src/replay/engine.ts                  deterministic artifact interpreter
src/cli/replay.ts                     replay command
examples/params/happy-path.json       member 24816 params
examples/params/no-offer.json         member 99999 params
examples/params/ambiguous-member.json member 77777 params
examples/artifacts/base.v1.json       hand-authored artifact for replay tests
examples/artifacts/blocked-submit-attempt.v1.json blocked policy artifact
tests/core/*.test.ts                  unit tests
tests/replay/*.test.ts                replay and CLI tests
```

---

### Task 1: Shared Result Types, Param Substitution, And Redaction

**Files:**
- Create: `src/shared/result.ts`
- Create: `src/shared/params.ts`
- Test: `tests/core/params.test.ts`

**Interfaces:**
- Produces: `RunStatus`, `RunResult`, `substituteParams(value, params)`, `redactParams(params)`
- Consumes: none

- [ ] **Step 1: Write the failing param helper tests**

Create `tests/core/params.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { redactParams, substituteParams } from "../../src/shared/params.js";

describe("parameter helpers", () => {
  it("substitutes double-brace params inside strings", () => {
    expect(substituteParams("member {{member_id}} uses {{vehicle_type}}", {
      member_id: "24816",
      vehicle_type: "used"
    })).toBe("member 24816 uses used");
  });

  it("leaves non-template values unchanged", () => {
    expect(substituteParams(60, { member_id: "24816" })).toBe(60);
    expect(substituteParams({ value: "{{member_id}}" }, { member_id: "24816" })).toEqual({ value: "24816" });
  });

  it("redacts sensitive run parameters", () => {
    expect(redactParams({ member_id: "24816", vehicle_type: "used", token: "secret" })).toEqual({
      member_id: "****16",
      vehicle_type: "used",
      token: "[REDACTED]"
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
npm test -- tests/core/params.test.ts
```

Expected: FAIL because `src/shared/params.ts` does not exist.

- [ ] **Step 3: Implement result and param helpers**

Create `src/shared/result.ts`:

```typescript
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
```

Create `src/shared/params.ts`:

```typescript
const secretKeys = new Set(["token", "api_key", "password", "secret", "GEMINI_API_KEY"]);

export function substituteParams(value: unknown, params: Record<string, unknown>): unknown {
  if (typeof value === "string") {
    return value.replace(/\{\{([^}]+)\}\}/g, (_match, key: string) => String(params[key.trim()] ?? ""));
  }
  if (Array.isArray(value)) return value.map((item) => substituteParams(item, params));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [key, substituteParams(nested, params)])
    );
  }
  return value;
}

export function redactParams(params: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(params).map(([key, value]) => {
      if (secretKeys.has(key) || /token|secret|password|api/i.test(key)) return [key, "[REDACTED]"];
      if (key === "member_id" && typeof value === "string") return [key, `****${value.slice(-2)}`];
      return [key, value];
    })
  );
}
```

- [ ] **Step 4: Run tests and typecheck**

Run:

```bash
npm test -- tests/core/params.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/shared/result.ts src/shared/params.ts tests/core/params.test.ts
git commit -m "feat: add shared result and param helpers"
```

---

### Task 2: Capability Artifact Schema And Tenant Overlays

**Files:**
- Create: `src/artifacts/schema.ts`
- Create: `src/artifacts/overlays.ts`
- Test: `tests/core/artifact-schema.test.ts`
- Test: `tests/core/overlays.test.ts`

**Interfaces:**
- Produces: `CapabilityArtifact`, `ArtifactStep`, `parseCapabilityArtifact(value)`, `applyVariantOverlay(artifact, tenantProfile)`
- Consumes: `RunStatus` from `src/shared/result.ts`

- [ ] **Step 1: Write failing artifact schema tests**

Create `tests/core/artifact-schema.test.ts`:

```typescript
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
```

Create `tests/core/overlays.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { applyVariantOverlay } from "../../src/artifacts/overlays.js";

describe("variant overlays", () => {
  it("overrides a target fingerprint for a tenant profile", () => {
    const artifact = {
      schema_version: "1.0",
      steps: [
        {
          id: "open_offers_tab",
          action: { target: { fingerprint: { semantic: { role: "tab", name: "Offers" } } } }
        }
      ],
      variant_overlays: {
        tenant_b: {
          target_overrides: {
            "open_offers_tab.target": {
              fingerprint: { semantic: { role: "tab", name: "Pre-Approvals" }, visual: { anchor_text: "Pre-Approvals" } }
            }
          }
        }
      }
    };

    const merged = applyVariantOverlay(artifact as never, "tenant_b");
    expect(merged.steps[0].action.target.fingerprint.semantic.name).toBe("Pre-Approvals");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
npm test -- tests/core/artifact-schema.test.ts tests/core/overlays.test.ts
```

Expected: FAIL because schema and overlay modules do not exist.

- [ ] **Step 3: Implement artifact schema**

Create `src/artifacts/schema.ts` with Zod schemas for the fields used by the spec:

```typescript
import { z } from "zod";

export const runStatusSchema = z.enum(["success", "business_outcome", "needs_human", "failure", "blocked"]);
export const riskSchema = z.enum(["safe", "approval_required", "blocked"]);
export const actionTypeSchema = z.enum(["navigate", "click", "type", "select", "extract", "assert", "wait", "finish", "escalate"]);

export const targetFingerprintSchema = z.object({
  semantic: z.record(z.unknown()).optional(),
  visual: z.record(z.unknown()).optional(),
  structure: z.record(z.unknown()).optional(),
  adapter_hints: z.record(z.record(z.unknown())).optional()
});

export const artifactStepSchema = z.object({
  id: z.string().min(1),
  phase: z.string().min(1),
  intent: z.string().min(1),
  risk: riskSchema,
  action: z.object({
    type: actionTypeSchema,
    target: z.object({
      id: z.string().min(1),
      description: z.string().min(1),
      fingerprint: targetFingerprintSchema,
      confidence: z.object({
        minimum: z.number().min(0).max(1),
        signals: z.array(z.string())
      }).optional()
    }).optional(),
    value: z.unknown().optional(),
    output_key: z.string().optional()
  }),
  checkpoint: z.object({
    type: z.string(),
    value: z.unknown()
  }).optional(),
  recovery: z.array(z.record(z.unknown())).optional()
});

export const capabilityArtifactSchema = z.object({
  schema_version: z.literal("1.0"),
  capability: z.object({
    id: z.string(),
    name: z.string(),
    status: z.enum(["draft", "reviewed", "approved", "deprecated"]),
    risk_level: z.enum(["low", "moderate", "high"])
  }),
  surface: z.object({
    kind: z.string(),
    app_family: z.string(),
    supported_adapters: z.array(z.string())
  }),
  contract: z.object({
    inputs: z.record(z.record(z.unknown())),
    outputs: z.record(z.record(z.unknown()))
  }),
  safety: z.record(z.unknown()),
  phases: z.array(z.object({ id: z.string(), description: z.string() })),
  steps: z.array(artifactStepSchema),
  known_outcomes: z.array(z.object({
    code: z.string(),
    status: runStatusSchema,
    detect: z.record(z.unknown()),
    message: z.string().optional()
  })),
  handoff: z.record(z.unknown()),
  compatibility: z.object({
    app_family: z.string(),
    base_variant: z.string(),
    tested_variants: z.array(z.string()),
    required_features: z.array(z.string())
  }),
  variant_overlays: z.record(z.unknown()),
  evidence: z.record(z.unknown())
});

export type ArtifactStep = z.infer<typeof artifactStepSchema>;
export type CapabilityArtifact = z.infer<typeof capabilityArtifactSchema>;

export function parseCapabilityArtifact(value: unknown): CapabilityArtifact {
  return capabilityArtifactSchema.parse(value);
}
```

- [ ] **Step 4: Implement overlay application**

Create `src/artifacts/overlays.ts`:

```typescript
import type { CapabilityArtifact } from "./schema.js";

type Overlay = {
  target_overrides?: Record<string, unknown>;
};

export function applyVariantOverlay(artifact: CapabilityArtifact, tenantProfile?: string): CapabilityArtifact {
  if (!tenantProfile) return artifact;
  const overlay = artifact.variant_overlays[tenantProfile] as Overlay | undefined;
  if (!overlay?.target_overrides) return artifact;

  const steps = artifact.steps.map((step) => {
    const override = overlay.target_overrides?.[`${step.id}.target`];
    if (!override || !step.action.target) return step;
    return {
      ...step,
      action: {
        ...step.action,
        target: {
          ...step.action.target,
          ...(override as Record<string, unknown>)
        }
      }
    };
  });

  return { ...artifact, steps };
}
```

- [ ] **Step 5: Run tests and typecheck**

Run:

```bash
npm test -- tests/core/artifact-schema.test.ts tests/core/overlays.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/artifacts/schema.ts src/artifacts/overlays.ts tests/core/artifact-schema.test.ts tests/core/overlays.test.ts
git commit -m "feat: add capability artifact schema"
```

---

### Task 3: Safety Policy

**Files:**
- Create: `src/safety/policy.ts`
- Test: `tests/core/safety-policy.test.ts`

**Interfaces:**
- Produces: `SafetyDecision`, `SafetyPolicy`, `createDefaultSafetyPolicy(profile)`
- Consumes: none

- [ ] **Step 1: Write the failing policy tests**

Create `tests/core/safety-policy.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:

```bash
npm test -- tests/core/safety-policy.test.ts
```

Expected: FAIL because `src/safety/policy.ts` does not exist.

- [ ] **Step 3: Implement the default safety policy**

Create `src/safety/policy.ts`:

```typescript
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

const allowedActions = new Set(["navigate", "click", "type", "select", "extract", "assert", "wait", "finish", "escalate"]);
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
```

- [ ] **Step 4: Run tests and typecheck**

Run:

```bash
npm test -- tests/core/safety-policy.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/safety/policy.ts tests/core/safety-policy.test.ts
git commit -m "feat: add safety policy"
```

---

### Task 4: Evidence Logger

**Files:**
- Create: `src/evidence/logger.ts`
- Test: `tests/core/evidence-logger.test.ts`

**Interfaces:**
- Produces: `EvidenceLogger`, `createEvidenceLogger(rootDir, runId)`
- Consumes: `redactParams(params)`

- [ ] **Step 1: Write the failing evidence logger test**

Create `tests/core/evidence-logger.test.ts`:

```typescript
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createEvidenceLogger } from "../../src/evidence/logger.js";

describe("evidence logger", () => {
  it("writes redacted JSONL events and result JSON", async () => {
    const dir = await mkdtemp(join(tmpdir(), "evidence-"));
    try {
      const logger = await createEvidenceLogger(dir, "run_001");
      await logger.event({
        phase: "find_member",
        step_id: "enter_member_id",
        event: "action_executed",
        actor: "replay",
        intent: "search_member",
        action_type: "type",
        target_id: "member_id_field",
        risk: "safe",
        status: "ok",
        params: { member_id: "24816", token: "secret" }
      });
      await logger.result({ status: "success", capability_id: "cap", run_id: "run_001", message: "ok", evidence: {} });

      const log = await readFile(join(dir, "run_001", "run-log.jsonl"), "utf8");
      expect(log).toContain("****16");
      expect(log).not.toContain("24816");
      expect(log).not.toContain("secret");

      const result = await readFile(join(dir, "run_001", "result.json"), "utf8");
      expect(JSON.parse(result).status).toBe("success");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
npm test -- tests/core/evidence-logger.test.ts
```

Expected: FAIL because `src/evidence/logger.ts` does not exist.

- [ ] **Step 3: Implement the evidence logger**

Create `src/evidence/logger.ts`:

```typescript
import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { RunResult } from "../shared/result.js";
import { redactParams } from "../shared/params.js";

type EvidenceEvent = {
  phase?: string;
  step_id?: string;
  event: string;
  actor: "gemini" | "replay" | "human" | "system";
  intent?: string;
  action_type?: string;
  target_id?: string;
  risk?: string;
  status: string;
  params?: Record<string, unknown>;
  [key: string]: unknown;
};

export type EvidenceLogger = {
  runDir: string;
  event(event: EvidenceEvent): Promise<void>;
  result(result: RunResult): Promise<void>;
  path(name: string): string;
};

export async function createEvidenceLogger(rootDir: string, runId: string): Promise<EvidenceLogger> {
  const runDir = join(rootDir, runId);
  await mkdir(runDir, { recursive: true });
  const logPath = join(runDir, "run-log.jsonl");
  return {
    runDir,
    path(name) {
      return join(runDir, name);
    },
    async event(event) {
      const safe = { ...event, params: event.params ? redactParams(event.params) : undefined, ts: new Date().toISOString() };
      await appendFile(logPath, `${JSON.stringify(safe)}\n`);
    },
    async result(result) {
      await writeFile(join(runDir, "result.json"), `${JSON.stringify(result, null, 2)}\n`);
    }
  };
}
```

- [ ] **Step 4: Run tests and typecheck**

Run:

```bash
npm test -- tests/core/evidence-logger.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/evidence/logger.ts tests/core/evidence-logger.test.ts
git commit -m "feat: add evidence logger"
```

---

### Task 5: Surface Types And Browser Observation Adapter

**Files:**
- Create: `src/surface/types.ts`
- Create: `src/surface/browser.ts`
- Test: `tests/replay/browser-surface.test.ts`

**Interfaces:**
- Produces: `SurfaceAdapter`, `Observation`, `ResolvedAction`, `BrowserSurfaceAdapter`
- Consumes: Playwright `Page`

- [ ] **Step 1: Write the failing browser observation test**

Create `tests/replay/browser-surface.test.ts`:

```typescript
import { chromium } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BrowserSurfaceAdapter } from "../../src/surface/browser.js";
import { createLoanPortalApp } from "../../apps/loan-portal/src/server.js";

let server: { close(callback?: () => void): void };

beforeAll(async () => {
  server = createLoanPortalApp().listen(3000);
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe("BrowserSurfaceAdapter", () => {
  it("captures state, visible text, controls, and local screenshot path", async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage();
    const adapter = new BrowserSurfaceAdapter(page, "evidence/test-browser-surface");
    await adapter.open("http://localhost:3000");
    const observation = await adapter.observe({ recent_actions: [] });
    await browser.close();

    expect(observation.state.title).toContain("Loan Servicing Portal");
    expect(observation.visual.visible_text_blocks.join(" ")).toContain("Member Search");
    expect(observation.accessibility.controls.some((control) => control.name === "Member Search")).toBe(true);
    expect(observation.visual.screenshot_path).toContain("evidence/test-browser-surface");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
npm test -- tests/replay/browser-surface.test.ts
```

Expected: FAIL because surface modules do not exist.

- [ ] **Step 3: Implement generic surface types**

Create `src/surface/types.ts`:

```typescript
export type Observation = {
  state: { surface_kind: "browser"; url: string; title: string; recent_actions: string[] };
  visual: { screenshot_path: string; send_to_llm: boolean; viewport: { width: number; height: number }; visible_text_blocks: string[] };
  accessibility: { controls: Array<{ role: string; name: string; enabled: boolean }> };
  structure: { tables: Array<{ name: string; headers: string[]; rows: string[][] }>; forms: Array<{ name: string; fields: string[] }>; regions: Array<{ name: string; text: string }> };
  policy: Record<string, unknown>;
};

export type ObservationContext = {
  recent_actions: string[];
  policy?: Record<string, unknown>;
};

export type ResolvedAction =
  | { type: "navigate"; url: string }
  | { type: "click"; locator: string }
  | { type: "type"; locator: string; value: string }
  | { type: "select"; locator: string; value: string }
  | { type: "extract"; locator: string; output_key: string }
  | { type: "assert"; text: string }
  | { type: "wait"; ms: number };

export type ActionResult = {
  ok: boolean;
  extracted?: Record<string, unknown>;
  message?: string;
};

export type EvidenceRef = {
  path: string;
  kind: "screenshot" | "trace" | "snapshot";
};

export interface SurfaceAdapter {
  open(entrypoint: string): Promise<void>;
  observe(context: ObservationContext): Promise<Observation>;
  act(action: ResolvedAction): Promise<ActionResult>;
  captureEvidence(label: string): Promise<EvidenceRef>;
}
```

- [ ] **Step 4: Implement BrowserSurfaceAdapter**

Create `src/surface/browser.ts`:

```typescript
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { Page } from "playwright";
import type { ActionResult, EvidenceRef, Observation, ObservationContext, ResolvedAction, SurfaceAdapter } from "./types.js";

export class BrowserSurfaceAdapter implements SurfaceAdapter {
  constructor(private readonly page: Page, private readonly evidenceDir: string) {}

  async open(entrypoint: string): Promise<void> {
    await this.page.goto(entrypoint);
  }

  async observe(context: ObservationContext): Promise<Observation> {
    const screenshot = await this.captureEvidence(`observation-${Date.now()}`);
    const bodyText = await this.page.locator("body").innerText().catch(() => "");
    const viewport = this.page.viewportSize() ?? { width: 0, height: 0 };
    const controls = await this.page.locator("a,button,input,select,[role='tab']").evaluateAll((elements) =>
      elements.map((element) => {
        const input = element as HTMLInputElement;
        const role = element.getAttribute("role") || element.tagName.toLowerCase();
        const name = element.getAttribute("aria-label") || input.labels?.[0]?.textContent?.trim() || element.textContent?.trim() || input.name || input.value || "";
        return { role, name, enabled: !(input.disabled ?? false) };
      }).filter((control) => control.name)
    );
    return {
      state: { surface_kind: "browser", url: this.page.url(), title: await this.page.title(), recent_actions: context.recent_actions },
      visual: { screenshot_path: screenshot.path, send_to_llm: false, viewport, visible_text_blocks: bodyText.split("\n").map((line) => line.trim()).filter(Boolean) },
      accessibility: { controls },
      structure: { tables: [], forms: [], regions: [{ name: "body", text: bodyText }] },
      policy: context.policy ?? {}
    };
  }

  async act(action: ResolvedAction): Promise<ActionResult> {
    if (action.type === "navigate") await this.page.goto(action.url);
    if (action.type === "click") await this.page.locator(action.locator).click();
    if (action.type === "type") await this.page.locator(action.locator).fill(action.value);
    if (action.type === "select") await this.page.locator(action.locator).selectOption(action.value);
    if (action.type === "assert") await this.page.getByText(action.text).waitFor({ state: "visible" });
    if (action.type === "wait") await this.page.waitForTimeout(action.ms);
    if (action.type === "extract") {
      const text = await this.page.locator(action.locator).textContent();
      return { ok: true, extracted: { [action.output_key]: text?.trim() ?? "" } };
    }
    return { ok: true };
  }

  async captureEvidence(label: string): Promise<EvidenceRef> {
    await mkdir(this.evidenceDir, { recursive: true });
    const path = join(this.evidenceDir, `${label}.png`);
    await this.page.screenshot({ path, fullPage: true });
    return { path, kind: "screenshot" };
  }
}
```

- [ ] **Step 5: Run tests and typecheck**

Run:

```bash
npm test -- tests/replay/browser-surface.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/surface/types.ts src/surface/browser.ts tests/replay/browser-surface.test.ts
git commit -m "feat: add browser surface adapter"
```

---

### Task 6: Target Resolver

**Files:**
- Create: `src/replay/target-resolver.ts`
- Test: `tests/replay/target-resolver.test.ts`

**Interfaces:**
- Produces: `resolveTarget(target, observation): TargetResolution`
- Consumes: `Observation` from `src/surface/types.ts`

- [ ] **Step 1: Write the failing target resolver tests**

Create `tests/replay/target-resolver.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { resolveTarget } from "../../src/replay/target-resolver.js";
import type { Observation } from "../../src/surface/types.js";

const observation: Observation = {
  state: { surface_kind: "browser", url: "http://localhost:3000", title: "Member Profile", recent_actions: [] },
  visual: { screenshot_path: "shot.png", send_to_llm: false, viewport: { width: 1280, height: 720 }, visible_text_blocks: ["Member Profile", "Accounts", "Loans", "Offers"] },
  accessibility: { controls: [{ role: "tab", name: "Offers", enabled: true }] },
  structure: { tables: [], forms: [], regions: [{ name: "profile_tabs", text: "Accounts Loans Offers" }] },
  policy: {}
};

describe("target resolver", () => {
  it("resolves a unique semantic role/name target to a Playwright locator", () => {
    const result = resolveTarget({
      id: "offers_tab",
      description: "Offers tab",
      fingerprint: { semantic: { role: "tab", name: "Offers" } },
      confidence: { minimum: 0.85, signals: ["role_name_match", "unique_match"] }
    }, observation);
    expect(result).toEqual({ status: "resolved", locator: "role=tab[name=\"Offers\"]", score: 1 });
  });

  it("returns needs_human for ambiguous targets", () => {
    const ambiguous = { ...observation, accessibility: { controls: [{ role: "link", name: "Open Member", enabled: true }, { role: "link", name: "Open Member", enabled: true }] } };
    const result = resolveTarget({
      id: "open_member",
      description: "Open Member link",
      fingerprint: { semantic: { role: "link", name: "Open Member" } },
      confidence: { minimum: 0.85, signals: ["role_name_match", "unique_match"] }
    }, ambiguous);
    expect(result.status).toBe("ambiguous");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
npm test -- tests/replay/target-resolver.test.ts
```

Expected: FAIL because `target-resolver.ts` does not exist.

- [ ] **Step 3: Implement deterministic target resolution**

Create `src/replay/target-resolver.ts`:

```typescript
import type { Observation } from "../surface/types.js";

type Target = {
  id: string;
  description: string;
  fingerprint: {
    semantic?: { role?: string; name?: string; name_contains?: string };
    visual?: { anchor_text?: string };
    structure?: { region?: string };
    adapter_hints?: Record<string, { locator?: string }>;
  };
  confidence?: { minimum: number; signals: string[] };
};

export type TargetResolution =
  | { status: "resolved"; locator: string; score: number }
  | { status: "ambiguous"; code: "ambiguous_target"; message: string }
  | { status: "not_found"; code: "target_not_found"; message: string };

export function resolveTarget(target: Target, observation: Observation): TargetResolution {
  const semantic = target.fingerprint.semantic;
  if (semantic?.role && semantic.name) {
    const matches = observation.accessibility.controls.filter((control) => control.role === semantic.role && control.name === semantic.name);
    if (matches.length === 1) return { status: "resolved", locator: `role=${semantic.role}[name="${semantic.name}"]`, score: 1 };
    if (matches.length > 1) return { status: "ambiguous", code: "ambiguous_target", message: `Multiple controls matched ${target.description}` };
  }
  if (semantic?.role && semantic.name_contains) {
    const matches = observation.accessibility.controls.filter((control) => control.role === semantic.role && control.name.includes(semantic.name_contains ?? ""));
    if (matches.length === 1) return { status: "resolved", locator: `text=${semantic.name_contains}`, score: 0.9 };
    if (matches.length > 1) return { status: "ambiguous", code: "ambiguous_target", message: `Multiple controls matched ${target.description}` };
  }
  const anchor = target.fingerprint.visual?.anchor_text;
  if (anchor && observation.visual.visible_text_blocks.some((block) => block.includes(anchor))) {
    return { status: "resolved", locator: `text=${anchor}`, score: 0.86 };
  }
  const hint = target.fingerprint.adapter_hints?.["browser.playwright"]?.locator;
  if (hint) return { status: "resolved", locator: hint, score: 0.85 };
  return { status: "not_found", code: "target_not_found", message: `No target matched ${target.description}` };
}
```

- [ ] **Step 4: Run tests and typecheck**

Run:

```bash
npm test -- tests/replay/target-resolver.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/replay/target-resolver.ts tests/replay/target-resolver.test.ts
git commit -m "feat: add target resolver"
```

---

### Task 7: Outcome Detector And Recovery Decisions

**Files:**
- Create: `src/replay/outcome-detector.ts`
- Test: `tests/replay/outcome-detector.test.ts`

**Interfaces:**
- Produces: `detectOutcome(observation, knownOutcomes): OutcomeDetection`
- Consumes: `Observation`

- [ ] **Step 1: Write the failing outcome detector tests**

Create `tests/replay/outcome-detector.test.ts`:

```typescript
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

  it("detects unknown modal text as needs_human", () => {
    const result = detectOutcome(observationWithText("Unexpected Confirmation Required"), []);
    expect(result).toMatchObject({ status: "needs_human", code: "unknown_modal" });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
npm test -- tests/replay/outcome-detector.test.ts
```

Expected: FAIL because `outcome-detector.ts` does not exist.

- [ ] **Step 3: Implement outcome detection**

Create `src/replay/outcome-detector.ts`:

```typescript
import type { RunStatus } from "../shared/result.js";
import type { Observation } from "../surface/types.js";

type KnownOutcome = {
  code: string;
  status: RunStatus;
  detect: Record<string, unknown>;
  message?: string;
};

export type OutcomeDetection =
  | { status: "continue" }
  | { status: RunStatus; code: string; message: string };

export function detectOutcome(observation: Observation, knownOutcomes: KnownOutcome[]): OutcomeDetection {
  const text = observation.visual.visible_text_blocks.join("\n");
  for (const outcome of knownOutcomes) {
    if (outcome.detect.type === "text_visible" && typeof outcome.detect.value === "string" && text.includes(outcome.detect.value)) {
      return { status: outcome.status, code: outcome.code, message: outcome.message ?? outcome.code };
    }
  }
  if (/unexpected confirmation|required/i.test(text)) {
    return { status: "needs_human", code: "unknown_modal", message: "Unknown modal or confirmation requires human review." };
  }
  return { status: "continue" };
}
```

- [ ] **Step 4: Run tests and typecheck**

Run:

```bash
npm test -- tests/replay/outcome-detector.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/replay/outcome-detector.ts tests/replay/outcome-detector.test.ts
git commit -m "feat: add outcome detector"
```

---

### Task 8: Handoff Manager

**Files:**
- Create: `src/handoff/manager.ts`
- Test: `tests/replay/handoff-manager.test.ts`

**Interfaces:**
- Produces: `createIntervention(options)`, `recordHumanResume(options)`, `performInteractiveHandoff(options)`
- Consumes: filesystem APIs, evidence paths, `SurfaceAdapter`

- [ ] **Step 1: Write the failing handoff tests**

Create `tests/replay/handoff-manager.test.ts`:

```typescript
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createIntervention, performInteractiveHandoff, recordHumanResume } from "../../src/handoff/manager.js";
import type { ActionResult, EvidenceRef, Observation, ObservationContext, ResolvedAction, SurfaceAdapter } from "../../src/surface/types.js";

class FakeSurface implements SurfaceAdapter {
  async open(): Promise<void> {}
  async observe(_context: ObservationContext): Promise<Observation> { throw new Error("not used"); }
  async act(_action: ResolvedAction): Promise<ActionResult> { return { ok: true }; }
  async captureEvidence(label: string): Promise<EvidenceRef> { return { path: `${label}.png`, kind: "screenshot" }; }
}

describe("handoff manager", () => {
  it("writes intervention and human resume records", async () => {
    const dir = await mkdtemp(join(tmpdir(), "handoff-"));
    try {
      const interventionPath = await createIntervention({
        dir,
        intervention_id: "int_001",
        reason: "ambiguous_member_match",
        step_id: "select_member_result",
        before_screenshot: "before.png",
        message: "Multiple member records matched."
      });
      await recordHumanResume({
        dir,
        intervention_id: "int_001",
        reason: "ambiguous_member_match",
        before_screenshot: "before.png",
        after_screenshot: "after.png",
        human_summary: "Operator selected the Avery Patel row with DOB ending 1991.",
        resume_checkpoint: "member_profile_visible"
      });
      expect(JSON.parse(await readFile(interventionPath, "utf8")).controller).toBe("human");
      expect(await readFile(join(dir, "human-resume.json"), "utf8")).toContain("DOB ending 1991");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("performs a same-session handoff and returns control to automation", async () => {
    const dir = await mkdtemp(join(tmpdir(), "handoff-"));
    try {
      await performInteractiveHandoff({
        dir,
        intervention_id: "int_002",
        reason: "ambiguous_member_match",
        step_id: "select_member_result",
        message: "Multiple member records matched.",
        surface: new FakeSurface(),
        resume_checkpoint: "member_profile_visible",
        waitForResume: async () => "Operator selected the Avery Patel row."
      });
      expect(await readFile(join(dir, "human-resume.json"), "utf8")).toContain("Avery Patel");
      expect(JSON.parse(await readFile(join(dir, "control-lease.json"), "utf8")).controller).toBe("automation");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
npm test -- tests/replay/handoff-manager.test.ts
```

Expected: FAIL because `handoff/manager.ts` does not exist.

- [ ] **Step 3: Implement same-session handoff helpers**

Create `src/handoff/manager.ts`:

```typescript
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import type { SurfaceAdapter } from "../surface/types.js";

export async function createIntervention(input: {
  dir: string;
  intervention_id: string;
  reason: string;
  step_id: string;
  before_screenshot: string;
  message: string;
}): Promise<string> {
  await mkdir(input.dir, { recursive: true });
  const path = join(input.dir, "intervention-request.json");
  await writeFile(path, `${JSON.stringify({ ...input, controller: "human" }, null, 2)}\n`);
  await writeFile(join(input.dir, "control-lease.json"), `${JSON.stringify({ intervention_id: input.intervention_id, controller: "human", reason: input.reason, step_id: input.step_id }, null, 2)}\n`);
  return path;
}

export async function recordHumanResume(input: {
  dir: string;
  intervention_id: string;
  reason: string;
  before_screenshot: string;
  after_screenshot: string;
  human_summary: string;
  resume_checkpoint: string;
}): Promise<string> {
  const path = join(input.dir, "human-resume.json");
  await writeFile(path, `${JSON.stringify(input, null, 2)}\n`);
  await writeFile(join(input.dir, "control-lease.json"), `${JSON.stringify({ intervention_id: input.intervention_id, controller: "automation", reason: input.reason }, null, 2)}\n`);
  return path;
}

async function promptForResume(): Promise<string> {
  const rl = createInterface({ input, output });
  try {
    const summary = await rl.question("Human handoff active. Complete the manual step in the open browser, then describe what you did and press Enter: ");
    return summary.trim() || "Human completed the requested manual step.";
  } finally {
    rl.close();
  }
}

export async function performInteractiveHandoff(input: {
  dir: string;
  intervention_id: string;
  reason: string;
  step_id: string;
  message: string;
  surface: SurfaceAdapter;
  resume_checkpoint: string;
  waitForResume?: () => Promise<string>;
}): Promise<{ before_screenshot: string; after_screenshot: string; human_summary: string }> {
  const before = await input.surface.captureEvidence("handoff-before");
  await createIntervention({
    dir: input.dir,
    intervention_id: input.intervention_id,
    reason: input.reason,
    step_id: input.step_id,
    before_screenshot: before.path,
    message: input.message
  });
  const human_summary = input.waitForResume ? await input.waitForResume() : await promptForResume();
  const after = await input.surface.captureEvidence("handoff-after");
  await recordHumanResume({
    dir: input.dir,
    intervention_id: input.intervention_id,
    reason: input.reason,
    before_screenshot: before.path,
    after_screenshot: after.path,
    human_summary,
    resume_checkpoint: input.resume_checkpoint
  });
  return { before_screenshot: before.path, after_screenshot: after.path, human_summary };
}
```

- [ ] **Step 4: Run tests and typecheck**

Run:

```bash
npm test -- tests/replay/handoff-manager.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/handoff/manager.ts tests/replay/handoff-manager.test.ts
git commit -m "feat: add handoff records"
```

---

### Task 9: Deterministic Replay Engine

**Files:**
- Create: `src/replay/engine.ts`
- Create: `examples/params/happy-path.json`
- Create: `examples/params/no-offer.json`
- Create: `examples/params/ambiguous-member.json`
- Create: `examples/artifacts/base.v1.json`
- Create: `examples/artifacts/blocked-submit-attempt.v1.json`
- Test: `tests/replay/replay-engine.test.ts`

**Interfaces:**
- Produces: `runReplay(options): Promise<RunResult>`
- Consumes: artifact schema, overlays, safety policy, surface adapter, target resolver, outcome detector, evidence logger

- [ ] **Step 1: Write failing replay engine tests with a fake surface**

Create `tests/replay/replay-engine.test.ts`:

```typescript
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runReplay } from "../../src/replay/engine.js";
import { createDefaultSafetyPolicy } from "../../src/safety/policy.js";
import type { SurfaceAdapter, Observation, ResolvedAction, ActionResult, EvidenceRef, ObservationContext } from "../../src/surface/types.js";

class FakeSurface implements SurfaceAdapter {
  actions: ResolvedAction[] = [];
  private observations: Observation[];
  private lastObservation: Observation;
  constructor(observations: Observation | Observation[]) {
    this.observations = Array.isArray(observations) ? [...observations] : [observations];
    this.lastObservation = this.observations[0];
  }
  async open(): Promise<void> {}
  async observe(_context: ObservationContext): Promise<Observation> {
    const next = this.observations.shift();
    if (next) this.lastObservation = next;
    return this.lastObservation;
  }
  async act(action: ResolvedAction): Promise<ActionResult> { this.actions.push(action); return { ok: true, extracted: action.type === "extract" ? { review_status: "ready_for_final_review" } : undefined }; }
  async captureEvidence(label: string): Promise<EvidenceRef> { return { path: `${label}.png`, kind: "screenshot" }; }
}

function observation(text: string): Observation {
  return {
    state: { surface_kind: "browser", url: "http://localhost:3000", title: "Final Review", recent_actions: [] },
    visual: { screenshot_path: "shot.png", send_to_llm: false, viewport: { width: 1, height: 1 }, visible_text_blocks: [text] },
    accessibility: { controls: [{ role: "button", name: "Submit Final Application", enabled: true }, { role: "link", name: "Member Search", enabled: true }] },
    structure: { tables: [], forms: [], regions: [{ name: "body", text }] },
    policy: {}
  };
}

describe("runReplay", () => {
  it("blocks forbidden intents before clicking", async () => {
    const dir = await mkdtemp(join(tmpdir(), "replay-"));
    try {
      const surface = new FakeSurface(observation("Final Review Ready for final review"));
      const result = await runReplay({
        artifact: {
          schema_version: "1.0",
          capability: { id: "prepare_auto_loan_offer_review", name: "Prepare", status: "draft", risk_level: "moderate" },
          surface: { kind: "browser", app_family: "loan_servicing_portal", supported_adapters: ["browser.playwright"] },
          contract: { inputs: {}, outputs: {} },
          safety: {},
          phases: [{ id: "blocked", description: "Blocked" }],
          steps: [{
            id: "submit_final_application",
            phase: "blocked",
            intent: "submit_final_application",
            risk: "blocked",
            action: { type: "click", target: { id: "submit", description: "Submit Final Application", fingerprint: { semantic: { role: "button", name: "Submit Final Application" } }, confidence: { minimum: 0.85, signals: [] } } }
          }],
          known_outcomes: [],
          handoff: {},
          compatibility: { app_family: "loan_servicing_portal", base_variant: "default", tested_variants: ["default"], required_features: [] },
          variant_overlays: {},
          evidence: {}
        },
        params: {},
        surface,
        policy: createDefaultSafetyPolicy("demo"),
        evidenceRoot: dir,
        runId: "run_blocked",
        allowDraft: true
      });
      expect(result.status).toBe("blocked");
      expect(surface.actions).toHaveLength(0);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("pauses for same-session handoff and resumes replay when interactive handoff is enabled", async () => {
    const dir = await mkdtemp(join(tmpdir(), "replay-"));
    try {
      const surface = new FakeSurface([
        observation("Multiple member records matched"),
        observation("Dashboard Member Search")
      ]);
      const result = await runReplay({
        artifact: {
          schema_version: "1.0",
          capability: { id: "prepare_auto_loan_offer_review", name: "Prepare", status: "draft", risk_level: "moderate" },
          surface: { kind: "browser", app_family: "loan_servicing_portal", supported_adapters: ["browser.playwright"] },
          contract: { inputs: {}, outputs: {} },
          safety: {},
          phases: [{ id: "find_member", description: "Find member" }],
          steps: [{
            id: "open_member_search",
            phase: "find_member",
            intent: "open_member_search",
            risk: "safe",
            action: { type: "click", target: { id: "member_search", description: "Member Search link", fingerprint: { semantic: { role: "link", name: "Member Search" } }, confidence: { minimum: 0.85, signals: [] } } }
          }],
          known_outcomes: [
            { code: "ambiguous_member_match", status: "needs_human", detect: { type: "text_visible", value: "Multiple member records matched" }, message: "Multiple member records matched." }
          ],
          handoff: { mode: "same_session_cli", resume_checkpoint: "member_profile_visible" },
          compatibility: { app_family: "loan_servicing_portal", base_variant: "default", tested_variants: ["default"], required_features: [] },
          variant_overlays: {},
          evidence: {}
        },
        params: {},
        surface,
        policy: createDefaultSafetyPolicy("demo"),
        evidenceRoot: dir,
        runId: "run_handoff",
        allowDraft: true,
        interactiveHandoff: true,
        waitForHandoffResume: async () => "Operator selected the correct member row."
      });
      expect(result.status).toBe("success");
      expect(surface.actions).toHaveLength(0);
      expect(await readFile(join(dir, "handoff-open_member_search", "human-resume.json"), "utf8")).toContain("correct member row");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
```

- [ ] **Step 2: Run the replay test to verify it fails**

Run:

```bash
npm test -- tests/replay/replay-engine.test.ts
```

Expected: FAIL because `runReplay` does not exist.

- [ ] **Step 3: Implement minimal replay engine**

Create `src/replay/engine.ts`:

```typescript
import type { CapabilityArtifact } from "../artifacts/schema.js";
import { parseCapabilityArtifact } from "../artifacts/schema.js";
import { applyVariantOverlay } from "../artifacts/overlays.js";
import { createEvidenceLogger } from "../evidence/logger.js";
import { performInteractiveHandoff } from "../handoff/manager.js";
import type { RunResult } from "../shared/result.js";
import { substituteParams } from "../shared/params.js";
import type { SafetyPolicy } from "../safety/policy.js";
import type { SurfaceAdapter } from "../surface/types.js";
import { detectOutcome } from "./outcome-detector.js";
import { resolveTarget } from "./target-resolver.js";

export type ReplayOptions = {
  artifact: CapabilityArtifact;
  params: Record<string, unknown>;
  surface: SurfaceAdapter;
  policy: SafetyPolicy;
  evidenceRoot: string;
  runId: string;
  tenantProfile?: string;
  allowDraft: boolean;
  interactiveHandoff?: boolean;
  waitForHandoffResume?: () => Promise<string>;
};

function toResolvedAction(step: CapabilityArtifact["steps"][number], locator: string, params: Record<string, unknown>) {
  const value = String(substituteParams(step.action.value, params) ?? "");
  if (step.action.type === "click") return { type: "click" as const, locator };
  if (step.action.type === "type") return { type: "type" as const, locator, value };
  if (step.action.type === "select") return { type: "select" as const, locator, value };
  if (step.action.type === "extract") return { type: "extract" as const, locator, output_key: step.action.output_key ?? step.id };
  if (step.action.type === "assert") return { type: "assert" as const, text: value };
  if (step.action.type === "wait") return { type: "wait" as const, ms: Number(value || 500) };
  return { type: "wait" as const, ms: 0 };
}

export async function runReplay(options: ReplayOptions): Promise<RunResult> {
  const parsed = parseCapabilityArtifact(options.artifact);
  if (parsed.capability.status === "draft" && !options.allowDraft) {
    return { status: "blocked", capability_id: parsed.capability.id, run_id: options.runId, code: "draft_not_allowed", message: "Draft artifact replay requires --allow-draft.", evidence: {} };
  }
  const artifact = applyVariantOverlay(parsed, options.tenantProfile);
  const logger = await createEvidenceLogger(options.evidenceRoot, options.runId);
  await logger.event({ event: "replay_started", actor: "replay", status: "ok", params: options.params });
  const resumeCheckpoint = typeof artifact.handoff.resume_checkpoint === "string" ? artifact.handoff.resume_checkpoint : "post_handoff_observed";

  async function handleNeedsHuman(step: CapabilityArtifact["steps"][number], code: string, message: string): Promise<RunResult | "resumed"> {
    if (!options.interactiveHandoff) {
      const result: RunResult = { status: "needs_human", capability_id: artifact.capability.id, run_id: options.runId, step_id: step.id, code, message, evidence: { log: logger.path("run-log.jsonl") } };
      await logger.result(result);
      return result;
    }
    await performInteractiveHandoff({
      dir: `${options.evidenceRoot}/handoff-${step.id}`,
      intervention_id: `${options.runId}_${step.id}`,
      reason: code,
      step_id: step.id,
      message,
      surface: options.surface,
      resume_checkpoint: resumeCheckpoint,
      waitForResume: options.waitForHandoffResume
    });
    await logger.event({ event: "handoff_resumed", actor: "human", status: "ok", step_id: step.id, reason_summary: message, params: options.params });
    return "resumed";
  }

  for (const step of artifact.steps) {
    const observation = await options.surface.observe({ recent_actions: [step.id] });
    const knownOutcome = detectOutcome(observation, artifact.known_outcomes);
    if (knownOutcome.status !== "continue") {
      if (knownOutcome.status === "needs_human") {
        const handoff = await handleNeedsHuman(step, knownOutcome.code, knownOutcome.message);
        if (handoff === "resumed") continue;
        return handoff;
      }
      const result: RunResult = { status: knownOutcome.status, capability_id: artifact.capability.id, run_id: options.runId, step_id: step.id, code: knownOutcome.code, message: knownOutcome.message, evidence: { log: logger.path("run-log.jsonl") } };
      await logger.result(result);
      return result;
    }

    const safety = options.policy.evaluate({ origin: new URL(observation.state.url).origin, actionType: step.action.type, intent: step.intent, risk: step.risk });
    if (safety.decision === "blocked") {
      const result: RunResult = { status: "blocked", capability_id: artifact.capability.id, run_id: options.runId, step_id: step.id, code: safety.code, message: safety.message, evidence: { log: logger.path("run-log.jsonl") } };
      await logger.result(result);
      return result;
    }
    if (safety.decision === "needs_human") {
      const handoff = await handleNeedsHuman(step, safety.code, safety.message);
      if (handoff === "resumed") continue;
      return handoff;
    }

    if (step.action.type === "finish") continue;
    if (!step.action.target) continue;
    const resolution = resolveTarget(step.action.target, observation);
    if (resolution.status === "ambiguous") {
      const handoff = await handleNeedsHuman(step, resolution.code, resolution.message);
      if (handoff === "resumed") continue;
      return handoff;
    }
    if (resolution.status === "not_found") {
      const result: RunResult = { status: "failure", capability_id: artifact.capability.id, run_id: options.runId, step_id: step.id, code: "surface_drift_detected", message: resolution.message, evidence: { log: logger.path("run-log.jsonl") } };
      await logger.result(result);
      return result;
    }

    await options.surface.act(toResolvedAction(step, resolution.locator, options.params));
    await logger.event({ event: "action_executed", actor: "replay", phase: step.phase, step_id: step.id, intent: step.intent, action_type: step.action.type, target_id: step.action.target.id, risk: step.risk, status: "ok", params: options.params });
  }

  const result: RunResult = { status: "success", capability_id: artifact.capability.id, run_id: options.runId, message: "Replay completed.", outputs: {}, evidence: { log: logger.path("run-log.jsonl") } };
  await logger.result(result);
  return result;
}
```

- [ ] **Step 4: Add example params and artifacts**

Create `examples/params/happy-path.json`:

```json
{
  "member_id": "24816",
  "offer_type": "auto_loan",
  "vehicle_type": "used"
}
```

Create `examples/params/no-offer.json`:

```json
{
  "member_id": "99999",
  "offer_type": "auto_loan",
  "vehicle_type": "used"
}
```

Create `examples/params/ambiguous-member.json`:

```json
{
  "member_id": "77777",
  "offer_type": "auto_loan",
  "vehicle_type": "used"
}
```

Create `examples/artifacts/base.v1.json`:

```json
{
  "schema_version": "1.0",
  "capability": {
    "id": "prepare_auto_loan_offer_review",
    "name": "Prepare Auto Loan Offer Review",
    "status": "draft",
    "risk_level": "moderate"
  },
  "surface": {
    "kind": "browser",
    "app_family": "loan_servicing_portal",
    "supported_adapters": ["browser.playwright"]
  },
  "contract": {
    "inputs": {
      "member_id": { "type": "string", "required": true },
      "offer_type": { "type": "string", "required": true },
      "vehicle_type": { "type": "string", "required": true }
    },
    "outputs": {
      "review_status": { "type": "string", "sensitivity": "low" }
    }
  },
  "safety": { "policy_profile": "demo" },
  "phases": [
    { "id": "find_member", "description": "Find and open the member profile." }
  ],
  "steps": [
    {
      "id": "open_member_search",
      "phase": "find_member",
      "intent": "open_member_search",
      "risk": "safe",
      "action": {
        "type": "click",
        "target": {
          "id": "member_search_link",
          "description": "Member Search link",
          "fingerprint": {
            "semantic": { "role": "link", "name": "Member Search" },
            "visual": { "anchor_text": "Member Search" }
          },
          "confidence": { "minimum": 0.85, "signals": ["role_name_match", "unique_match"] }
        }
      },
      "checkpoint": { "type": "text_visible", "value": "Member Search" }
    }
  ],
  "known_outcomes": [
    {
      "code": "no_auto_loan_offer",
      "status": "business_outcome",
      "detect": { "type": "text_visible", "value": "No active pre-approved auto loan offers" },
      "message": "Member has no active pre-approved auto loan offer."
    }
  ],
  "handoff": { "mode": "same_session_cli" },
  "compatibility": {
    "app_family": "loan_servicing_portal",
    "base_variant": "default",
    "tested_variants": ["default"],
    "required_features": ["member_search"]
  },
  "variant_overlays": {},
  "evidence": {}
}
```

Create `examples/artifacts/blocked-submit-attempt.v1.json`:

```json
{
  "schema_version": "1.0",
  "capability": {
    "id": "prepare_auto_loan_offer_review",
    "name": "Prepare Auto Loan Offer Review",
    "status": "draft",
    "risk_level": "moderate"
  },
  "surface": {
    "kind": "browser",
    "app_family": "loan_servicing_portal",
    "supported_adapters": ["browser.playwright"]
  },
  "contract": {
    "inputs": {
      "member_id": { "type": "string", "required": true },
      "offer_type": { "type": "string", "required": true },
      "vehicle_type": { "type": "string", "required": true }
    },
    "outputs": {}
  },
  "safety": { "policy_profile": "demo" },
  "phases": [
    { "id": "blocked_policy_test", "description": "Prove blocked final submission is stopped before clicking." }
  ],
  "steps": [
    {
      "id": "submit_final_application",
      "phase": "blocked_policy_test",
      "intent": "submit_final_application",
      "risk": "blocked",
      "action": {
        "type": "click",
        "target": {
          "id": "submit_final_application_button",
          "description": "Submit Final Application button",
          "fingerprint": {
            "semantic": { "role": "button", "name": "Submit Final Application" },
            "visual": { "anchor_text": "Submit Final Application" }
          },
          "confidence": { "minimum": 0.85, "signals": ["role_name_match", "unique_match"] }
        }
      },
      "checkpoint": { "type": "blocked_before_action", "value": "submit_final_application" }
    }
  ],
  "known_outcomes": [],
  "handoff": {},
  "compatibility": {
    "app_family": "loan_servicing_portal",
    "base_variant": "default",
    "tested_variants": ["default"],
    "required_features": ["auto_loan_offer_review"]
  },
  "variant_overlays": {},
  "evidence": {}
}
```

- [ ] **Step 5: Run replay tests and typecheck**

Run:

```bash
npm test -- tests/replay/replay-engine.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/replay/engine.ts examples/params examples/artifacts tests/replay/replay-engine.test.ts
git commit -m "feat: add deterministic replay engine"
```

---

### Task 10: Replay CLI

**Files:**
- Create: `src/cli/replay.ts`
- Test: `tests/replay/replay-cli.test.ts`

**Interfaces:**
- Produces CLI: `npm run replay -- --artifact <path> --params <path> --out <dir> --allow-draft`
- Consumes: `runReplay(options)`, `BrowserSurfaceAdapter`, `createDefaultSafetyPolicy`

- [ ] **Step 1: Write a failing CLI argument parser test**

Create `tests/replay/replay-cli.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { parseReplayArgs } from "../../src/cli/replay.js";

describe("replay CLI args", () => {
  it("parses artifact, params, out, tenant, and allow-draft flags", () => {
    expect(parseReplayArgs([
      "--artifact", "evidence/artifact.json",
      "--params", "examples/params/happy-path.json",
      "--out", "evidence/replay-success",
      "--tenant", "default",
      "--allow-draft"
    ])).toEqual({
      artifactPath: "evidence/artifact.json",
      paramsPath: "examples/params/happy-path.json",
      outDir: "evidence/replay-success",
      tenantProfile: "default",
      allowDraft: true,
      interactiveHandoff: false
    });
  });
});
```

- [ ] **Step 2: Run the CLI test to verify it fails**

Run:

```bash
npm test -- tests/replay/replay-cli.test.ts
```

Expected: FAIL because replay CLI does not export `parseReplayArgs`.

- [ ] **Step 3: Implement CLI arg parsing and executable main**

Create `src/cli/replay.ts`:

```typescript
import { readFile } from "node:fs/promises";
import { chromium } from "playwright";
import { parseCapabilityArtifact } from "../artifacts/schema.js";
import { runReplay } from "../replay/engine.js";
import { createDefaultSafetyPolicy } from "../safety/policy.js";
import { BrowserSurfaceAdapter } from "../surface/browser.js";

export type ReplayCliArgs = {
  artifactPath: string;
  paramsPath: string;
  outDir: string;
  tenantProfile?: string;
  allowDraft: boolean;
  interactiveHandoff: boolean;
};

export function parseReplayArgs(argv: string[]): ReplayCliArgs {
  const value = (flag: string) => {
    const index = argv.indexOf(flag);
    return index >= 0 ? argv[index + 1] : undefined;
  };
  const artifactPath = value("--artifact");
  const paramsPath = value("--params");
  const outDir = value("--out");
  if (!artifactPath || !paramsPath || !outDir) throw new Error("Required flags: --artifact, --params, --out");
  return {
    artifactPath,
    paramsPath,
    outDir,
    tenantProfile: value("--tenant"),
    allowDraft: argv.includes("--allow-draft"),
    interactiveHandoff: argv.includes("--interactive-handoff")
  };
}

async function main(): Promise<void> {
  const args = parseReplayArgs(process.argv.slice(2));
  const artifact = parseCapabilityArtifact(JSON.parse(await readFile(args.artifactPath, "utf8")));
  const params = JSON.parse(await readFile(args.paramsPath, "utf8")) as Record<string, unknown>;
  const browser = await chromium.launch({ headless: !args.interactiveHandoff });
  const page = await browser.newPage();
  const surface = new BrowserSurfaceAdapter(page, `${args.outDir}/screenshots`);
  await surface.open("http://localhost:3000");
  const result = await runReplay({
    artifact,
    params,
    surface,
    policy: createDefaultSafetyPolicy("demo"),
    evidenceRoot: args.outDir,
    runId: "replay",
    tenantProfile: args.tenantProfile,
    allowDraft: args.allowDraft,
    interactiveHandoff: args.interactiveHandoff
  });
  console.log(JSON.stringify(result, null, 2));
  await browser.close();
  if (result.status === "failure" || result.status === "blocked") process.exitCode = 1;
}

if (process.argv[1]?.endsWith("replay.ts")) {
  void main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
```

- [ ] **Step 4: Run CLI tests and typecheck**

Run:

```bash
npm test -- tests/replay/replay-cli.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/cli/replay.ts tests/replay/replay-cli.test.ts
git commit -m "feat: add replay CLI"
```

---

## Plan 2 Verification

Run:

```bash
npm run typecheck
npm test -- tests/core tests/replay
npm run replay -- --artifact examples/artifacts/blocked-submit-attempt.v1.json --params examples/params/happy-path.json --out evidence/replay-blocked-policy --allow-draft
```

Expected:

```text
typecheck passes
core and replay tests pass
blocked replay exits with status=blocked and code=policy_violation
result JSON is written under evidence/replay-blocked-policy/replay/result.json
```

At the end of this plan, the system can validate and interpret artifacts without any LLM discovery path.
