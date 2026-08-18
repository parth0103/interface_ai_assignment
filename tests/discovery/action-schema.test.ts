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
