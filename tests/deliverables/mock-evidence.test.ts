import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { generateMockEvidence } from "../../scripts/generate-mock-evidence.js";
import { validateEvidence } from "../../scripts/validate-evidence.js";

describe("generateMockEvidence", () => {
  it("creates complete synthetic evidence structure", async () => {
    const dir = await mkdtemp(join(tmpdir(), "mock-evidence-"));

    try {
      await generateMockEvidence(dir);

      expect(await validateEvidence(dir, { requireRealDiscovery: false })).toEqual([]);

      const blocked = JSON.parse(
        await readFile(join(dir, "replay-14-blocked-policy", "replay", "result.json"), "utf8")
      );
      expect(blocked.status).toBe("blocked");
      expect(blocked.code).toBe("policy_violation");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
