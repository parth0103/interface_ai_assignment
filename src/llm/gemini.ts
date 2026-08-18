import { readFile } from "node:fs/promises";
import { geminiAgentDecisionResponseSchema, parseAgentDecision } from "./action-schema.js";
import { buildDiscoveryPrompt } from "./prompt.js";
import type { LLMClient } from "./types.js";

type GeminiPart = { text: string } | { inlineData: { mimeType: string; data: string } };

export class GeminiClient implements LLMClient {
  constructor(private readonly config: { apiKey: string; model: string; sendScreenshots?: boolean }) {}

  async decide(input: Parameters<LLMClient["decide"]>[0]): ReturnType<LLMClient["decide"]> {
    const prompt = buildDiscoveryPrompt(input);
    const parts: GeminiPart[] = [{ text: prompt }];
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
