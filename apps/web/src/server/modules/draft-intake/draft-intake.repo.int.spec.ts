/**
 * draft-intake.repo integration tests
 *
 * Tests: create/update wizard state, verified map persistence, step transitions,
 * and audit-in-tx.
 *
 * Runs against the test database (TEST_DATABASE_URL → DATABASE_URL via integration config).
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { createTestDb, deployTestSchema, truncateAll } from "../../../test/db-harness.js";
import {
  createDraftIntake,
  updateDraftIntake,
  getDraftIntake,
} from "./draft-intake.repo.js";
import type { PrismaClient } from "../../../generated/prisma/client.js";

const db: PrismaClient = createTestDb();
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

describe("createDraftIntake", () => {
  it("creates a DraftIntake with default step='insurer' and verified='{}'", async () => {
    const draft = await createDraftIntake(db, ctx, {});

    expect(draft.id).toBeTruthy();
    expect(draft.step).toBe("insurer");
    expect(draft.verified).toStrictEqual({});
  });

  it("persists provided step and verified map", async () => {
    const verifiedMap = { nationalId: true, chassisNumber: false };
    const draft = await createDraftIntake(db, ctx, {
      step: "map-verify",
      verified: verifiedMap,
    });

    expect(draft.step).toBe("map-verify");
    expect(draft.verified).toStrictEqual(verifiedMap);
  });

  it("persists all entity ref fields", async () => {
    const draft = await createDraftIntake(db, ctx, {
      insuranceCompanyId: "ins-001",
      policyMode: "NEW",
      leadId: "lead-001",
      customerId: "cust-001",
      identityDocumentId: "doc-001",
      ocrResultId: "ocr-001",
      vehicleId: "veh-001",
    });

    expect(draft.insuranceCompanyId).toBe("ins-001");
    expect(draft.policyMode).toBe("NEW");
    expect(draft.leadId).toBe("lead-001");
    expect(draft.customerId).toBe("cust-001");
    expect(draft.identityDocumentId).toBe("doc-001");
    expect(draft.ocrResultId).toBe("ocr-001");
    expect(draft.vehicleId).toBe("veh-001");
  });

  it("writes exactly one audit_logs row (action=CREATE) in the same tx", async () => {
    const draft = await createDraftIntake(db, ctx, { step: "insurer" });

    const logs = await db.auditLog.findMany({
      where: { subjectType: "DraftIntake", subjectId: draft.id },
    });

    expect(logs).toHaveLength(1);
    expect(logs[0]!.actor).toBe("test");
    expect(logs[0]!.action).toBe("CREATE");
  });

  it("persists mapping Json verbatim", async () => {
    const mapping = {
      brand: { rawValue: "TOYOTA", suggestedId: "brand-001", confidence: 0.95 },
      color: { rawValue: "silver", suggestedId: "color-012", confidence: 0.80 },
    };

    const draft = await createDraftIntake(db, ctx, {
      mapping,
    });

    const row = await db.draftIntake.findUniqueOrThrow({ where: { id: draft.id } });
    expect(row.mapping).toStrictEqual(mapping);
  });
});

describe("updateDraftIntake", () => {
  it("updates the step field", async () => {
    const draft = await createDraftIntake(db, ctx, { step: "insurer" });

    const updated = await updateDraftIntake(db, ctx, draft.id, { step: "customer" });

    expect(updated.step).toBe("customer");
  });

  it("updates the verified map (merges caller-supplied map)", async () => {
    const draft = await createDraftIntake(db, ctx, {
      step: "map-verify",
      verified: { nationalId: false, chassisNumber: false },
    });

    // Advance verified flags after staff confirmation
    const updated = await updateDraftIntake(db, ctx, draft.id, {
      verified: { nationalId: true, chassisNumber: true, engineNumber: true },
    });

    expect(updated.verified).toStrictEqual({
      nationalId: true,
      chassisNumber: true,
      engineNumber: true,
    });
  });

  it("writes exactly one audit_logs row (action=UPDATE) in the same tx", async () => {
    const draft = await createDraftIntake(db, ctx, { step: "insurer" });

    await updateDraftIntake(db, ctx, draft.id, { step: "customer" });

    const logs = await db.auditLog.findMany({
      where: { subjectType: "DraftIntake", subjectId: draft.id, action: "UPDATE" },
    });

    expect(logs).toHaveLength(1);
    expect(logs[0]!.actor).toBe("test");
  });

  it("can patch entity refs as wizard advances", async () => {
    const draft = await createDraftIntake(db, ctx, { step: "insurer" });

    await updateDraftIntake(db, ctx, draft.id, {
      insuranceCompanyId: "ins-999",
      policyMode: "RENEWAL",
      step: "customer",
    });

    const row = await getDraftIntake(db, draft.id);
    expect(row.insuranceCompanyId).toBe("ins-999");
    expect(row.policyMode).toBe("RENEWAL");
    expect(row.step).toBe("customer");
  });

  it("total audit row count = 1 CREATE + N UPDATEs after multiple updates", async () => {
    const draft = await createDraftIntake(db, ctx, { step: "insurer" });
    await updateDraftIntake(db, ctx, draft.id, { step: "customer" });
    await updateDraftIntake(db, ctx, draft.id, { step: "upload" });

    const logs = await db.auditLog.findMany({
      where: { subjectType: "DraftIntake", subjectId: draft.id },
      orderBy: { createdAt: "asc" },
    });

    expect(logs).toHaveLength(3); // 1 CREATE + 2 UPDATE
    expect(logs[0]!.action).toBe("CREATE");
    expect(logs[1]!.action).toBe("UPDATE");
    expect(logs[2]!.action).toBe("UPDATE");
  });
});

describe("getDraftIntake", () => {
  it("returns the persisted draft by id", async () => {
    const draft = await createDraftIntake(db, ctx, {
      step: "review",
      verified: { nationalId: true },
    });

    const fetched = await getDraftIntake(db, draft.id);

    expect(fetched.id).toBe(draft.id);
    expect(fetched.step).toBe("review");
    expect(fetched.verified).toStrictEqual({ nationalId: true });
  });

  it("throws if the id does not exist", async () => {
    await expect(
      getDraftIntake(db, "non-existent-id-xxx"),
    ).rejects.toThrow();
  });
});
