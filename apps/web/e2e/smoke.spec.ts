import { test, expect } from "@playwright/test";

test.describe("Smoke tests", () => {
  test("home page returns 200 and renders the app title", async ({ page }) => {
    const response = await page.goto("/en");
    expect(response?.status()).toBe(200);

    // The landing page renders the app name from the en catalog
    await expect(page.getByRole("heading", { name: "Super Care" })).toBeVisible();
  });

  test("health page returns 200 and shows OK status", async ({ page }) => {
    const response = await page.goto("/en/health");
    expect(response?.status()).toBe(200);

    await expect(page.getByRole("heading", { name: "Health Check" })).toBeVisible();
    await expect(page.getByText("OK")).toBeVisible();
  });

  test("root redirects to /en", async ({ page }) => {
    const response = await page.goto("/");
    // After proxy/redirect, we should land on /en
    expect(response?.status()).toBeLessThan(400);
    await expect(page).toHaveURL(/\/en/);
  });
});
