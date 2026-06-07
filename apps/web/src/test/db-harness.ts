/**
 * Integration test database harness.
 *
 * Provides:
 *   - A PrismaClient connected to TEST_DATABASE_URL (set via vitest.integration.config.ts
 *     which maps TEST_DATABASE_URL → DATABASE_URL for the test run).
 *   - truncateAll(): truncates all user-data tables between tests so suites are isolated.
 *   - Lifecycle helpers: beforeAll (migrate deploy) and afterAll (disconnect).
 *
 * Usage in a *.int.spec.ts:
 *   import { createTestDb, truncateAll } from "../../test/db-harness.js";
 *   const db = createTestDb();
 *   beforeAll(async () => { await deployTestSchema(db); });
 *   afterEach(async () => { await truncateAll(db); });
 *   afterAll(async () => { await db.$disconnect(); });
 *
 * The test DB schema is kept in sync by running `prisma migrate deploy` against
 * TEST_DATABASE_URL via the vitest.integration.config.ts globalSetup (or beforeAll here).
 */

import { execSync } from "node:child_process";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.js";

/**
 * Create a PrismaClient connected to the test database (DATABASE_URL as remapped
 * from TEST_DATABASE_URL by vitest.integration.config.ts env override).
 */
export function createTestDb(): PrismaClient {
  const connectionString = process.env["DATABASE_URL"];
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL not set in integration test environment. " +
      "Ensure TEST_DATABASE_URL is set and vitest.integration.config.ts maps it to DATABASE_URL.",
    );
  }
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter });
}

/**
 * Deploy pending migrations to the test database.
 * Safe to call multiple times (deploy is idempotent).
 */
export function deployTestSchema(): void {
  const url = process.env["DATABASE_URL"];
  if (!url) {
    throw new Error("DATABASE_URL must be set before calling deployTestSchema()");
  }
  execSync("pnpm --filter @super-care/web exec prisma migrate deploy", {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: url },
    stdio: "pipe",
  });
}

/**
 * Truncate all user-data tables in reverse dependency order so foreign-key constraints
 * don't block the operation. Re-runs are safe.
 *
 * Tables are truncated (not deleted row-by-row) for speed in test cleanup.
 * CASCADE is used so dependent rows are cleaned up atomically.
 */
export async function truncateAll(db: PrismaClient): Promise<void> {
  // Truncate in reverse FK dependency order
  // (children before parents to avoid FK violations)
  await db.$executeRawUnsafe(
    `TRUNCATE TABLE
      draft_intakes,
      ocr_results,
      identity_documents,
      renewals,
      certificates,
      payments,
      payment_attempts,
      invoices,
      commissions,
      orders,
      fx_quotes,
      premiums,
      vehicles,
      customers,
      leads,
      accounts,
      users,
      partners,
      audit_logs,
      idempotency_keys,
      master_subdistricts,
      master_districts,
      master_car_models,
      master_provinces,
      master_nationalities,
      master_car_brands,
      master_car_colors,
      master_vehicle_types,
      master_card_types,
      master_title_names,
      cmi_policy_types,
      insurance_companies
    RESTART IDENTITY CASCADE`
  );
}
