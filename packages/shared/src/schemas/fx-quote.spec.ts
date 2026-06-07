import { describe, it, expect } from "vitest";
import { fxQuoteSchema } from "./fx-quote.schema.js";

/**
 * Zod boundary-schema spec (PLAT-02).
 *
 * These tests prove that the fxQuoteSchema:
 * 1. Parses a valid LA quote (market LA, decimal-string amounts, currency LAK)
 * 2. Parses a valid TH quote (market TH, currency THB, null rate fields)
 * 3. REJECTS a JS-number money field (float money must never enter the boundary)
 * 4. REJECTS an unknown market value and a missing required field
 */

const VALID_LA_QUOTE = {
  market: "LA",
  premiumThb: "1000.00",
  sourceRatePerThb: "250",
  adjustedRatePerThb: "265",
  collected: {
    amount: "265000",
    currency: "LAK",
  },
  lockedAt: "2026-06-07T00:00:00.000Z",
};

const VALID_TH_QUOTE = {
  market: "TH",
  premiumThb: "1499.50",
  sourceRatePerThb: null,
  adjustedRatePerThb: null,
  collected: {
    amount: "1499.50",
    currency: "THB",
  },
  lockedAt: "2026-06-07T00:00:00.000Z",
};

describe("fxQuoteSchema", () => {
  it("parses a valid LA quote with decimal-string amounts and LAK currency", () => {
    const result = fxQuoteSchema.safeParse(VALID_LA_QUOTE);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.market).toBe("LA");
      expect(result.data.collected.currency).toBe("LAK");
      expect(result.data.premiumThb).toBe("1000.00");
    }
  });

  it("parses a valid TH quote with null rate fields and THB currency", () => {
    const result = fxQuoteSchema.safeParse(VALID_TH_QUOTE);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.market).toBe("TH");
      expect(result.data.collected.currency).toBe("THB");
      expect(result.data.sourceRatePerThb).toBeNull();
      expect(result.data.adjustedRatePerThb).toBeNull();
    }
  });

  it("REJECTS an object with a JS-number money field (float money must not enter the boundary)", () => {
    const withNumberMoney = {
      ...VALID_LA_QUOTE,
      // premiumThb as a JS number — the boundary must reject this
      premiumThb: 1000.0,
    };
    const result = fxQuoteSchema.safeParse(withNumberMoney);
    expect(result.success).toBe(false);
  });

  it("REJECTS a JS-number collected.amount field", () => {
    const withNumberAmount = {
      ...VALID_LA_QUOTE,
      collected: {
        amount: 265000, // number instead of string
        currency: "LAK",
      },
    };
    const result = fxQuoteSchema.safeParse(withNumberAmount);
    expect(result.success).toBe(false);
  });

  it("REJECTS an unknown market value", () => {
    const withBadMarket = {
      ...VALID_LA_QUOTE,
      market: "US", // not in enum
    };
    const result = fxQuoteSchema.safeParse(withBadMarket);
    expect(result.success).toBe(false);
  });

  it("REJECTS an object with a missing required field (premiumThb)", () => {
    const { premiumThb: _premiumThb, ...withoutPremium } = VALID_LA_QUOTE;
    const result = fxQuoteSchema.safeParse(withoutPremium);
    expect(result.success).toBe(false);
  });
});
