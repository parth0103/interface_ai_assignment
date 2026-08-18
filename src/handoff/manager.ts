import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import type { Observation, SurfaceAdapter } from "../surface/types.js";

type Checkpoint = { type: string; value: unknown };

function checkpointMatches(checkpoint: Checkpoint, observation: Observation): boolean {
  if (checkpoint.type === "text_visible") {
    const expected = String(checkpoint.value);
    return observation.visual.visible_text_blocks.some((block) => block.includes(expected));
  }
  if (checkpoint.type === "url_contains") return observation.state.url.includes(String(checkpoint.value));
  return false;
}

export async function createIntervention(input: {
  dir: string;
  intervention_id: string;
  reason: string;
  step_id: string;
  before_screenshot: string;
  message: string;
}): Promise<string> {
  await mkdir(input.dir, { recursive: true });
  const path = join(input.dir, "intervention-request.json");
  await writeFile(path, `${JSON.stringify({ ...input, controller: "human" }, null, 2)}\n`);
  await writeFile(join(input.dir, "control-lease.json"), `${JSON.stringify({ intervention_id: input.intervention_id, controller: "human", reason: input.reason, step_id: input.step_id }, null, 2)}\n`);
  return path;
}

export async function recordHumanResume(input: {
  dir: string;
  intervention_id: string;
  reason: string;
  before_screenshot: string;
  after_screenshot: string;
  human_summary: string;
  resume_checkpoint: Checkpoint;
  resume_verified: boolean;
}): Promise<string> {
  const path = join(input.dir, "human-resume.json");
  await writeFile(path, `${JSON.stringify(input, null, 2)}\n`);
  await writeFile(join(input.dir, "control-lease.json"), `${JSON.stringify({ intervention_id: input.intervention_id, controller: "automation", reason: input.reason }, null, 2)}\n`);
  return path;
}

async function promptForResume(): Promise<string> {
  const rl = createInterface({ input, output });
  try {
    const summary = await rl.question("Human handoff active. Complete the manual step in the open browser, then describe what you did and press Enter: ");
    return summary.trim() || "Human completed the requested manual step.";
  } finally {
    rl.close();
  }
}

export async function performInteractiveHandoff(input: {
  dir: string;
  intervention_id: string;
  reason: string;
  step_id: string;
  message: string;
  surface: SurfaceAdapter;
  resume_checkpoint: Checkpoint;
  waitForResume?: () => Promise<string>;
}): Promise<{ before_screenshot: string; after_screenshot: string; human_summary: string; resume_verified: boolean }> {
  const before = await input.surface.captureEvidence("handoff-before");
  await createIntervention({
    dir: input.dir,
    intervention_id: input.intervention_id,
    reason: input.reason,
    step_id: input.step_id,
    before_screenshot: before.path,
    message: input.message
  });
  const human_summary = input.waitForResume ? await input.waitForResume() : await promptForResume();
  const after = await input.surface.captureEvidence("handoff-after");
  const resumeObservation = await input.surface.observe({ recent_actions: [`handoff:${input.step_id}`] });
  const resume_verified = checkpointMatches(input.resume_checkpoint, resumeObservation);
  await recordHumanResume({
    dir: input.dir,
    intervention_id: input.intervention_id,
    reason: input.reason,
    before_screenshot: before.path,
    after_screenshot: after.path,
    human_summary,
    resume_checkpoint: input.resume_checkpoint,
    resume_verified
  });
  return { before_screenshot: before.path, after_screenshot: after.path, human_summary, resume_verified };
}
