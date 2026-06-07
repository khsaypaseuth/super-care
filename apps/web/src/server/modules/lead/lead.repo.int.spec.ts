/**
 * lead.repo integration tests
 *
 * Tests: createLead audit-in-tx, convertLeadToCustomer dual-audit-in-tx atomicity,
 * and rollback leaving neither Customer nor audit rows.
 *
 * Runs against the test database (TEST_DATABASE_URL → DATABASE_URL via integration config).
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { createTestDb, deployTestSchema, truncateAll } from "../../../test/db-harness.js";
import { CryptoService } from "../../crypto/crypto.service.js";
import { EnvKeyProvider } from "../../crypto/env-key-provider.js";
import { createLead, convertLeadToCustomer } from "./lead.repo.js";
import type { PrismaClient } from "../../../generated/prisma/client.js";

const db: PrismaClient = createTestDb();
const crypto = new CryptoService(new EnvKeyProvider());
const ctx = { actor: "test" };

beforeAll(() => {
  deployTestSchema();
});

beforeEach(async () => {
  await truncateAll(db);
});

afterAll(async () => {
  await db.$disconnect();
});

describe("createLead", () => {
  it("creates a Lead row with the provided contact fields", async () => {
    const lead = await createLead(db, ctx, {
      email: "testlead@example.com",
      phone: "0800000001",
      notes: "Walk-in inquiry",
    });

    expect(lead.id).toBeTruthy();
    expect(lead.email).toBe("testlead@example.com");
    expect(lead.phone).toBe("0800000001");
    expect(lead.customerId).toBeNull();
    expect(lead.convertedAt).toBeNull();
  });

  it("writes exactly one audit_logs row (action=CREATE, subjectType=Lead) in the same tx", async () => {
    const lead = await createLead(db, ctx, { email: "audit@test.com" });

    const logs = await db.auditLog.findMany({
      where: { subjectType: "Lead", subjectId: lead.id },
    });

    expect(logs).toHaveLength(1);
    expect(logs[0]!.actor).toBe("test");
    expect(logs[0]!.action).toBe("CREATE");
    expect(logs[0]!.subjectType).toBe("Lead");
    expect(logs[0]!.subjectId).toBe(lead.id);
  });
});

describe("convertLeadToCustomer", () => {
  it("creates a Customer and links the Lead (customerId + convertedAt)", async () => {
    const lead = await createLead(db, ctx, { email: "convert@test.com" });

    const customer = await convertLeadToCustomer(db, ctx, lead.id, {
      firstName: "สมใจ",
      lastName: "ใจดี",
      nationalId: "1234567890123",
    }, crypto);

    expect(customer.id).toBeTruthy();
    expect(customer.firstName).toBe("สมใจ");

    // Lead should be linked now
    const updatedLead = await db.lead.findUniqueOrThrow({ where: { id: lead.id } });
    expect(updatedLead.customerId).toBe(customer.id);
    expect(updatedLead.convertedAt).not.toBeNull();
  });

  it("writes audit rows for BOTH Lead (CONVERT) and Customer (CREATE) in one tx", async () => {
    const lead = await createLead(db, ctx, { email: "audit2@test.com" });
    const customer = await convertLeadToCustomer(db, ctx, lead.id, {
      firstName: "Test",
      lastName: "Audit",
    }, crypto);

    const leadLogs = await db.auditLog.findMany({
      where: { subjectType: "Lead", subjectId: lead.id, action: "CONVERT" },
    });
    const customerLogs = await db.auditLog.findMany({
      where: { subjectType: "Customer", subjectId: customer.id, action: "CREATE" },
    });

    expect(leadLogs).toHaveLength(1);
    expect(customerLogs).toHaveLength(1);
  });

  it("rolls back both Customer and Lead link on duplicate nationalId (atomicity)", async () => {
    // First conversion
    const lead1 = await createLead(db, ctx, { email: "first@test.com" });
    await convertLeadToCustomer(db, ctx, lead1.id, {
      firstName: "First",
      lastName: "User",
      nationalId: "9876543210001",
    }, crypto);

    // Second Lead with the same nationalId — should fail
    const lead2 = await createLead(db, ctx, { email: "second@test.com" });

    await expect(
      convertLeadToCustomer(db, ctx, lead2.id, {
        firstName: "Second",
        lastName: "User",
        nationalId: "9876543210001", // duplicate
      }, crypto),
    ).rejects.toThrow();

    // lead2 must NOT have been linked
    const updatedLead2 = await db.lead.findUniqueOrThrow({ where: { id: lead2.id } });
    expect(updatedLead2.customerId).toBeNull();

    // No customer row leaked
    const customers = await db.customer.findMany({ where: { firstName: "Second" } });
    expect(customers).toHaveLength(0);

    // No audit rows for lead2 CONVERT
    const logs = await db.auditLog.findMany({
      where: { subjectType: "Lead", subjectId: lead2.id, action: "CONVERT" },
    });
    expect(logs).toHaveLength(0);
  });
});
