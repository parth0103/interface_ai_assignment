import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import "dotenv/config";
import { chromium } from "playwright";
import { runDiscovery } from "../agent/discovery-agent.js";
import { autoLoanOfferReviewCapability } from "../capabilities/auto-loan-offer-review.js";
import { GeminiClient } from "../llm/gemini.js";
import { MockLLMClient } from "../llm/mock.js";
import type { AgentDecision, LLMClient } from "../llm/types.js";
import { createDefaultSafetyPolicy } from "../safety/policy.js";
import { BrowserSurfaceAdapter } from "../surface/browser.js";

export type DiscoverCliArgs = {
  goal: string;
  target: string;
  paramsPath: string;
  outDir: string;
  llmMode: "gemini" | "mock";
  llmDelayMs: number;
};

export function parseDiscoverArgs(argv: string[]): DiscoverCliArgs {
  const value = (flag: string) => {
    const index = argv.indexOf(flag);
    return index >= 0 ? argv[index + 1] : undefined;
  };
  const goal = value("--goal");
  const target = value("--target");
  const paramsPath = value("--params");
  const outDir = value("--out");
  const llmMode = (value("--llm") ?? process.env.LLM_MODE ?? "gemini") as "gemini" | "mock";
  const llmDelayMs = Number(value("--llm-delay-ms") ?? process.env.DISCOVERY_LLM_DELAY_MS ?? "0");
  if (!goal || !target || !paramsPath || !outDir) throw new Error("Required flags: --goal, --target, --params, --out");
  if (llmMode !== "gemini" && llmMode !== "mock") throw new Error("--llm must be gemini or mock");
  return { goal, target, paramsPath, outDir, llmMode, llmDelayMs };
}

function createHappyPathMockDecisions(): AgentDecision[] {
  return [
    { decision: "act", reason_summary: "Open Member Search.", action: { type: "click", intent: "open_member_search", target: { description: "Member Search link", semantic: { role: "link", name: "Member Search" } } } },
    { decision: "act", reason_summary: "Enter the requested member ID.", action: { type: "type", intent: "type_member_id", target: { description: "Member ID field", semantic: { role: "textbox", name: "Member ID" } }, value: "{{member_id}}" } },
    { decision: "act", reason_summary: "Submit member search.", action: { type: "click", intent: "submit_member_search", target: { description: "Search button", semantic: { role: "button", name: "Search" } } } },
    { decision: "act", reason_summary: "Open the unique member result.", action: { type: "click", intent: "open_member_profile", target: { description: "Open Member link", semantic: { role: "link", name: "Open Member" } } } },
    { decision: "act", reason_summary: "Open the offers tab.", action: { type: "click", intent: "open_offers_tab", target: { description: "Offers tab", semantic: { role: "tab", name: "Offers" } } } },
    { decision: "act", reason_summary: "Open the active auto loan offer.", action: { type: "click", intent: "open_auto_loan_offer", target: { description: "Open Offer link", semantic: { role: "link", name: "Open Offer" } } } },
    { decision: "act", reason_summary: "Select the requested vehicle type.", action: { type: "select", intent: "select_vehicle_type", target: { description: "Vehicle Type select", semantic: { role: "combobox", name_contains: "Vehicle Type" } }, value: "{{vehicle_type}}" } },
    { decision: "act", reason_summary: "Continue to final review.", action: { type: "click", intent: "continue_to_review", target: { description: "Continue to Review button", semantic: { role: "button", name: "Continue to Review" } } } },
    { decision: "act", reason_summary: "Extract review status.", action: { type: "extract", intent: "extract_review_status", target: { description: "Review status text", visual: { anchor_text: "Review Status: Ready for final review" } }, output_key: "review_status" } },
    { decision: "finish", reason_summary: "Final Review is visible and the review status was extracted.", outputs: { review_status: "Ready for final review" } }
  ];
}

function createLlm(mode: "gemini" | "mock"): LLMClient {
  if (mode === "mock") return new MockLLMClient(createHappyPathMockDecisions());
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is required for --llm gemini.");
  return new GeminiClient({
    apiKey,
    model: process.env.DISCOVERY_MODEL ?? "gemini-2.5-pro",
    sendScreenshots: process.env.SEND_SCREENSHOTS_TO_LLM === "true"
  });
}

async function main(): Promise<void> {
  const args = parseDiscoverArgs(process.argv.slice(2));
  const params = JSON.parse(await readFile(args.paramsPath, "utf8")) as Record<string, unknown>;
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const surface = new BrowserSurfaceAdapter(page, join(args.outDir, "screenshots"));
    const result = await runDiscovery({
      goal: args.goal,
      target: args.target,
      params,
      capability: autoLoanOfferReviewCapability,
      llm: createLlm(args.llmMode),
      surface,
      policy: createDefaultSafetyPolicy("demo"),
      evidenceRoot: args.outDir,
      runId: "discovery",
      maxSteps: 25,
      llmDelayMs: args.llmDelayMs
    });
    await mkdir("evidence", { recursive: true });
    if (result.status === "success") {
      const artifactJson = `${JSON.stringify(result.artifact, null, 2)}\n`;
      await writeFile("evidence/prepared-auto-loan-offer-review.v1.json", artifactJson);
      await mkdir(args.outDir, { recursive: true });
      await writeFile(join(args.outDir, "artifact.v1.json"), artifactJson);
    }
    console.log(JSON.stringify(result, null, 2));
    if (result.status !== "success") process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

if (process.argv[1]?.endsWith("discover.ts")) {
  void main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
