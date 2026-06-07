/**
 * DraftIntake repository — wizard state persistence.
 *
 * DraftIntake holds in-progress CMI intake wizard state:
 *   - insurer / policy mode (Step 1)
 *   - leadId / customerId refs (Steps 2–2b)
 *   - identityDocumentId + ocrResultId (Step 3)
 *   - mapping Json (Step 4 — mapper suggestions)
 *   - verified Json (Step 4 — per-field human-verified flags for CUST-07 gate)
 *   - vehicleId (Step 5)
 *   - step (current wizard step identifier)
 *
 * No PII encryption on the draft itself — it references already-encrypted rows by id.
 * All mutations write audit_logs in the same transaction (SEC-03).
 *
 * Actor context:
 *   - Phase 7 will populate actor from the session JWT.
 *   - Until then callers pass { actor: "system" } or { actor: "test" }.
 */

import type { PrismaClient, DraftIntake } from "../../../generated/prisma/client";
import { Prisma } from "../../../generated/prisma/client";
import type { ActorContext } from "../../audit/audit.service";
import { recordAudit } from "../../audit/audit.service";

// ─── Input / Output types ──────────────────────────────────────────────────────

export interface CreateDraftIntakeInput {
  insuranceCompanyId?: string;
  policyMode?: string;
  leadId?: string;
  customerId?: string;
  identityDocumentId?: string;
  ocrResultId?: string;
  vehicleId?: string;
  /** Per-field mapper suggestions (raw OCR → master table id). Opaque Json. */
  mapping?: Record<string, unknown>;
  /** Per-field verified flags, e.g. { "chassisNumber": true, "nationalId": false }. */
  verified?: Record<string, boolean>;
  /** Current wizard step identifier. Defaults to "insurer". */
  step?: string;
}

export type UpdateDraftIntakeInput = Partial<CreateDraftIntakeInput>;

// ─── Repository ────────────────────────────────────────────────────────────────

/**
 * Create a new DraftIntake with initial wizard state. Writes one audit CREATE row in tx.
 */
export async function createDraftIntake(
  db: PrismaClient,
  ctx: ActorContext,
  input: CreateDraftIntakeInput,
): Promise<DraftIntake> {
  return db.$transaction(async (tx) => {
    const draft = await tx.draftIntake.create({
      data: {
        insuranceCompanyId: input.insuranceCompanyId ?? null,
        policyMode: input.policyMode ?? null,
        leadId: input.leadId ?? null,
        customerId: input.customerId ?? null,
        identityDocumentId: input.identityDocumentId ?? null,
        ocrResultId: input.ocrResultId ?? null,
        vehicleId: input.vehicleId ?? null,
        mapping: input.mapping !== undefined
          ? (input.mapping as object)
          : Prisma.JsonNull,
        verified: (input.verified ?? {}) as object,
        step: input.step ?? "insurer",
      },
    });

    await recordAudit(tx, ctx, {
      action: "CREATE",
      subjectType: "DraftIntake",
      subjectId: draft.id,
    });

    return draft;
  });
}

/**
 * Partially update a DraftIntake (e.g. advance wizard step, set verified flags).
 * Writes one audit UPDATE row in tx.
 */
export async function updateDraftIntake(
  db: PrismaClient,
  ctx: ActorContext,
  id: string,
  patch: UpdateDraftIntakeInput,
): Promise<DraftIntake> {
  return db.$transaction(async (tx) => {
    const draft = await tx.draftIntake.update({
      where: { id },
      data: {
        ...(patch.insuranceCompanyId !== undefined && { insuranceCompanyId: patch.insuranceCompanyId }),
        ...(patch.policyMode !== undefined && { policyMode: patch.policyMode }),
        ...(patch.leadId !== undefined && { leadId: patch.leadId }),
        ...(patch.customerId !== undefined && { customerId: patch.customerId }),
        ...(patch.identityDocumentId !== undefined && { identityDocumentId: patch.identityDocumentId }),
        ...(patch.ocrResultId !== undefined && { ocrResultId: patch.ocrResultId }),
        ...(patch.vehicleId !== undefined && { vehicleId: patch.vehicleId }),
        ...(patch.mapping !== undefined && { mapping: patch.mapping as object }),
        ...(patch.verified !== undefined && { verified: patch.verified as object }),
        ...(patch.step !== undefined && { step: patch.step }),
      },
    });

    await recordAudit(tx, ctx, {
      action: "UPDATE",
      subjectType: "DraftIntake",
      subjectId: draft.id,
    });

    return draft;
  });
}

/**
 * Fetch a DraftIntake by id (read-only, no audit for simple look-up).
 *
 * @throws Prisma.NotFoundError if the draft does not exist.
 */
export async function getDraftIntake(
  db: PrismaClient,
  id: string,
): Promise<DraftIntake> {
  return db.draftIntake.findUniqueOrThrow({ where: { id } });
}
