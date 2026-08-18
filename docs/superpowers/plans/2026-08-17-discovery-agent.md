# Discovery Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the one-action-at-a-time LLM discovery path that drives the real Loan Servicing Portal and emits a reusable draft capability artifact.

**Architecture:** Discovery uses an `LLMClient` abstraction with Gemini and mock implementations. The agent receives layered observations from `SurfaceAdapter`, asks the LLM for one bounded JSON decision, validates and policy-checks that decision, executes it through the adapter, logs evidence, and records a capability artifact.

**Tech Stack:** TypeScript, Node fetch, Zod, Playwright, Vitest.

## Global Constraints

Gemini proposes actions but never executes browser operations directly.
Gemini does not write Playwright code.
The prompt must explain every observation layer and the exact decision contract before asking for an action.
Gemini structured output must use the same response schema shape as local validation when the API supports it.
Discovery output starts as a `draft` artifact.
Known outcomes come from explicit capability metadata, not hidden recorder logic or a single happy-path Gemini run.
Replay must remain model-free after this plan.
Screenshots are captured locally and sent to Gemini only when `SEND_SCREENSHOTS_TO_LLM=true`; screenshot upload must include the image bytes, not just a local path.
Mock LLM mode must support local repeatability without `GEMINI_API_KEY`.
Real submitted evidence must include at least one Gemini discovery run.
Every task uses TDD: write the failing test, verify failure, implement the minimum, verify pass, commit.

---

## File Structure

Create this structure:

```text
src/llm/types.ts                    LLM decision and client types
src/llm/action-schema.ts            Zod validation for LLM actions
src/llm/prompt.ts                   compact discovery prompt builder
src/llm/mock.ts                     deterministic mock LLM for local repeatability
src/llm/gemini.ts                   Gemini REST client
src/agent/discovery-agent.ts        observe-decide-act discovery loop
src/artifacts/recorder.ts           converts discovery trace to artifact
src/cli/discover.ts                 discovery command
tests/discovery/*.test.ts           unit tests for LLM/action/agent/recorder/CLI
```

This plan consumes `SurfaceAdapter`, `SafetyPolicy`, `EvidenceLogger`, and artifact schemas from earlier plans.

---

### Task 1: LLM Decision Types And Action Validation

**Files:**
- Create: `src/llm/types.ts`
- Create: `src/llm/action-schema.ts`
- Test: `tests/discovery/action-schema.test.ts`

**Interfaces:**
- Produces: `AgentDecision`, `ProposedAction`, `LLMClient`, `parseAgentDecision(value)`, `geminiAgentDecisionResponseSchema`
- Consumes: none

- [ ] **Step 1: Write the failing action schema tests**

Create `tests/discovery/action-schema.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { geminiAgentDecisionResponseSchema, parseAgentDecision } from "../../src/llm/action-schema.js";

describe("LLM action schema", () => {
  it("accepts one bounded click action", () => {
    const decision = parseAgentDecision({
      decision: "act",
      reason_summary: "Open member search first.",
      action: {
        type: "click",
        intent: "open_member_search",
        target: {
          description: "Member Search link",
          semantic: { role: "link", name: "Member Search" }
        }
      }
    });
    expect(decision.decision).toBe("act");
  });

  it("rejects code generation disguised as an action", () => {
    expect(() => parseAgentDecision({
      decision: "act",
      reason_summary: "Run script.",
      action: {
        type: "playwright_code",
        code: "await page.click('#submit')"
      }
    })).toThrow();
  });

  it("accepts finish with typed outputs", () => {
    const decision = parseAgentDecision({
      decision: "finish",
      reason_summary: "Final Review is visible.",
      outputs: { review_status: "ready_for_final_review" }
    });
    expect(decision.decision).toBe("finish");
  });

  it("exports a Gemini-compatible structured output schema", () => {
    expect(geminiAgentDecisionResponseSchema.anyOf[0]).toMatchObject({
      properties: {
        decision: { type: "string", enum: ["act"] }
      },
      required: ["decision", "reason_summary", "action"]
    });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:

```bash
npm test -- tests/discovery/action-schema.test.ts
```

Expected: FAIL because the LLM action schema does not exist.

- [ ] **Step 3: Implement decision types**

Create `src/llm/types.ts`:

```typescript
import type { Observation } from "../surface/types.js";

export type ProposedAction = {
  type: "click" | "type" | "select" | "extract" | "assert" | "wait";
  intent: string;
  target?: {
    description: string;
    semantic?: Record<string, unknown>;
    visual?: Record<string, unknown>;
    structure?: Record<string, unknown>;
  };
  value?: unknown;
  output_key?: string;
};

export type AgentDecision =
  | { decision: "act"; reason_summary: string; action: ProposedAction }
  | { decision: "finish"; reason_summary: string; outputs: Record<string, unknown> }
  | { decision: "escalate"; reason_summary: string; code: string; message: string };

