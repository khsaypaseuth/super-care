/**
 * seed.int.spec.ts — idempotent reference-data seed verification
 *
 * Proves:
 *   1. Seed populates expected row counts for inline reference tables
 *   2. Re-running the seed yields identical row counts (idempotent upsert on natural code)
 *   3. No duplicate-insert error on second run
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { execSync } from "node:child_process";
import { createTestDb, deployTestSchema, truncateAll } from "../../test/db-harness.js";
import type { PrismaClient } from "../../generated/prisma/client.js";

const db: PrismaClient = createTestDb();

beforeAll(() => {
  deployTestSchema();
});

beforeEach(async () => {
  await truncateAll(db);
});

afterAll(async () => {
  await db.$disconnect();
});

/** Run the seed script against the test DATABASE_URL. */
function runSeed(): void {
  const url = process.env["DATABASE_URL"];
  if (!url) throw new Error("DATABASE_URL not set for seed test");

  execSync("pnpm --filter @super-care/web exec tsx prisma/seed.ts", {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: url },
    stdio: "pipe",
  });
}

describe("Seed idempotency", () => {
  it("first run: populates expected row counts", async () => {
    runSeed();

    const titleCount = await db.masterTitleName.count();
    const cardTypeCount = await db.masterCardType.count();
    const colorCount = await db.masterCarColor.count();
    const vehicleTypeCount = await db.masterVehicleType.count();
    const policyTypeCount = await db.cmiPolicyType.count();

    expect(titleCount).toBe(6);
    expect(cardTypeCount).toBe(5);
    expect(colorCount).toBe(23);
    expect(vehicleTypeCount).toBe(3);
    expect(policyTypeCount).toBeGreaterThanOrEqual(2);
  });

  it("second run: row counts are identical (idempotent upsert)", async () => {
    // First run
    runSeed();

    const titleAfterFirst = await db.masterTitleName.count();
    const cardTypeAfterFirst = await db.masterCardType.count();
    const colorAfterFirst = await db.masterCarColor.count();

    // Second run — must not throw or add new rows
    runSeed();

    const titleAfterSecond = await db.masterTitleName.count();
    const cardTypeAfterSecond = await db.masterCardType.count();
    const colorAfterSecond = await db.masterCarColor.count();

    expect(titleAfterSecond).toBe(titleAfterFirst);
    expect(cardTypeAfterSecond).toBe(cardTypeAfterFirst);
    expect(colorAfterSecond).toBe(colorAfterFirst);
  });

  it("car brands are seeded parent-first (models FK references existing brand)", async () => {
    runSeed();

    const brands = await db.masterCarBrand.findMany();
    const models = await db.masterCarModel.findMany({ include: { brand: true } });

    expect(brands.length).toBeGreaterThanOrEqual(3);
    expect(models.length).toBeGreaterThanOrEqual(3);

    // Every model must have a valid brand reference
    for (const model of models) {
      expect(model.brand).not.toBeNull();
    }
  });

  it("province hierarchy seeded parent-first (district → province, subdistrict → district)", async () => {
    runSeed();

    const districts = await db.masterDistrict.findMany({ include: { province: true } });
    const subdistricts = await db.masterSubdistrict.findMany({ include: { district: true } });

    expect(districts.length).toBeGreaterThanOrEqual(1);
    expect(subdistricts.length).toBeGreaterThanOrEqual(1);

    for (const d of districts) {
      expect(d.province).not.toBeNull();
    }
    for (const s of subdistricts) {
      expect(s.district).not.toBeNull();
    }
  });
});
