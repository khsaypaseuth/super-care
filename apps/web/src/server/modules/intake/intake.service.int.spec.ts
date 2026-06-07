/**
 * intake.service integration tests (CUST-07, CMI-02, CUST-01/02, VEH-01)
 *
 * Tests:
 *   (a) saveIntake REJECTS and persists NOTHING when a required field is unverified
 *   (b) happy-path saveIntake persists Lead→Customer + IdentityDocument + Vehicle
 *       with verifiedBy/verifiedAt set and audit rows, all in one transaction
 *   (c) startIntake records insurer + New/Renewal on the DraftIntake (CMI-02)
 *
 * Runs against the test database (TEST_DATABASE_URL → DATABASE_URL via integration config).
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { createTestDb, deployTestSchema, truncateAll } from "../../../test/db-harness.js";
import { VerifyGateError } from "./verify-gate.js";
import {
  startIntake,
  setVerified,
  saveIntake,
  captureCustomer,
  setVehicleDraft,
} from "./intake.service.js";
import type { PrismaClient } from "../../../generated/prisma/client.js";
import { CryptoService } from "../../crypto/crypto.service.js";
import { EnvKeyProvider } from "../../crypto/env-key-provider.js";

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

// ─── Helpers ───────────────────────────────────────────────────────────────────

/** Set up a valid Lead in the DB for test use */
async function createTestLead() {
  return db.lead.create({
    data: { email: "test@example.com", phone: "+66812345678" },
  });
}

/** Seed an InsuranceCompany for tests that need one */
async function seedInsuranceCompany() {
  return db.insuranceCompany.create({
    data: { code: "TEST-INS", name: "Test Insurance Co." },
  });
}

// A valid Thai national ID (checksum correct: 1101400300328)
const VALID_NATIONAL_ID = "1101400300328";
// A valid chassis number
const VALID_CHASSIS = "1HGBH41JXMN109186";
// A valid engine number
const VALID_ENGINE = "1NZ-FE12345";
// A valid plate string
const VALID_PLATE = "กข 1234";

// ─── startIntake (CMI-02) ───────────────────────────────────────────────────────

describe("startIntake", () => {
  it("creates a DraftIntake with the given insurer + policyMode", async () => {
    const insurer = await seedInsuranceCompany();

    const draft = await startIntake(db, ctx, {
      insuranceCompanyId: insurer.id,
      policyMode: "NEW",
    });

    expect(draft.id).toBeTruthy();
    expect(draft.insuranceCompanyId).toBe(insurer.id);
    expect(draft.policyMode).toBe("NEW");
    expect(draft.step).toBe("insurer");
  });

  it("creates a DraftIntake with RENEWAL policyMode", async () => {
    const insurer = await seedInsuranceCompany();

    const draft = await startIntake(db, ctx, {
      insuranceCompanyId: insurer.id,
      policyMode: "RENEWAL",
    });

    expect(draft.policyMode).toBe("RENEWAL");
  });

  it("writes an audit CREATE row for the DraftIntake", async () => {
    const insurer = await seedInsuranceCompany();
    const draft = await startIntake(db, ctx, { insuranceCompanyId: insurer.id, policyMode: "NEW" });

    const logs = await db.auditLog.findMany({
      where: { subjectType: "DraftIntake", subjectId: draft.id, action: "CREATE" },
    });
    expect(logs).toHaveLength(1);
    expect(logs[0]!.actor).toBe("test");
  });
});

// ─── saveIntake — gate rejects (T-03-15) ──────────────────────────────────────

