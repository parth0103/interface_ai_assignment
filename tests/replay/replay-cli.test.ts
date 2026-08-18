import { describe, expect, it } from "vitest";
import { parseReplayArgs } from "../../src/cli/replay.js";

describe("replay CLI args", () => {
  it("parses artifact, params, out, tenant, and allow-draft flags", () => {
    expect(parseReplayArgs([
      "--artifact", "evidence/artifact.json",
      "--params", "examples/params/happy-path.json",
      "--out", "evidence/replay-success",
      "--tenant", "default",
      "--allow-draft"
    ])).toEqual({
      artifactPath: "evidence/artifact.json",
      paramsPath: "examples/params/happy-path.json",
      outDir: "evidence/replay-success",
      tenantProfile: "default",
      allowDraft: true,
      interactiveHandoff: false
    });
  });
});
