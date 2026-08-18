import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { Page } from "playwright";
import type { ActionResult, EvidenceRef, Observation, ObservationContext, ResolvedAction, SurfaceAdapter } from "./types.js";

export class BrowserSurfaceAdapter implements SurfaceAdapter {
  constructor(private readonly page: Page, private readonly evidenceDir: string) {}

  async open(entrypoint: string): Promise<void> {
    await this.page.goto(entrypoint);
  }

  async observe(context: ObservationContext): Promise<Observation> {
    const screenshot = await this.captureEvidence(`observation-${Date.now()}`);
    const bodyText = await this.page.locator("body").innerText().catch(() => "");
    const viewport = this.page.viewportSize() ?? { width: 0, height: 0 };
    const controls = await this.page.locator("a,button,input,select,[role='tab']").evaluateAll((elements) =>
      elements.map((element) => {
        const input = element as HTMLInputElement;
        const tag = element.tagName.toLowerCase();
        const inputType = (input.getAttribute("type") || "text").toLowerCase();
        const nativeRole =
          tag === "a" ? "link" :
          tag === "select" ? "combobox" :
          tag === "input" && ["button", "submit", "reset"].includes(inputType) ? "button" :
          tag === "input" && inputType === "checkbox" ? "checkbox" :
          tag === "input" && inputType === "radio" ? "radio" :
          tag === "input" ? "textbox" :
          tag;
        const role = element.getAttribute("role") || nativeRole;
        const name = element.getAttribute("aria-label") || input.labels?.[0]?.textContent?.trim() || element.textContent?.trim() || input.name || input.value || "";
        return { role, name, enabled: !(input.disabled ?? false) };
      }).filter((control) => control.name)
    );
    return {
      state: { surface_kind: "browser", url: this.page.url(), title: await this.page.title(), recent_actions: context.recent_actions },
      visual: {
        screenshot_path: screenshot.path,
        send_to_llm: process.env.SEND_SCREENSHOTS_TO_LLM === "true",
        viewport,
        visible_text_blocks: bodyText.split("\n").map((line) => line.trim()).filter(Boolean)
      },
      accessibility: { controls },
      structure: { tables: [], forms: [], regions: [{ name: "body", text: bodyText }] },
      policy: context.policy ?? {}
    };
  }

  async act(action: ResolvedAction): Promise<ActionResult> {
    if (action.type === "navigate") await this.page.goto(action.url);
    if (action.type === "click") await this.page.locator(action.locator).click();
    if (action.type === "type") await this.page.locator(action.locator).fill(action.value);
    if (action.type === "select") await this.page.locator(action.locator).selectOption(action.value);
    if (action.type === "assert") await this.page.getByText(action.text).waitFor({ state: "visible" });
    if (action.type === "wait") await this.page.waitForTimeout(action.ms);
    if (action.type === "extract") {
      const text = await this.page.locator(action.locator).textContent();
      return { ok: true, extracted: { [action.output_key]: text?.trim() ?? "" } };
    }
    return { ok: true };
  }

  async captureEvidence(label: string): Promise<EvidenceRef> {
    await mkdir(this.evidenceDir, { recursive: true });
    const path = join(this.evidenceDir, `${label}.png`);
    await this.page.screenshot({ path, fullPage: true });
    return { path, kind: "screenshot" };
  }
}
