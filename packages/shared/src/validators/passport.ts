/**
 * Passport format validator (CUST-06)
 *
 * Pure deterministic function — NO LLM, NO I/O. (§A3)
 *
 * Rule: uppercase A–Z and digits only; length 6–9; no spaces, hyphens, or other
 * symbols. Does NOT enforce country-specific formats — a foreign all-digit passport
 * (e.g. 123456789) is accepted; lowercase characters are rejected.
 *
 * Charset: [A-Z0-9]
 * Length : 6–9  [ASSUMED A4 — pragmatic ICAO baseline; confirm if edge real docs emerge]
 *
 * Reference: 01-RESEARCH.md §Passport Validator; ICAO Doc 9303 Part 3 (doc-num up to 9)
 */
export function isValidPassport(raw: string): boolean {
  // Exact match: 6–9 characters, each must be uppercase letter or digit
  return /^[A-Z0-9]{6,9}$/.test(raw);
}
