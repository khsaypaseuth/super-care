/**
 * verify-gate unit tests (CUST-07)
 *
 * RED phase: these tests are written before the implementation.
 *
 * Coverage:
 *   - assertVerified throws VerifyGateError listing unverified fields when any REQUIRED_VERIFY_FIELD is missing
 *   - assertVerified throws when a required identifier is invalid even if the client marked it "verified" (Pitfall 5)
 *   - assertVerified passes when all required fields are verified AND the identifiers are valid
 */

import { describe, it, expect } from "vitest";
import {
  REQUIRED_VERIFY_FIELDS,
  VerifyGateError,
  assertVerified,
} from "./verify-gate.js";

// ─── Test helpers ──────────────────────────────────────────────────────────────

/** A minimal state with all required fields verified and valid identifier values. */
function allVerifiedState() {
  return {
    verified: {
      nationalId: true,
      firstName: true,
      lastName: true,
      dob: true,
      plate: true,
      chassisNumber: true,
      engineNumber: true,
    } as Record<string, boolean>,
    values: {
      // Valid Thai national ID (checksum correct for this 13-digit number)
      nationalId: "1234567890121",
      // Valid passport (fallback — only one of nationalId/passport is required per card type)
      passportNumber: "AB123456",
      firstName: "Test",
      lastName: "User",
      dob: "1990-01-01",
      // Valid plate: Thai characters + digits
      plate: "กข 1234",
      // Valid chassis: VIN-safe alphanumeric, 6–17 chars
      chassisNumber: "1HGBH41JXMN109186",
      // Valid engine number: uppercase alphanumeric + hyphen, 4–20 chars
      engineNumber: "1NZ-FE12345",
    } as Record<string, string | undefined>,
    // Card type code: "1" = Thai national ID card (drives which identifier to re-validate)
    cardTypeCode: "1" as string,
  };
}

// ─── REQUIRED_VERIFY_FIELDS ────────────────────────────────────────────────────

describe("REQUIRED_VERIFY_FIELDS", () => {
  it("contains all seven required fields", () => {
    expect(REQUIRED_VERIFY_FIELDS).toContain("nationalId");
    expect(REQUIRED_VERIFY_FIELDS).toContain("firstName");
    expect(REQUIRED_VERIFY_FIELDS).toContain("lastName");
    expect(REQUIRED_VERIFY_FIELDS).toContain("dob");
    expect(REQUIRED_VERIFY_FIELDS).toContain("plate");
    expect(REQUIRED_VERIFY_FIELDS).toContain("chassisNumber");
    expect(REQUIRED_VERIFY_FIELDS).toContain("engineNumber");
  });

  it("has exactly 7 required fields", () => {
    expect(REQUIRED_VERIFY_FIELDS).toHaveLength(7);
  });
});

// ─── assertVerified — unverified field cases ───────────────────────────────────

