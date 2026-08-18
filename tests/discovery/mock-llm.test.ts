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
