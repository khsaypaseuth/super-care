/**
 * Engine number format validator — test vectors (VEH-02)
 *
 * Rule: alphanumeric + hyphen; uppercase; length 4–20 (engine numbers are less
 * standardised than VIN — keep permissive to avoid over-rejection).
 * Embedded spaces are always rejected.
 * [ASSUMED A4: length 4–20 — pragmatic baseline]
 *
 * RED phase: all tests fail until engine.ts is implemented.
 */
import { describe, it, expect } from "vitest";
import { isValidEngine } from "./engine.js";

describe("isValidEngine", () => {
  // ── VALID cases ──────────────────────────────────────────────────────────
  it("E1: 4G15-1234567 is valid (maker-prefixed engine number with hyphen)", () => {
    expect(isValidEngine("4G15-1234567")).toBe(true);
  });

  it("E2: K20A1234567 is valid (alphanumeric, no hyphen)", () => {
    expect(isValidEngine("K20A1234567")).toBe(true);
  });

  // ── INVALID cases ─────────────────────────────────────────────────────────
  it("E3: 12 is invalid (too short — only 2 chars, minimum is 4)", () => {
    expect(isValidEngine("12")).toBe(false);
  });

  it("E4: 'K20A 1234' is invalid (embedded space)", () => {
    expect(isValidEngine("K20A 1234")).toBe(false);
  });
});
