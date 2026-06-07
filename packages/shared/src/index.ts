/**
 * @super-care/shared — public root export.
 *
 * Only types and schemas are re-exported here for Wave 0.
 * The money, fx, premium, commission, order, and validators subpaths are
 * reserved in package.json exports and will be filled in Wave 1 plans.
 */
export type { Currency, Market } from "./types/index.js";
export { fxQuoteSchema } from "./schemas/index.js";
export type { FxQuote } from "./schemas/index.js";
