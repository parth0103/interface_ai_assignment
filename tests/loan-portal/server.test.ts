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
