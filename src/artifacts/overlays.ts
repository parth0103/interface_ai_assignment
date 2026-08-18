import type { CapabilityArtifact } from "./schema.js";

type Overlay = {
  target_overrides?: Record<string, unknown>;
};

export function applyVariantOverlay(artifact: CapabilityArtifact, tenantProfile?: string): CapabilityArtifact {
  if (!tenantProfile) return artifact;
  const overlay = artifact.variant_overlays[tenantProfile] as Overlay | undefined;
  if (!overlay?.target_overrides) return artifact;

  const steps = artifact.steps.map((step) => {
    const override = overlay.target_overrides?.[`${step.id}.target`];
    if (!override || !step.action.target) return step;
    return {
      ...step,
      action: {
        ...step.action,
        target: {
          ...step.action.target,
          ...(override as Record<string, unknown>)
        }
      }
    };
  });

  return { ...artifact, steps };
}