export type LLMClient = {
  decide(input: {
    goal: string;
    observation: Observation;
    params: Record<string, unknown>;
    recentActions: string[];
  }): Promise<AgentDecision>;
};
```

- [ ] **Step 4: Implement action validation**

Create `src/llm/action-schema.ts`:

```typescript
import { z } from "zod";
import type { AgentDecision } from "./types.js";

export const geminiAgentDecisionResponseSchema = {
  anyOf: [
    {
      type: "object",
      properties: {
        decision: { type: "string", enum: ["act"] },
        reason_summary: { type: "string", description: "A short, non-executable explanation for the proposed decision." },
        action: {
          type: "object",
          properties: {
            type: { type: "string", enum: ["click", "type", "select", "extract", "assert", "wait"] },
            intent: { type: "string", description: "Stable workflow intent, for example open_member_search." },
            target: {
              type: "object",
              properties: {
                description: { type: "string" },
                semantic: { type: "object", description: "Accessibility clues such as role, name, label, or accessible state." },
                visual: { type: "object", description: "Visible text, nearby text, or region hints." },
                structure: { type: "object", description: "Table, form, row, column, section, or relative-position hints." }
              },
              required: ["description"]
            },
            value: {
              anyOf: [
                { type: "string" },
                { type: "number" },
                { type: "boolean" },
                { type: "object" },
                { type: "array", items: { type: "string" } },
                { type: "null" }
              ]
            },
            output_key: { type: "string" }
          },
          required: ["type", "intent"]
        }
      },
      required: ["decision", "reason_summary", "action"]
    },
    {
      type: "object",
      properties: {
        decision: { type: "string", enum: ["finish"] },
        reason_summary: { type: "string" },
        outputs: { type: "object" }
      },
      required: ["decision", "reason_summary", "outputs"]
    },
    {
      type: "object",
      properties: {
        decision: { type: "string", enum: ["escalate"] },
        reason_summary: { type: "string" },
        code: { type: "string" },
        message: { type: "string" }
      },
      required: ["decision", "reason_summary", "code", "message"]
    }
  ]
} as const;

const proposedActionSchema = z.object({
  type: z.enum(["click", "type", "select", "extract", "assert", "wait"]),
  intent: z.string().min(1),
  target: z.object({
    description: z.string().min(1),
    semantic: z.record(z.unknown()).optional(),
    visual: z.record(z.unknown()).optional(),
    structure: z.record(z.unknown()).optional()
  }).optional(),
  value: z.unknown().optional(),
  output_key: z.string().optional()
});

const agentDecisionSchema = z.discriminatedUnion("decision", [
  z.object({ decision: z.literal("act"), reason_summary: z.string().min(1), action: proposedActionSchema }),
  z.object({ decision: z.literal("finish"), reason_summary: z.string().min(1), outputs: z.record(z.unknown()) }),
  z.object({ decision: z.literal("escalate"), reason_summary: z.string().min(1), code: z.string().min(1), message: z.string().min(1) })
]);

export function parseAgentDecision(value: unknown): AgentDecision {
  return agentDecisionSchema.parse(value);
}
```

- [ ] **Step 5: Run tests and typecheck**

Run:

```bash
npm test -- tests/discovery/action-schema.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/llm/types.ts src/llm/action-schema.ts tests/discovery/action-schema.test.ts
git commit -m "feat: add LLM action schema"
```

---

### Task 2: Prompt Builder With Explicit Input And Output Contract

**Files:**
- Create: `src/llm/prompt.ts`
- Test: `tests/discovery/prompt.test.ts`

**Interfaces:**
- Produces: `buildDiscoveryPrompt(input): string`
- Consumes: `Observation`

- [ ] **Step 1: Write the failing prompt tests**

Create `tests/discovery/prompt.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { buildDiscoveryPrompt } from "../../src/llm/prompt.js";

const observation = {
  state: { surface_kind: "browser", url: "http://localhost:3000", title: "Dashboard", recent_actions: [] },
  visual: { screenshot_path: "evidence/shot.png", send_to_llm: false, viewport: { width: 1280, height: 720 }, visible_text_blocks: ["Dashboard", "Member Search"] },
  accessibility: { controls: [{ role: "link", name: "Member Search", enabled: true }] },
  structure: { tables: [], forms: [], regions: [] },
  policy: { blocked_intents: ["submit_final_application"] }
};

