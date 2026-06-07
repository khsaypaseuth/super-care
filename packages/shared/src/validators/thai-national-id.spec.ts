/**
 * Thai National ID checksum validator — test vectors (CUST-05)
 *
 * Algorithm: sum = Σ d[i]·(13−i) for i = 0..11 (weights 13, 12, …, 2)
 *            check = (11 − (sum mod 11)) mod 10
 *            Valid iff input is exactly 13 numeric digits AND d[12] === check
 *
 * RED phase: all tests fail until thai-national-id.ts is implemented.
 */
import { describe, it, expect } from "vitest";
import { isValidThaiNationalId } from "./thai-national-id.js";

describe("isValidThaiNationalId", () => {
  // ── VALID cases ──────────────────────────────────────────────────────────
  // V1–V3: check-digit-0 — these break implementations that skip the final %10
  it("V1: 1102000000000 is valid (check digit = 0, final mod 10 required)", () => {
    expect(isValidThaiNationalId("1102000000000")).toBe(true);
  });

  it("V2: 1000000000050 is valid (check digit = 0)", () => {
    expect(isValidThaiNationalId("1000000000050")).toBe(true);
  });

  it("V3: 1000000000190 is valid (check digit = 0)", () => {
    expect(isValidThaiNationalId("1000000000190")).toBe(true);
  });

  it("V4: 1101700230724 is valid (check digit = 4)", () => {
    expect(isValidThaiNationalId("1101700230724")).toBe(true);
  });

  it("V5: 3210200300001 is valid (leading digit 3, check digit = 1)", () => {
    expect(isValidThaiNationalId("3210200300001")).toBe(true);
  });

  it("V6: 1555000000009 is valid (check digit = 9)", () => {
    expect(isValidThaiNationalId("1555000000009")).toBe(true);
  });

  // ── INVALID cases — wrong shape ──────────────────────────────────────────
  it("I1: 110200000000 is invalid (12 digits — too short)", () => {
    expect(isValidThaiNationalId("110200000000")).toBe(false);
  });

  it("I2: 11020000000000 is invalid (14 digits — too long)", () => {
    expect(isValidThaiNationalId("11020000000000")).toBe(false);
  });

  it("I3: 11020000000O0 is invalid (letter O instead of digit)", () => {
    expect(isValidThaiNationalId("11020000000O0")).toBe(false);
  });

  it("I5: empty string is invalid", () => {
    expect(isValidThaiNationalId("")).toBe(false);
  });

  // ── INVALID cases — wrong check digit ────────────────────────────────────
  it("I4: 1102000000001 is invalid (check should be 0, not 1)", () => {
    expect(isValidThaiNationalId("1102000000001")).toBe(false);
  });

  it("I6: 1101700230705 is invalid (computed check is 8, not 5) — classic trap vector", () => {
    expect(isValidThaiNationalId("1101700230705")).toBe(false);
  });
});
