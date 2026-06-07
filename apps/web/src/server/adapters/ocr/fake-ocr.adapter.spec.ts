/**
 * FakeOcrAdapter unit tests.
 *
 * Contracts asserted:
 * 1. Returned OcrResultRaw is shape-valid per OcrResultRawSchema (all 15 keys, string|null values).
 * 2. Values are byte-identical to the fixture — NO cleaning (trimming/uppercasing/normalization).
 * 3. A value with leading whitespace survives untrimmed (raw-never-cleaned contract, CUST-04/CMI-03).
 */

import { describe, it, expect } from "vitest";
import { FakeOcrAdapter } from "./fake-ocr.adapter.js";
import { OcrResultRawSchema } from "./ocr.port.js";
import { FAKE_REGBOOK_RESULT } from "./fixtures/regbook.js";

const fakeFile = { bytes: Buffer.from("dummy"), mime: "image/jpeg" };

describe("FakeOcrAdapter", () => {
  it("returns a shape-valid OcrResultRaw", async () => {
    const adapter = new FakeOcrAdapter();
    const result = await adapter.extract("vehicle_registration_book", fakeFile);

    // Validate the SHAPE (all 15 keys, each string|null) — NOT the values themselves
    const parsed = OcrResultRawSchema.safeParse(result);
    expect(parsed.success).toBe(true);
  });

  it("returns values byte-identical to the fixture — no cleaning applied", async () => {
    const adapter = new FakeOcrAdapter();
    const result = await adapter.extract("vehicle_registration_book", fakeFile);

    // Every field must be exactly the fixture value (no trimming, no uppercasing)
    expect(result).toStrictEqual(FAKE_REGBOOK_RESULT);
  });

  it("ownerName has leading whitespace — survives untrimmed (raw-never-cleaned)", async () => {
    const adapter = new FakeOcrAdapter();
    const result = await adapter.extract("vehicle_registration_book", fakeFile);

    // The fixture ownerName starts with a space — must not be trimmed
    expect(result.ownerName).toBe(FAKE_REGBOOK_RESULT.ownerName);
    expect(result.ownerName).toMatch(/^ /); // still has leading space
    expect(result.ownerName?.trimStart()).not.toBe(result.ownerName); // trimmed ≠ raw
  });

  it("falls back to the default result for unknown document types", async () => {
    const adapter = new FakeOcrAdapter();
    const result = await adapter.extract("unknown_document_type", fakeFile);

    // Unknown type falls back to the default reg-book fixture
    expect(result).toStrictEqual(FAKE_REGBOOK_RESULT);
  });

  it("all 15 OCR fields from CMI-SPEC.md are present in the result", async () => {
    const adapter = new FakeOcrAdapter();
    const result = await adapter.extract("vehicle_registration_book", fakeFile);

    const expectedKeys: (keyof typeof result)[] = [
      "ownerName",
      "ownerAddress",
      "idCardNumber",
      "passportNumber",
      "vehicleRegistrationNumber",
      "province",
      "vehicleBrand",
      "vehicleModel",
      "vehicleYear",
      "chassisNumber",
      "engineNumber",
      "engineCapacity",
      "vehicleWeight",
      "seatCount",
      "vehicleColor",
    ];

    for (const key of expectedKeys) {
      expect(result).toHaveProperty(key);
    }
  });
});
