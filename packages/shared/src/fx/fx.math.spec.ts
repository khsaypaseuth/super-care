/**
 * fx.math.spec.ts — RED phase: failing tests for FX quote (FX-02 / FX-03)
 *
 * Tests are written first per TDD mandate (§A3 Engineering Standards).
 * Vector table covers all research rows: FX-a..FX-d, TH-a, TH-b, drift, null-rate-throw.
 *
 * Load-bearing rule:
 *   LA market: collected LAK = ceil(premiumThb × (sourceRate + 15kips/unit))
 *   TH market: collected THB = premiumThb unchanged (NO conversion, NO markup — direction rule)
 */
import { describe, it, expect } from "vitest";
import Big from "big.js";
import { quote, MARKUP_KIPS_PER_RATE_UNIT, type FxQuoteResult } from "./fx.math.js";

describe("FX quote — direction rule + per-rate markup + ceil (FX-02/FX-03)", () => {
  /**
   * === VECTOR TABLE: Research FX Math Test Vectors ===
   *
   * From .planning/phases/01-foundation-money-legal-cores/01-RESEARCH.md
   *
   * | # | market | premiumThb | sourceRate | adjusted | expected collected | rule |
   * |---|--------|-----------|------------|----------|--------------------|----- |
   * | FX-a | LA | 1000 | 250 | 265 | 265000 LAK | rate+15, ×premium, exact |
   * | FX-b | LA | 1000 | 250.0001 | 265.0001 | 265001 LAK | ceil (not round/floor) |
   * | FX-c | LA | 333 | 250 | 265 | 88245 LAK | exact, no rounding needed |
   * | FX-d | LA | 1 | 250.5 | 265.5 | 266 LAK | sub-unit forces ceil to whole kip |
   * | TH-a | TH | 1000 | (n/a) | (n/a) | 1000 THB | direction rule: no conversion |
   * | TH-b | TH | 1499.50 | ignored | ignored | 1499.50 THB | satang preserved; no markup |
   * | drift | LA | 0.3 | 10 | 25 | 8 LAK (7.5 ceils to 8) | Big: exact; no float drift |
   */

  describe("LA market — THB→LAK with markup + ceil", () => {
    it("FX-a: 1000 THB at rate 250 → 265000 LAK (rate+15, exact)", () => {
      const result = quote("LA", new Big("1000"), new Big("250"));
      expect(result.market).toBe("LA");
      expect(result.collected.currency).toBe("LAK");
      expect(result.collected.amount.eq(new Big("265000"))).toBe(true);
      expect(result.sourceRatePerThb).not.toBeNull();
      expect(result.adjustedRatePerThb).not.toBeNull();
    });

    it("FX-b: 1000 THB at rate 250.0001 → 265001 LAK (ceil, NOT round/floor)", () => {
      // 1000 × 265.0001 = 265000.1 → ceil = 265001
      // This would be 265000 with floor/round-half, proving we use ceil
      const result = quote("LA", new Big("1000"), new Big("250.0001"));
      expect(result.collected.currency).toBe("LAK");
      expect(result.collected.amount.eq(new Big("265001"))).toBe(true);
    });

    it("FX-c: 333 THB at rate 250 → 88245 LAK (exact, no rounding)", () => {
      // 333 × (250+15) = 333 × 265 = 88245 (exact whole number)
      const result = quote("LA", new Big("333"), new Big("250"));
      expect(result.collected.amount.eq(new Big("88245"))).toBe(true);
    });

    it("FX-d: 1 THB at rate 250.5 → 266 LAK (sub-unit forces ceil)", () => {
      // 1 × (250.5+15) = 1 × 265.5 = 265.5 → ceil = 266
      const result = quote("LA", new Big("1"), new Big("250.5"));
      expect(result.collected.amount.eq(new Big("266"))).toBe(true);
    });

    it("LA result has populated sourceRatePerThb and adjustedRatePerThb", () => {
      const result = quote("LA", new Big("1000"), new Big("250"));
      expect(result.sourceRatePerThb).not.toBeNull();
      expect(result.adjustedRatePerThb).not.toBeNull();
      // adjusted = source + 15
      expect(result.adjustedRatePerThb!.eq(new Big("265"))).toBe(true);
      expect(result.sourceRatePerThb!.eq(new Big("250"))).toBe(true);
    });
  });

  describe("TH market — direction rule: no conversion, no markup (FX-03)", () => {
    it("TH-a: 1000 THB → 1000 THB collected, rate fields null", () => {
      const result = quote("TH", new Big("1000"), null);
      expect(result.market).toBe("TH");
      expect(result.collected.currency).toBe("THB");
      expect(result.collected.amount.eq(new Big("1000"))).toBe(true);
      expect(result.sourceRatePerThb).toBeNull();
      expect(result.adjustedRatePerThb).toBeNull();
    });

    it("TH-b: 1499.50 THB → 1499.50 THB unchanged (satang preserved, no markup)", () => {
      const result = quote("TH", new Big("1499.50"), null);
      expect(result.collected.amount.eq(new Big("1499.50"))).toBe(true);
      expect(result.collected.currency).toBe("THB");
    });

    it("TH with a passed rate still returns null rate fields and no markup (direction rule)", () => {
      // Even if a source rate is provided, the TH path MUST ignore it
      const result = quote("TH", new Big("1000"), new Big("250"));
      expect(result.sourceRatePerThb).toBeNull();
      expect(result.adjustedRatePerThb).toBeNull();
      expect(result.collected.currency).toBe("THB");
      expect(result.collected.amount.eq(new Big("1000"))).toBe(true);
    });
  });

  describe("float-drift proof: Big is exact", () => {
    it("drift: Big ensures no float precision loss in FX math", () => {
      // 0.1 + 0.2 = 0.3 as Big; 0.3 * (10+15) = 0.3 * 25 = 7.5; ceil(7.5) = 8 LAK
      // With JS number: (0.1 + 0.2) = 0.30000000000000004; result would differ
      const premiumBig = new Big("0.1").plus(new Big("0.2")); // exact 0.3
      const result = quote("LA", premiumBig, new Big("10"));
      // 0.3 × 25 = 7.5 → ceil = 8
      expect(result.collected.amount.eq(new Big("8"))).toBe(true);
    });
  });

  describe("null rate on LA market — throws (T-02-04 mitigated)", () => {
    it("throws when LA market has a null source rate", () => {
      expect(() => quote("LA", new Big("1000"), null)).toThrow(
        /LA market requires a source rate/i,
      );
    });
  });

  describe("MARKUP_KIPS_PER_RATE_UNIT constant", () => {
    it("is defined as a Big with value 15", () => {
      expect(MARKUP_KIPS_PER_RATE_UNIT instanceof Big).toBe(true);
      expect(MARKUP_KIPS_PER_RATE_UNIT.eq(new Big("15"))).toBe(true);
    });
  });

  describe("FxQuoteResult shape", () => {
    it("LA result shape matches FxQuoteResult interface", () => {
      const result: FxQuoteResult = quote("LA", new Big("1000"), new Big("250"));
      expect(result).toMatchObject({
        market: "LA",
        collected: { currency: "LAK" },
      });
      expect(result.premiumThb instanceof Big).toBe(true);
    });

    it("TH result shape matches FxQuoteResult interface", () => {
      const result: FxQuoteResult = quote("TH", new Big("500"), null);
      expect(result).toMatchObject({
        market: "TH",
        sourceRatePerThb: null,
        adjustedRatePerThb: null,
        collected: { currency: "THB" },
      });
    });
  });
});
