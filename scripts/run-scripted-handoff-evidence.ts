import { readFile, rm } from "node:fs/promises";
import { chromium } from "playwright";
import { parseCapabilityArtifact } from "../src/artifacts/schema.js";
import { runReplay } from "../src/replay/engine.js";
import { createDefaultSafetyPolicy } from "../src/safety/policy.js";
import { BrowserSurfaceAdapter } from "../src/surface/browser.js";

async function main(): Promise<void> {
  const artifact = parseCapabilityArtifact(JSON.parse(await readFile("evidence/discovery-claude-real-8/artifact.v1.json", "utf8")));
  const params = JSON.parse(await readFile("examples/params/ambiguous-member.json", "utf8")) as Record<string, unknown>;
  const outDir = "evidence/replay-15-interactive-handoff";
  await rm(outDir, { recursive: true, force: true });
  const browser = await chromium.launch({ headless: true });

  try {
    const page = await browser.newPage();
    const surface = new BrowserSurfaceAdapter(page, `${outDir}/screenshots`);
    await surface.open("http://localhost:3000");
    const result = await runReplay({
      artifact,
      params,
      surface,
      policy: createDefaultSafetyPolicy("demo"),
      evidenceRoot: outDir,
      runId: "replay",
      allowDraft: true,
      interactiveHandoff: true,
      waitForHandoffResume: async () => {
        await page.locator("tr", { hasText: "1991" }).getByRole("link", { name: "Open Member" }).click();
        return "Scripted operator selected the ambiguous member row with DOB year 1991 in the same browser session.";
      }
    });

    console.log(JSON.stringify(result, null, 2));
    if (result.status !== "success") process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

if (process.argv[1]?.endsWith("run-scripted-handoff-evidence.ts")) {
  void main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