describe("assertVerified — throws on unverified required field", () => {
  it("throws VerifyGateError when 'chassisNumber' is not verified", () => {
    const state = allVerifiedState();
    state.verified["chassisNumber"] = false;

    expect(() => assertVerified(state)).toThrow(VerifyGateError);
  });

  it("lists 'chassisNumber' in the unverified fields of the error", () => {
    const state = allVerifiedState();
    state.verified["chassisNumber"] = false;

    try {
      assertVerified(state);
      expect.fail("Expected VerifyGateError to be thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(VerifyGateError);
      expect((err as VerifyGateError).unverifiedFields).toContain("chassisNumber");
    }
  });

  it("throws when 'nationalId' is missing from the verified map", () => {
    const state = allVerifiedState();
    // Remove the key entirely (not present = not verified)
    delete state.verified["nationalId"];

    expect(() => assertVerified(state)).toThrow(VerifyGateError);
  });

  it("throws when 'firstName' is false", () => {
    const state = allVerifiedState();
    state.verified["firstName"] = false;

    try {
      assertVerified(state);
      expect.fail("Expected VerifyGateError");
    } catch (err) {
      expect(err).toBeInstanceOf(VerifyGateError);
      expect((err as VerifyGateError).unverifiedFields).toContain("firstName");
    }
  });

  it("throws listing all three unverified fields when multiple fields unverified", () => {
    const state = allVerifiedState();
    state.verified["chassisNumber"] = false;
    state.verified["engineNumber"] = false;
    state.verified["dob"] = false;

    try {
      assertVerified(state);
      expect.fail("Expected VerifyGateError");
    } catch (err) {
      expect(err).toBeInstanceOf(VerifyGateError);
      const fields = (err as VerifyGateError).unverifiedFields;
      expect(fields).toContain("chassisNumber");
      expect(fields).toContain("engineNumber");
      expect(fields).toContain("dob");
    }
  });
});

// ─── assertVerified — server-side identifier re-validation (Pitfall 5) ──────────

describe("assertVerified — server-side identifier re-validation (Pitfall 5)", () => {
  it("throws VerifyGateError even when nationalId is marked verified=true but the value is invalid", () => {
    const state = allVerifiedState();
    // Client claims verified but the value is not a valid Thai national ID
    state.verified["nationalId"] = true;
    state.values["nationalId"] = "0000000000000"; // fails checksum

    expect(() => assertVerified(state)).toThrow(VerifyGateError);
  });

  it("error message indicates the identifier failed server-side validation, not just unverified", () => {
    const state = allVerifiedState();
    state.values["nationalId"] = "1111111111111"; // invalid checksum

    try {
      assertVerified(state);
      expect.fail("Expected VerifyGateError");
    } catch (err) {
      expect(err).toBeInstanceOf(VerifyGateError);
      // The error should mention the field that failed re-validation
      const e = err as VerifyGateError;
      expect(e.invalidIdentifiers.length).toBeGreaterThan(0);
    }
  });

  it("throws when chassisNumber is marked verified=true but the format is invalid", () => {
    const state = allVerifiedState();
    state.values["chassisNumber"] = "!!!INVALID!!!"; // not VIN-safe

    expect(() => assertVerified(state)).toThrow(VerifyGateError);
  });

  it("throws when engineNumber is marked verified=true but the format is invalid", () => {
    const state = allVerifiedState();
    state.values["engineNumber"] = "bad engine#"; // has space and #

    expect(() => assertVerified(state)).toThrow(VerifyGateError);
  });

  it("throws when plate is marked verified=true but the format is invalid", () => {
    const state = allVerifiedState();
    state.values["plate"] = ""; // too short (length < 2)

    expect(() => assertVerified(state)).toThrow(VerifyGateError);
  });

  it("for card type '2' (passport), re-validates passportNumber instead of nationalId", () => {
    const state = allVerifiedState();
    state.cardTypeCode = "2"; // passport card type
    // Remove nationalId from verified (not required for passport card type)
    state.verified["nationalId"] = false;
    // passport IS verified but value is invalid
    state.verified["passportNumber"] = true;
    state.values["passportNumber"] = "x"; // too short — fails passport validator

    expect(() => assertVerified(state)).toThrow(VerifyGateError);
  });
});

// ─── assertVerified — happy path ──────────────────────────────────────────────

describe("assertVerified — passes when all required fields verified and valid", () => {
  it("does not throw when all fields are verified and identifiers are valid", () => {
    const state = allVerifiedState();
    // Should not throw
    expect(() => assertVerified(state)).not.toThrow();
  });

  it("does not throw with passport card type when passportNumber is verified+valid", () => {
    const state = allVerifiedState();
    state.cardTypeCode = "2"; // passport
    state.verified["nationalId"] = false; // not required for passport
    state.verified["passportNumber"] = true;
    state.values["passportNumber"] = "AB123456"; // valid passport

    expect(() => assertVerified(state)).not.toThrow();
  });
});
