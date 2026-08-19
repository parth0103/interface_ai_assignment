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
  "replay-15-interactive-handoff/replay/result.json",
  "replay-15-interactive-handoff/replay/run-log.jsonl",
  "replay-15-interactive-handoff/handoff-open_member_profile/intervention-request.json",
  "replay-15-interactive-handoff/handoff-open_member_profile/human-resume.json",
  "replay-15-interactive-handoff/handoff-open_member_profile/control-lease.json",
  "replay-14-blocked-policy/replay/result.json",
  "replay-14-blocked-policy/replay/run-log.jsonl"
];

const expectedReplayStatuses = {
  "replay-11-success/replay/result.json": "success",
  "replay-12-business-outcome/replay/result.json": "business_outcome",
  "replay-13-handoff/replay/result.json": "needs_human",
  "replay-15-interactive-handoff/replay/result.json": "success",
  "replay-14-blocked-policy/replay/result.json": "blocked"
} as const;

type EvidenceValidationOptions = {
  requireRealDiscovery?: boolean;
};

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

async function readJsonl(path: string): Promise<unknown[]> {
  const text = await readFile(path, "utf8");
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

export async function validateEvidence(root = "evidence", options: EvidenceValidationOptions = {}): Promise<string[]> {
  const failures: string[] = [];
  const requireRealDiscovery = options.requireRealDiscovery ?? true;

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

  if (requireRealDiscovery) {
    const discoveryLog = "discovery-claude-real-8/discovery/run-log.jsonl";
    const path = join(root, discoveryLog);
    if (await exists(path)) {
      try {
        const events = await readJsonl(path);
        const started = events.find((event) => eventMatches(event, {
          event: "discovery_started",
          provider: "anthropic",
          model: "claude-sonnet-5"
        }));
        if (!started) failures.push(`${discoveryLog} missing anthropic discovery_started metadata`);

        const decision = events.find((event) => eventMatches(event, {
          event: "llm_decision",
          provider: "anthropic",
          model: "claude-sonnet-5"
        }) && hasStringField(event, "decision"));
        if (!decision) failures.push(`${discoveryLog} missing anthropic llm_decision metadata`);
      } catch (error) {
        failures.push(`${discoveryLog} is not valid JSONL: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  return failures;
}

function eventMatches(value: unknown, expected: Record<string, string>): boolean {
  if (!value || typeof value !== "object") return false;
  return Object.entries(expected).every(([key, expectedValue]) => (value as Record<string, unknown>)[key] === expectedValue);
}

function hasStringField(value: unknown, key: string): boolean {
  if (!value || typeof value !== "object") return false;
  return typeof (value as Record<string, unknown>)[key] === "string";
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
