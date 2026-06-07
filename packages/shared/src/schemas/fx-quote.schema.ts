import { z } from "zod";

/**
 * Zod boundary schema for FxQuote — PLAT-02 pattern.
 *
 * FxQuote is a locked, time-stamped foreign-exchange quote (source rate + markup, rounded).
 * See docs/GLOSSARY.md for the authoritative domain term definition.
 *
 * Money/rate fields are decimal-safe strings (NOT z.number).
 * A JS number in a money field must fail parse — this is the boundary guard.
 */
export const fxQuoteSchema = z.object({
  /** The market this quote belongs to (TH = Thailand, LA = Laos). */
  market: z.enum(["TH", "LA"]),

  /**
   * The premium amount in THB as a decimal-safe string.
   * Must never be a JS number (float precision risk).
   */
  premiumThb: z.string(),

  /**
   * The source FX rate (LAK per THB) as a decimal-safe string.
   * Null on the THB-collection path (TH market — no conversion needed).
   */
  sourceRatePerThb: z.string().nullable(),

  /**
   * The adjusted FX rate (sourceRate + 15 kips/unit) as a decimal-safe string.
   * Null on the THB-collection path.
   */
  adjustedRatePerThb: z.string().nullable(),

  /** The amount actually collected from the customer. */
  collected: z.object({
    /** The collected amount as a decimal-safe string. */
    amount: z.string(),
    /** The currency in which the amount is collected. */
    currency: z.enum(["THB", "LAK"]),
  }),

  /** ISO 8601 timestamp when this quote was locked. */
  lockedAt: z.string().datetime(),
});

/** The inferred TypeScript type for a valid FxQuote. */
export type FxQuote = z.infer<typeof fxQuoteSchema>;
