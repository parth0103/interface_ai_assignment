import { describe, expect, it } from "vitest";
import { resolveTarget } from "../../src/replay/target-resolver.js";
import type { Observation } from "../../src/surface/types.js";

const observation: Observation = {
  state: { surface_kind: "browser", url: "http://localhost:3000", title: "Member Profile", recent_actions: [] },
  visual: { screenshot_path: "shot.png", send_to_llm: false, viewport: { width: 1280, height: 720 }, visible_text_blocks: ["Member Profile", "Accounts", "Loans", "Offers"] },
  accessibility: { controls: [{ role: "tab", name: "Offers", enabled: true }] },
  structure: { tables: [], forms: [], regions: [{ name: "profile_tabs", text: "Accounts Loans Offers" }] },
  policy: {}
};

describe("target resolver", () => {
  it("resolves a unique semantic role/name target to a Playwright locator", () => {
    const result = resolveTarget({
      id: "offers_tab",
      description: "Offers tab",
      fingerprint: { semantic: { role: "tab", name: "Offers" } },
      confidence: { minimum: 0.85, signals: ["role_name_match", "unique_match"] }
    }, observation);
    expect(result).toEqual({ status: "resolved", locator: "role=tab[name=\"Offers\"]", score: 1 });
  });

  it("returns needs_human for ambiguous targets", () => {
    const ambiguous = { ...observation, accessibility: { controls: [{ role: "link", name: "Open Member", enabled: true }, { role: "link", name: "Open Member", enabled: true }] } };
    const result = resolveTarget({
      id: "open_member",
      description: "Open Member link",
      fingerprint: { semantic: { role: "link", name: "Open Member" } },
      confidence: { minimum: 0.85, signals: ["role_name_match", "unique_match"] }
    }, ambiguous);
    expect(result.status).toBe("ambiguous");
  });

  it("keeps the role when resolving semantic name containment", () => {
    const form = {
      ...observation,
      accessibility: { controls: [{ role: "combobox", name: "Vehicle Type Select vehicle type New Used", enabled: true }] }
    };
    const result = resolveTarget({
      id: "vehicle_type",
      description: "Vehicle Type select",
      fingerprint: { semantic: { role: "combobox", name_contains: "Vehicle Type" } },
      confidence: { minimum: 0.85, signals: ["role_name_match", "unique_match"] }
    }, form);
    expect(result).toEqual({ status: "resolved", locator: "role=combobox[name*=\"Vehicle Type\"]", score: 0.9 });
  });

  it("resolves a unique accessible control mentioned in the target description", () => {
    const dashboard = {
      ...observation,
      accessibility: { controls: [{ role: "link", name: "Member Search", enabled: true }] }
    };
    const result = resolveTarget({
      id: "member_search",
      description: "Member Search navigation link",
      fingerprint: {},
      confidence: { minimum: 0.85, signals: ["description_control_name_match", "unique_match"] }
    }, dashboard);
    expect(result).toEqual({ status: "resolved", locator: "role=link[name=\"Member Search\"]", score: 0.8 });
  });

  it("resolves natural descriptions to unique controls by meaningful tokens", () => {
    const termsPage = {
      ...observation,
      accessibility: { controls: [{ role: "combobox", name: "Vehicle Type Select vehicle type New Used", enabled: true }] }
    };
    const result = resolveTarget({
      id: "vehicle_type",
      description: "Vehicle Type dropdown",
      fingerprint: {},
      confidence: { minimum: 0.85, signals: ["description_token_match", "unique_match"] }
    }, termsPage);
    expect(result).toEqual({ status: "resolved", locator: "role=combobox[name*=\"Vehicle Type\"]", score: 0.76 });
  });

  it("uses the description to disambiguate broad semantic containment", () => {
    const searchResults = {
      ...observation,
      accessibility: { controls: [{ role: "link", name: "Member Search", enabled: true }, { role: "link", name: "Open Member", enabled: true }] }
    };
    const result = resolveTarget({
      id: "open_member",
      description: "Open Member button next to member ID 24816",
      fingerprint: { semantic: { role: "link", name_contains: "Member" } },
      confidence: { minimum: 0.85, signals: ["description_control_name_match", "unique_match"] }
    }, searchResults);
    expect(result).toEqual({ status: "resolved", locator: "role=link[name=\"Open Member\"]", score: 0.8 });
  });
});
