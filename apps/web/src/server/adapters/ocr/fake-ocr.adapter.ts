/**
 * FakeOcrAdapter — returns canned raw reg-book fields verbatim.
 *
 * Phase-3 implementation of OcrModule. Returns the fixture from fixtures/regbook.ts
 * WITHOUT any cleaning, trimming, uppercasing, or normalization.
 *
 * The returned OcrResultRaw is Zod-shape-valid (OcrResultRawSchema validates it).
 * Values are byte-identical to the fixture — the raw contract is preserved (CUST-04/CMI-03).
 *
 * Real adapter (Google Document AI) swaps in at Phase 10 with zero consumer changes.
 */

import type { OcrModule, OcrResultRaw } from "./ocr.port";
import { getCannedResult } from "./fixtures/regbook";

export class FakeOcrAdapter implements OcrModule {
  /**
   * Returns the canned reg-book result for the given documentType.
   * The file bytes and mime are accepted but not read — it's a fake adapter.
   * Values are returned verbatim with no normalization of any kind.
   */
  async extract(
    documentType: string,
    _file: { bytes: Buffer; mime: string },
  ): Promise<OcrResultRaw> {
    // Return the fixture verbatim — no trimming, no uppercasing, no transforms
    return getCannedResult(documentType);
  }
}