describe("saveIntake — REJECTS and persists NOTHING on gate failure", () => {
  it("throws VerifyGateError and leaves no Customer/Vehicle when chassisNumber is unverified", async () => {
    const insurer = await seedInsuranceCompany();
    const lead = await createTestLead();

    // Start draft and capture enough state
    const draft = await startIntake(db, ctx, {
      insuranceCompanyId: insurer.id,
      policyMode: "NEW",
    });

    // Capture customer info (sets leadId on draft)
    await captureCustomer(db, ctx, draft.id, {
      firstName: "ทดสอบ",
      lastName: "นามสกุล",
      cardTypeCode: "1",
      nationalId: VALID_NATIONAL_ID,
      dob: "1990-01-01",
    }, lead.id, crypto);

    // Set vehicle draft
    await setVehicleDraft(db, ctx, draft.id, {
      plateNumber: VALID_PLATE,
      chassisNumber: VALID_CHASSIS,
      engineNumber: VALID_ENGINE,
    });

    // Set verified — omit chassisNumber (not verified)
    await setVerified(db, ctx, draft.id, {
      nationalId: true,
      firstName: true,
      lastName: true,
      dob: true,
      plate: true,
      // chassisNumber: missing/false
      engineNumber: true,
    });

    // Count rows before failed save
    const customersBefore = await db.customer.count();
    const vehiclesBefore = await db.vehicle.count();

    // Must throw
    await expect(saveIntake(db, ctx, draft.id, crypto)).rejects.toThrow(VerifyGateError);

    // Nothing should have been persisted
    const customersAfter = await db.customer.count();
    const vehiclesAfter = await db.vehicle.count();

    expect(customersAfter).toBe(customersBefore); // no new customer row
    expect(vehiclesAfter).toBe(vehiclesBefore);   // no new vehicle row
  });

  it("throws VerifyGateError and persists nothing when a required identifier is invalid (client-bypass)", async () => {
    const insurer = await seedInsuranceCompany();
    const lead = await createTestLead();

    const draft = await startIntake(db, ctx, {
      insuranceCompanyId: insurer.id,
      policyMode: "NEW",
    });

    await captureCustomer(db, ctx, draft.id, {
      firstName: "ทดสอบ",
      lastName: "นามสกุล",
      cardTypeCode: "1",
      nationalId: "0000000000000", // invalid checksum — Pitfall 5
      dob: "1990-01-01",
    }, lead.id, crypto);

    await setVehicleDraft(db, ctx, draft.id, {
      plateNumber: VALID_PLATE,
      chassisNumber: VALID_CHASSIS,
      engineNumber: VALID_ENGINE,
    });

    // Client claims everything is verified (simulating client-bypass attack)
    await setVerified(db, ctx, draft.id, {
      nationalId: true,
      firstName: true,
      lastName: true,
      dob: true,
      plate: true,
      chassisNumber: true,
      engineNumber: true,
    });

    const customersBefore = await db.customer.count();
    const vehiclesBefore = await db.vehicle.count();

    // Gate must catch the invalid national ID and throw
    await expect(saveIntake(db, ctx, draft.id, crypto)).rejects.toThrow(VerifyGateError);

    // Nothing persisted
    const customersAfter = await db.customer.count();
    const vehiclesAfter = await db.vehicle.count();
    expect(customersAfter).toBe(customersBefore);
    expect(vehiclesAfter).toBe(vehiclesBefore);
  });
});

// ─── saveIntake — happy path (transactional persist) ─────────────────────────

