import { describe, expect, it } from "vitest";
import { parseDiscoverArgs } from "../../src/cli/discover.js";

describe("discover CLI args", () => {
  it("parses goal, target, params, out, and llm flags", () => {
    expect(parseDiscoverArgs([
      "--goal", "Find member 24816",
      "--target", "http://localhost:3000",
      "--params", "examples/params/happy-path.json",
      "--out", "evidence/discovery-success",
      "--llm", "mock"
    ])).toEqual({
      goal: "Find member 24816",
      target: "http://localhost:3000",
      paramsPath: "examples/params/happy-path.json",
      outDir: "evidence/discovery-success",
      llmMode: "mock"
    });
  });
});
