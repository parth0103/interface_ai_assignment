import { readFile } from "node:fs/promises";
import { geminiAgentDecisionResponseSchema, parseAgentDecision } from "./action-schema.js";
import { buildDiscoveryPrompt } from "./prompt.js";
import type { LLMClient } from "./types.js";

type AnthropicContentBlock =
  | { type: "text"; text: string }
  | { type: "image"; source: { type: "base64"; media_type: "image/png"; data: string } };

function parseJsonText(text: string): unknown {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return JSON.parse(fenced?.[1] ?? trimmed);
}

function buildAnthropicPrompt(input: Parameters<LLMClient["decide"]>[0]): string {
  const examples = [
    {
      decision: "act",
      reason_summary: "Open member search.",
      action: {
        type: "click",
        intent: "open_member_search",
        target: { description: "Member Search link", semantic: { role: "link", name: "Member Search" } }
      }
    },
    {
      decision: "act",
      reason_summary: "Enter the member id.",
      action: {
        type: "type",
        intent: "type_member_id",
        target: { description: "Member ID field", semantic: { role: "textbox", name: "Member ID" } },
        value: "{{member_id}}"
      }
    },
    { decision: "finish", reason_summary: "Final review screen is visible.", outputs: { review_status: "Ready for final review" } },
    { decision: "escalate", reason_summary: "The target is ambiguous.", code: "ambiguous_target", message: "Multiple matching members are visible." }
  ];

  return [
    buildDiscoveryPrompt(input),
    "",
    "Anthropic response contract:",
    "The Anthropic Messages API is being called without a native response_schema field, so the full machine contract is repeated here.",
    "Return exactly one JSON object matching this schema. Do not omit required fields.",
    `JSON schema: ${JSON.stringify(geminiAgentDecisionResponseSchema)}`,
    "Valid examples:",
    ...examples.map((example) => JSON.stringify(example)),
    "For every act decision, action.intent is required.",
    "For every act decision with a target, action.target.description is required.",
    "Copy target.semantic role/name/label from Controls when possible.",
    "Do not return selectors, XPath, Playwright locators, raw coordinates, markdown, or prose."
  ].join("\n");
}

function parseClaudeDecision(text: string) {
  let parsed: unknown;
  try {
    parsed = parseJsonText(text);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Claude returned invalid decision JSON: response text was not parseable JSON. ${message}`);
  }

  try {
    return parseAgentDecision(parsed);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Claude returned invalid decision JSON: ${message}. Parsed keys: ${JSON.stringify(parsed)}`);
  }
}

export class AnthropicClient implements LLMClient {
  constructor(private readonly config: { apiKey: string; model: string; sendScreenshots?: boolean; maxTokens?: number }) {}

  async decide(input: Parameters<LLMClient["decide"]>[0]): ReturnType<LLMClient["decide"]> {
    const prompt = buildAnthropicPrompt(input);
    const content: AnthropicContentBlock[] = [{ type: "text", text: prompt }];
    if (this.config.sendScreenshots && input.observation.visual.send_to_llm) {
      const image = await readFile(input.observation.visual.screenshot_path);
      content.push({
        type: "image",
        source: { type: "base64", media_type: "image/png", data: image.toString("base64") }
      });
    }

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": this.config.apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: this.config.model,
        max_tokens: this.config.maxTokens ?? 2048,
        messages: [{ role: "user", content }]
      })
    });
    if (!response.ok) throw new Error(`Anthropic request failed: ${response.status}`);

    const json = await response.json() as { content?: Array<{ type?: string; text?: string }> };
    const text = json.content?.find((part) => part.type === "text" && part.text)?.text;
    if (!text) throw new Error("Anthropic response did not include text.");
    return parseClaudeDecision(text);
  }
}
