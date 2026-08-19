import type { Observation } from "../surface/types.js";

export type LLMMetadata = {
  provider: "mock" | "gemini" | "anthropic";
  model: string;
  sendsScreenshots: boolean;
};

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
  readonly metadata: LLMMetadata;
  decide(input: {
    goal: string;
    observation: Observation;
    params: Record<string, unknown>;
    recentActions: string[];
    requiredOutputs?: string[];
  }): Promise<AgentDecision>;
};
