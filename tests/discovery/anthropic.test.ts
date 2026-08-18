import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AnthropicClient } from "../../src/llm/anthropic.js";

const observation = {
  state: { surface_kind: "browser" as const, url: "http://localhost:3000", title: "Dashboard", recent_actions: [] },
  visual: { screenshot_path: "local.png", send_to_llm: false, viewport: { width: 1, height: 1 }, visible_text_blocks: [] },
  accessibility: { controls: [] },
  structure: { tables: [], forms: [], regions: [] },
  policy: {}
};

describe("AnthropicClient", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts prompt text and parses JSON decision from Claude response", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      content: [
        { type: "text", text: JSON.stringify({ decision: "finish", reason_summary: "Done", outputs: { review_status: "ready_for_final_review" } }) }
      ]
    })));
    vi.stubGlobal("fetch", fetchMock);

    const client = new AnthropicClient({ apiKey: "key", model: "claude-sonnet-5" });
    const result = await client.decide({ goal: "g", observation, params: {}, recentActions: [] });

    expect(result.decision).toBe("finish");
    expect(fetchMock).toHaveBeenCalledWith("https://api.anthropic.com/v1/messages", expect.objectContaining({ method: "POST" }));
    const firstCall = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const headers = firstCall[1].headers as Record<string, string>;
    const body = JSON.parse(firstCall[1].body as string);
    expect(headers["x-api-key"]).toBe("key");
    expect(headers["anthropic-version"]).toBe("2023-06-01");
    expect(body).toMatchObject({ model: "claude-sonnet-5", max_tokens: 2048 });
    expect(body.messages[0].content[0]).toMatchObject({ type: "text" });
  });

  it("includes the full decision contract because Anthropic has no response schema field", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      content: [{ type: "text", text: JSON.stringify({ decision: "finish", reason_summary: "Done", outputs: {} }) }]
    })));
    vi.stubGlobal("fetch", fetchMock);

    const client = new AnthropicClient({ apiKey: "key", model: "claude-sonnet-5" });
    await client.decide({ goal: "g", observation, params: {}, recentActions: [] });

    const firstCall = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(firstCall[1].body as string);
    const text = body.messages[0].content[0].text as string;
    expect(text).toContain("\"decision\":\"act\"");
    expect(text).toContain("\"intent\":\"open_member_search\"");
    expect(text).toContain("\"target\":{\"description\":\"Member Search link\"");
    expect(text).toContain("\"decision\":\"finish\"");
    expect(text).toContain("\"decision\":\"escalate\"");
  });

  it("explains schema validation errors with raw Claude JSON keys", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      content: [{ type: "text", text: JSON.stringify({ decision: "act", reason_summary: "Click", action: { type: "click", target: { semantic: { role: "link", name: "Member Search" } } } }) }]
    })));
    vi.stubGlobal("fetch", fetchMock);

    const client = new AnthropicClient({ apiKey: "key", model: "claude-sonnet-5" });
    await expect(client.decide({ goal: "g", observation, params: {}, recentActions: [] }))
      .rejects.toThrow(/Claude returned invalid decision JSON.*intent.*description/s);
  });

  it("attaches screenshot bytes as Claude image input when enabled", async () => {
    const dir = join(tmpdir(), "anthropic-screenshot-test");
    await mkdir(dir, { recursive: true });
    const screenshotPath = join(dir, "shot.png");
    await writeFile(screenshotPath, Buffer.from("fakepng"));
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      content: [{ type: "text", text: JSON.stringify({ decision: "finish", reason_summary: "Done", outputs: {} }) }]
    })));
    vi.stubGlobal("fetch", fetchMock);

    const client = new AnthropicClient({ apiKey: "key", model: "claude-sonnet-5", sendScreenshots: true });
    await client.decide({
      goal: "g",
      observation: { ...observation, visual: { ...observation.visual, screenshot_path: screenshotPath, send_to_llm: true } },
      params: {},
      recentActions: []
    });

    const firstCall = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(firstCall[1].body as string);
    expect(body.messages[0].content).toContainEqual({
      type: "image",
      source: { type: "base64", media_type: "image/png", data: Buffer.from("fakepng").toString("base64") }
    });
  });
});
