import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { RunResult } from "../shared/result.js";
import { redactParams } from "../shared/params.js";

type EvidenceEvent = {
  phase?: string;
  step_id?: string;
  event: string;
  actor: "gemini" | "replay" | "human" | "system";
  intent?: string;
  action_type?: string;
  target_id?: string;
  risk?: string;
  status: string;
  params?: Record<string, unknown>;
  [key: string]: unknown;
};

export type EvidenceLogger = {
  runDir: string;
  event(event: EvidenceEvent): Promise<void>;
  result(result: RunResult): Promise<void>;
  path(name: string): string;
};

export async function createEvidenceLogger(rootDir: string, runId: string): Promise<EvidenceLogger> {
  const runDir = join(rootDir, runId);
  await mkdir(runDir, { recursive: true });
  const logPath = join(runDir, "run-log.jsonl");
  return {
    runDir,
    path(name) {
      return join(runDir, name);
    },
    async event(event) {
      const safe = { ...event, params: event.params ? redactParams(event.params) : undefined, ts: new Date().toISOString() };
      await appendFile(logPath, `${JSON.stringify(safe)}\n`);
    },
    async result(result) {
      await writeFile(join(runDir, "result.json"), `${JSON.stringify(result, null, 2)}\n`);
    }
  };
}
