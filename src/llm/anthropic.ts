import { readFile } from "node:fs/promises";
import { parseAgentDecision } from "./action-schema.js";
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

export class AnthropicClient implements LLMClient {
  constructor(private readonly config: { apiKey: string; model: string; sendScreenshots?: boolean; maxTokens?: number }) {}

  async decide(input: Parameters<LLMClient["decide"]>[0]): ReturnType<LLMClient["decide"]> {
    const prompt = buildDiscoveryPrompt(input);
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
    return parseAgentDecision(parseJsonText(text));
  }
}
