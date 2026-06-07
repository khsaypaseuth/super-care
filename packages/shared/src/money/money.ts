/**
 * money.ts — Money value object over big.js (PLAT-03)
 *
 * A Money carries a Big `amount` and a glossary `Currency`.
 * - THB: 2 decimal places (satang)
 * - LAK: 0 decimal places (whole kip — LAK has no sub-unit in practice)
 *
 * Rules:
 * - Amount MUST be constructed from a decimal string or existing Big — never a JS number.
 * - LAK amounts with fractional sub-kip are rejected.
 * - No FX, no rounding-for-conversion — those live in the fx module.
 *
 * PLAT-03: Money is decimal everywhere via big.js; JS `number` is never used for money.
 */
import Big from "big.js";
import type { Currency } from "../types/index.js";

/**
 * The scale (decimal places) for each supported currency.
 * THB: 2 dp (satang). LAK: 0 dp (whole kip).
 */
const CURRENCY_SCALE: Record<Currency, number> = {
  THB: 2,
  LAK: 0,
};

/**
 * Money value object.
 * Immutable. Public fields only — no methods to keep the surface narrow (§A4).
 */
export interface Money {
  /** The decimal amount as a Big. */
  readonly amount: Big;
  /** The currency this amount is denominated in. */
  readonly currency: Currency;
}

/**
 * Construct a Money value object.
 *
 * @param amount - A decimal string (e.g. "1000.50") or an existing Big.
 *                 JS `number` is intentionally NOT accepted (PLAT-03).
 * @param currency - The currency ("THB" | "LAK")
 * @throws {TypeError} if amount is a JS number
 * @throws {RangeError} if amount has more decimal places than the currency allows
 */
export function makeMoney(amount: string | Big, currency: Currency): Money {
  // Guard: explicitly reject JS number amounts — money must never be a float
  if (typeof amount === "number") {
    throw new TypeError(
      "Money amount must be a decimal string or Big, not a JS number (PLAT-03: float money forbidden)",
    );
  }

  const big = typeof amount === "string" ? new Big(amount) : amount;

  // Scale enforcement: check the number of decimal places against the currency rule
  const scale = CURRENCY_SCALE[currency];
  // Use big.toString() (not toFixed) to get the canonical decimal string representation.
  // big.toString() gives the unrounded, full-precision value (e.g. "265000.5").
  const amountStr = big.toString();
  const dotIndex = amountStr.indexOf(".");
  if (dotIndex !== -1) {
    const actualDp = amountStr.length - dotIndex - 1;
    if (actualDp > scale) {
      throw new RangeError(
        `${currency} money cannot have more than ${scale} decimal place(s); ` +
          `got amount "${amountStr}" with ${actualDp} dp (PLAT-03: LAK is whole kip, THB is 2dp satang)`,
      );
    }
  }

  return Object.freeze({ amount: big, currency });
}

/**
 * Add two Money values of the same currency.
 * Returns a new Money — neither input is mutated (Big is immutable).
 *
 * @throws {TypeError} if currencies do not match
 */
export function addMoney(a: Money, b: Money): Money {
  if (a.currency !== b.currency) {
    throw new TypeError(
      `Cannot add money with different currencies: ${a.currency} + ${b.currency}`,
    );
  }
  return makeMoney(a.amount.plus(b.amount), a.currency);
}
