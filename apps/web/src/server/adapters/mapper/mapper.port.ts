/**
 * MapperProvider port — the deep-module seam for master-table suggestion mapping.
 *
 * CMI-04 contract:
 *   - map() returns RANKED SUGGESTIONS only. It NEVER auto-commits a master-table selection.
 *   - map() NEVER validates identifiers — identifier validation is exclusively the domain
 *     of the Phase-1 pure validators in @super-care/shared/validators.
 *   - The mapper uses normalized text matching; it does NOT perform checksums or structured
 *     identifier parsing.
 *   - Real LLM mapper (Claude/GPT) swaps in at Phase 10 with zero consumer changes.
 *
 * Structural guarantee (T-03-09): fake-mapper.adapter.ts does NOT import the
 * @super-care/shared validators barrel — enforced by a source-content test.
 */

// ─── Supporting types ──────────────────────────────────────────────────────────

/**
 * A candidate entry from a master table (e.g. master_car_brands, master_provinces).
 * The label is the human-readable name used for matching.
 */
export interface MasterCandidate {
  id: string;
  label: string;
  /** Optional Thai-language label for bilingual matching. */
  labelTh?: string | null;
}

/**
 * A ranked suggestion returned by the mapper.
 * score is a normalized distance (lower = better match; 0 = exact).
 * Suggestions are ordered ascending by score (best first).
 */
export interface Suggestion {
  id: string;
  label: string;
  /** Normalized match score. 0 = exact match. Higher = less similar. */
  score: number;
}

// ─── Port interface ────────────────────────────────────────────────────────────

/**
 * The mapper provider port — config-selected at runtime by the registry.
 * FakeMapperAdapter is the Phase-3 implementation; the LLM adapter lands at Phase 10.
 */
export interface MapperProvider {
  /**
   * Map a raw OCR text value to ranked master-table suggestions.
   *
   * @param rawValue   - the raw string from the OCR result (e.g. "Toyota", "กรุงเทพมหานคร")
   * @param candidates - master-table rows to match against
   * @returns up to 5 suggestions ordered by match score (best first); never auto-committed
   */
  map(rawValue: string, candidates: MasterCandidate[]): Suggestion[];
}
