import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createEvidenceLogger } from "../../src/evidence/logger.js";

describe("evidence logger", () => {
  it("writes redacted JSONL events and result JSON", async () => {
    const dir = await mkdtemp(join(tmpdir(), "evidence-"));
    try {
      const logger = await createEvidenceLogger(dir, "run_001");
      await logger.event({
        phase: "find_member",
        step_id: "enter_member_id",
        event: "action_executed",
        actor: "replay",
        intent: "search_member",
        action_type: "type",
        target_id: "member_id_field",
        risk: "safe",
        status: "ok",
        params: { member_id: "24816", token: "secret" }
      });
      await logger.result({ status: "success", capability_id: "cap", run_id: "run_001", message: "ok", evidence: {} });

      const log = await readFile(join(dir, "run_001", "run-log.jsonl"), "utf8");
      expect(log).toContain("****16");
      expect(log).not.toContain("24816");
      expect(log).not.toContain("secret");

      const result = await readFile(join(dir, "run_001", "result.json"), "utf8");
      expect(JSON.parse(result).status).toBe("success");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
