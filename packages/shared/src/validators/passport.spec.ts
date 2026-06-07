/**
 * Passport format validator — test vectors (CUST-06)
 *
 * Rule: uppercase A–Z and digits, length 6–9 (ICAO travel-document number is
 * up to 9 alphanumerics); no spaces or symbols; must NOT be tied to one country.
 * [ASSUMED A4: length range 6–9 — pragmatic baseline; confirm if edge real docs emerge]
 *
 * RED phase: all tests fail until passport.ts is implemented.
 */
import { describe, it, expect } from "vitest";
import { isValidPassport } from "./passport.js";

describe("isValidPassport", () => {
  // ── VALID cases ──────────────────────────────────────────────────────────
  it("P1: AA1234567 is valid (Thai passport — 2 letters + 7 digits)", () => {
    expect(isValidPassport("AA1234567")).toBe(true);
  });

  it("P2: P1234567 is valid (Lao passport shape — 1 letter + 7 digits)", () => {
    expect(isValidPassport("P1234567")).toBe(true);
  });

  it("P3: 123456789 is valid (all-digit foreign passport — must NOT over-reject)", () => {
    expect(isValidPassport("123456789")).toBe(true);
  });

  it("P4: E12345678 is valid (9-char alphanumeric — maximum length)", () => {
    expect(isValidPassport("E12345678")).toBe(true);
  });

  // ── INVALID cases ────────────────────────────────────────────────────────
  it("P5: ab123 is invalid (too short and lowercase)", () => {
    expect(isValidPassport("ab123")).toBe(false);
  });

  it("P6: 'AB 123456' is invalid (embedded space)", () => {
    expect(isValidPassport("AB 123456")).toBe(false);
  });

  it("P7: AB-123456 is invalid (symbol / hyphen)", () => {
    expect(isValidPassport("AB-123456")).toBe(false);
  });

  it("P8: empty string is invalid", () => {
    expect(isValidPassport("")).toBe(false);
  });
});