describe("saveIntake — happy path: transactional persist", () => {
  it("persists Lead→Customer + IdentityDocument + Vehicle with verifiedBy/At set and audit rows", async () => {
    const insurer = await seedInsuranceCompany();
    const lead = await createTestLead();

    // 1. Start intake
    const draft = await startIntake(db, ctx, {
      insuranceCompanyId: insurer.id,
      policyMode: "NEW",
    });

    // 2. Capture customer data (links lead to draft)
    await captureCustomer(db, ctx, draft.id, {
      firstName: "ทดสอบ",
      lastName: "นามสกุล",
      cardTypeCode: "1",
      nationalId: VALID_NATIONAL_ID,
      dob: "1990-01-01",
    }, lead.id, crypto);

    // 3. Set vehicle draft data
    await setVehicleDraft(db, ctx, draft.id, {
      plateNumber: VALID_PLATE,
      chassisNumber: VALID_CHASSIS,
      engineNumber: VALID_ENGINE,
    });

    // 4. Verify all required fields
    await setVerified(db, ctx, draft.id, {
      nationalId: true,
      firstName: true,
      lastName: true,
      dob: true,
      plate: true,
      chassisNumber: true,
      engineNumber: true,
    });

    // 5. Save — must succeed
    const result = await saveIntake(db, ctx, draft.id, crypto);

    // Customer was created and linked to the Lead
    expect(result.customer.id).toBeTruthy();
    expect(result.customer.firstName).toBe("ทดสอบ");
    expect(result.customer.lastName).toBe("นามสกุล");
    expect(result.customer.verifiedBy).toBe("test"); // ctx.actor
    expect(result.customer.verifiedAt).toBeInstanceOf(Date);

    // Lead was converted (customerId set, convertedAt set)
    const updatedLead = await db.lead.findUniqueOrThrow({ where: { id: lead.id } });
    expect(updatedLead.customerId).toBe(result.customer.id);
    expect(updatedLead.convertedAt).toBeInstanceOf(Date);

    // IdentityDocument was created
    expect(result.identityDocument.id).toBeTruthy();
    expect(result.identityDocument.customerId).toBe(result.customer.id);

    // Vehicle was created
    expect(result.vehicle.id).toBeTruthy();
    expect(result.vehicle.customerId).toBe(result.customer.id);
    expect(result.vehicle.verifiedBy).toBe("test");
    expect(result.vehicle.verifiedAt).toBeInstanceOf(Date);

    // Audit rows exist for all persisted entities
    const customerAuditLogs = await db.auditLog.findMany({
      where: { subjectType: "Customer", subjectId: result.customer.id },
    });
    expect(customerAuditLogs.length).toBeGreaterThanOrEqual(1);

    const vehicleAuditLogs = await db.auditLog.findMany({
      where: { subjectType: "Vehicle", subjectId: result.vehicle.id },
    });
    expect(vehicleAuditLogs.length).toBeGreaterThanOrEqual(1);
  });

  it("encrypts chassisNumber in the persisted Vehicle row (CUST-07 audit + PII)", async () => {
    const insurer = await seedInsuranceCompany();
    const lead = await createTestLead();

    const draft = await startIntake(db, ctx, { insuranceCompanyId: insurer.id, policyMode: "NEW" });

    await captureCustomer(db, ctx, draft.id, {
      firstName: "Test",
      lastName: "Encrypt",
      cardTypeCode: "1",
      nationalId: VALID_NATIONAL_ID,
      dob: "1990-01-01",
    }, lead.id, crypto);

    await setVehicleDraft(db, ctx, draft.id, {
      plateNumber: VALID_PLATE,
      chassisNumber: VALID_CHASSIS,
      engineNumber: VALID_ENGINE,
    });

    await setVerified(db, ctx, draft.id, {
      nationalId: true,
      firstName: true,
      lastName: true,
      dob: true,
      plate: true,
      chassisNumber: true,
      engineNumber: true,
    });

    const result = await saveIntake(db, ctx, draft.id, crypto);

    // Fetch raw DB row and check chassis is stored as envelope
    const vehicleRow = await db.vehicle.findUniqueOrThrow({ where: { id: result.vehicle.id } });
    expect(vehicleRow.chassisNumber).not.toBeNull();
    expect(vehicleRow.chassisNumber).toMatch(/^v\d+:/); // CryptoService envelope format
    expect(vehicleRow.chassisNumber).not.toBe(VALID_CHASSIS); // never plaintext

    // Similarly for nationalId on customer
    const customerRow = await db.customer.findUniqueOrThrow({ where: { id: result.customer.id } });
    expect(customerRow.nationalId).toMatch(/^v\d+:/);
  });
});
