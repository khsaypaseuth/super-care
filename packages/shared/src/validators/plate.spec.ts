/**
 * Plate format validator — test vectors (VEH-02)
 *
 * Rule: allow Thai script (U+0E00–U+0E7F), Lao script (U+0E80–U+0EFF),
 * Latin A–Z, digits, spaces, and hyphens; length 2–20; reject empty/symbol-only.
 * A [A-Z0-9]-only regex is WRONG — Thai/Lao-script plates must be accepted (Pitfall 4).
 * [ASSUMED A4: length 2–20 — pragmatic baseline]
 *
 * RED phase: all tests fail until plate.ts is implemented.
 */
import { describe, it, expect } from "vitest";
import { isValidPlate } from "./plate.js";

describe("isValidPlate", () => {
  // ── VALID cases ──────────────────────────────────────────────────────────
  it("PL1: กข 1234 is valid (Thai-script plate with space)", () => {
    expect(isValidPlate("กข 1234")).toBe(true);
  });

  it("PL2: 1กก 5678 is valid (Thai plate with leading digit)", () => {
    expect(isValidPlate("1กก 5678")).toBe(true);
  });

  it("PL3: ກຂ 0123 is valid (Lao-script plate)", () => {
    expect(isValidPlate("ກຂ 0123")).toBe(true);
  });

  it("PL4: ABC-123 is valid (Latin plate with hyphen)", () => {
    expect(isValidPlate("ABC-123")).toBe(true);
  });

  // ── INVALID cases ─────────────────────────────────────────────────────────
  it("PL5: empty string is invalid", () => {
    expect(isValidPlate("")).toBe(false);
  });

  it("PL6: @@@ is invalid (symbol-only)", () => {
    expect(isValidPlate("@@@")).toBe(false);
  });
});
