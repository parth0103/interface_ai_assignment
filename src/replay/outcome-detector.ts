import type { RunStatus } from "../shared/result.js";
import type { Observation } from "../surface/types.js";

type KnownOutcome = {
  code: string;
  status: RunStatus;
  detect: Record<string, unknown>;
  message?: string;
};

export type OutcomeDetection =
  | { status: "continue" }
  | { status: RunStatus; code: string; message: string };

export function detectOutcome(observation: Observation, knownOutcomes: KnownOutcome[]): OutcomeDetection {
  const text = observation.visual.visible_text_blocks.join("\n");
  for (const outcome of knownOutcomes) {
    if (outcome.detect.type === "text_visible" && typeof outcome.detect.value === "string" && text.includes(outcome.detect.value)) {
      return { status: outcome.status, code: outcome.code, message: outcome.message ?? outcome.code };
    }
    if (outcome.detect.type === "text_regex" && typeof outcome.detect.pattern === "string" && new RegExp(outcome.detect.pattern, "i").test(text)) {
      return { status: outcome.status, code: outcome.code, message: outcome.message ?? outcome.code };
    }
    if (outcome.detect.type === "region_contains" && typeof outcome.detect.region === "string" && typeof outcome.detect.value === "string") {
      const region = observation.structure.regions.find((item) => item.name === outcome.detect.region);
      if (region?.text.includes(outcome.detect.value)) return { status: outcome.status, code: outcome.code, message: outcome.message ?? outcome.code };
    }
    if (outcome.detect.type === "dialog_visible" && typeof outcome.detect.title_contains === "string") {
      const dialog = observation.structure.regions.find((item) => /dialog|modal/i.test(item.name));
      if (dialog?.text.toLowerCase().includes(outcome.detect.title_contains.toLowerCase())) return { status: outcome.status, code: outcome.code, message: outcome.message ?? outcome.code };
    }
  }
  return { status: "continue" };
}
