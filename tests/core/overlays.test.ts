import { describe, expect, it } from "vitest";
import { applyVariantOverlay } from "../../src/artifacts/overlays.js";

describe("variant overlays", () => {
  it("overrides a target fingerprint for a tenant profile", () => {
    const artifact = {
      schema_version: "1.0",
      steps: [
        {
          id: "open_offers_tab",
          action: { target: { fingerprint: { semantic: { role: "tab", name: "Offers" } } } }
        }
      ],
      variant_overlays: {
        tenant_b: {
          target_overrides: {
            "open_offers_tab.target": {
              fingerprint: { semantic: { role: "tab", name: "Pre-Approvals" }, visual: { anchor_text: "Pre-Approvals" } }
            }
          }
        }
      }
    };

    const merged = applyVariantOverlay(artifact as never, "tenant_b");
    const [step] = merged.steps;
    expect(step?.action.target?.fingerprint.semantic?.name).toBe("Pre-Approvals");
  });
});
