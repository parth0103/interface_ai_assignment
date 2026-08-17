import { describe, expect, it } from "vitest";
import packageJson from "../../package.json";

describe("package scripts", () => {
  it("defines the command surface required by the assignment demo", () => {
    expect(packageJson.scripts).toMatchObject({
      app: "tsx apps/loan-portal/src/main.ts",
      test: "vitest run",
      "test:e2e": "playwright test",
      typecheck: "tsc --noEmit",
      build: "tsc --noEmit",
      discover: "tsx src/cli/discover.ts",
      replay: "tsx src/cli/replay.ts",
      "evidence:validate": "tsx scripts/validate-evidence.ts"
    });
  });
});
