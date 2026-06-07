/**
 * intake.actions — thin Server Actions over intake.service (API-01 seam).
 *
 * Each action:
 *   1. Parses FormData via the intake.schema (PLAT-02 boundary — client validation is UX only).
 *   2. Delegates to intakeService with ctx { actor: "system" }.
 *   3. Returns a result object (never throws to the client — returns error shape instead).
 *
 * NO business logic here. All logic lives in intake.service.
 *
 * Security (T-03-17/18/19):
 *   - Server-side re-parse of ALL inputs via Zod before touching the service.
 *   - Never log PII or raw OCR values.
 *   - Server-only import guards keep crypto/repos out of client bundles.
 */

"use server";

import "server-only";

import { db } from "../db/client";
import {
  startIntake,
  captureCustomer,
  runOcr,
} from "../modules/intake/intake.service";
import {
  startIntakeInputSchema,
  customerStepInputSchema,
} from "../modules/intake/intake.schema";
import type { ActorContext } from "../audit/audit.service";
import type { OcrResultRaw } from "../adapters/ocr/ocr.port";

// Actor context — real auth wired in Phase 7.
const SYSTEM_CTX: ActorContext = { actor: "system" };

// ─── File upload constants (T-03-16 mitigation) ───────────────────────────────

/** Allowed MIME types for vehicle registration book uploads. */
const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf",
]);

/** Maximum file size: 10 MB (matches next.config.ts serverActions.bodySizeLimit). */
const MAX_FILE_BYTES = 10 * 1024 * 1024;

// ─── Result types ─────────────────────────────────────────────────────────────

export interface ActionResult<T = void> {
  success: boolean;
  data?: T;
  error?: string;
  fieldErrors?: Record<string, string[]>;
}

// ─── startIntakeAction (Step 1: CMI-02) ──────────────────────────────────────

/**
 * Parse FormData for the Start step, delegate to intakeService.startIntake.
 * Returns the new draftId on success.
 */
export async function startIntakeAction(
  formData: FormData,
): Promise<ActionResult<{ draftId: string }>> {
  // Parse + validate via schema (server re-parse — T-03-17)
  const raw = {
    insuranceCompanyId: formData.get("insuranceCompanyId"),
    policyMode: formData.get("policyMode"),
  };

  const parsed = startIntakeInputSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.join(".") || "_";
      (fieldErrors[key] ??= []).push(issue.message);
    }
    return { success: false, fieldErrors };
  }

  try {
    const draft = await startIntake(db, SYSTEM_CTX, parsed.data);
    return { success: true, data: { draftId: draft.id } };
  } catch (err) {
    // Never expose raw error details to the client
    console.error("[startIntakeAction] error", err instanceof Error ? err.message : "unknown");
    return { success: false, error: "Failed to start intake. Please try again." };
  }
}

// ─── captureCustomerAction (Step 2: CUST-01/02) ───────────────────────────────

/**
 * Parse FormData for the Customer step, delegate to intakeService.captureCustomer.
 * A Lead is linked to the draft; the Lead→Customer conversion happens in saveIntake.
 */
