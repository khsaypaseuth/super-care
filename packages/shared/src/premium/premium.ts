/**
 * premium.ts — Table-driven Premium lookup returning Big THB (FX-01)
 *
 * Shape: a static lookup table keyed by (coverage, vehicleType) → Big THB.
 * The lookup shape is what Phase 1 locks. The data in PREMIUM_TABLE is
 * a placeholder that will be replaced when the insurer's rate card is supplied.
 *
 * [ASSUMED A2 — PLACEHOLDER DATA]: The specific premium amounts (e.g. 645.21, 967.28)
 * are placeholder values from the research doc. They do NOT represent real rate-card data.
 * Real insurer rate-card data is DEFERRED (not a v1 reduction). When the rate card is
 * supplied, only the table data changes — the lookup shape, CoverageClass type, and
 * test discipline remain locked.
 *
 * Rules:
 * - Return type is always Big (never JS number)
 * - Premium amounts are stored as decimal strings, parsed to Big at lookup time
 * - An unknown (coverage, vehicleType) key THROWS a clear error
 * - No float literals for amounts — decimal strings only
 */
import Big from "big.js";

/**
 * The coverage class for a vehicle insurance policy.
 * CMI = Compulsory Motor Insurance (Thai/Lao mandatory third-party)
 * VOLUNTARY = Voluntary (comprehensive/third-party-fire-theft)
 *
 * [ASSUMED A2]: These keys are placeholders. The insurer product matrix may extend
 * this union when the rate card is supplied.
 */
export type CoverageClass = "CMI" | "VOLUNTARY";

/**
 * A single row in the premium rate table.
 * premiumThb is stored as a decimal string to prevent float parsing [PLAT-03].
 */
interface PremiumRow {
  readonly coverage: CoverageClass;
  readonly vehicleType: string;
  /** Decimal string — parsed to Big at lookup time; NEVER a JS number literal */
  readonly premiumThb: string;
}

/**
 * The premium rate table.
 *
 * [ASSUMED A2 — PLACEHOLDER DATA]: Amounts are research-doc placeholders.
 * Real insurer rate-card data is DEFERRED and will replace these values.
 * The shape (CoverageClass × vehicleType → premiumThb string) is the locked deliverable.
 *
 * Amounts use decimal strings, never JS number literals, to prevent float precision risk.
 */
const PREMIUM_TABLE: readonly PremiumRow[] = [
  // CMI (Compulsory Motor Insurance) — placeholder amounts [ASSUMED A2]
  { coverage: "CMI", vehicleType: "sedan", premiumThb: "645.21" },
  { coverage: "CMI", vehicleType: "pickup", premiumThb: "967.28" },
  { coverage: "CMI", vehicleType: "motorcycle", premiumThb: "323.14" },

  // VOLUNTARY — placeholder amounts [ASSUMED A2]
  { coverage: "VOLUNTARY", vehicleType: "sedan", premiumThb: "2850.00" },
  { coverage: "VOLUNTARY", vehicleType: "pickup", premiumThb: "3200.00" },
  { coverage: "VOLUNTARY", vehicleType: "motorcycle", premiumThb: "1500.00" },
];

/**
 * Look up the premium amount in THB for a given coverage class and vehicle type.
 *
 * @param coverage - The coverage class ("CMI" | "VOLUNTARY")
 * @param vehicleType - The vehicle type string (e.g. "sedan", "pickup", "motorcycle")
 * @returns The premium amount as a Big THB value (never a JS number)
 * @throws {Error} if no row is found for the given (coverage, vehicleType) combination
 */
export function lookupPremiumThb(coverage: CoverageClass, vehicleType: string): Big {
  const row = PREMIUM_TABLE.find(
    (r) => r.coverage === coverage && r.vehicleType === vehicleType,
  );

  if (!row) {
    throw new Error(
      `No premium found for coverage="${coverage}" vehicleType="${vehicleType}". ` +
        `Check that both values are in the PREMIUM_TABLE (data is placeholder [ASSUMED A2] pending rate card).`,
    );
  }

  // Parse the decimal string to Big — never pass through a JS number
  return new Big(row.premiumThb);
}
