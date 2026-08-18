import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
    const result = await client.decide({
      goal: "g",
      observation: {
        state: { surface_kind: "browser", url: "http://localhost:3000", title: "Dashboard", recent_actions: [] },
        visual: { screenshot_path: "local.png", send_to_llm: false, viewport: { width: 1, height: 1 }, visible_text_blocks: [] },
        accessibility: { controls: [] },
        structure: { tables: [], forms: [], regions: [] },
        policy: {}
      },
      params: {},
      recentActions: []
    });

    expect(result.decision).toBe("finish");
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("gemini-2.5-pro"), expect.objectContaining({ method: "POST" }));
    const firstCall = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(firstCall[1].body as string);
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

    const firstCall = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(firstCall[1].body as string);
    expect(body.contents[0].parts).toContainEqual({ inlineData: { mimeType: "image/png", data: Buffer.from("fakepng").toString("base64") } });
  });
});
