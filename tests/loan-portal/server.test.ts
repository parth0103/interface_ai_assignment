import request from "supertest";
import { describe, expect, it } from "vitest";
import { getMemberByRecordId } from "../../apps/loan-portal/src/data.js";
import { renderReview } from "../../apps/loan-portal/src/render.js";
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

  it("escapes unsafe member search values before rendering them", async () => {
    const memberId = `"&<script>alert(1)</script>`;
    const response = await request(app).get("/members/search").query({ memberId });
    expect(response.status).toBe(200);
    expect(response.text).not.toContain(memberId);
    expect(response.text).toContain("&quot;&amp;&lt;script&gt;alert(1)&lt;/script&gt;");
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

  it("escapes unsafe vehicle types in review rendering", () => {
    const member = getMemberByRecordId("rec-24816");
    if (!member) throw new Error("Expected the happy-path member");
    const review = renderReview(member, member.offers[0], `<img src=x onerror=alert(1)>`);
    expect(review).not.toContain(`<img src=x onerror=alert(1)>`);
    expect(review).toContain("&lt;img src=x onerror=alert(1)&gt;");
  });

  it("rejects a final review without a vehicle type", async () => {
    const response = await request(app).get("/members/rec-24816/offers/OFFER-4421/review");
    expect(response.status).toBe(400);
    expect(response.text).toContain("Vehicle type is required");
  });

  it("rejects an invalid vehicle type", async () => {
    const response = await request(app)
      .get("/members/rec-24816/offers/OFFER-4421/review")
      .query({ vehicleType: "truck" });
    expect(response.status).toBe(400);
    expect(response.text).toContain("Vehicle type must be new or used");
  });

  it("returns not found for an unknown offer", async () => {
    const response = await request(app).get("/members/rec-24816/offers/OFFER-unknown");
    expect(response.status).toBe(404);
    expect(response.text).toContain("Offer not found");
  });
});
