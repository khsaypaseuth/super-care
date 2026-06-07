/**
 * Engine number format validator (VEH-02)
 *
 * Pure deterministic function — NO LLM, NO I/O. (§A3)
 *
 * Rule: uppercase letters A–Z, digits 0–9, and hyphens only; length 4–20;
 * no spaces or other symbols. Engine numbers are less standardised than VIN,
 * so the validator is deliberately permissive to avoid over-rejection.
 *
 * Charset: [A-Z0-9-]
 * Length : 4–20  [ASSUMED A4 — pragmatic baseline]
 *
 * Reference: 01-RESEARCH.md §Engine number validator; E1–E4 vector table.
 */

// Uppercase alphanumeric + hyphen, length 4–20; spaces are explicitly excluded.
const ENGINE_REGEX = /^[A-Z0-9-]{4,20}$/;

export function isValidEngine(raw: string): boolean {
  return ENGINE_REGEX.test(raw);
}