describe("discovery prompt", () => {
  it("includes the goal, visible controls, and JSON-only instruction", () => {
    const prompt = buildDiscoveryPrompt({ goal: "Find member 24816", observation, params: { member_id: "24816" }, recentActions: [] });
    expect(prompt).toContain("Find member 24816");
    expect(prompt).toContain("Member Search");
    expect(prompt).toContain("Return exactly one JSON object");
  });

  it("explains the observation layers and how to use them", () => {
    const prompt = buildDiscoveryPrompt({ goal: "Find member 24816", observation, params: { member_id: "24816" }, recentActions: [] });
    expect(prompt).toContain("Controls are accessibility-derived");
    expect(prompt).toContain("Prefer semantic targets");
    expect(prompt).toContain("Use Structure for tables, forms, regions");
  });

  it("references the configured response schema instead of duplicating it", () => {
    const prompt = buildDiscoveryPrompt({ goal: "Find member 24816", observation, params: { member_id: "24816" }, recentActions: [] });
    expect(prompt).toContain("configured response schema");
    expect(prompt).not.toContain("\"decision\":\"act\"");
  });

  it("does not include local screenshot path when screenshot upload is disabled", () => {
    const prompt = buildDiscoveryPrompt({ goal: "Find member 24816", observation, params: { member_id: "24816" }, recentActions: [] });
    expect(prompt).not.toContain("evidence/shot.png");
  });

  it("includes the screenshot path only when screenshot upload is enabled for the observation", () => {
    const prompt = buildDiscoveryPrompt({
      goal: "Find member 24816",
      observation: { ...observation, visual: { ...observation.visual, send_to_llm: true } },
      params: { member_id: "24816" },
      recentActions: []
    });
    expect(prompt).toContain("evidence/shot.png");
  });
});
```

- [ ] **Step 2: Run the prompt tests to verify they fail**

Run:

```bash
npm test -- tests/discovery/prompt.test.ts
```

Expected: FAIL because `prompt.ts` does not exist.

- [ ] **Step 3: Implement the prompt builder**

Create `src/llm/prompt.ts`:

```typescript
import type { Observation } from "../surface/types.js";
import { redactParams } from "../shared/params.js";

export function buildDiscoveryPrompt(input: {
  goal: string;
  observation: Observation;
  params: Record<string, unknown>;
  recentActions: string[];
}): string {
  const visual = input.observation.visual.send_to_llm
    ? input.observation.visual
    : { ...input.observation.visual, screenshot_path: "[local-only]" };
  return [
    "You are driving a back-office computer surface one safe action at a time.",
    "Return exactly one JSON object. Do not return markdown, prose, selectors, or Playwright code.",
    "",
    "Input fields:",
    "- Goal is the workflow objective to complete.",
    "- Params are user/workflow inputs. They may be redacted and should not be treated as page state unless the observation confirms them.",
    "- Recent actions are already attempted intents. Use them to avoid loops and repeated clicks.",
    "- State is the current browser/page state such as URL, title, and surface kind.",
    "- Visual contains visible text and viewport details. screenshot_path identifies the screenshot that may be attached as image input when send_to_llm is true.",
    "- Controls are accessibility-derived interactive elements such as links, buttons, tabs, inputs, and selects.",
    "- Structure describes tables, forms, regions, rows, and field context.",
    "- Policy describes blocked or restricted intents. Never propose blocked work.",
    "",
    "Decision rules:",
    "- Choose exactly one next decision: act, finish, or escalate.",
    "- Use act for one safe next UI operation only.",
    "- Use finish only when the goal is complete and required outputs are visible or extracted.",
    "- Use escalate when the target is ambiguous, missing, unsafe, policy-blocked, or requires human judgment.",
    "- Never submit, approve, price, disburse, or finalize a loan.",
    "- Prefer semantic targets from Controls: role, name, label, accessible state.",
    "- Use Visual for visible text, nearby text, and region hints.",
    "- Use Structure for tables, forms, regions, rows, columns, and relative position.",
    "- Do not invent CSS selectors, XPath selectors, raw coordinates, or Playwright locators.",
    "",
    "Response shape:",
    "- Return one JSON object matching the configured response schema.",
    "- The schema defines the exact fields for act, finish, and escalate decisions.",
    "- Use reason_summary for audit context only; it is not executable.",
    "",
    `Goal: ${input.goal}`,
    `Params: ${JSON.stringify(redactParams(input.params))}`,
    `Recent actions: ${JSON.stringify(input.recentActions)}`,
    `State: ${JSON.stringify(input.observation.state)}`,
    `Visual: ${JSON.stringify(visual)}`,
    `Controls: ${JSON.stringify(input.observation.accessibility.controls)}`,
    `Structure: ${JSON.stringify(input.observation.structure)}`,
    `Policy: ${JSON.stringify(input.observation.policy)}`,
    "Allowed decisions: act, finish, escalate.",
    "Allowed action types: click, type, select, extract, assert, wait."
  ].join("\n");
}
```

- [ ] **Step 4: Run tests and typecheck**

Run:

```bash
npm test -- tests/discovery/prompt.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/llm/prompt.ts tests/discovery/prompt.test.ts
git commit -m "feat: add discovery prompt builder"
```

---

### Task 3: Mock LLM Client

**Files:**
- Create: `src/llm/mock.ts`
- Test: `tests/discovery/mock-llm.test.ts`

**Interfaces:**
- Produces: `MockLLMClient implements LLMClient`
- Consumes: `LLMClient`, `AgentDecision`

- [ ] **Step 1: Write the failing mock LLM tests**

Create `tests/discovery/mock-llm.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { MockLLMClient } from "../../src/llm/mock.js";

