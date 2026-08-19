import { access, readFile } from "node:fs/promises";
import { join } from "node:path";

const requiredFiles = [
  "discovery-claude-real-8/artifact.v1.json",
  "discovery-claude-real-8/discovery/run-log.jsonl",
  "replay-11-success/replay/result.json",
  "replay-11-success/replay/run-log.jsonl",
  "replay-12-business-outcome/replay/result.json",
  "replay-12-business-outcome/replay/run-log.jsonl",
  "replay-13-handoff/replay/result.json",
  "replay-13-handoff/replay/run-log.jsonl",
  "replay-14-blocked-policy/replay/result.json",
  "replay-14-blocked-policy/replay/run-log.jsonl"
];

const expectedReplayStatuses = {
  "replay-11-success/replay/result.json": "success",
  "replay-12-business-outcome/replay/result.json": "business_outcome",
  "replay-13-handoff/replay/result.json": "needs_human",
  "replay-14-blocked-policy/replay/result.json": "blocked"
} as const;

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8"));
}

export async function validateEvidence(root = "evidence"): Promise<string[]> {
  const failures: string[] = [];

  for (const file of requiredFiles) {
    if (!(await exists(join(root, file)))) failures.push(`missing ${file}`);
  }

  for (const [file, expectedStatus] of Object.entries(expectedReplayStatuses)) {
    const path = join(root, file);
    if (!(await exists(path))) continue;

    try {
      const result = readResultStatus(await readJson(path));
      if (result !== expectedStatus) {
        failures.push(`${file} status ${result ?? "<missing>"}, expected ${expectedStatus}`);
      }
    } catch (error) {
      failures.push(`${file} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return failures;
}

function readResultStatus(value: unknown): string | undefined {
  if (!value || typeof value !== "object" || !("status" in value)) return undefined;

  const status = (value as { status: unknown }).status;
  return typeof status === "string" ? status : undefined;
}

async function main(): Promise<void> {
  const failures = await validateEvidence(process.argv[2] ?? "evidence");
  if (failures.length) {
    console.error(failures.join("\n"));
    process.exitCode = 1;
    return;
  }

  console.log("Evidence validation passed.");
}

if (process.argv[1]?.endsWith("validate-evidence.ts")) {
  void main();
}
