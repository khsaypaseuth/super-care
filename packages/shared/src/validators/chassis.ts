/**
 * Chassis / VIN format validator (VEH-02)
 *
 * Pure deterministic function — NO LLM, NO I/O. (§A3)
 *
 * Rule: alphanumeric excluding I, O, Q (VIN convention to prevent 0/O and
 * 1/I/Q transcription confusion); uppercase only; length 6–17 (do NOT
 * hard-require the standard 17 chars — regional and older vehicles may use
 * shorter numbers).
 *
 * Charset : [A-HJ-NPR-Z0-9]  (uppercase letters minus I, O, Q; plus digits)
 * Length  : 6–17  [ASSUMED A4 — pragmatic baseline]
 *
 * Reference: SAE J454 / ISO 3779 VIN spec (international standard for 17-char);
 *            relaxed to 6+ for regional/older vehicles per 01-RESEARCH.md A4.
 */

// VIN-safe charset: uppercase letters excluding I (U+0049), O (U+004F), Q (U+0051)
const CHASSIS_REGEX = /^[A-HJ-NPR-Z0-9]{6,17}$/;

export function isValidChassis(raw: string): boolean {
  return CHASSIS_REGEX.test(raw);
}
