/**
 * Chassis / VIN format validator — test vectors (VEH-02)
 *
 * Rule: alphanumeric excluding I, O, Q (VIN convention to avoid 0/O confusion);
 * uppercase; length 6–17 (regional/older vehicles may be <17 — do NOT hard-require 17).
 * [ASSUMED A4: length 6–17 — pragmatic baseline; exact minimum may vary by region]
 *
 * Key rejection: the letter O (not zero) in position triggers the I/O/Q exclusion.
 * This prevents O↔0 transcription errors (the critical C4 vector in the research table).
 *
 * RED phase: all tests fail until chassis.ts is implemented.
 */
import { describe, it, expect } from "vitest";
import { isValidChassis } from "./chassis.js";

describe("isValidChassis", () => {
  // ── VALID cases ──────────────────────────────────────────────────────────
  it("C1: 1HGCM82633A004352 is valid (standard 17-char VIN)", () => {
    expect(isValidChassis("1HGCM82633A004352")).toBe(true);
  });

  it("C2: MR053EE00X1234567 is valid (17-char regional VIN)", () => {
    expect(isValidChassis("MR053EE00X1234567")).toBe(true);
  });

  it("C3: ABC123456 is valid (shorter regional chassis, 9 chars)", () => {
    expect(isValidChassis("ABC123456")).toBe(true);
  });

  // ── INVALID cases ─────────────────────────────────────────────────────────
  it("C4: 1HGCM82633A0O4352 is invalid (contains letter O — VIN-forbidden)", () => {
    // The 13th character is the letter O (capital letter O, not zero)
    expect(isValidChassis("1HGCM82633A0O4352")).toBe(false);
  });

  it("C5: 12345 is invalid (too short — only 5 chars, minimum is 6)", () => {
    expect(isValidChassis("12345")).toBe(false);
  });

  it("C6: abc123 is invalid (lowercase)", () => {
    expect(isValidChassis("abc123")).toBe(false);
  });
});
