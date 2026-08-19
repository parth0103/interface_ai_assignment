import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { RunResult } from "../shared/result.js";
import { redactParams } from "../shared/params.js";

type EvidenceEvent = {
  phase?: string;
  step_id?: string;
  event: string;
  actor: "llm" | "replay" | "human" | "system";
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

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildReplacements(params?: Record<string, unknown>): Array<{ raw: string; redacted: string }> {
  if (!params) return [];
  const redactedParams = redactParams(params);
  return Object.entries(params)
    .filter(([, value]) => typeof value === "string" && value.length > 0)
    .map(([key, value]) => ({ raw: value as string, redacted: String(redactedParams[key]) }))
    .filter(({ raw, redacted }) => raw !== redacted);
}

function redactEventValue(value: unknown, replacements: Array<{ raw: string; redacted: string }>): unknown {
  if (typeof value === "string") {
    return replacements.reduce(
      (current, replacement) => current.replace(new RegExp(escapeRegex(replacement.raw), "g"), replacement.redacted),
      value
    );
  }
  if (Array.isArray(value)) return value.map((item) => redactEventValue(item, replacements));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [key, redactEventValue(nested, replacements)])
    );
  }
  return value;
}

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
      const replacements = buildReplacements(event.params);
      const safe = {
        ...redactEventValue(event, replacements) as EvidenceEvent,
        params: event.params ? redactParams(event.params) : undefined,
        ts: new Date().toISOString()
      };
      await appendFile(logPath, `${JSON.stringify(safe)}\n`);
    },
    async result(result) {
      await writeFile(join(runDir, "result.json"), `${JSON.stringify(result, null, 2)}\n`);
    }
  };
}
