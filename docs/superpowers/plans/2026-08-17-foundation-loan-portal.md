# Foundation And Loan Portal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the TypeScript project foundation and a local, moderately legacy Loan Servicing Portal that supports the assignment demo scenarios.

**Architecture:** This plan creates the executable project shell, test harness, and mock browser target. The portal is a server-rendered Express app so the UI feels like a stable enterprise back-office system rather than a polished SPA. Later plans use this app through Playwright and do not depend on internal app data APIs.

**Tech Stack:** Node 20+, TypeScript, Express, Vitest, Playwright, Supertest, tsx.

## Global Constraints

Use TypeScript for app and automation code.
Use Playwright as the concrete browser automation tool.
Use a local mock Loan Servicing Portal at `http://localhost:3000`.
Primary goal: `Find member 24816, open their pre-approved auto loan offer, and advance it to the final review screen.`
The project stops at final review and never submits, approves, prices, or disburses a loan.
Do not use test IDs as primary locators in the app or automation.
Use synthetic demo data only.
Keep secrets out of git. `.env` and `.env.*` stay ignored.
Every task uses TDD: write the failing test, verify failure, implement the minimum, verify pass, commit.

---

## File Structure

Create this structure:

```text
package.json                         root scripts and dependencies
tsconfig.json                        TypeScript config shared by app and automation
vitest.config.ts                     unit/integration test config
playwright.config.ts                 browser test config
.env.example                         safe environment template
apps/loan-portal/src/data.ts         synthetic member and offer data
apps/loan-portal/src/render.ts       server-rendered HTML helpers
apps/loan-portal/src/server.ts       Express app factory and server start
apps/loan-portal/src/main.ts         CLI entrypoint for `npm run app`
tests/loan-portal/data.test.ts       data matrix tests
tests/loan-portal/server.test.ts     route and HTML integration tests
tests/e2e/loan-portal.spec.ts        Playwright smoke test for the happy UI path
```

The server module must export `createLoanPortalApp()` so tests can run without binding a real port.

---

### Task 1: Project Tooling And Scripts

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `playwright.config.ts`
- Create: `.env.example`
- Test: `tests/tooling/package-scripts.test.ts`

**Interfaces:**
- Produces: npm scripts `app`, `test`, `test:e2e`, `typecheck`, `build`, `discover`, `replay`, `evidence:validate`
- Produces: TypeScript path aliases `@app/*` and `@src/*`

- [ ] **Step 1: Write the failing package script test**

Create `tests/tooling/package-scripts.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
npm test -- tests/tooling/package-scripts.test.ts
```

Expected: FAIL because `package.json` and the scripts do not exist yet.

- [ ] **Step 3: Create project tooling files**

Create `package.json`:

```json
{
  "name": "interface-ai-computer-use-assignment",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "app": "tsx apps/loan-portal/src/main.ts",
    "test": "vitest run",
    "test:e2e": "playwright test",
    "typecheck": "tsc --noEmit",
    "build": "tsc --noEmit",
    "discover": "tsx src/cli/discover.ts",
    "replay": "tsx src/cli/replay.ts",
    "evidence:validate": "tsx scripts/validate-evidence.ts"
  },
  "dependencies": {
    "dotenv": "^16.4.7",
    "express": "^4.21.2",
    "zod": "^3.24.1"
  },
  "devDependencies": {
    "@playwright/test": "^1.49.1",
    "@types/express": "^5.0.0",
    "@types/node": "^22.10.2",
    "@types/supertest": "^6.0.2",
    "supertest": "^7.0.0",
    "tsx": "^4.19.2",
    "typescript": "^5.7.2",
    "vitest": "^2.1.8"
  }
}
```

Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM"],
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "skipLibCheck": true,
    "types": ["node", "vitest"],
    "baseUrl": ".",
    "paths": {
      "@app/*": ["apps/loan-portal/src/*"],
      "@src/*": ["src/*"]
    }
  },
  "include": ["apps/**/*.ts", "src/**/*.ts", "tests/**/*.ts", "scripts/**/*.ts", "*.ts"]
}
```

Create `vitest.config.ts`:

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: false,
    environment: "node",
    include: ["tests/**/*.test.ts"]
  }
});
```

