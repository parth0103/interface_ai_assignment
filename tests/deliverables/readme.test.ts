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

    for (const expected of [
      "discovery-claude-real-8",
      "replay-11-success",
      "replay-12-business-outcome",
      "replay-13-handoff",
      "replay-14-blocked-policy"
    ]) {
      expect(readme).toContain(expected);
    }
  });
});