describe("MockLLMClient", () => {
  it("returns scripted decisions in order", async () => {
    const client = new MockLLMClient([
      { decision: "act", reason_summary: "Click search", action: { type: "click", intent: "open_member_search", target: { description: "Member Search", semantic: { role: "link", name: "Member Search" } } } },
      { decision: "finish", reason_summary: "Done", outputs: { review_status: "ready_for_final_review" } }
    ]);

    expect((await client.decide({ goal: "g", observation: {} as never, params: {}, recentActions: [] })).decision).toBe("act");
    expect((await client.decide({ goal: "g", observation: {} as never, params: {}, recentActions: [] })).decision).toBe("finish");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
npm test -- tests/discovery/mock-llm.test.ts
```

Expected: FAIL because `MockLLMClient` does not exist.

- [ ] **Step 3: Implement MockLLMClient**

Create `src/llm/mock.ts`:

```typescript
import type { AgentDecision, LLMClient } from "./types.js";

export class MockLLMClient implements LLMClient {
  private index = 0;

  constructor(private readonly decisions: AgentDecision[]) {}

  async decide(): Promise<AgentDecision> {
    const decision = this.decisions[this.index];
    if (!decision) {
      return { decision: "escalate", reason_summary: "Mock LLM script exhausted.", code: "mock_script_exhausted", message: "No mock decision was available." };
    }
    this.index += 1;
    return decision;
  }
}
```

- [ ] **Step 4: Run tests and typecheck**

Run:

```bash
npm test -- tests/discovery/mock-llm.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/llm/mock.ts tests/discovery/mock-llm.test.ts
git commit -m "feat: add mock LLM client"
```

---

### Task 4: Gemini REST Client

**Files:**
- Create: `src/llm/gemini.ts`
- Test: `tests/discovery/gemini.test.ts`

**Interfaces:**
- Produces: `GeminiClient implements LLMClient`
- Consumes: `buildDiscoveryPrompt`, `parseAgentDecision`

- [ ] **Step 1: Write the failing Gemini client test**

Create `tests/discovery/gemini.test.ts`:

```typescript
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import { geminiAgentDecisionResponseSchema } from "../../src/llm/action-schema.js";
import { GeminiClient } from "../../src/llm/gemini.js";

describe("GeminiClient", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts prompt text and parses JSON decision from Gemini response", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      candidates: [
        {
          content: {
            parts: [
              { text: JSON.stringify({ decision: "finish", reason_summary: "Done", outputs: { review_status: "ready_for_final_review" } }) }
            ]
          }
        }
      ]
    })));
    vi.stubGlobal("fetch", fetchMock);

    const client = new GeminiClient({ apiKey: "key", model: "gemini-2.5-pro" });
    const result = await client.decide({ goal: "g", observation: {} as never, params: {}, recentActions: [] });

    expect(result.decision).toBe("finish");
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("gemini-2.5-pro"), expect.objectContaining({ method: "POST" }));
    const body = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string);
    expect(body.generationConfig).toMatchObject({
      responseMimeType: "application/json",
      responseSchema: geminiAgentDecisionResponseSchema
    });
  });

  it("attaches screenshot bytes when the observation opts into image input", async () => {
    const dir = join(tmpdir(), "gemini-screenshot-test");
    await mkdir(dir, { recursive: true });
    const screenshotPath = join(dir, "shot.png");
    await writeFile(screenshotPath, Buffer.from("fakepng"));
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: JSON.stringify({ decision: "finish", reason_summary: "Done", outputs: {} }) }] } }]
    })));
    vi.stubGlobal("fetch", fetchMock);

    const client = new GeminiClient({ apiKey: "key", model: "gemini-2.5-pro", sendScreenshots: true });
    await client.decide({
      goal: "g",
      observation: {
        state: { surface_kind: "browser", url: "http://localhost:3000", title: "Dashboard", recent_actions: [] },
        visual: { screenshot_path: screenshotPath, send_to_llm: true, viewport: { width: 1, height: 1 }, visible_text_blocks: [] },
        accessibility: { controls: [] },
        structure: { tables: [], forms: [], regions: [] },
        policy: {}
      },
      params: {},
      recentActions: []
    });

    const body = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string);
    expect(body.contents[0].parts).toContainEqual({ inlineData: { mimeType: "image/png", data: Buffer.from("fakepng").toString("base64") } });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