Create `playwright.config.ts`:

```typescript
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 30_000,
  retries: 0,
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off"
  },
  webServer: {
    command: "npm run app",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 30_000
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] }
    }
  ]
});
```

Create `.env.example`:

```text
GEMINI_API_KEY=
DISCOVERY_MODEL=gemini-2.5-pro
LLM_MODE=mock
SEND_SCREENSHOTS_TO_LLM=false
PORT=3000
```

- [ ] **Step 4: Install dependencies**

Run:

```bash
npm install
```

Expected: installs dependencies and creates `package-lock.json`.

- [ ] **Step 5: Run the package script test to verify it passes**

Run:

```bash
npm test -- tests/tooling/package-scripts.test.ts
```

Expected: PASS.

- [ ] **Step 6: Run typecheck**

Run:

```bash
npm run typecheck
```

Expected: PASS. If missing CLI files cause failure because the scripts point to files not created yet, create empty modules with valid exports:

```typescript
export {};
```

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json tsconfig.json vitest.config.ts playwright.config.ts .env.example tests/tooling/package-scripts.test.ts
git commit -m "chore: add TypeScript project tooling"
```

---

### Task 2: Synthetic Loan Portal Data Matrix

**Files:**
- Create: `apps/loan-portal/src/data.ts`
- Test: `tests/loan-portal/data.test.ts`

**Interfaces:**
- Produces: `MemberRecord`, `LoanOffer`, `SearchResult`, `findMembersById(memberId: string): SearchResult[]`, `getMemberByRecordId(recordId: string): MemberRecord | undefined`
- Consumes: none

- [ ] **Step 1: Write the failing data matrix test**

Create `tests/loan-portal/data.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { findMembersById, getMemberByRecordId } from "../../apps/loan-portal/src/data.js";

