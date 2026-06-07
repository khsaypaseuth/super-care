/**
 * schema.int.spec.ts — schema migration verification
 *
 * Confirms that:
 *   - User/Account/Role tables exist and accept data
 *   - All 4 Role values are enumerable (ADMIN, STAFF, PARTNER, CUSTOMER)
 *   - Order.state column exists and accepts OrderState enum values
 *   - AuditLog table exists and can be queried
 *   - IdempotencyKey table exists with @@unique([provider, eventId])
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { createTestDb, deployTestSchema, truncateAll } from "../../test/db-harness.js";
import type { PrismaClient } from "../../generated/prisma/client.js";
import { Role, OrderState } from "../../generated/prisma/enums.js";

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

describe("User / Account / Role schema", () => {
  it("all 4 Role enum values are defined", () => {
    const roles = Object.values(Role);
    expect(roles).toContain("ADMIN");
    expect(roles).toContain("STAFF");
    expect(roles).toContain("PARTNER");
    expect(roles).toContain("CUSTOMER");
    expect(roles).toHaveLength(4);
  });

  it("User table migrated — can create a user with CUSTOMER role (default)", async () => {
    const user = await db.user.create({
      data: {
        email: "test@example.com",
      },
    });

    expect(user.id).toBeTruthy();
    expect(user.email).toBe("test@example.com");
    expect(user.role).toBe("CUSTOMER");
    expect(user.passwordHash).toBeNull();
  });

  it("User table — can create users with all 4 roles", async () => {
    for (const role of Object.values(Role)) {
      const user = await db.user.create({
        data: { email: `test-${role.toLowerCase()}@example.com`, role },
      });
      expect(user.role).toBe(role);
    }

    const count = await db.user.count();
    expect(count).toBe(4);
  });

  it("Account table migrated — @@unique([provider, providerAccountId]) enforced", async () => {
    const user = await db.user.create({ data: { email: "oauth@example.com" } });

    await db.account.create({
      data: {
        userId: user.id,
        provider: "google",
        providerAccountId: "google-123",
      },
    });

    // Duplicate should throw
    await expect(
      db.account.create({
        data: {
          userId: user.id,
          provider: "google",
          providerAccountId: "google-123",
        },
      }),
    ).rejects.toThrow();
  });
});

describe("Order.state column", () => {
  it("all 12 OrderState enum values are defined", () => {
    const states = Object.values(OrderState);
    const expected = [
      "DRAFT", "OCR_FAILED", "QUOTED", "AWAITING_PAYMENT", "PAYMENT_FAILED",
      "PAID", "ISSUING_CERTIFICATE", "CERT_FAILED", "REFUNDING",
      "COMPLETED", "REFUNDED", "CANCELLED",
    ];
    for (const state of expected) {
      expect(states).toContain(state);
    }
    expect(states).toHaveLength(12);
  });

  it("Order.state defaults to DRAFT", async () => {
    // We need a customer first (FK)
    const customer = await db.customer.create({
      data: { firstName: "State", lastName: "Test" },
    });

    const order = await db.order.create({
      data: { customerId: customer.id },
    });

    expect(order.state).toBe("DRAFT");
  });

  it("Order.state accepts any valid OrderState value", async () => {
    const customer = await db.customer.create({
      data: { firstName: "State2", lastName: "Test2" },
    });

    const order = await db.order.create({
      data: { customerId: customer.id, state: OrderState.PAID },
    });

    expect(order.state).toBe("PAID");
  });
});

describe("AuditLog table (audit_logs)", () => {
  it("exists and can create/query audit rows", async () => {
    await db.auditLog.create({
      data: {
        actor: "system",
        action: "CREATE",
        subjectType: "Test",
        subjectId: "test-id-123",
      },
    });

    const found = await db.auditLog.findFirst({
      where: { subjectId: "test-id-123" },
    });

    expect(found).not.toBeNull();
    expect(found!.actor).toBe("system");
  });
});

describe("IdempotencyKey table (idempotency_keys)", () => {
  it("@@unique([provider, eventId]) is enforced", async () => {
    await db.idempotencyKey.create({
      data: { provider: "stripe", eventId: "evt_123" },
    });

    await expect(
      db.idempotencyKey.create({
        data: { provider: "stripe", eventId: "evt_123" },
      }),
    ).rejects.toThrow();
  });

  it("same eventId under different provider is allowed", async () => {
    await db.idempotencyKey.create({
      data: { provider: "stripe", eventId: "evt_dup" },
    });

    const other = await db.idempotencyKey.create({
      data: { provider: "omise", eventId: "evt_dup" },
    });

    expect(other.id).toBeTruthy();
  });
});
