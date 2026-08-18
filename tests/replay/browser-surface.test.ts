import { chromium } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BrowserSurfaceAdapter } from "../../src/surface/browser.js";
import { createLoanPortalApp } from "../../apps/loan-portal/src/server.js";

let server: { close(callback?: () => void): void };

beforeAll(async () => {
  server = createLoanPortalApp().listen(3000);
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe("BrowserSurfaceAdapter", () => {
  it("captures state, visible text, controls, and local screenshot path", async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage();
    const adapter = new BrowserSurfaceAdapter(page, "evidence/test-browser-surface");
    await adapter.open("http://localhost:3000");
    const observation = await adapter.observe({ recent_actions: [] });
    await browser.close();

    expect(observation.state.title).toContain("Loan Servicing Portal");
    expect(observation.visual.visible_text_blocks.join(" ")).toContain("Member Search");
    expect(observation.accessibility.controls.some((control) => control.name === "Member Search")).toBe(true);
    expect(observation.accessibility.controls).toContainEqual(expect.objectContaining({ role: "link", name: "Member Search" }));
    expect(observation.visual.screenshot_path).toContain("evidence/test-browser-surface");
  });

  it("executes semantic role name-containment locators", async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage();
    const adapter = new BrowserSurfaceAdapter(page, "evidence/test-browser-surface");
    await adapter.open("http://localhost:3000/members/rec-24816/offers/OFFER-4421");

    const result = await adapter.act({ type: "select", locator: "role=combobox[name*=\"Vehicle Type\"]", value: "used" });
    const selected = await page.locator("select[name='vehicleType']").inputValue();
    await browser.close();

    expect(result.ok).toBe(true);
    expect(selected).toBe("used");
  });
});
