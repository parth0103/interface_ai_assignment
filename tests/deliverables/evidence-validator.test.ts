import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { validateEvidence } from "../../scripts/validate-evidence.js";

const replayStatuses = {
  "replay-11-success": "success",
  "replay-12-business-outcome": "business_outcome",
  "replay-13-handoff": "needs_human",
  "replay-14-blocked-policy": "blocked"
} as const;

async function writeCompleteEvidence(root: string): Promise<void> {
  await mkdir(join(root, "discovery-claude-real-8", "discovery"), { recursive: true });
  await writeFile(join(root, "discovery-claude-real-8", "artifact.v1.json"), "{}\n");
  await writeFile(join(root, "discovery-claude-real-8", "discovery", "run-log.jsonl"), "{}\n");

  for (const [subdir, status] of Object.entries(replayStatuses)) {
    await mkdir(join(root, subdir, "replay"), { recursive: true });
    await writeFile(join(root, subdir, "replay", "result.json"), `${JSON.stringify({ status })}\n`);
    await writeFile(join(root, subdir, "replay", "run-log.jsonl"), "{}\n");
  }
}

describe("validateEvidence", () => {
  it("reports missing required evidence paths", async () => {
    const dir = await mkdtemp(join(tmpdir(), "evidence-validator-"));

    try {
      expect(await validateEvidence(dir)).toContain("missing discovery-claude-real-8/artifact.v1.json");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("passes when required evidence files are present", async () => {
    const dir = await mkdtemp(join(tmpdir(), "evidence-validator-"));

    try {
      await writeCompleteEvidence(dir);

      expect(await validateEvidence(dir)).toEqual([]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("reports replay result status mismatches", async () => {
    const dir = await mkdtemp(join(tmpdir(), "evidence-validator-"));

    try {
      await writeCompleteEvidence(dir);
      await writeFile(
        join(dir, "replay-14-blocked-policy", "replay", "result.json"),
        `${JSON.stringify({ status: "success" })}\n`
      );

      expect(await validateEvidence(dir)).toContain(
        "replay-14-blocked-policy/replay/result.json status success, expected blocked"
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