export async function captureCustomerAction(
  draftId: string,
  formData: FormData,
): Promise<ActionResult<{ draftId: string }>> {
  // Server re-parse of all customer PII (T-03-17)
  const raw = {
    titleCode: formData.get("titleCode") ?? undefined,
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    cardTypeCode: formData.get("cardTypeCode"),
    nationalId: formData.get("nationalId") ?? undefined,
    passportNumber: formData.get("passportNumber") ?? undefined,
    nationalityCode: formData.get("nationalityCode") ?? undefined,
    dob: formData.get("dob") ?? undefined,
    phone: formData.get("phone") ?? undefined,
    email: formData.get("email") ?? undefined,
    addressLine1: formData.get("addressLine1") ?? undefined,
    addressLine2: formData.get("addressLine2") ?? undefined,
    subdistrict: formData.get("subdistrict") ?? undefined,
    district: formData.get("district") ?? undefined,
    province: formData.get("province") ?? undefined,
    postalCode: formData.get("postalCode") ?? undefined,
  };

  const parsed = customerStepInputSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.join(".") || "_";
      (fieldErrors[key] ??= []).push(issue.message);
    }
    return { success: false, fieldErrors };
  }

  // Create a Lead first (the actual Lead row is a prerequisite for captureCustomer)
  // For Phase 3 we create a minimal Lead using the contact info provided.
  try {
    const lead = await db.$transaction(async (tx) => {
      return tx.lead.create({
        data: {
          email: parsed.data.email ?? null,
          phone: parsed.data.phone ?? null,
        },
      });
    });

    // Build CaptureCustomerInput — only include keys that have a value (exactOptionalPropertyTypes)
    const d = parsed.data;
    const customerInput: import("../modules/intake/intake.service").CaptureCustomerInput = {
      firstName: d.firstName,
      lastName: d.lastName,
      cardTypeCode: d.cardTypeCode,
      ...(d.titleCode !== undefined && { titleCode: d.titleCode }),
      ...(d.nationalId !== undefined && { nationalId: d.nationalId }),
      ...(d.passportNumber !== undefined && { passportNumber: d.passportNumber }),
      ...(d.nationalityCode !== undefined && { nationalityCode: d.nationalityCode }),
      ...(d.dob !== undefined && { dob: d.dob }),
      ...(d.phone !== undefined && { phone: d.phone }),
      ...(d.email !== undefined && { email: d.email }),
      ...(d.addressLine1 !== undefined && { addressLine1: d.addressLine1 }),
      ...(d.addressLine2 !== undefined && { addressLine2: d.addressLine2 }),
      ...(d.subdistrict !== undefined && { subdistrict: d.subdistrict }),
      ...(d.district !== undefined && { district: d.district }),
      ...(d.province !== undefined && { province: d.province }),
      ...(d.postalCode !== undefined && { postalCode: d.postalCode }),
    };

    await captureCustomer(db, SYSTEM_CTX, draftId, customerInput, lead.id);
    return { success: true, data: { draftId } };
  } catch (err) {
    console.error("[captureCustomerAction] error", err instanceof Error ? err.message : "unknown");
    return { success: false, error: "Failed to save customer. Please try again." };
  }
}

// ─── uploadDocumentAction (Step 3: CUST-03/04, CMI-03) ───────────────────────

/**
 * Handle document file upload:
 *   1. Enforce MIME allowlist + max size server-side (T-03-16).
 *   2. Delegate to intakeService.runOcr (storage.put → ocr.extract → persist raw OcrResult).
 *   3. Return the raw OcrResult for display (never normalized in the UI — CUST-04).
 */
export async function uploadDocumentAction(
  draftId: string,
  formData: FormData,
): Promise<ActionResult<{ ocrResultId: string; rawOcr: OcrResultRaw }>> {
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return { success: false, error: "No file provided." };
  }

  // ── Server-side MIME allowlist (T-03-16) ────────────────────────────────────
  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    return {
      success: false,
      error: `File type "${file.type}" is not allowed. Upload an image (JPEG, PNG, WebP) or PDF.`,
    };
  }

  // ── Server-side size limit (T-03-16) ────────────────────────────────────────
  if (file.size > MAX_FILE_BYTES) {
    return {
      success: false,
      error: `File is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum is 10 MB.`,
    };
  }

  try {
    const bytes = Buffer.from(await file.arrayBuffer());
    const { ocrResultId } = await runOcr(db, SYSTEM_CTX, draftId, {
      bytes,
      mime: file.type,
    });

    // Fetch the raw OCR result to return to the UI
    // We need the rawPayload for display — fetch from DB
    if (ocrResultId) {
      const ocrRow = await db.ocrResult.findUniqueOrThrow({
        where: { id: ocrResultId },
      });
      return {
        success: true,
        data: {
          ocrResultId,
          rawOcr: ocrRow.rawPayload as unknown as OcrResultRaw,
        },
      };
    }

    // Draft had no customerId yet — rawOcr is stored in draft.mapping
    // Fetch from the draft mapping field
    const draft = await db.draftIntake.findUniqueOrThrow({
      where: { id: draftId },
    });
    const mapping = (draft.mapping as Record<string, unknown>) ?? {};
    const rawOcr = (mapping["rawOcr"] as OcrResultRaw | undefined) ?? null;

    return {
      success: true,
      data: {
        ocrResultId: "",
        rawOcr: rawOcr as OcrResultRaw,
      },
    };
  } catch (err) {
    // Never log PII/raw OCR (T-03-19)
    console.error("[uploadDocumentAction] error", err instanceof Error ? err.message : "unknown");
    return {
      success: false,
      error: "Failed to process document. Please try again.",
    };
  }
}
