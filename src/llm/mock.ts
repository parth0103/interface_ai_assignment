import type { AgentDecision, LLMClient, LLMMetadata } from "./types.js";

export class MockLLMClient implements LLMClient {
  private index = 0;
  readonly metadata: LLMMetadata;

  constructor(private readonly decisions: AgentDecision[], metadata: Partial<LLMMetadata> = {}) {
    this.metadata = {
      provider: "mock",
      model: "scripted-mock",
      sendsScreenshots: false,
      ...metadata
    };
  }

  async decide(_input: Parameters<LLMClient["decide"]>[0]): Promise<AgentDecision> {
    const decision = this.decisions[this.index];
    if (!decision) {
      return {
        decision: "escalate",
        reason_summary: "Mock LLM script exhausted.",
        code: "mock_script_exhausted",
        message: "No mock decision was available."
      };
    }
    this.index += 1;
    return decision;
  }
}
