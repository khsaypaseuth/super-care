/**
 * customer.repo integration tests
 *
 * Tests encrypted PII storage, blind-index lookup, and audit-in-transaction atomicity.
 * Runs against the test database (TEST_DATABASE_URL → DATABASE_URL via integration config).
 *
 * Coverage:
 *   - createCustomer: stored nationalId is an envelope, not plaintext
 *   - readCustomerPii: decrypts to original cleartext
 *   - findCustomerByNationalId: locates row via blind index (no decryption)
 *   - duplicate nationalId violates @unique blind-index constraint
 *   - each PII create/read writes exactly one audit_logs row
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { createTestDb, deployTestSchema, truncateAll } from "../../../test/db-harness.js";
import { CryptoService } from "../../crypto/crypto.service.js";
import { EnvKeyProvider } from "../../crypto/env-key-provider.js";
import {
  createCustomer,
  findCustomerByNationalId,
  readCustomerPii,
} from "./customer.repo.js";
import type { PrismaClient } from "../../../generated/prisma/client.js";

const db: PrismaClient = createTestDb();
const crypto = new CryptoService(new EnvKeyProvider());
const ctx = { actor: "test" };

beforeAll(() => {
  deployTestSchema();
});

// Truncate before each test to ensure clean state regardless of prior test file order.
beforeEach(async () => {
  await truncateAll(db);
});

afterAll(async () => {
  await db.$disconnect();
});

describe("createCustomer", () => {
  it("stores nationalId as a CryptoService envelope (not plaintext)", async () => {
    const raw = "1234567890123";

    const customer = await createCustomer(db, ctx, {
      firstName: "ทดสอบ",
      lastName: "นามสกุล",
      nationalId: raw,
    }, crypto);

    // Fetch the raw DB row to inspect the stored value
    const row = await db.customer.findUniqueOrThrow({ where: { id: customer.id } });

    expect(row.nationalId).not.toBeNull();
    // Must be an envelope: starts with "v" + digit, has 4 colon-separated parts
    expect(row.nationalId).toMatch(/^v\d+:/);
    expect(row.nationalId!.split(":")).toHaveLength(4);
    // Must NOT be the raw plaintext
    expect(row.nationalId).not.toBe(raw);
  });

  it("stores passportNumber as an envelope", async () => {
    const raw = "AB123456";

    const customer = await createCustomer(db, ctx, {
      firstName: "Test",
      lastName: "User",
      passportNumber: raw,
    }, crypto);

    const row = await db.customer.findUniqueOrThrow({ where: { id: customer.id } });
    expect(row.passportNumber).not.toBeNull();
    expect(row.passportNumber).toMatch(/^v\d+:/);
    expect(row.passportNumber).not.toBe(raw);
  });

  it("writes exactly one audit_logs row (action=CREATE) in the same transaction", async () => {
    const customer = await createCustomer(db, ctx, {
      firstName: "Audit",
      lastName: "Test",
      nationalId: "9876543210001",
    }, crypto);

    const logs = await db.auditLog.findMany({
      where: { subjectType: "Customer", subjectId: customer.id },
    });

    expect(logs).toHaveLength(1);
    expect(logs[0]!.actor).toBe("test");
    expect(logs[0]!.action).toBe("CREATE");
    expect(logs[0]!.subjectType).toBe("Customer");
    expect(logs[0]!.subjectId).toBe(customer.id);
  });
});

describe("readCustomerPii", () => {
  it("decrypts nationalId to original cleartext", async () => {
    const rawNationalId = "1234567890123";

    const customer = await createCustomer(db, ctx, {
      firstName: "Read",
      lastName: "Test",
      nationalId: rawNationalId,
    }, crypto);

    const pii = await readCustomerPii(db, ctx, customer.id, crypto);

    expect(pii.nationalId).toBe(rawNationalId);
  });

  it("decrypts passportNumber to original cleartext", async () => {
    const rawPassport = "PA9876543";

    const customer = await createCustomer(db, ctx, {
      firstName: "Passport",
      lastName: "User",
      passportNumber: rawPassport,
    }, crypto);

    const pii = await readCustomerPii(db, ctx, customer.id, crypto);

    expect(pii.passportNumber).toBe(rawPassport);
  });

  it("writes exactly one audit_logs row (action=READ) beyond the CREATE row", async () => {
    const customer = await createCustomer(db, ctx, {
      firstName: "PII",
      lastName: "Read",
      nationalId: "1111111111111",
    }, crypto);

    await readCustomerPii(db, ctx, customer.id, crypto);

    const logs = await db.auditLog.findMany({
      where: { subjectType: "Customer", subjectId: customer.id },
      orderBy: { createdAt: "asc" },
    });

    // 1 CREATE + 1 READ = 2 total
    expect(logs).toHaveLength(2);
    expect(logs[0]!.action).toBe("CREATE");
    expect(logs[1]!.action).toBe("READ");
  });
});

describe("findCustomerByNationalId", () => {
  it("locates the customer via blind index without decryption", async () => {
    const rawNationalId = "1234567890001";

    const created = await createCustomer(db, ctx, {
      firstName: "Blind",
      lastName: "Index",
      nationalId: rawNationalId,
    }, crypto);

    const found = await findCustomerByNationalId(db, ctx, rawNationalId, crypto);

    expect(found).not.toBeNull();
    expect(found!.id).toBe(created.id);
    // nationalId in the returned row is still an envelope (not decrypted by this method)
    expect(found!.nationalId).toMatch(/^v\d+:/);
  });

  it("returns null for an unknown national ID", async () => {
    const found = await findCustomerByNationalId(db, ctx, "0000000000000", crypto);
    expect(found).toBeNull();
  });

  it("writes one audit_logs READ row when found", async () => {
    const rawNationalId = "2222222222222";

    const created = await createCustomer(db, ctx, {
      firstName: "Audit",
      lastName: "Blind",
      nationalId: rawNationalId,
    }, crypto);

    await findCustomerByNationalId(db, ctx, rawNationalId, crypto);

    const logs = await db.auditLog.findMany({
      where: { subjectType: "Customer", subjectId: created.id, action: "READ" },
    });
    expect(logs).toHaveLength(1);
  });

  it("enforces @unique blind-index: duplicate nationalId throws", async () => {
    const rawNationalId = "3333333333333";

    await createCustomer(db, ctx, {
      firstName: "First",
      lastName: "User",
      nationalId: rawNationalId,
    }, crypto);

    await expect(
      createCustomer(db, ctx, {
        firstName: "Second",
        lastName: "User",
        nationalId: rawNationalId,
      }, crypto),
    ).rejects.toThrow();
  });
});
