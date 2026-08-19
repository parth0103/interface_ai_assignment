import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("REPORT.md", () => {
  it("uses exactly the assignment-required top-level headings", () => {
    const report = readFileSync("REPORT.md", "utf8");
    const headings = [...report.matchAll(/^## (.+)$/gm)].map((match) => match[1]);

    expect(headings).toEqual([
      "Architecture",
      "Artifact schema",
      "Determinism & error handling",
      "Heterogeneity & multi-tenant",
      "Escalation & handoff",
      "Safety",
      "Cuts"
    ]);
  });

  it("states that replay does not call any LLM", () => {
    const report = readFileSync("REPORT.md", "utf8");

    expect(report).toContain("Replay does not call any LLM");
  });
});
