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
