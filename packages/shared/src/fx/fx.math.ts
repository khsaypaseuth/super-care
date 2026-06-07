/**
 * fx.math.ts — FX quote: direction rule + per-rate markup + ceil (FX-02 / FX-03)
 *
 * Load-bearing business rule:
 *   LA market (THB→LAK): collected = ceil(premiumThb × (sourceRate + 15 kips/unit))
 *   TH market (THB collection): passthrough — NO conversion, NO markup, rate fields null.
 *
 * Rounding: Big.roundUp (= ceil for positive money) is the ONLY rounding in this file.
 * It is applied once: to the LAK total at the FX-quote boundary.
 *
 * Markup placement: MARKUP_KIPS_PER_RATE_UNIT is added to the per-THB rate ONLY.
 * It is NEVER added to the THB amount or the LAK total directly.
 *
 * See .planning/phases/01-foundation-money-legal-cores/01-RESEARCH.md for the
 * verified test vector table (FX-a..FX-d, TH-a, TH-b, drift).
 */
import Big from "big.js";
import type { Currency, Market } from "../types/index.js";

/**
 * The per-rate-unit markup applied to the source LAK-per-THB rate.
 *
 * [ASSUMED A1]: "+15 kips per rate unit" means adding 15 to the LAK-per-THB source rate.
 * Most plausibly: source rate is quoted in whole LAK/THB, so +15 means +15 LAK/THB markup.
 * The function shape and vector math are locked; the magnitude depends on rate-feed unit
 * confirmation. If the unit interpretation changes, only this constant changes — not the math.
 *
 * Exported for reference/testing; should be referenced only from this module.
 */
export const MARKUP_KIPS_PER_RATE_UNIT = new Big("15"); // [ASSUMED A1]: rate unit = whole LAK/THB

/**
 * The result of an FX quote calculation.
 *
 * Field semantics:
 * - premiumThb: the original Premium in THB (the pricing basis)
 * - sourceRatePerThb: the live LAK/THB rate (null on TH-collection path)
 * - adjustedRatePerThb: sourceRate + 15 kips markup (null on TH-collection path)
 * - collected: the amount charged to the customer {amount: Big, currency}
 *
 * On the TH-collection path (direction rule FX-03):
 * - sourceRatePerThb = null, adjustedRatePerThb = null
 * - collected = {amount: premiumThb, currency: "THB"} (unchanged, satang preserved)
 */
export interface FxQuoteResult {
  market: Market;
  premiumThb: Big;
  sourceRatePerThb: Big | null;
  adjustedRatePerThb: Big | null;
  collected: { amount: Big; currency: Currency };
}

/**
 * Compute the FX quote for a given market and premium.
 *
 * Direction rule (FX-03): TH market collects in THB — no conversion, no markup.
 * LA rule (FX-02): THB → LAK at (sourceRate + MARKUP_KIPS_PER_RATE_UNIT), ceil to whole kip.
 *
 * @param market - "TH" (Thailand, THB collection) or "LA" (Laos, LAK collection)
 * @param premiumThb - The Premium amount in THB as a Big
 * @param sourceRatePerThb - The current LAK/THB rate (required for LA, may be null for TH)
 * @returns FxQuoteResult with collected amount in the appropriate currency
 * @throws {Error} if market is "LA" and sourceRatePerThb is null
 */
export function quote(
  market: Market,
  premiumThb: Big,
  sourceRatePerThb: Big | null,
): FxQuoteResult {
  // Direction rule (FX-03): TH market collects in THB.
  // No conversion happens, no markup is applied, rate fields are null.
  // The THB amount passes through unchanged — satang preserved.
  if (market === "TH") {
    return {
      market,
      premiumThb,
      sourceRatePerThb: null,
      adjustedRatePerThb: null,
      collected: { amount: premiumThb, currency: "THB" },
    };
  }

  // LA market (FX-02): THB → LAK
  // Rate must be present — cannot quote LAK without a source rate (T-02-04 mitigation)
  if (sourceRatePerThb === null) {
    throw new Error(
      "LA market requires a source rate (sourceRatePerThb cannot be null for LAK collection)",
    );
  }

  // +15 kips markup applied to the per-THB rate ONLY (Pitfall 2 guard)
  // NEVER to the THB amount or the LAK total
  const adjustedRatePerThb = sourceRatePerThb.plus(MARKUP_KIPS_PER_RATE_UNIT);

  // ceil to whole kip using Big.roundUp (= ceil for positive amounts)
  // Big.roundUp is the ONLY rounding in this codebase; no Math.round, no Math.floor
  const lak = premiumThb.times(adjustedRatePerThb).round(0, Big.roundUp);

  return {
    market,
    premiumThb,
    sourceRatePerThb,
    adjustedRatePerThb,
    collected: { amount: lak, currency: "LAK" },
  };
}
