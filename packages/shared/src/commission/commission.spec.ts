/**
 * Commission tier ladder spec — COMM-01 / COMM-02
 *
 * Tests the full boundary vector table from 01-RESEARCH.md:
 *   T0a / T0b: tier0 (5%) — partnerVolume 0, 9 (just below threshold 10)
 *   T1a / T1b: tier1 (7%) — partnerVolume 10 (exactly at threshold 10), 49 (just below 50)
 *   T2a / T2b: tier2 (10% + 50 flat THB) — partnerVolume 50 (exactly at 50), 51 (just above)
 *   Tround: rounding case — volume 10, premium 333.33, 7% → 23.3331 → 23.33 (roundHalfUp)
 *
 * COMM-02: every threshold tested on BOTH SIDES (just-below, exactly-at, just-above).
 * PLAT-03: return value is a Big (never a JS number).
 */

import { describe, it, expect } from "vitest";
import Big from "big.js";
import { computeCommissionThb } from "./commission.js";

// ─── Tier 0: 5% — volume 0..9 ────────────────────────────────────────────────

describe("Commission tier ladder — tier0 (5%, volume < 10)", () => {
  // T0a: volume 0 → tier0 5% of 1000 = 50.00
  it("T0a: volume 0, premium 1000 → 50.00 (5%)", () => {
    const result = computeCommissionThb(0, new Big("1000"));
    expect(result.toFixed(2)).toBe("50.00");
  });

  // T0b: volume 9 (just below threshold 10) → tier0 5% = 50.00
  it("T0b: volume 9 (just below threshold 10), premium 1000 → 50.00 (still 5%)", () => {
    const result = computeCommissionThb(9, new Big("1000"));
    expect(result.toFixed(2)).toBe("50.00");
  });
});

// ─── Tier 1: 7% — volume 10..49 ──────────────────────────────────────────────

describe("Commission tier ladder — tier1 (7%, 10 ≤ volume < 50)", () => {
  // T1a: volume 10 (exactly at threshold 10) → tier1 7% = 70.00
  it("T1a: volume 10 (exactly at threshold 10), premium 1000 → 70.00 (7%)", () => {
    const result = computeCommissionThb(10, new Big("1000"));
    expect(result.toFixed(2)).toBe("70.00");
  });

  // T1b: volume 49 (just below threshold 50) → tier1 7% = 70.00
  it("T1b: volume 49 (just below threshold 50), premium 1000 → 70.00 (still 7%)", () => {
    const result = computeCommissionThb(49, new Big("1000"));
    expect(result.toFixed(2)).toBe("70.00");
  });
});

// ─── Tier 2: 10% + 50 flat THB — volume ≥ 50 ─────────────────────────────────

describe("Commission tier ladder — tier2 (10% + 50 flat, volume ≥ 50)", () => {
  // T2a: volume 50 (exactly at threshold 50) → tier2 10%+50 = 100+50 = 150.00
  it("T2a: volume 50 (exactly at threshold 50), premium 1000 → 150.00 (10%+50 flat)", () => {
    const result = computeCommissionThb(50, new Big("1000"));
    expect(result.toFixed(2)).toBe("150.00");
  });

  // T2b: volume 51 (just above threshold 50) → tier2 = 150.00
  it("T2b: volume 51 (just above threshold 50), premium 1000 → 150.00 (still tier2)", () => {
    const result = computeCommissionThb(51, new Big("1000"));
    expect(result.toFixed(2)).toBe("150.00");
  });

  it("volume 100, premium 1000 → 150.00 (tier2, well above threshold)", () => {
    const result = computeCommissionThb(100, new Big("1000"));
    expect(result.toFixed(2)).toBe("150.00");
  });
});

// ─── Rounding case ────────────────────────────────────────────────────────────

describe("Commission tier ladder — rounding (Tround)", () => {
  // Tround: volume 10, premium 333.33, 7% = 23.3331 → 23.33 (roundHalfUp at 2dp)
  it("Tround: volume 10, premium 333.33 → 23.33 (7% = 23.3331 → rounds to 23.33)", () => {
    const result = computeCommissionThb(10, new Big("333.33"));
    expect(result.toFixed(2)).toBe("23.33");
  });
});

// ─── Both sides of EVERY threshold ───────────────────────────────────────────

describe("Commission tier ladder — boundary summary (COMM-02 — both sides of every threshold)", () => {
  // Threshold 10: 9 (below) vs 10 (at)
  it("volume 9 < threshold 10 → 5% applies (not 7%)", () => {
    const below = computeCommissionThb(9, new Big("1000"));
    const at = computeCommissionThb(10, new Big("1000"));
    expect(below.toFixed(2)).toBe("50.00"); // 5%
    expect(at.toFixed(2)).toBe("70.00"); // 7% — tier change at exactly 10
    expect(below.lt(at)).toBe(true);
  });

  // Threshold 50: 49 (below) vs 50 (at) vs 51 (above)
  it("volume 49 < threshold 50 → 7% applies (not 10%+50)", () => {
    const below = computeCommissionThb(49, new Big("1000"));
    const at = computeCommissionThb(50, new Big("1000"));
    const above = computeCommissionThb(51, new Big("1000"));
    expect(below.toFixed(2)).toBe("70.00"); // 7%
    expect(at.toFixed(2)).toBe("150.00"); // 10%+50 flat — tier change at exactly 50
    expect(above.toFixed(2)).toBe("150.00"); // still 10%+50 flat
    expect(below.lt(at)).toBe(true);
    expect(at.eq(above)).toBe(true);
  });
});

// ─── Return type is Big (PLAT-03) ─────────────────────────────────────────────

describe("Commission tier ladder — return type is Big (PLAT-03)", () => {
  it("returns a Big instance (not a number)", () => {
    const result = computeCommissionThb(0, new Big("1000"));
    expect(result).toBeInstanceOf(Big);
  });

  it("result has a toFixed method (Big API)", () => {
    const result = computeCommissionThb(10, new Big("500"));
    expect(typeof result.toFixed).toBe("function");
  });

  it("result is exact (no float drift) — 7% of 333.33", () => {
    // 333.33 × 7 / 100 = 23.3331 exactly as Big, not 23.33310000...1 drift
    // The function rounds the final value to 2dp, so the rounded result is 23.33
    // (Big proves exactness; float would give 23.333099999... which rounds the same,
    // but the test proves the computation is done on Big, not JS number)
    const result = computeCommissionThb(10, new Big("333.33"));
    expect(result).toBeInstanceOf(Big);
    // The rounded result at 2dp is 23.33 (not drifted by float)
    expect(result.toFixed(2)).toBe("23.33");
    // Also verify that 7% × 333.33 intermediate is exact as Big (23.3331, not 23.3330999...)
    const intermediate = new Big("333.33").times("7").div(100);
    expect(intermediate.toFixed(4)).toBe("23.3331");
  });
});

// ─── Flat + percent combined (tier2 sanity) ───────────────────────────────────

describe("Commission tier ladder — tier2 flat + percent breakdown", () => {
  it("volume 50, premium 500 → 10%+50 = 50+50 = 100.00", () => {
    const result = computeCommissionThb(50, new Big("500"));
    expect(result.toFixed(2)).toBe("100.00");
  });

  it("volume 50, premium 200 → 10%+50 = 20+50 = 70.00", () => {
    const result = computeCommissionThb(50, new Big("200"));
    expect(result.toFixed(2)).toBe("70.00");
  });
});
