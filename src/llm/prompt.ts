import { redactParams } from "../shared/params.js";
import type { Observation } from "../surface/types.js";

export function buildDiscoveryPrompt(input: {
  goal: string;
  observation: Observation;
  params: Record<string, unknown>;
  recentActions: string[];
  requiredOutputs?: string[];
}): string {
  const visual = input.observation.visual.send_to_llm
    ? input.observation.visual
    : { ...input.observation.visual, screenshot_path: "[local-only]" };

  return [
    "You are driving a back-office computer surface one safe action at a time.",
    "Return exactly one JSON object. Do not return markdown, prose, selectors, or Playwright code.",
    "",
    "Input fields:",
    "- Goal is the workflow objective to complete.",
    "- Params are user/workflow inputs. They may be redacted and should not be treated as page state unless the observation confirms them.",
    "- Recent actions are already attempted intents. Use them to avoid loops and repeated clicks.",
    "- State is the current browser/page state such as URL, title, and surface kind.",
    "- Visual contains visible text and viewport details. screenshot_path identifies the screenshot that may be attached as image input when send_to_llm is true.",
    "- Controls are accessibility-derived interactive elements such as links, buttons, tabs, inputs, and selects.",
    "- Structure describes tables, forms, regions, rows, and field context.",
    "- Policy describes blocked or restricted intents. Never propose blocked work.",
    "",
    "Decision rules:",
    "- Choose exactly one next decision: act, finish, or escalate.",
    "- Use act for one safe next UI operation only.",
    "- Use finish only when the goal is complete and required outputs have already been extracted.",
    "- Use extract actions for required outputs before finish. Do not put required outputs only in the finish decision.",
    "- Use escalate when the target is ambiguous, missing, unsafe, policy-blocked, or requires human judgment.",
    "- Never submit, approve, price, disburse, or finalize a loan.",
    "- Prefer semantic targets from Controls: role, name, label, accessible state.",
    "- Use Visual for visible text, nearby text, and region hints.",
    "- Use Structure for tables, forms, regions, rows, columns, and relative position.",
    "- Do not invent CSS selectors, XPath selectors, raw coordinates, or Playwright locators.",
    "",
    "Response shape:",
    "- Return one JSON object matching the configured response schema.",
    "- The schema defines the exact fields for act, finish, and escalate decisions.",
    "- Use reason_summary for audit context only; it is not executable.",
    "",
    `Goal: ${input.goal}`,
    `Params: ${JSON.stringify(redactParams(input.params))}`,
    `Recent actions: ${JSON.stringify(input.recentActions)}`,
    `Required outputs: ${JSON.stringify(input.requiredOutputs ?? [])}`,
    `State: ${JSON.stringify(input.observation.state)}`,
    `Visual: ${JSON.stringify(visual)}`,
    `Controls: ${JSON.stringify(input.observation.accessibility.controls)}`,
    `Structure: ${JSON.stringify(input.observation.structure)}`,
    `Policy: ${JSON.stringify(input.observation.policy)}`,
    "Allowed decisions: act, finish, escalate.",
    "Allowed action types: click, type, select, extract, assert, wait."
  ].join("\n");
}
