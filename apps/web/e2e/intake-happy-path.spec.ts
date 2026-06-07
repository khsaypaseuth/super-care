/**
 * Intake happy-path end-to-end test.
 *
 * This test drives the full wizard: Start → Customer → Document → Map+Verify → Vehicle → Review → Save.
 * It is written FIRST (red/failing until 03-06 completes the wizard).
 *
 * Steps 1–3 (Start, Customer, Document) land in 03-05.
 * Steps 4–6 (Map+Verify, Vehicle, Review) land in 03-06.
 *
 * The test is marked test.fail() so the suite does not block on the partial implementation.
 * Remove test.fail() in 03-06 when all steps are complete.
 *
 * @see 03-05-PLAN.md Task 1
 */

import { test, expect } from "@playwright/test";
import path from "path";

test.describe("Intake wizard — happy path", () => {
  /**
   * Full happy-path: Start → Customer → Document → Verify → Vehicle → Review → Save.
   * Marked test.fail() because steps 4–6 are built in 03-06.
   * Expected to fail until 03-06 completes.
   */
  test.fail(
    "full happy path Start→Customer→Document→Verify→Vehicle→Review→Save",
    async ({ page }) => {
      // ─── Step 1: Navigate to new intake ─────────────────────────────────────────
      await page.goto("/en/intake/new");

      // Should auto-redirect to /en/intake/{id}/start
      await expect(page).toHaveURL(/\/en\/intake\/[^/]+\/start/);

      // ─── Step 1: Start — select insurer + policy mode ────────────────────────────
      await expect(
        page.getByRole("heading", { name: /start/i }),
      ).toBeVisible();

      // Open the insurance company combobox and select first option
      const insurerCombobox = page.getByRole("combobox", {
        name: /insurance company/i,
      });
      await insurerCombobox.click();
      // Wait for dropdown to open and select first option
      const firstOption = page.getByRole("option").first();
      await firstOption.click();

      // Select "New Policy"
      await page.getByRole("radio", { name: /new policy/i }).click();

      // Click Continue
      await page.getByRole("button", { name: /continue/i }).click();

      // ─── Step 2: Customer ────────────────────────────────────────────────────────
      await expect(page).toHaveURL(/\/en\/intake\/[^/]+\/customer/);
      await expect(
        page.getByRole("heading", { name: /customer/i }),
      ).toBeVisible();

      // Fill in customer form
      await page.getByLabel(/first name/i).fill("สมชาย");
      await page.getByLabel(/last name/i).fill("ใจดี");
      await page.getByLabel(/phone/i).fill("0812345678");
      await page.getByLabel(/email/i).fill("somchai@example.com");

      // Select card type: Thai ID card
      const cardTypeSelect = page.getByRole("combobox", {
        name: /card type/i,
      });
      await cardTypeSelect.click();
      await page.getByRole("option", { name: /thai id/i }).click();

      // Fill Thai national ID (valid checksum: 1100700001221)
      await page.getByLabel(/national id/i).fill("1100700001221");

      // Date of birth
      await page.getByLabel(/date of birth/i).fill("1990-01-15");

      // Nationality
      const nationalitySelect = page.getByRole("combobox", {
        name: /nationality/i,
      });
      await nationalitySelect.click();
      await page.getByRole("option", { name: /thai/i }).click();

      // Address
      await page.getByLabel(/address line 1/i).fill("123 Main Street");

      // Select province
      const provinceSelect = page.getByRole("combobox", {
        name: /province/i,
      });
      await provinceSelect.click();
      await page.getByRole("option").first().click();

      // Continue to document
      await page.getByRole("button", { name: /continue/i }).click();

      // ─── Step 3: Document & OCR ──────────────────────────────────────────────────
      await expect(page).toHaveURL(/\/en\/intake\/[^/]+\/document/);
      await expect(
        page.getByRole("heading", { name: /document/i }),
      ).toBeVisible();

      // Upload a test image file
      const fileInput = page.locator('input[type="file"]');
      await fileInput.setInputFiles(
        path.join(__dirname, "fixtures", "test-reg-book.jpg"),
      );

      // Wait for OCR extraction to complete
      await expect(page.getByText(/extracting/i)).toBeVisible();
      await expect(page.getByText(/raw ocr/i)).toBeVisible({ timeout: 30000 });
      await expect(page.getByText(/unverified/i)).toBeVisible();

      // Continue to verify
      await page.getByRole("button", { name: /continue/i }).click();

      // ─── Step 4: Map & Verify (03-06) ────────────────────────────────────────────
      await expect(page).toHaveURL(/\/en\/intake\/[^/]+\/verify/);
      await expect(
        page.getByRole("heading", { name: /map.*verify/i }),
      ).toBeVisible();

      // Verify required fields
      const verifyCheckboxes = page.getByRole("checkbox", {
        name: /verified/i,
      });
      const count = await verifyCheckboxes.count();
      for (let i = 0; i < count; i++) {
        await verifyCheckboxes.nth(i).check();
      }

      await page.getByRole("button", { name: /continue/i }).click();

      // ─── Step 5: Vehicle (03-06) ─────────────────────────────────────────────────
      await expect(page).toHaveURL(/\/en\/intake\/[^/]+\/vehicle/);

      // Fill minimum required vehicle fields
      await page.getByLabel(/plate prefix/i).fill("กข");
      await page.getByLabel(/plate number/i).fill("1234");
      await page.getByLabel(/chassis/i).fill("ABC12345678901234");
      await page.getByLabel(/engine number/i).fill("ENG12345");

      await page.getByRole("button", { name: /continue/i }).click();

      // ─── Step 6: Review & Save (03-06) ───────────────────────────────────────────
      await expect(page).toHaveURL(/\/en\/intake\/[^/]+\/review/);
      await expect(
        page.getByRole("heading", { name: /review/i }),
      ).toBeVisible();

      // Submit
      await page.getByRole("button", { name: /save intake/i }).click();

      // Expect success toast + confirmation
      await expect(page.getByText(/intake saved/i)).toBeVisible({
        timeout: 15000,
      });
    },
  );

  /**
   * Partial test: Start step works (lands in 03-05).
   * This SHOULD pass once the Start step is implemented.
   */
  test("navigating to /en/intake/new creates a draft and redirects to Start step", async ({
    page,
  }) => {
    await page.goto("/en/intake/new");

    // Should redirect to the start step
    await expect(page).toHaveURL(/\/en\/intake\/[^/]+\/start/);

    // The start step heading should be visible
    await expect(
      page.getByRole("heading", { name: /start/i }),
    ).toBeVisible();

    // Wizard step indicator should show Step 1 active
    await expect(page.getByTestId("wizard-steps")).toBeVisible();

    // Insurer combobox and policy mode radio should be present
    await expect(
      page.getByRole("combobox", { name: /insurance company/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("radio", { name: /new policy/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("radio", { name: /renewal/i }),
    ).toBeVisible();
  });
});
