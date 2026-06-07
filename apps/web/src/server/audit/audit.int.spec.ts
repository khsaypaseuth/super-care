/**
 * audit.service integration tests
 *
 * Proves:
 *   1. A PII create writes exactly one audit_logs row (correct actor/action/subject)
 *   2. A PII read writes exactly one audit_logs row
 *   3. Atomicity: if the data op throws inside the transaction, NEITHER the data row
 *      NOR the audit row persists (rollback propagates to both)
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { createTestDb, deployTestSchema, truncateAll } from "../../test/db-harness.js";
import { CryptoService } from "../crypto/crypto.service.js";
import { EnvKeyProvider } from "../crypto/env-key-provider.js";
import { recordAudit } from "./audit.service.js";
import { createCustomer, readCustomerPii } from "../modules/customer/customer.repo.js";
import type { PrismaClient } from "../../generated/prisma/client.js";

const db: PrismaClient = createTestDb();
const crypto = new CryptoService(new EnvKeyProvider());
const ctx = { actor: "test-audit" };

beforeAll(() => {
  deployTestSchema();
});

beforeEach(async () => {
  await truncateAll(db);
});

afterAll(async () => {
  await db.$disconnect();
});

describe("AuditService — PII create audit", () => {
  it("creates one audit_logs row with correct actor/action/subjectType/subjectId", async () => {
    const customer = await createCustomer(db, ctx, {
      firstName: "Audit",
      lastName: "Create",
      nationalId: "4444444444444",
    }, crypto);

    const logs = await db.auditLog.findMany({
      where: { subjectType: "Customer", subjectId: customer.id },
    });

    expect(logs).toHaveLength(1);
    const log = logs[0]!;
    expect(log.actor).toBe("test-audit");
    expect(log.action).toBe("CREATE");
    expect(log.subjectType).toBe("Customer");
    expect(log.subjectId).toBe(customer.id);
    expect(log.createdAt).toBeInstanceOf(Date);
  });
});

describe("AuditService — PII read audit", () => {
  it("writes one audit_logs READ row on readCustomerPii", async () => {
    const customer = await createCustomer(db, { actor: "system" }, {
      firstName: "Read",
      lastName: "Audit",
      nationalId: "5555555555555",
    }, crypto);

    await readCustomerPii(db, ctx, customer.id, crypto);

    const readLogs = await db.auditLog.findMany({
      where: { subjectType: "Customer", subjectId: customer.id, action: "READ" },
    });
    expect(readLogs).toHaveLength(1);
    expect(readLogs[0]!.actor).toBe("test-audit");
  });
});

describe("AuditService — atomicity (rollback leaves no data AND no audit row)", () => {
  it("rolls back both the data row and the audit row if the transaction throws", async () => {
    const firstName = "Rollback";
    const lastName = "Test";

    // Attempt a transaction that succeeds on data write but throws before commit
    await expect(
      db.$transaction(async (tx) => {
        // Write a customer row inside the transaction
        const customer = await tx.customer.create({
          data: { firstName, lastName },
        });

        // Write the audit row
        await recordAudit(tx, ctx, {
          action: "CREATE",
          subjectType: "Customer",
          subjectId: customer.id,
        });

        // Force a rollback — this simulates any downstream failure
        throw new Error("Simulated failure — should rollback both rows");
      }),
    ).rejects.toThrow("Simulated failure");

    // Assert: no customer row persisted
    const customers = await db.customer.findMany({
      where: { firstName, lastName },
    });
    expect(customers).toHaveLength(0);

    // Assert: no audit row persisted
    const logs = await db.auditLog.findMany({
      where: { actor: ctx.actor, action: "CREATE", subjectType: "Customer" },
    });
    expect(logs).toHaveLength(0);
  });
});
