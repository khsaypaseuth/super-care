/**
 * Commission tier ladder — COMM-01 / COMM-02
 *
 * Computes the commission owed to a Partner for a single Order,
 * based on their cumulative order volume and the Order's Premium in THB.
 *
 * Key design decisions (per 01-RESEARCH.md Assumption A3):
 *
 *   WHOLE-VOLUME application: the partner's current total order volume selects
 *   the tier that applies to the ENTIRE order. This is the simplest model that
 *   matches the "tier ladder" intent. (Not marginal — the tier sets the rate for
 *   the whole order, not just the incremental volume above the threshold.)
 *
 *   BASE: commission is computed on the THB Premium (the THB base is explicit —
 *   T-04-03 / PITFALLS.md #13). Never on the LAK amount.
 *
 *   ROUNDING: Big.roundHalfUp at 2dp (THB satang). Documented here as the
 *   rounding mode for commission; differs from FX (which uses Big.roundUp / ceil).
 *
 *   PLACEHOLDER DATA: tier thresholds, percentages, and flat amounts below are
 *   placeholders per [ASSUMED A3] — the real partner-commission policy has not been
 *   supplied. Only the shape and boundary-testing discipline are locked in Phase 1.
 *   Swap LADDER data when the real policy is confirmed.
 *
 * No `any`. No JS number literals for money (amounts stored as decimal strings).
 */

import Big from "big.js";

// ─── Tier definition ──────────────────────────────────────────────────────────

interface Tier {
  /** Minimum partner order volume (inclusive) to activate this tier. */
  readonly minVolume: number;
  /**
   * Percentage of the THB premium to pay as commission (decimal string).
   * null means no percentage component.
   */
  readonly percent: string | null;
  /**
   * Flat THB amount to add to the commission (decimal string).
   * null means no flat component.
   */
  readonly flatThb: string | null;
}

// ─── Tier ladder ──────────────────────────────────────────────────────────────

/**
 * Commission tier ladder — [ASSUMED A3] placeholder data.
 *
 * Tiers are ordered by minVolume ascending; `computeCommissionThb` selects the
 * highest tier whose minVolume ≤ partnerVolume (whole-volume application).
 *
 * Real policy: deferred — confirm tier thresholds/percentages/flats with partner
 * commission policy documentation before go-live (Phase 8+).
 */
const LADDER: readonly Tier[] = [
  // [ASSUMED A3] tier0: 5% for partners with < 10 total orders
  { minVolume: 0, percent: "5", flatThb: null },
  // [ASSUMED A3] tier1: 7% for partners with 10–49 total orders
  { minVolume: 10, percent: "7", flatThb: null },
  // [ASSUMED A3] tier2: 10% + 50 THB flat for partners with ≥ 50 total orders
  { minVolume: 50, percent: "10", flatThb: "50" },
] as const;

// ─── Commission computation ───────────────────────────────────────────────────

/**
 * Compute the commission owed to a Partner for a single Order.
 *
 * @param partnerVolume - The Partner's cumulative order count (whole number).
 *   Used to select the tier; NOT fractional.
 * @param premiumThb - The Order's insurance Premium in THB as a Big instance.
 *   Must be positive. This is the explicit THB base (T-04-03).
 * @returns The commission amount in THB as a Big, rounded to 2dp (satang)
 *   using Big.roundHalfUp.
 */
export function computeCommissionThb(
  partnerVolume: number,
  premiumThb: Big
): Big {
  // Whole-volume tier selection: find the highest tier with minVolume ≤ partnerVolume.
  // LADDER is ascending, so reversing and finding the first match gives the highest tier.
  const tier = [...LADDER]
    .reverse()
    .find((t) => partnerVolume >= t.minVolume);

  // Safety: LADDER[0] has minVolume=0, so any non-negative volume finds a tier.
  // If partnerVolume is negative (programming error), LADDER[0] still matches
  // because 0 ≤ negative is false → fallback to tier0. Keep it safe.
  if (tier === undefined) {
    throw new Error(
      `No commission tier found for partnerVolume=${partnerVolume}`
    );
  }

  let commission = new Big(0);

  // Percentage component (computed on the Big THB premium — T-04-03)
  if (tier.percent !== null) {
    commission = commission.plus(premiumThb.times(tier.percent).div(100));
  }

  // Flat THB component
  if (tier.flatThb !== null) {
    commission = commission.plus(new Big(tier.flatThb));
  }

  // Round to 2dp (THB satang) with roundHalfUp.
  // Note: Big.roundHalfUp = 1 (verified in 01-RESEARCH.md).
  // For commission (not FX) this is the documented rounding choice.
  return commission.round(2, Big.roundHalfUp);
}
