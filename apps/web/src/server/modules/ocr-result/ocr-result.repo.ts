/**
 * OcrResult repository — verbatim persistence of raw OCR output.
 *
 * CRITICAL: rawPayload is stored AS-IS with NO transformation, normalization,
 * trimming, or case conversion (T-03-05). The record must be byte-identical
 * to what the OCR adapter returned.
 *
 * All mutations run inside db.$transaction so the audit_logs row is written
 * atomically with the data write (SEC-03).
 *
 * Default provider is "fake" for Phase 3 (real Google Document AI in Phase 10).
 *
 * Actor context:
 *   - Phase 7 will populate actor from the session JWT.
 *   - Until then callers pass { actor: "system" } or { actor: "test" }.
 */

import type { PrismaClient, OcrResult } from "../../../generated/prisma/client";
import type { ActorContext } from "../../audit/audit.service";
import { recordAudit } from "../../audit/audit.service";

// ─── Input / Output types ──────────────────────────────────────────────────────

export interface CreateOcrResultInput {
  identityDocumentId: string;
  /** Raw OCR payload — persisted VERBATIM. Do NOT trim or normalize before passing. */
  rawPayload: Record<string, unknown>;
  /** OCR provider name. Defaults to "fake" for Phase 3. */
  provider?: string;
}

// ─── Repository ────────────────────────────────────────────────────────────────

/**
 * Persist a raw OcrResult VERBATIM. Writes one audit_logs row (action=CREATE) in the same tx.
 *
 * The rawPayload is stored as opaque Json exactly as received. No cleaning, trimming,
 * uppercasing, or normalization. This is enforced by T-03-05.
 */
export async function createOcrResult(
  db: PrismaClient,
  ctx: ActorContext,
  input: CreateOcrResultInput,
): Promise<OcrResult> {
  return db.$transaction(async (tx) => {
    const result = await tx.ocrResult.create({
      data: {
        identityDocumentId: input.identityDocumentId,
        // rawPayload is stored verbatim. Record<string,unknown> satisfies the Prisma
        // Json input type (InputJsonValue) at runtime; we widen here to satisfy TS.
        rawPayload: input.rawPayload as object,
        provider: input.provider ?? "fake",
      },
    });

    await recordAudit(tx, ctx, {
      action: "CREATE",
      subjectType: "OcrResult",
      subjectId: result.id,
    });

    return result;
  });
}
