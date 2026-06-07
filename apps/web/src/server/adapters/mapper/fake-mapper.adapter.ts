/**
 * FakeMapperAdapter — deterministic normalized-distance mapper for Phase 3.
 *
 * CMI-04 / T-03-09 structural contract:
 *   - This file does NOT import @super-care/shared or any identifier validators.
 *   - map() NEVER validates identifiers; it performs text-similarity matching only.
 *   - map() NEVER auto-commits — returns ranked suggestions for human selection.
 *
 * Algorithm: hand-rolled normalized Levenshtein-style distance (no external deps).
 *   1. Normalize both strings: trim whitespace, uppercase (for non-Thai text).
 *   2. Exact normalized match → score 0 (ranks first).
 *   3. Prefix match → score equal to the unmatched suffix length (ranks second).
 *   4. Character-level edit distance for everything else (a simple Wagner-Fischer DP).
 *   5. Bilingual: if labelTh is provided, take the minimum score across both labels.
 *
 * Returns up to 5 ranked suggestions (best first). Real LLM adapter swaps in at Phase 10.
 *
 * NOTE: No import of @super-care/shared/validators — structural test asserts this.
 */

import type { MapperProvider, MasterCandidate, Suggestion } from "./mapper.port.js";

// ─── Internal helpers ──────────────────────────────────────────────────────────

/**
 * Normalize a string for comparison:
 * - Trim leading/trailing whitespace.
 * - Uppercase all Latin characters.
 * Thai script is preserved as-is (Thai unicode does not have upper/lowercase).
 */
function normalize(s: string): string {
  return s.trim().toUpperCase();
}

/**
 * Simple Wagner-Fischer edit distance (Levenshtein) between two normalized strings.
 * O(m*n) time, O(n) space.
 */
function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let prevRow: number[] = Array.from({ length: b.length + 1 }, (_, i) => i);

  for (let i = 1; i <= a.length; i++) {
    const currRow: number[] = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      currRow[j] = Math.min(
        (prevRow[j] ?? j) + 1,                 // deletion
        (currRow[j - 1] ?? i) + 1,             // insertion
        (prevRow[j - 1] ?? i - 1) + cost,      // substitution
      );
    }
    prevRow = currRow;
  }

  return prevRow[b.length] ?? Math.max(a.length, b.length);
}

/**
 * Compute the match score between a raw OCR value and a candidate label.
 * Lower score = better match. 0 = exact normalized match.
 *
 * Tries both the English label and the Thai labelTh (if present), taking the minimum.
 */
function scoreCandidate(rawNorm: string, candidate: MasterCandidate): number {
  const labelNorm = normalize(candidate.label);
  const distEn = editDistance(rawNorm, labelNorm);

  if (!candidate.labelTh) return distEn;

  // Thai: normalize by trim only (no uppercase — Thai has no case)
  const rawTrimmed = rawNorm.trim(); // already normalized, but keep Thai chars
  const labelThTrimmed = candidate.labelTh.trim();
  const distTh = editDistance(rawTrimmed, labelThTrimmed);

  return Math.min(distEn, distTh);
}

// ─── Adapter ───────────────────────────────────────────────────────────────────

export class FakeMapperAdapter implements MapperProvider {
  private static readonly MAX_SUGGESTIONS = 5;

  /**
   * Map a raw OCR value to ranked master-table suggestions.
   * Returns at most 5 results ordered by ascending score (best first).
   *
   * NEVER validates identifiers.
   * NEVER auto-commits a selection.
   */
  map(rawValue: string, candidates: MasterCandidate[]): Suggestion[] {
    const rawNorm = normalize(rawValue);

    const scored = candidates.map((c): Suggestion => ({
      id: c.id,
      label: c.label,
      score: scoreCandidate(rawNorm, c),
    }));

    // Sort ascending by score (lowest = best match), then by label for determinism
    scored.sort((a, b) =>
      a.score !== b.score ? a.score - b.score : a.label.localeCompare(b.label),
    );

    return scored.slice(0, FakeMapperAdapter.MAX_SUGGESTIONS);
  }
}