npm test -- tests/discovery/gemini.test.ts
```

Expected: FAIL because `GeminiClient` does not exist.

- [ ] **Step 3: Implement GeminiClient**

Create `src/llm/gemini.ts`:

```typescript
import { readFile } from "node:fs/promises";
import { buildDiscoveryPrompt } from "./prompt.js";
import { geminiAgentDecisionResponseSchema, parseAgentDecision } from "./action-schema.js";
import type { LLMClient } from "./types.js";

export class GeminiClient implements LLMClient {
  constructor(private readonly config: { apiKey: string; model: string; sendScreenshots?: boolean }) {}

  async decide(input: Parameters<LLMClient["decide"]>[0]): ReturnType<LLMClient["decide"]> {
    const prompt = buildDiscoveryPrompt(input);
    const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [{ text: prompt }];
    if (this.config.sendScreenshots && input.observation.visual.send_to_llm) {
      const image = await readFile(input.observation.visual.screenshot_path);
      parts.push({ inlineData: { mimeType: "image/png", data: image.toString("base64") } });
    }
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.config.model}:generateContent?key=${this.config.apiKey}`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: geminiAgentDecisionResponseSchema
        }
      })
    });
    if (!response.ok) throw new Error(`Gemini request failed: ${response.status}`);
    const json = await response.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error("Gemini response did not include text.");
    return parseAgentDecision(JSON.parse(text));
  }
}
```

- [ ] **Step 4: Run tests and typecheck**

Run:

```bash
npm test -- tests/discovery/gemini.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/llm/gemini.ts tests/discovery/gemini.test.ts
git commit -m "feat: add Gemini discovery client"
```

---

### Task 5: Capability Definition And Artifact Recorder

**Files:**
- Create: `src/capabilities/auto-loan-offer-review.ts`
- Create: `src/artifacts/recorder.ts`
- Test: `tests/discovery/artifact-recorder.test.ts`

**Interfaces:**
- Produces: `autoLoanOfferReviewCapability`, `recordCapabilityArtifact(input): CapabilityArtifact`
- Consumes: `AgentDecision`, `CapabilityArtifact`

- [ ] **Step 1: Write the failing recorder test**

Create `tests/discovery/artifact-recorder.test.ts`:

```typescript
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
          action: { type: "click", target: { description: "Member Search link", semantic: { role: "link", name: "Member Search" } } },
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
npm test -- tests/discovery/artifact-recorder.test.ts
```

Expected: FAIL because `recorder.ts` and the capability definition do not exist.

- [ ] **Step 3: Implement the capability definition**

Create `src/capabilities/auto-loan-offer-review.ts`:

```typescript
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
      member_name: { type: "string", sensitivity: "pii" },
      offer_id: { type: "string", sensitivity: "internal" },
      apr: { type: "string", sensitivity: "low" },
      max_amount: { type: "currency", sensitivity: "financial" },
      term_months: { type: "number", sensitivity: "low" },
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
    { code: "ambiguous_member_match", status: "needs_human", detect: { type: "multiple_rows_match", table: "member_results", match: "{{member_id}}" }, message: "Multiple member records matched." }
  ],
  handoff: { mode: "same_session_cli", resume_checkpoint: "member_profile_visible" },
  compatibility: { app_family: "loan_servicing_portal", base_variant: "default", tested_variants: ["default"], required_features: ["member_search", "member_profile", "offers_tab", "auto_loan_offer_review"] },
  variant_overlays: {}
};
```

- [ ] **Step 4: Implement the recorder**

Create `src/artifacts/recorder.ts`:

```typescript
import type { CapabilityArtifact } from "./schema.js";
import type { CapabilityDefinition } from "../capabilities/auto-loan-offer-review.js";
import type { ProposedAction } from "../llm/types.js";

type RecordedStep = {
  id: string;
  phase: string;
  intent: string;
  risk: "safe" | "approval_required" | "blocked";
  action: ProposedAction;
  checkpoint?: { type: string; value: unknown };
};

export function recordCapabilityArtifact(input: {
  capability: CapabilityDefinition;
  goal: string;
  params: Record<string, unknown>;
  steps: RecordedStep[];
  outputs: Record<string, unknown>;
}): CapabilityArtifact {
  return {
    schema_version: "1.0",
    capability: input.capability.capability,
    surface: input.capability.surface,
    contract: input.capability.contract,
    safety: input.capability.safety,
    phases: input.capability.phases,
    steps: input.steps.map((step) => ({
      id: step.id,
      phase: step.phase,
      intent: step.intent,
      risk: step.risk,
      action: {
        type: step.action.type,
        value: step.action.value,
        output_key: step.action.output_key,
        target: step.action.target ? {
          id: step.id,
          description: step.action.target.description,
          fingerprint: {
            semantic: step.action.target.semantic,
            visual: step.action.target.visual,
            structure: step.action.target.structure
          },
          confidence: { minimum: 0.85, signals: ["role_name_match", "visible_text_match", "unique_match"] }
        } : undefined
      },
      checkpoint: step.checkpoint
    })),
    known_outcomes: input.capability.known_outcomes,
    handoff: input.capability.handoff,
    compatibility: input.capability.compatibility,
    variant_overlays: input.capability.variant_overlays,
    evidence: { source_goal: input.goal }
  };
}
```

- [ ] **Step 5: Run tests and typecheck**

Run:

```bash
npm test -- tests/discovery/artifact-recorder.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/capabilities/auto-loan-offer-review.ts src/artifacts/recorder.ts tests/discovery/artifact-recorder.test.ts
git commit -m "feat: add artifact recorder"
```

---

### Task 6: ComputerUseAgent Discovery Loop

**Files:**
- Create: `src/agent/discovery-agent.ts`
- Test: `tests/discovery/discovery-agent.test.ts`

**Interfaces:**
- Produces: `runDiscovery(options): Promise<DiscoveryResult>`
- Consumes: `LLMClient`, `SurfaceAdapter`, `SafetyPolicy`, `EvidenceLogger`, `recordCapabilityArtifact`, `CapabilityDefinition`

- [ ] **Step 1: Write the failing discovery agent test with fake dependencies**

Create `tests/discovery/discovery-agent.test.ts`:

```typescript
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runDiscovery } from "../../src/agent/discovery-agent.js";
import { autoLoanOfferReviewCapability } from "../../src/capabilities/auto-loan-offer-review.js";
import { MockLLMClient } from "../../src/llm/mock.js";
import { createDefaultSafetyPolicy } from "../../src/safety/policy.js";
import type { SurfaceAdapter, Observation, ResolvedAction, ActionResult, EvidenceRef, ObservationContext } from "../../src/surface/types.js";

class FakeSurface implements SurfaceAdapter {
  actions: ResolvedAction[] = [];
  async open(): Promise<void> {}
  async observe(_context: ObservationContext): Promise<Observation> {
    return {
      state: { surface_kind: "browser", url: "http://localhost:3000", title: "Dashboard", recent_actions: [] },
      visual: { screenshot_path: "shot.png", send_to_llm: false, viewport: { width: 1, height: 1 }, visible_text_blocks: ["Dashboard", "Member Search"] },
      accessibility: { controls: [{ role: "link", name: "Member Search", enabled: true }] },
      structure: { tables: [], forms: [], regions: [] },
      policy: {}
    };
  }
  async act(action: ResolvedAction): Promise<ActionResult> { this.actions.push(action); return { ok: true }; }
  async captureEvidence(label: string): Promise<EvidenceRef> { return { path: `${label}.png`, kind: "screenshot" }; }
}

describe("runDiscovery", () => {
  it("executes bounded LLM actions and emits a draft artifact", async () => {
    const dir = await mkdtemp(join(tmpdir(), "discovery-"));
    try {
      const surface = new FakeSurface();
      const result = await runDiscovery({
        goal: "Find member 24816",
        target: "http://localhost:3000",
        params: { member_id: "24816", vehicle_type: "used" },
        capability: autoLoanOfferReviewCapability,
        llm: new MockLLMClient([
          { decision: "act", reason_summary: "Open search", action: { type: "click", intent: "open_member_search", target: { description: "Member Search link", semantic: { role: "link", name: "Member Search" } } } },
          { decision: "finish", reason_summary: "Done", outputs: { review_status: "ready_for_final_review" } }
        ]),
        surface,
        policy: createDefaultSafetyPolicy("demo"),
        evidenceRoot: dir,
        runId: "run_discovery",
        maxSteps: 5
      });
      expect(result.status).toBe("success");
      expect(result.artifact.capability.status).toBe("draft");
      expect(surface.actions).toHaveLength(1);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
```

- [ ] **Step 2: Run the discovery agent test to verify it fails**

Run:

```bash
npm test -- tests/discovery/discovery-agent.test.ts
```

Expected: FAIL because `runDiscovery` does not exist.

- [ ] **Step 3: Implement discovery loop**

Create `src/agent/discovery-agent.ts`:

```typescript
import { createEvidenceLogger } from "../evidence/logger.js";
import type { CapabilityArtifact } from "../artifacts/schema.js";
import { recordCapabilityArtifact } from "../artifacts/recorder.js";
import type { CapabilityDefinition } from "../capabilities/auto-loan-offer-review.js";
import type { LLMClient, ProposedAction } from "../llm/types.js";
import type { SafetyPolicy } from "../safety/policy.js";
import type { SurfaceAdapter, ResolvedAction } from "../surface/types.js";
import { resolveTarget } from "../replay/target-resolver.js";

type DiscoveryOptions = {
  goal: string;
  target: string;
  params: Record<string, unknown>;
  capability: CapabilityDefinition;
  llm: LLMClient;
  surface: SurfaceAdapter;
  policy: SafetyPolicy;
  evidenceRoot: string;
  runId: string;
  maxSteps: number;
};

export type DiscoveryResult =
  | { status: "success"; artifact: CapabilityArtifact }
  | { status: "needs_human" | "failure" | "blocked"; code: string; message: string };

function toResolvedAction(action: ProposedAction, locator: string): ResolvedAction {
  if (action.type === "click") return { type: "click", locator };
  if (action.type === "type") return { type: "type", locator, value: String(action.value ?? "") };
  if (action.type === "select") return { type: "select", locator, value: String(action.value ?? "") };
  if (action.type === "extract") return { type: "extract", locator, output_key: action.output_key ?? "value" };
  if (action.type === "assert") return { type: "assert", text: String(action.value ?? "") };
  if (action.type === "wait") return { type: "wait", ms: Number(action.value ?? 500) };
  return { type: "wait", ms: 0 };
}

export async function runDiscovery(options: DiscoveryOptions): Promise<DiscoveryResult> {
  const logger = await createEvidenceLogger(options.evidenceRoot, options.runId);
  await options.surface.open(options.target);
  const recentActions: string[] = [];
  const recordedSteps: Array<{ id: string; phase: string; intent: string; risk: "safe"; action: ProposedAction; checkpoint?: { type: string; value: unknown } }> = [];

  for (let stepIndex = 0; stepIndex < options.maxSteps; stepIndex += 1) {
    const observation = await options.surface.observe({ recent_actions: recentActions });
    const decision = await options.llm.decide({ goal: options.goal, observation, params: options.params, recentActions });
    await logger.event({ event: "llm_decision", actor: "gemini", status: "ok", step_id: `discovery_${stepIndex}`, reason_summary: decision.reason_summary, params: options.params });

    if (decision.decision === "finish") {
      const artifact = recordCapabilityArtifact({ capability: options.capability, goal: options.goal, params: options.params, steps: recordedSteps, outputs: decision.outputs });
      return { status: "success", artifact };
    }
    if (decision.decision === "escalate") {
      return { status: "needs_human", code: decision.code, message: decision.message };
    }

    const safety = options.policy.evaluate({ origin: new URL(observation.state.url).origin, actionType: decision.action.type, intent: decision.action.intent, risk: "safe" });
    if (safety.decision === "blocked") return { status: "blocked", code: safety.code, message: safety.message };
    if (safety.decision === "needs_human") return { status: "needs_human", code: safety.code, message: safety.message };

    if (!decision.action.target) return { status: "failure", code: "missing_target", message: "LLM action did not include a target." };
    const resolution = resolveTarget({
      id: decision.action.intent,
      description: decision.action.target.description,
      fingerprint: {
        semantic: decision.action.target.semantic,
        visual: decision.action.target.visual,
        structure: decision.action.target.structure
      },
      confidence: { minimum: 0.85, signals: ["role_name_match", "visible_text_match", "unique_match"] }
    }, observation);
    if (resolution.status !== "resolved") return { status: resolution.status === "ambiguous" ? "needs_human" : "failure", code: resolution.code, message: resolution.message };

    await options.surface.act(toResolvedAction(decision.action, resolution.locator));
    const stepId = decision.action.intent;
    recentActions.push(stepId);
    recordedSteps.push({ id: stepId, phase: "discovery", intent: decision.action.intent, risk: "safe", action: decision.action });
  }

  return { status: "failure", code: "max_steps_exceeded", message: "Discovery exceeded max_steps." };
}
```

- [ ] **Step 4: Run tests and typecheck**

Run:

```bash
npm test -- tests/discovery/discovery-agent.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/agent/discovery-agent.ts tests/discovery/discovery-agent.test.ts
git commit -m "feat: add discovery agent loop"
```

---

### Task 7: Discovery CLI

**Files:**
- Create: `src/cli/discover.ts`
- Test: `tests/discovery/discover-cli.test.ts`

**Interfaces:**
- Produces CLI: `npm run discover -- --goal <goal> --target <url> --params <path> --out <dir>`
- Consumes: `runDiscovery`, `MockLLMClient`, `GeminiClient`, `BrowserSurfaceAdapter`, `autoLoanOfferReviewCapability`

- [ ] **Step 1: Write failing CLI parser test**

Create `tests/discovery/discover-cli.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { parseDiscoverArgs } from "../../src/cli/discover.js";

describe("discover CLI args", () => {
  it("parses goal, target, params, out, and llm flags", () => {
    expect(parseDiscoverArgs([
      "--goal", "Find member 24816",
      "--target", "http://localhost:3000",
      "--params", "examples/params/happy-path.json",
      "--out", "evidence/discovery-success",
      "--llm", "mock"
    ])).toEqual({
      goal: "Find member 24816",
      target: "http://localhost:3000",
      paramsPath: "examples/params/happy-path.json",
      outDir: "evidence/discovery-success",
      llmMode: "mock"
    });
  });
});
```

- [ ] **Step 2: Run the CLI test to verify it fails**

Run:

```bash
npm test -- tests/discovery/discover-cli.test.ts
```

Expected: FAIL because `discover.ts` does not exist.

- [ ] **Step 3: Implement discovery CLI parsing and LLM selection**

Create `src/cli/discover.ts`:

```typescript
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import "dotenv/config";
import { chromium } from "playwright";
import { runDiscovery } from "../agent/discovery-agent.js";
import { autoLoanOfferReviewCapability } from "../capabilities/auto-loan-offer-review.js";
import { GeminiClient } from "../llm/gemini.js";
import { MockLLMClient } from "../llm/mock.js";
import type { AgentDecision, LLMClient } from "../llm/types.js";
import { createDefaultSafetyPolicy } from "../safety/policy.js";
import { BrowserSurfaceAdapter } from "../surface/browser.js";

export type DiscoverCliArgs = {
  goal: string;
  target: string;
  paramsPath: string;
  outDir: string;
  llmMode: "gemini" | "mock";
};

export function parseDiscoverArgs(argv: string[]): DiscoverCliArgs {
  const value = (flag: string) => {
    const index = argv.indexOf(flag);
    return index >= 0 ? argv[index + 1] : undefined;
  };
  const goal = value("--goal");
  const target = value("--target");
  const paramsPath = value("--params");
  const outDir = value("--out");
  const llmMode = (value("--llm") ?? process.env.LLM_MODE ?? "gemini") as "gemini" | "mock";
  if (!goal || !target || !paramsPath || !outDir) throw new Error("Required flags: --goal, --target, --params, --out");
  return { goal, target, paramsPath, outDir, llmMode };
}

function createHappyPathMockDecisions(): AgentDecision[] {
  return [
    { decision: "act", reason_summary: "Open Member Search.", action: { type: "click", intent: "open_member_search", target: { description: "Member Search link", semantic: { role: "link", name: "Member Search" } } } },
    { decision: "finish", reason_summary: "Mock discovery reached final review.", outputs: { review_status: "ready_for_final_review" } }
  ];
}

function createLlm(mode: "gemini" | "mock"): LLMClient {
  if (mode === "mock") return new MockLLMClient(createHappyPathMockDecisions());
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is required for --llm gemini.");
  return new GeminiClient({
    apiKey,
    model: process.env.DISCOVERY_MODEL ?? "gemini-2.5-pro",
    sendScreenshots: process.env.SEND_SCREENSHOTS_TO_LLM === "true"
  });
}

async function main(): Promise<void> {
  const args = parseDiscoverArgs(process.argv.slice(2));
  const params = JSON.parse(await readFile(args.paramsPath, "utf8")) as Record<string, unknown>;
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const surface = new BrowserSurfaceAdapter(page, join(args.outDir, "screenshots"));
  const result = await runDiscovery({
    goal: args.goal,
    target: args.target,
    params,
    capability: autoLoanOfferReviewCapability,
    llm: createLlm(args.llmMode),
    surface,
    policy: createDefaultSafetyPolicy("demo"),
    evidenceRoot: args.outDir,
    runId: "discovery",
    maxSteps: 25
  });
  await mkdir("evidence", { recursive: true });
  if (result.status === "success") {
    await writeFile("evidence/prepared-auto-loan-offer-review.v1.json", `${JSON.stringify(result.artifact, null, 2)}\n`);
  }
  console.log(JSON.stringify(result, null, 2));
  await browser.close();
  if (result.status !== "success") process.exitCode = 1;
}

if (process.argv[1]?.endsWith("discover.ts")) {
  void main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
```

- [ ] **Step 4: Run tests and typecheck**

Run:

```bash
npm test -- tests/discovery/discover-cli.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/cli/discover.ts tests/discovery/discover-cli.test.ts
git commit -m "feat: add discovery CLI"
```

---

## Plan 3 Verification

Run:

```bash
npm run typecheck
npm test -- tests/discovery
npm run discover -- --llm mock --goal "Find member 24816, open their pre-approved auto loan offer, and advance it to the final review screen." --target http://localhost:3000 --params examples/params/happy-path.json --out evidence/mock-discovery
```

Expected:

```text
typecheck passes
discovery tests pass
mock discovery exits with status=success
evidence/prepared-auto-loan-offer-review.v1.json is written
no Gemini API key is required for mock mode
```

Manual real-Gemini evidence command:

```bash
LLM_MODE=gemini GEMINI_API_KEY=<redacted> SEND_SCREENSHOTS_TO_LLM=true npm run discover -- \
  --goal "Find member 24816, open their pre-approved auto loan offer, and advance it to the final review screen." \
  --target http://localhost:3000 \
  --params examples/params/happy-path.json \
  --out evidence/discovery-success
```

Expected:

```text
Gemini returns structured actions using structured observations plus screenshot image input
the live browser is driven one action at a time
artifact is written as draft
screenshots are attached to Gemini only because SEND_SCREENSHOTS_TO_LLM=true
```
