/**
 * Thai National ID 13-digit checksum validator (CUST-05)
 *
 * Pure deterministic function — NO LLM, NO I/O. (§A3 — identifiers are never
 * routed through an LLM; validation is a deterministic checksum only.)
 *
 * Algorithm:
 *   1. Reject unless input matches /^\d{13}$/
 *   2. sum = Σ d[i] · (13 − i)  for i = 0..11  (weights 13, 12, …, 2)
 *   3. check = (11 − (sum mod 11)) mod 10   ← the final mod 10 is LOAD-BEARING
 *      (when 11 − (sum%11) equals 10 or 11 the result wraps to 0 or 1;
 *       implementations that drop the final mod 10 reject valid IDs with check = 0)
 *   4. Valid iff d[12] === check
 *
 * Reference: Thai Department of Interior ID-card checksum spec;
 *            verified against test vectors in 01-RESEARCH.md (2026-06-06).
 */
export function isValidThaiNationalId(raw: string): boolean {
  // Step 1 — shape guard: exactly 13 decimal digits
  if (!/^\d{13}$/.test(raw)) return false;

  const d = raw.split("").map(Number);

  // Step 2 — weighted sum over the first 12 digits
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += (d[i] as number) * (13 - i); // weight descends 13, 12, …, 2
  }

  // Step 3 — derive expected check digit
  // The final % 10 handles the case where (11 - sum%11) = 10 → check digit 0
  const check = (11 - (sum % 11)) % 10;

  // Step 4 — compare to the actual 13th digit (index 12)
  return (d[12] as number) === check;
}
