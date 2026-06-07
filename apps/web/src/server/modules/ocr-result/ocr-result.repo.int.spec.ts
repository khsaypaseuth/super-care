/**
 * ocr-result.repo integration tests
 *
 * Tests: verbatim rawPayload persistence (byte-equality, no trim/upper/normalize),
 * audit-in-tx, and provider defaulting.
 *
 * Runs against the test database (TEST_DATABASE_URL → DATABASE_URL via integration config).
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { createTestDb, deployTestSchema, truncateAll } from "../../../test/db-harness.js";
import { createCustomer } from "../customer/customer.repo.js";
import { createIdentityDocument } from "../identity-document/identity-document.repo.js";
import { createOcrResult } from "./ocr-result.repo.js";
import type { PrismaClient } from "../../../generated/prisma/client.js";
import { CryptoService } from "../../crypto/crypto.service.js";
import { EnvKeyProvider } from "../../crypto/env-key-provider.js";

const db: PrismaClient = createTestDb();
const crypto = new CryptoService(new EnvKeyProvider());
const ctx = { actor: "test" };

// Helper: create the minimum prerequisite rows
async function createPrerequisites() {
  const customer = await createCustomer(db, ctx, {
    firstName: "OCR",
    lastName: "Test",
  }, crypto);
  const doc = await createIdentityDocument(db, ctx, {
    customerId: customer.id,
  }, crypto);
  return { customer, doc };
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

describe("createOcrResult", () => {
  it("stores rawPayload byte-for-byte verbatim (no trimming, no case change)", async () => {
    const { doc } = await createPrerequisites();

    // Include leading/trailing whitespace and mixed case — must survive unchanged
    const rawPayload = {
      ownerName: "  สมชาย  ใจดี  ",
      idNumber: "  1234567890123  ",
      plateNumber: "กข 1234",
      chassis: "abc123XYZ",
      UPPERCASE_KEY: "VALUE",
      nested: { key: "  whitespace  " },
    };

    const result = await createOcrResult(db, ctx, {
      identityDocumentId: doc.id,
      rawPayload,
    });

    // Fetch raw row to compare stored value
    const row = await db.ocrResult.findUniqueOrThrow({ where: { id: result.id } });
    const stored = row.rawPayload as typeof rawPayload;

    // Assert byte-for-byte equality including whitespace
    expect(stored["ownerName"]).toBe("  สมชาย  ใจดี  ");
    expect(stored["idNumber"]).toBe("  1234567890123  ");
    expect(stored["plateNumber"]).toBe("กข 1234");
    expect(stored["chassis"]).toBe("abc123XYZ");
    expect(stored["UPPERCASE_KEY"]).toBe("VALUE");
    expect((stored["nested"] as Record<string, string>)["key"]).toBe("  whitespace  ");

    // Deep equal assertion — the entire payload is identical
    expect(stored).toStrictEqual(rawPayload);
  });

  it("defaults provider to 'fake' when not specified", async () => {
    const { doc } = await createPrerequisites();
    const result = await createOcrResult(db, ctx, {
      identityDocumentId: doc.id,
      rawPayload: { field: "value" },
    });

    expect(result.provider).toBe("fake");
  });

  it("uses the specified provider when provided", async () => {
    const { doc } = await createPrerequisites();
    const result = await createOcrResult(db, ctx, {
      identityDocumentId: doc.id,
      rawPayload: { field: "value" },
      provider: "google_document_ai",
    });

    expect(result.provider).toBe("google_document_ai");
  });

  it("writes exactly one audit_logs row (action=CREATE) in the same tx", async () => {
    const { doc } = await createPrerequisites();
    const result = await createOcrResult(db, ctx, {
      identityDocumentId: doc.id,
      rawPayload: { test: "audit" },
    });

    const logs = await db.auditLog.findMany({
      where: { subjectType: "OcrResult", subjectId: result.id },
    });

    expect(logs).toHaveLength(1);
    expect(logs[0]!.actor).toBe("test");
    expect(logs[0]!.action).toBe("CREATE");
    expect(logs[0]!.subjectType).toBe("OcrResult");
    expect(logs[0]!.subjectId).toBe(result.id);
  });

  it("persists complex nested payload with arrays and mixed types verbatim", async () => {
    const { doc } = await createPrerequisites();

    const complex = {
      strings: ["  one  ", "TWO", "three"],
      number: 42,
      bool: true,
      nested: { deep: { deeper: "  value  " } },
      nullField: null,
    };

    const result = await createOcrResult(db, ctx, {
      identityDocumentId: doc.id,
      rawPayload: complex as Record<string, unknown>,
    });

    const row = await db.ocrResult.findUniqueOrThrow({ where: { id: result.id } });
    expect(row.rawPayload).toStrictEqual(complex);
  });
});
