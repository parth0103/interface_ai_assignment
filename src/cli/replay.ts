import { readFile } from "node:fs/promises";
import { chromium } from "playwright";
import { parseCapabilityArtifact } from "../artifacts/schema.js";
import { runReplay } from "../replay/engine.js";
import { createDefaultSafetyPolicy } from "../safety/policy.js";
import { BrowserSurfaceAdapter } from "../surface/browser.js";

export type ReplayCliArgs = {
  artifactPath: string;
  paramsPath: string;
  outDir: string;
  tenantProfile?: string;
  allowDraft: boolean;
  interactiveHandoff: boolean;
};

export function parseReplayArgs(argv: string[]): ReplayCliArgs {
  const value = (flag: string) => {
    const index = argv.indexOf(flag);
    return index >= 0 ? argv[index + 1] : undefined;
  };
  const artifactPath = value("--artifact");
  const paramsPath = value("--params");
  const outDir = value("--out");
  if (!artifactPath || !paramsPath || !outDir) throw new Error("Required flags: --artifact, --params, --out");
  return {
    artifactPath,
    paramsPath,
    outDir,
    tenantProfile: value("--tenant"),
    allowDraft: argv.includes("--allow-draft"),
    interactiveHandoff: argv.includes("--interactive-handoff")
  };
}

async function main(): Promise<void> {
  const args = parseReplayArgs(process.argv.slice(2));
  const artifact = parseCapabilityArtifact(JSON.parse(await readFile(args.artifactPath, "utf8")));
  const params = JSON.parse(await readFile(args.paramsPath, "utf8")) as Record<string, unknown>;
  const browser = await chromium.launch({ headless: !args.interactiveHandoff });
  const page = await browser.newPage();
  const surface = new BrowserSurfaceAdapter(page, `${args.outDir}/screenshots`);
  await surface.open("http://localhost:3000");
  const result = await runReplay({
    artifact,
    params,
    surface,
    policy: createDefaultSafetyPolicy("demo"),
    evidenceRoot: args.outDir,
    runId: "replay",
    tenantProfile: args.tenantProfile,
    allowDraft: args.allowDraft,
    interactiveHandoff: args.interactiveHandoff
  });
  console.log(JSON.stringify(result, null, 2));
  await browser.close();
  if (result.status === "failure" || result.status === "blocked") process.exitCode = 1;
}

if (process.argv[1]?.endsWith("replay.ts")) {
  void main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
