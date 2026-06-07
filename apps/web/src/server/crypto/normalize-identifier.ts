/**
 * normalizeIdentifier — single normalization function for blind-index computation.
 *
 * CRITICAL: This function MUST be called identically at write time and at query time.
 * Any mismatch silently breaks blind-index lookups (Pitfall 2 in 02-RESEARCH.md).
 *
 * Rules:
 *
 * "id" kind (Thai 13-digit national ID):
 *   → keep digits only (strip everything else including spaces, dashes, dots)
 *   Example: "12-3456 7890123" → "1234567890123"
 *
 * "text" kind (passport numbers, chassis numbers, engine numbers, provider keys):
 *   → trim leading/trailing whitespace
 *   → remove internal whitespace characters
 *   → remove dashes (often appear in chassis/registration codes)
 *   → toUpperCase (case-insensitive equality)
 *   Example: " Abc-Def " → "ABCDEF"
 *   Example: "ABC 123-XYZ" → "ABC123XYZ"
 *
 * The "id" rule is strict digits-only so that re-formatted Thai IDs (with or without
 * the standard dashes) always produce the same blind index.
 *
 * When in doubt, use "text" — it is the safer default for opaque string identifiers.
 */

export type IdentifierKind = "id" | "text";

export function normalizeIdentifier(value: string, kind: IdentifierKind = "text"): string {
  if (kind === "id") {
    // Digits only — strips ALL non-digit characters
    return value.replace(/\D/g, "");
  }
  // "text": trim → remove internal whitespace → remove dashes → uppercase
  return value.trim().replace(/[\s-]+/g, "").toUpperCase();
}
