/**
 * vehicle.repo integration tests
 *
 * Tests: encrypted chassis/engine at rest, blind-index lookup, audit-in-tx atomicity,
 * and round-trip decryption.
 *
 * Runs against the test database (TEST_DATABASE_URL → DATABASE_URL via integration config).
 *
 * Coverage:
 *   - createVehicle: stored chassisNumber is an envelope, not plaintext
 *   - readVehiclePii: decrypts chassisNumber/engineNumber to original cleartext
 *   - findVehicleByChassisNumber: locates row via blind index (no decryption)
 *   - duplicate chassisNumber violates @unique blind-index constraint
 *   - each PII create/read writes exactly one audit_logs row
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { createTestDb, deployTestSchema, truncateAll } from "../../../test/db-harness.js";
import { createCustomer } from "../customer/customer.repo.js";
import { CryptoService } from "../../crypto/crypto.service.js";
import { EnvKeyProvider } from "../../crypto/env-key-provider.js";
import {
  createVehicle,
  readVehiclePii,
  findVehicleByChassisNumber,
} from "./vehicle.repo.js";
import type { PrismaClient } from "../../../generated/prisma/client.js";

const db: PrismaClient = createTestDb();
const crypto = new CryptoService(new EnvKeyProvider());
const ctx = { actor: "test" };

// Helper: create a prerequisite Customer
async function createTestCustomer() {
  return createCustomer(db, ctx, { firstName: "Vehicle", lastName: "Test" }, crypto);
}

beforeAll(() => {
  deployTestSchema();
});

beforeEach(async () => {
  await truncateAll(db);
});

afterAll(async () => {
  await db.$disconnect();
});

describe("createVehicle", () => {
  it("stores chassisNumber as a CryptoService envelope (not plaintext)", async () => {
    const customer = await createTestCustomer();
    const rawChassis = "CHASSIS123ABC";

    const vehicle = await createVehicle(db, ctx, {
      customerId: customer.id,
      chassisNumber: rawChassis,
    }, crypto);

    const row = await db.vehicle.findUniqueOrThrow({ where: { id: vehicle.id } });

    expect(row.chassisNumber).not.toBeNull();
    // Must be an envelope: starts with "v" + digit, has 4 colon-separated parts
    expect(row.chassisNumber).toMatch(/^v\d+:/);
    expect(row.chassisNumber!.split(":")).toHaveLength(4);
    // Must NOT be the raw plaintext
    expect(row.chassisNumber).not.toBe(rawChassis);
  });

  it("stores engineNumber as a CryptoService envelope (not plaintext)", async () => {
    const customer = await createTestCustomer();
    const rawEngine = "ENGINE456DEF";

    const vehicle = await createVehicle(db, ctx, {
      customerId: customer.id,
      engineNumber: rawEngine,
    }, crypto);

    const row = await db.vehicle.findUniqueOrThrow({ where: { id: vehicle.id } });

    expect(row.engineNumber).not.toBeNull();
    expect(row.engineNumber).toMatch(/^v\d+:/);
    expect(row.engineNumber).not.toBe(rawEngine);
  });

  it("stores chassisNumberIdx as an HMAC blind index (not plaintext)", async () => {
    const customer = await createTestCustomer();
    const rawChassis = "CHASSIS_BLIND";

    const vehicle = await createVehicle(db, ctx, {
      customerId: customer.id,
      chassisNumber: rawChassis,
    }, crypto);

    const row = await db.vehicle.findUniqueOrThrow({ where: { id: vehicle.id } });

    expect(row.chassisNumberIdx).not.toBeNull();
    // HMAC-SHA256 → 64 hex chars
    expect(row.chassisNumberIdx).toMatch(/^[0-9a-f]{64}$/);
    expect(row.chassisNumberIdx).not.toBe(rawChassis);
  });

  it("writes exactly one audit_logs row (action=CREATE) in the same transaction", async () => {
    const customer = await createTestCustomer();
    const vehicle = await createVehicle(db, ctx, {
      customerId: customer.id,
      chassisNumber: "AUDIT_CHASSIS",
    }, crypto);

    const logs = await db.auditLog.findMany({
      where: { subjectType: "Vehicle", subjectId: vehicle.id },
    });

    expect(logs).toHaveLength(1);
    expect(logs[0]!.actor).toBe("test");
    expect(logs[0]!.action).toBe("CREATE");
  });

  it("stores optional plaintext fields (plate, year, engineCC, seatCount, weight)", async () => {
    const customer = await createTestCustomer();
    const vehicle = await createVehicle(db, ctx, {
      customerId: customer.id,
      platePrefix: "กข",
      plateNumber: "1234",
      plateProvince: "กรุงเทพมหานคร",
      year: 2022,
      engineCC: 1500,
      seatCount: 5,
      weight: 1200.5,
    }, crypto);

    const row = await db.vehicle.findUniqueOrThrow({ where: { id: vehicle.id } });

    expect(row.platePrefix).toBe("กข");
    expect(row.plateNumber).toBe("1234");
    expect(row.year).toBe(2022);
    expect(row.engineCC).toBe(1500);
    expect(row.seatCount).toBe(5);
    // weight is Decimal — compare as string
    expect(row.weight?.toString()).toBe("1200.5");
  });
});

describe("readVehiclePii", () => {
  it("decrypts chassisNumber to original cleartext (round-trip)", async () => {
    const customer = await createTestCustomer();
    const rawChassis = "ROUNDTRIP_CHASSIS_001";

    const vehicle = await createVehicle(db, ctx, {
      customerId: customer.id,
      chassisNumber: rawChassis,
    }, crypto);

    const pii = await readVehiclePii(db, ctx, vehicle.id, crypto);

    expect(pii.chassisNumber).toBe(rawChassis);
  });

  it("decrypts engineNumber to original cleartext (round-trip)", async () => {
    const customer = await createTestCustomer();
    const rawEngine = "ROUNDTRIP_ENGINE_001";

    const vehicle = await createVehicle(db, ctx, {
      customerId: customer.id,
      engineNumber: rawEngine,
    }, crypto);

    const pii = await readVehiclePii(db, ctx, vehicle.id, crypto);

    expect(pii.engineNumber).toBe(rawEngine);
  });

  it("writes exactly one audit_logs row (action=READ) in addition to the CREATE row", async () => {
    const customer = await createTestCustomer();
    const vehicle = await createVehicle(db, ctx, {
      customerId: customer.id,
      chassisNumber: "READ_AUDIT_CHASSIS",
    }, crypto);

    await readVehiclePii(db, ctx, vehicle.id, crypto);

    const logs = await db.auditLog.findMany({
      where: { subjectType: "Vehicle", subjectId: vehicle.id },
      orderBy: { createdAt: "asc" },
    });

    // 1 CREATE + 1 READ = 2 total
    expect(logs).toHaveLength(2);
    expect(logs[0]!.action).toBe("CREATE");
    expect(logs[1]!.action).toBe("READ");
  });

  it("returns weight as a string (Decimal boundary)", async () => {
    const customer = await createTestCustomer();
    const vehicle = await createVehicle(db, ctx, {
      customerId: customer.id,
      weight: 1350.75,
    }, crypto);

    const pii = await readVehiclePii(db, ctx, vehicle.id, crypto);

    expect(typeof pii.weight).toBe("string");
    expect(pii.weight).toBe("1350.75");
  });
});

describe("findVehicleByChassisNumber", () => {
  it("locates the vehicle via blind index without decryption", async () => {
    const customer = await createTestCustomer();
    const rawChassis = "FIND_BY_BLIND_IDX";

    const created = await createVehicle(db, ctx, {
      customerId: customer.id,
      chassisNumber: rawChassis,
    }, crypto);

    const found = await findVehicleByChassisNumber(db, ctx, rawChassis, crypto);

    expect(found).not.toBeNull();
    expect(found!.id).toBe(created.id);
    // chassisNumber in the returned row is still an envelope (not decrypted by this method)
    expect(found!.chassisNumber).toMatch(/^v\d+:/);
  });

  it("returns null for an unknown chassis number", async () => {
    const found = await findVehicleByChassisNumber(db, ctx, "UNKNOWN_CHASSIS_XYZ", crypto);
    expect(found).toBeNull();
  });

  it("writes one audit_logs READ row when found", async () => {
    const customer = await createTestCustomer();
    const rawChassis = "AUDIT_BLIND_CHASSIS";

    const created = await createVehicle(db, ctx, {
      customerId: customer.id,
      chassisNumber: rawChassis,
    }, crypto);

    await findVehicleByChassisNumber(db, ctx, rawChassis, crypto);

    const logs = await db.auditLog.findMany({
      where: { subjectType: "Vehicle", subjectId: created.id, action: "READ" },
    });
    expect(logs).toHaveLength(1);
  });

  it("enforces @unique blind-index: duplicate chassisNumber throws", async () => {
    const customer = await createTestCustomer();
    const rawChassis = "DUPLICATE_CHASSIS_001";

    await createVehicle(db, ctx, {
      customerId: customer.id,
      chassisNumber: rawChassis,
    }, crypto);

    await expect(
      createVehicle(db, ctx, {
        customerId: customer.id,
        chassisNumber: rawChassis,
      }, crypto),
    ).rejects.toThrow();
  });
});