describe("loan portal synthetic data", () => {
  it("provides the happy path member with an active pre-approved auto loan offer", () => {
    const results = findMembersById("24816");
    expect(results).toHaveLength(1);
    const member = getMemberByRecordId(results[0].recordId);
    expect(member?.displayName).toBe("Maya Chen");
    expect(member?.offers[0]).toMatchObject({
      offerId: "OFFER-4421",
      type: "auto_loan",
      status: "active",
      apr: "6.49%",
      maxAmount: "$25,000",
      termMonths: 60
    });
  });

  it("provides a member with no active pre-approved auto loan offer", () => {
    const member = getMemberByRecordId(findMembersById("99999")[0].recordId);
    expect(member?.displayName).toBe("Jordan Rivera");
    expect(member?.offers).toHaveLength(0);
  });

  it("provides an ambiguous member search result", () => {
    const results = findMembersById("77777");
    expect(results.map((result) => result.displayName)).toEqual(["Avery Patel", "Avery Patel"]);
    expect(results.map((result) => result.dobHint)).toEqual(["1984", "1991"]);
  });

  it("provides an offer that requires a disclosure warning path", () => {
    const member = getMemberByRecordId(findMembersById("55555")[0].recordId);
    expect(member?.displayName).toBe("Sam Morgan");
    expect(member?.flags).toContain("special_handling_notice");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
npm test -- tests/loan-portal/data.test.ts
```

Expected: FAIL because `apps/loan-portal/src/data.ts` does not exist.

- [ ] **Step 3: Implement the synthetic data module**

Create `apps/loan-portal/src/data.ts`:

```typescript
export type LoanOffer = {
  offerId: string;
  type: "auto_loan";
  status: "active" | "expired";
  apr: string;
  maxAmount: string;
  termMonths: number;
};

export type MemberRecord = {
  recordId: string;
  memberId: string;
  displayName: string;
  dobHint: string;
  addressHint: string;
  flags: string[];
  offers: LoanOffer[];
};

export type SearchResult = Pick<MemberRecord, "recordId" | "memberId" | "displayName" | "dobHint" | "addressHint">;

const members: MemberRecord[] = [
  {
    recordId: "rec-24816",
    memberId: "24816",
    displayName: "Maya Chen",
    dobHint: "1992",
    addressHint: "1042",
    flags: [],
    offers: [
      {
        offerId: "OFFER-4421",
        type: "auto_loan",
        status: "active",
        apr: "6.49%",
        maxAmount: "$25,000",
        termMonths: 60
      }
    ]
  },
  {
    recordId: "rec-99999",
    memberId: "99999",
    displayName: "Jordan Rivera",
    dobHint: "1988",
    addressHint: "7710",
    flags: [],
    offers: []
  },
  {
    recordId: "rec-77777-a",
    memberId: "77777",
    displayName: "Avery Patel",
    dobHint: "1984",
    addressHint: "0184",
    flags: [],
    offers: []
  },
  {
    recordId: "rec-77777-b",
    memberId: "77777",
    displayName: "Avery Patel",
    dobHint: "1991",
    addressHint: "0191",
    flags: [],
    offers: [
      {
        offerId: "OFFER-7788",
        type: "auto_loan",
        status: "active",
        apr: "6.89%",
        maxAmount: "$18,000",
        termMonths: 48
      }
    ]
  },
  {
    recordId: "rec-55555",
    memberId: "55555",
    displayName: "Sam Morgan",
    dobHint: "1979",
    addressHint: "5500",
    flags: ["special_handling_notice"],
    offers: [
      {
        offerId: "OFFER-5555",
        type: "auto_loan",
        status: "active",
        apr: "7.12%",
        maxAmount: "$16,500",
        termMonths: 48
      }
    ]
  }
];

export function findMembersById(memberId: string): SearchResult[] {
  return members
    .filter((member) => member.memberId === memberId)
    .map(({ recordId, memberId: id, displayName, dobHint, addressHint }) => ({
      recordId,
      memberId: id,
      displayName,
      dobHint,
      addressHint
    }));
}

export function getMemberByRecordId(recordId: string): MemberRecord | undefined {
  return members.find((member) => member.recordId === recordId);
}
```

- [ ] **Step 4: Run the data tests to verify they pass**

Run:

```bash
npm test -- tests/loan-portal/data.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/loan-portal/src/data.ts tests/loan-portal/data.test.ts
git commit -m "feat: add synthetic loan portal data"
```

---

### Task 3: Server-Rendered Portal Routes

**Files:**
- Create: `apps/loan-portal/src/render.ts`
- Create: `apps/loan-portal/src/server.ts`
- Create: `apps/loan-portal/src/main.ts`
- Test: `tests/loan-portal/server.test.ts`

**Interfaces:**
- Consumes: `findMembersById(memberId: string)`, `getMemberByRecordId(recordId: string)`
- Produces: `createLoanPortalApp(): express.Express`
- Produces routes: `/`, `/members/search`, `/members/:recordId`, `/members/:recordId/offers`, `/members/:recordId/offers/:offerId`, `/members/:recordId/offers/:offerId/review`

- [ ] **Step 1: Write the failing server route tests**

Create `tests/loan-portal/server.test.ts`:

```typescript
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createLoanPortalApp } from "../../apps/loan-portal/src/server.js";

const app = createLoanPortalApp();

describe("loan portal routes", () => {
  it("renders the dashboard with a member search link", async () => {
    const response = await request(app).get("/");
    expect(response.status).toBe(200);
    expect(response.text).toContain("Loan Servicing Portal");
    expect(response.text).toContain("Member Search");
  });

  it("renders one member result for the happy path search", async () => {
    const response = await request(app).get("/members/search").query({ memberId: "24816" });
    expect(response.status).toBe(200);
    expect(response.text).toContain("Maya Chen");
    expect(response.text).toContain("Open Member");
  });

  it("renders an explicit no-offer business state", async () => {
    const response = await request(app).get("/members/rec-99999/offers");
    expect(response.status).toBe(200);
    expect(response.text).toContain("No active pre-approved auto loan offers");
  });

  it("renders the final review page without submitting the application", async () => {
    const response = await request(app)
      .get("/members/rec-24816/offers/OFFER-4421/review")
      .query({ vehicleType: "used" });
    expect(response.status).toBe(200);
    expect(response.text).toContain("Final Review");
    expect(response.text).toContain("Ready for final review");
    expect(response.text).toContain("Submit Final Application");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
npm test -- tests/loan-portal/server.test.ts
```

Expected: FAIL because `server.ts` and route rendering do not exist.

- [ ] **Step 3: Implement HTML rendering helpers**

Create `apps/loan-portal/src/render.ts`:

```typescript
import type { LoanOffer, MemberRecord, SearchResult } from "./data.js";

function shell(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${title}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 0; background: #f4f6f8; color: #18202a; }
    header { background: #12324a; color: white; padding: 16px 24px; }
    nav { background: #e3e8ee; padding: 10px 24px; }
    nav a, .tab { margin-right: 16px; color: #12324a; font-weight: bold; }
    main { padding: 24px; max-width: 1120px; }
    table { border-collapse: collapse; width: 100%; background: white; }
    th, td { border: 1px solid #c8d1dc; padding: 10px; text-align: left; }
    th { background: #eef3f7; }
    .panel { background: white; border: 1px solid #c8d1dc; padding: 16px; margin-bottom: 16px; }
    .warning { border: 2px solid #a15c00; background: #fff7e6; padding: 12px; margin: 12px 0; }
    button, .button { border: 1px solid #12324a; background: #174966; color: white; padding: 8px 12px; text-decoration: none; cursor: pointer; }
    .danger { background: #8a1f11; }
  </style>
</head>
<body>
  <header><h1>Loan Servicing Portal</h1></header>
  <nav><a href="/">Dashboard</a><a href="/members/search">Member Search</a><a href="/queue">Loan Queue</a></nav>
  <main>${body}</main>
</body>
</html>`;
}

export function renderDashboard(): string {
  return shell("Loan Servicing Portal", `
    <section class="panel">
      <h2>Operator Dashboard</h2>
      <p>Use Member Search to open member servicing records.</p>
      <a class="button" href="/members/search">Member Search</a>
    </section>`);
}

export function renderSearch(memberId = "", results: SearchResult[] = []): string {
  const rows = results.map((result) => `
    <tr>
      <td>${result.memberId}</td>
      <td>${result.displayName}</td>
      <td>${result.dobHint}</td>
      <td>${result.addressHint}</td>
      <td><a class="button" href="/members/${result.recordId}">Open Member</a></td>
    </tr>`).join("");
  const message = memberId && results.length === 0 ? `<p>No member found for ${memberId}.</p>` : "";
  return shell("Member Search", `
    <h2>Member Search</h2>
    <form method="get" action="/members/search">
      <label>Member ID <input name="memberId" value="${memberId}" /></label>
      <button type="submit">Search</button>
    </form>
    ${message}
    ${results.length ? `<table aria-label="Member Results"><thead><tr><th>Member ID</th><th>Name</th><th>DOB Year</th><th>Address Ending</th><th>Action</th></tr></thead><tbody>${rows}</tbody></table>` : ""}`);
}

export function renderMember(member: MemberRecord): string {
  return shell("Member Profile", `
    <h2>Member Profile</h2>
    <section class="panel">
      <p>Name: ${member.displayName}</p>
      <p>Member ID: ${member.memberId}</p>
    </section>
    <div role="tablist" aria-label="Member Profile Tabs">
      <a class="tab" role="tab" href="/members/${member.recordId}">Accounts</a>
      <a class="tab" role="tab" href="/members/${member.recordId}/loans">Loans</a>
      <a class="tab" role="tab" href="/members/${member.recordId}/offers">Offers</a>
      <a class="tab" role="tab" href="/members/${member.recordId}/documents">Documents</a>
    </div>`);
}

export function renderOffers(member: MemberRecord): string {
  const warning = member.flags.includes("special_handling_notice")
    ? `<div class="warning">Special handling note requires operator acknowledgement.</div>`
    : "";
  const rows = member.offers.map((offer) => `
    <tr>
      <td>Pre-approved Auto Loan</td>
      <td>${offer.status}</td>
      <td>${offer.maxAmount}</td>
      <td>${offer.apr}</td>
      <td><a class="button" href="/members/${member.recordId}/offers/${offer.offerId}">Open Offer</a></td>
    </tr>`).join("");
  const body = rows
    ? `<table aria-label="Pre-approved Offers"><thead><tr><th>Offer Type</th><th>Status</th><th>Max Amount</th><th>APR</th><th>Action</th></tr></thead><tbody>${rows}</tbody></table>`
    : `<p>No active pre-approved auto loan offers</p>`;
  return shell("Pre-approved Offers", `<h2>Pre-approved offers</h2>${warning}${body}`);
}

export function renderOfferTerms(member: MemberRecord, offer: LoanOffer): string {
  return shell("Offer Terms", `
    <h2>Offer Terms</h2>
    <table aria-label="Offer Terms">
      <tbody>
        <tr><th>Offer ID</th><td>${offer.offerId}</td></tr>
        <tr><th>APR</th><td>${offer.apr}</td></tr>
        <tr><th>Max Amount</th><td>${offer.maxAmount}</td></tr>
        <tr><th>Term</th><td>${offer.termMonths} months</td></tr>
      </tbody>
    </table>
    <form method="get" action="/members/${member.recordId}/offers/${offer.offerId}/review">
      <label>Vehicle Type
        <select name="vehicleType">
          <option value="">Select vehicle type</option>
          <option value="new">New</option>
          <option value="used">Used</option>
        </select>
      </label>
      <button type="submit">Continue to Review</button>
    </form>`);
}

export function renderReview(member: MemberRecord, offer: LoanOffer, vehicleType: string): string {
  return shell("Final Review", `
    <h2>Final Review</h2>
    <p>Review Status: Ready for final review</p>
    <table aria-label="Review Summary">
      <tbody>
        <tr><th>Member</th><td>${member.displayName}</td></tr>
        <tr><th>Offer ID</th><td>${offer.offerId}</td></tr>
        <tr><th>APR</th><td>${offer.apr}</td></tr>
        <tr><th>Max Amount</th><td>${offer.maxAmount}</td></tr>
        <tr><th>Term</th><td>${offer.termMonths} months</td></tr>
        <tr><th>Vehicle Type</th><td>${vehicleType}</td></tr>
      </tbody>
    </table>
    <button class="danger" type="button">Submit Final Application</button>`);
}
```

- [ ] **Step 4: Implement the Express app factory and main entrypoint**

Create `apps/loan-portal/src/server.ts`:

```typescript
import express from "express";
import { findMembersById, getMemberByRecordId } from "./data.js";
import { renderDashboard, renderMember, renderOfferTerms, renderOffers, renderReview, renderSearch } from "./render.js";

export function createLoanPortalApp(): express.Express {
  const app = express();

  app.get("/", (_request, response) => response.send(renderDashboard()));

  app.get("/members/search", (request, response) => {
    const memberId = typeof request.query.memberId === "string" ? request.query.memberId.trim() : "";
    response.send(renderSearch(memberId, memberId ? findMembersById(memberId) : []));
  });

  app.get("/members/:recordId", (request, response) => {
    const member = getMemberByRecordId(request.params.recordId);
    if (!member) return response.status(404).send("Member record not found");
    return response.send(renderMember(member));
  });

  app.get("/members/:recordId/offers", (request, response) => {
    const member = getMemberByRecordId(request.params.recordId);
    if (!member) return response.status(404).send("Member record not found");
    return response.send(renderOffers(member));
  });

  app.get("/members/:recordId/offers/:offerId", (request, response) => {
    const member = getMemberByRecordId(request.params.recordId);
    const offer = member?.offers.find((candidate) => candidate.offerId === request.params.offerId);
    if (!member || !offer) return response.status(404).send("Offer not found");
    return response.send(renderOfferTerms(member, offer));
  });

  app.get("/members/:recordId/offers/:offerId/review", (request, response) => {
    const member = getMemberByRecordId(request.params.recordId);
    const offer = member?.offers.find((candidate) => candidate.offerId === request.params.offerId);
    if (!member || !offer) return response.status(404).send("Offer not found");
    const vehicleType = typeof request.query.vehicleType === "string" ? request.query.vehicleType : "";
    if (!vehicleType) return response.status(400).send("Vehicle type is required");
    return response.send(renderReview(member, offer, vehicleType));
  });

  return app;
}
```

Create `apps/loan-portal/src/main.ts`:

```typescript
import { createLoanPortalApp } from "./server.js";

const port = Number(process.env.PORT ?? "3000");
const app = createLoanPortalApp();

app.listen(port, () => {
  console.log(`Loan Servicing Portal listening on http://localhost:${port}`);
});
```

- [ ] **Step 5: Run the route tests to verify they pass**

Run:

```bash
npm test -- tests/loan-portal/server.test.ts
```

Expected: PASS.

- [ ] **Step 6: Run typecheck**

Run:

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/loan-portal/src/render.ts apps/loan-portal/src/server.ts apps/loan-portal/src/main.ts tests/loan-portal/server.test.ts
git commit -m "feat: add loan portal routes"
```

---

### Task 4: Browser Smoke Test For The Happy Path

**Files:**
- Create: `tests/e2e/loan-portal.spec.ts`

**Interfaces:**
- Consumes: route behavior from Task 3
- Produces: one Playwright smoke test that replay tests can use as a UI oracle

- [ ] **Step 1: Write the failing Playwright smoke test**

Create `tests/e2e/loan-portal.spec.ts`:

```typescript
import { expect, test } from "@playwright/test";

test("operator can reach final review for the happy path loan offer", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Member Search" }).click();
  await page.getByLabel("Member ID").fill("24816");
  await page.getByRole("button", { name: "Search" }).click();
  await page.getByRole("link", { name: "Open Member" }).click();
  await page.getByRole("tab", { name: "Offers" }).click();
  await page.getByRole("link", { name: "Open Offer" }).click();
  await page.getByLabel("Vehicle Type").selectOption("used");
  await page.getByRole("button", { name: "Continue to Review" }).click();

  await expect(page.getByRole("heading", { name: "Final Review" })).toBeVisible();
  await expect(page.getByText("Ready for final review")).toBeVisible();
  await expect(page.getByText("OFFER-4421")).toBeVisible();
  await expect(page.getByRole("button", { name: "Submit Final Application" })).toBeVisible();
});
```

- [ ] **Step 2: Run the e2e test to verify it fails if browsers are not installed or the UI route is wrong**

Run:

```bash
npx playwright install chromium
npm run test:e2e -- tests/e2e/loan-portal.spec.ts
```

Expected before fixes: FAIL if role labels or routing are incorrect.

- [ ] **Step 3: Adjust only labels/routes required by the smoke test**

If `getByLabel("Member ID")` fails, make the search field explicit in `renderSearch`:

```html
<label for="member-id-input">Member ID</label>
<input id="member-id-input" name="memberId" value="${memberId}" />
```

If `getByRole("tab", { name: "Offers" })` fails, keep the existing visible tab text and role:

```html
<a class="tab" role="tab" href="/members/${member.recordId}/offers">Offers</a>
```

- [ ] **Step 4: Run the e2e test to verify it passes**

Run:

```bash
npm run test:e2e -- tests/e2e/loan-portal.spec.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/loan-portal/src/render.ts tests/e2e/loan-portal.spec.ts
git commit -m "test: add loan portal browser smoke test"
```

---

## Plan 1 Verification

Run:

```bash
npm run typecheck
npm test
npm run test:e2e -- tests/e2e/loan-portal.spec.ts
```

Expected:

```text
typecheck passes
unit/integration tests pass
Playwright smoke test reaches Final Review
```

At the end of this plan, the repository has a working local app but no automation engine yet.
