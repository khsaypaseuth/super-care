/**
 * Vehicle plate format validator (VEH-02)
 *
 * Pure deterministic function — NO LLM, NO I/O. (§A3)
 *
 * Rule: allow Thai script (U+0E00–U+0E7F), Lao script (U+0E80–U+0EFF),
 * Latin A–Z, digits 0–9, spaces, and hyphens; length 2–20; the plate must
 * contain at least one non-space, non-hyphen character that is a letter or digit
 * (rejects empty string and symbol-only inputs like @@@).
 *
 * A [A-Z0-9]-only regex is WRONG — Thai-script and Lao-script plates are valid
 * and must be accepted (Pitfall 4 from 01-RESEARCH.md).
 *
 * Charset: Thai script + Lao script + [A-Z0-9 -]
 * Length : 2–20  [ASSUMED A4 — pragmatic baseline]
 *
 * Note on Lao script: U+0E80–U+0EFF covers the Unicode Lao block.
 */

// Characters allowed in a plate: Thai script, Lao script, Latin uppercase,
// digits, space, hyphen.
const PLATE_CHAR = /[฀-໿ A-Z0-9-]/;

// A plate must have at least one substantive (non-space, non-hyphen) character.
const HAS_SUBSTANTIVE = /[฀-໿a-zA-Z0-9]/;

export function isValidPlate(raw: string): boolean {
  if (raw.length < 2 || raw.length > 20) return false;
  // Every character must be in the allowed set
  for (const ch of raw) {
    if (!PLATE_CHAR.test(ch)) return false;
  }
  // Must contain at least one letter or digit (reject space/hyphen-only)
  return HAS_SUBSTANTIVE.test(raw);
}
