import type { Observation } from "../surface/types.js";

type Target = {
  id: string;
  description: string;
  fingerprint: {
    semantic?: { role?: string; name?: string; name_contains?: string };
    visual?: { anchor_text?: string };
    structure?: { region?: string };
    adapter_hints?: Record<string, { locator?: string }>;
  };
  confidence?: { minimum: number; signals: string[] };
};

export type TargetResolution =
  | { status: "resolved"; locator: string; score: number }
  | { status: "ambiguous"; code: "ambiguous_target"; message: string }
  | { status: "not_found"; code: "target_not_found"; message: string };

function locatorForRoleName(role: string, name: string): string {
  return `role=${role}[name="${name}"]`;
}

const genericDescriptionTokens = new Set(["button", "link", "field", "input", "dropdown", "select", "navigation", "nav", "menu", "the", "a", "an"]);

function meaningfulTokens(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 1 && !genericDescriptionTokens.has(token));
}

export function resolveTarget(target: Target, observation: Observation): TargetResolution {
  const semantic = target.fingerprint.semantic;
  let deferredAmbiguous: TargetResolution | undefined;
  if (semantic?.role && semantic.name) {
    const matches = observation.accessibility.controls.filter((control) => control.role === semantic.role && control.name === semantic.name);
    if (matches.length === 1) return { status: "resolved", locator: locatorForRoleName(semantic.role, semantic.name), score: 1 };
    if (matches.length > 1) return { status: "ambiguous", code: "ambiguous_target", message: `Multiple controls matched ${target.description}` };
  }
  if (semantic?.role && semantic.name_contains) {
    const matches = observation.accessibility.controls.filter((control) => control.role === semantic.role && control.name.includes(semantic.name_contains ?? ""));
    if (matches.length === 1) return { status: "resolved", locator: `role=${semantic.role}[name*="${semantic.name_contains}"]`, score: 0.9 };
    if (matches.length > 1) deferredAmbiguous = { status: "ambiguous", code: "ambiguous_target", message: `Multiple controls matched ${target.description}` };
  }
  const anchor = target.fingerprint.visual?.anchor_text;
  if (anchor && observation.visual.visible_text_blocks.some((block) => block.includes(anchor))) {
    return { status: "resolved", locator: `text=${anchor}`, score: 0.86 };
  }
  const hint = target.fingerprint.adapter_hints?.["browser.playwright"]?.locator;
  if (hint) return { status: "resolved", locator: hint, score: 0.85 };
  const normalizedDescription = target.description.toLowerCase();
  const descriptionMatches = observation.accessibility.controls.filter((control) =>
    control.enabled && control.name && normalizedDescription.includes(control.name.toLowerCase())
  );
  if (descriptionMatches.length === 1) {
    const match = descriptionMatches[0];
    return { status: "resolved", locator: locatorForRoleName(match.role, match.name), score: 0.8 };
  }
  if (descriptionMatches.length > 1) {
    return { status: "ambiguous", code: "ambiguous_target", message: `Multiple controls matched ${target.description}` };
  }
  const descriptionTokens = meaningfulTokens(target.description);
  const tokenMatches = descriptionTokens.length > 0
    ? observation.accessibility.controls.filter((control) => {
      const controlTokens = new Set(meaningfulTokens(control.name));
      return control.enabled && descriptionTokens.every((token) => controlTokens.has(token));
    })
    : [];
  if (tokenMatches.length === 1) {
    const match = tokenMatches[0];
    return { status: "resolved", locator: locatorForRoleName(match.role, match.name), score: 0.76 };
  }
  if (tokenMatches.length > 1) {
    return { status: "ambiguous", code: "ambiguous_target", message: `Multiple controls matched ${target.description}` };
  }
  if (deferredAmbiguous) return deferredAmbiguous;
  return { status: "not_found", code: "target_not_found", message: `No target matched ${target.description}` };
}
