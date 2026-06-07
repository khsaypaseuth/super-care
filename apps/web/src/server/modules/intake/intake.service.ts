/**
 * intake.service — orchestrator for the CMI intake capture flow.
 *
 * This module is marked `import "server-only"` to guarantee it never bundles into a
 * client component (T-03-10, Pattern 2 from 03-RESEARCH.md). All business logic
 * lives here; Server Actions stay thin (API-01 seam).
 *
 * Orchestrated steps:
 *   1. startIntake       — create DraftIntake with insurer + policyMode (CMI-02)
 *   2. captureCustomer   — link Lead to draft + store customer PII draft fields
 *   3. runOcr            — store uploaded file via StorageProvider + run OcrModule.extract
 *                          + persist raw OcrResult + link to IdentityDocument stub
 *   4. suggestMappings   — run MapperProvider.map per OCR field (returns suggestions, no commit)
 *   5. setVerified        — update per-field verified flags on draft (CUST-07)
 *   6. setVehicleDraft   — store vehicle data on draft before final save
 *   7. saveIntake         — server-enforced gate + transactional persist of all domain entities
 *
 * CUST-07 contract: saveIntake MUST call assertVerified FIRST; if it throws, NO rows
 * are persisted. All writes run in ONE db.$transaction (T-03-15 atomicity).
 *
 * Actor context: { actor: "system" } until Phase 7 wires real auth (CONTEXT decision).
 */

import "server-only";

import type { PrismaClient, DraftIntake, Customer, IdentityDocument, Vehicle } from "../../../generated/prisma/client.js";
import type { ActorContext } from "../../audit/audit.service.js";
import { recordAudit } from "../../audit/audit.service.js";
import { CryptoService } from "../../crypto/crypto.service.js";
import { EnvKeyProvider } from "../../crypto/env-key-provider.js";

import { assertVerified } from "./verify-gate.js";
import { createDraftIntake, updateDraftIntake, getDraftIntake } from "../draft-intake/draft-intake.repo.js";
import { createOcrResult } from "../ocr-result/ocr-result.repo.js";

import { getOcrModule, getMapperProvider, getStorageProvider } from "../../adapters/registry.js";
import type { MasterCandidate, Suggestion } from "../../adapters/mapper/mapper.port.js";

// ─── Default crypto ────────────────────────────────────────────────────────────

function defaultCrypto(): CryptoService {
  return new CryptoService(new EnvKeyProvider());
}

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface StartIntakeInput {
  insuranceCompanyId: string;
  policyMode: "NEW" | "RENEWAL";
}

export interface CaptureCustomerInput {
  email?: string;
  phone?: string;
  firstName: string;
  lastName: string;
  titleCode?: string;
  cardTypeCode: string;
  /** Thai national ID (for cardTypeCode = "1"). */
  nationalId?: string;
  /** Passport number (for cardTypeCode = "2"). */
  passportNumber?: string;
  nationalityCode?: string;
  dob?: string;
  addressLine1?: string;
  addressLine2?: string;
  subdistrict?: string;
  district?: string;
  province?: string;
  postalCode?: string;
}

export interface VehicleDraftInput {
  platePrefix?: string;
  plateNumber?: string;
  plateProvince?: string;
  brandId?: string;
  modelId?: string;
  year?: number;
  colorId?: string;
  vehicleTypeId?: string;
  chassisNumber?: string;
  engineNumber?: string;
  engineCC?: number;
  seatCount?: number;
  weight?: number;
}

export interface SaveIntakeResult {
  customer: Customer;
  identityDocument: IdentityDocument;
  vehicle: Vehicle;
}

// ─── Step 1: startIntake (CMI-02) ─────────────────────────────────────────────

/**
 * Create a new DraftIntake with the selected insurer and policy mode.
 * This is Step 1 of the intake wizard (CMI-02).
 */
export async function startIntake(
  db: PrismaClient,
  ctx: ActorContext,
  input: StartIntakeInput,
): Promise<DraftIntake> {
  return createDraftIntake(db, ctx, {
    insuranceCompanyId: input.insuranceCompanyId,
    policyMode: input.policyMode,
    step: "insurer",
  });
}

// ─── Step 2: captureCustomer ──────────────────────────────────────────────────

/**
 * Store customer PII draft fields and link the Lead to the DraftIntake.
 *
 * This does NOT convert the Lead to a Customer yet — that happens in saveIntake.
 * It stores the data on the draft so saveIntake can build the final state.
 *
 * The draft's mapping.customerDraft field holds PII data unencrypted at the draft
 * stage. This is acceptable because: (a) it's still server-side, (b) final save
 * encrypts everything via the repos, (c) draft rows are ephemeral (cleared post-save).
 *
 * NOTE: Never log the customer draft data — it contains raw PII.
 */
export async function captureCustomer(
  db: PrismaClient,
  ctx: ActorContext,
  draftId: string,
  input: CaptureCustomerInput,
  leadId: string,
  _crypto: CryptoService = defaultCrypto(),
): Promise<DraftIntake> {
  const draft = await getDraftIntake(db, draftId);

  // Store customer PII draft in the mapping field alongside any existing mapping
  const existingMapping = (draft.mapping as Record<string, unknown>) ?? {};
  const updatedMapping = {
    ...existingMapping,
    customerDraft: {
      firstName: input.firstName,
      lastName: input.lastName,
      titleCode: input.titleCode,
      cardTypeCode: input.cardTypeCode,
      nationalId: input.nationalId,
      passportNumber: input.passportNumber,
      nationalityCode: input.nationalityCode,
      dob: input.dob,
      email: input.email,
      phone: input.phone,
      addressLine1: input.addressLine1,
      addressLine2: input.addressLine2,
      subdistrict: input.subdistrict,
      district: input.district,
      province: input.province,
      postalCode: input.postalCode,
    },
  };

  return updateDraftIntake(db, ctx, draftId, {
    leadId,
    mapping: updatedMapping,
    step: "customer",
  });
}

// ─── Step 3: runOcr ───────────────────────────────────────────────────────────

/**
 * Upload a document file via StorageProvider, run OcrModule.extract, persist the
 * raw OcrResult, and link everything to the DraftIntake.
 *
 * CMI-03/CUST-04 contract: OcrResult is stored verbatim (never cleaned/normalized).
 * The documentRef (storage ref) is stored unencrypted on the draft; the repo will
 * encrypt it when creating the IdentityDocument in saveIntake.
 */
export async function runOcr(
  db: PrismaClient,
  ctx: ActorContext,
  draftId: string,
  file: { bytes: Buffer; mime: string },
  documentType: string = "vehicle_registration_book",
): Promise<{ ocrResultId: string; documentRef: string }> {
  const storage = getStorageProvider();
  const ocr = getOcrModule();

  // 1. Store the file encrypted at rest — returns an opaque server-generated ref
  const documentRef = await storage.put(file.bytes, file.mime);

  // 2. Run OCR — returns raw verbatim fields (never cleaned)
  const rawOcr = await ocr.extract(documentType, file);

  // 3. Create a stub IdentityDocument for the OcrResult FK
  //    (the real IdentityDocument is created in saveIntake with full customer data)
  const draft = await getDraftIntake(db, draftId);
  const customerId = draft.customerId;

  // We need a customer ID to create an IdentityDocument.
  // If not yet available, store the documentRef on the draft and defer OcrResult persistence.
  if (!customerId) {
    const existingMapping = (draft.mapping as Record<string, unknown>) ?? {};
    await updateDraftIntake(db, ctx, draftId, {
      mapping: {
        ...existingMapping,
        documentRef,
        rawOcr: rawOcr as unknown as Record<string, unknown>,
      },
      step: "upload",
    });
    return { ocrResultId: "", documentRef };
  }

  // Create stub IdentityDocument to satisfy the OcrResult FK
  const identityDoc = await db.$transaction(async (tx) => {
    const doc = await tx.identityDocument.create({
      data: { customerId },
    });
    await recordAudit(tx, ctx, {
      action: "CREATE",
      subjectType: "IdentityDocument",
      subjectId: doc.id,
    });
    return doc;
  });

  // 4. Persist the raw OcrResult (VERBATIM — no normalization)
  const ocrResult = await createOcrResult(db, ctx, {
    identityDocumentId: identityDoc.id,
    rawPayload: rawOcr as unknown as Record<string, unknown>,
    provider: "fake",
  });

  // 5. Update the draft with the identityDocumentId + ocrResultId + documentRef
  const existingMapping = (draft.mapping as Record<string, unknown>) ?? {};
  await updateDraftIntake(db, ctx, draftId, {
    identityDocumentId: identityDoc.id,
    ocrResultId: ocrResult.id,
    mapping: {
      ...existingMapping,
      documentRef,
    },
    step: "upload",
  });

  return { ocrResultId: ocrResult.id, documentRef };
}

// ─── Step 4: suggestMappings ──────────────────────────────────────────────────

/**
 * Run MapperProvider.map on a raw OCR field value against a set of master-table candidates.
 *
 * Returns ranked suggestions — never auto-commits, never validates identifiers.
 * CMI-04 contract: mapper NEVER calls identifier validators.
 */
export function suggestMappings(
  rawValue: string,
  candidates: MasterCandidate[],
): Suggestion[] {
  const mapper = getMapperProvider();
  return mapper.map(rawValue, candidates);
}

// ─── Step 5: setVerified ──────────────────────────────────────────────────────

/**
 * Update the per-field verified flags on the DraftIntake.
 *
 * Called by the Map+Verify wizard step when staff clicks "Confirm" on each field.
 * The gate (assertVerified) checks these flags in saveIntake — it does NOT trust them
 * blindly (re-runs validators server-side).
 */
export async function setVerified(
  db: PrismaClient,
  ctx: ActorContext,
  draftId: string,
  verifyMap: Record<string, boolean>,
): Promise<DraftIntake> {
  return updateDraftIntake(db, ctx, draftId, {
    verified: verifyMap,
    step: "map-verify",
  });
}

// ─── Step 6: setVehicleDraft ──────────────────────────────────────────────────

/**
 * Store vehicle draft data on the DraftIntake.
 * The final Vehicle row is created in saveIntake (in the same transaction).
 */
export async function setVehicleDraft(
  db: PrismaClient,
  ctx: ActorContext,
  draftId: string,
  input: VehicleDraftInput,
): Promise<DraftIntake> {
  const draft = await getDraftIntake(db, draftId);
  const existingMapping = (draft.mapping as Record<string, unknown>) ?? {};
  return updateDraftIntake(db, ctx, draftId, {
    mapping: {
      ...existingMapping,
      vehicleDraft: {
        platePrefix: input.platePrefix,
        plateNumber: input.plateNumber,
        plateProvince: input.plateProvince,
        brandId: input.brandId,
        modelId: input.modelId,
        year: input.year,
        colorId: input.colorId,
        vehicleTypeId: input.vehicleTypeId,
        chassisNumber: input.chassisNumber,
        engineNumber: input.engineNumber,
        engineCC: input.engineCC,
        seatCount: input.seatCount,
        weight: input.weight,
      },
    },
    step: "vehicle",
  });
}

// ─── Step 7: saveIntake (CUST-07, transactional) ──────────────────────────────

/**
 * Finalize the intake — the transactional gated save.
 *
 * Protocol (T-03-12, T-03-13, T-03-14, T-03-15):
 *   1. Load the DraftIntake and build the final state.
 *   2. Call assertVerified (throws VerifyGateError if gate fails — NOTHING written).
 *   3. Run ONE db.$transaction:
 *      a. Convert Lead → Customer (encrypt PII, blind-index, set Lead.customerId + convertedAt)
 *      b. Create IdentityDocument (encrypted documentRef)
 *      c. Create Vehicle (encrypted chassis/engine, blind-index chassis)
 *      d. Stamp verifiedBy/verifiedAt on Customer + Vehicle
 *      e. Write audit rows for each entity
 *   4. Return { customer, identityDocument, vehicle }.
 *
 * If the gate fails, NO rows are committed (T-03-15 — gate before transaction).
 * Business logic lives here, NOT in Server Actions (API-01 seam).
 */
export async function saveIntake(
  db: PrismaClient,
  ctx: ActorContext,
  draftId: string,
  crypto: CryptoService = defaultCrypto(),
): Promise<SaveIntakeResult> {
  // 1. Load draft state
  const draft = await getDraftIntake(db, draftId);
  const mapping = (draft.mapping as Record<string, unknown>) ?? {};
  const customerDraft = (mapping["customerDraft"] as Record<string, string | undefined>) ?? {};
  const vehicleDraft = (mapping["vehicleDraft"] as Record<string, unknown>) ?? {};
  const documentRef = (mapping["documentRef"] as string | undefined);

  // Build the gate state from the draft
  const verifyGateState = {
    verified: (draft.verified as Record<string, boolean>) ?? {},
    values: {
      nationalId: customerDraft["nationalId"],
      passportNumber: customerDraft["passportNumber"],
      firstName: customerDraft["firstName"],
      lastName: customerDraft["lastName"],
      dob: customerDraft["dob"],
      plate: vehicleDraft["plateNumber"] as string | undefined,
      chassisNumber: vehicleDraft["chassisNumber"] as string | undefined,
      engineNumber: vehicleDraft["engineNumber"] as string | undefined,
    } as Record<string, string | undefined>,
    cardTypeCode: customerDraft["cardTypeCode"] ?? "1",
  };

  // 2. Server-enforced gate — throws VerifyGateError if any required field is unverified
  //    or any identifier fails the pure validator (T-03-12, T-03-13).
  //    This runs BEFORE the transaction so a gate failure commits nothing (T-03-15).
  assertVerified(verifyGateState);

  // 3. Transactional persist — all-or-nothing
  const verifiedAt = new Date();
  const verifiedBy = ctx.actor;

  const result = await db.$transaction(async (tx) => {
    // a. Encrypt customer PII
    const nationalId = customerDraft["nationalId"]
      ? crypto.encrypt(customerDraft["nationalId"])
      : null;
    const nationalIdIdx = customerDraft["nationalId"]
      ? crypto.blindIndex(customerDraft["nationalId"], "id")
      : null;
    const passportNumber = customerDraft["passportNumber"]
      ? crypto.encrypt(customerDraft["passportNumber"])
      : null;
    const passportNumberIdx = customerDraft["passportNumber"]
      ? crypto.blindIndex(customerDraft["passportNumber"], "text")
      : null;

    // b. Create the Customer row
    const customer = await tx.customer.create({
      data: {
        firstName: customerDraft["firstName"] ?? "",
        lastName: customerDraft["lastName"] ?? "",
        email: customerDraft["email"] ?? null,
        phone: customerDraft["phone"] ?? null,
        nationalId,
        nationalIdIdx,
        passportNumber,
        passportNumberIdx,
        verifiedBy,
        verifiedAt,
      },
    });

    await recordAudit(tx, ctx, {
      action: "CREATE",
      subjectType: "Customer",
      subjectId: customer.id,
    });

    // c. Link Lead → Customer (set Lead.customerId + Lead.convertedAt)
    if (draft.leadId) {
      await tx.lead.update({
        where: { id: draft.leadId },
        data: {
          customerId: customer.id,
          convertedAt: verifiedAt,
        },
      });

      await recordAudit(tx, ctx, {
        action: "CONVERT",
        subjectType: "Lead",
        subjectId: draft.leadId,
      });
    }

    // d. Encrypt documentRef and create IdentityDocument
    const encryptedDocumentRef = documentRef ? crypto.encrypt(documentRef) : null;

    // Encrypt documentNumber (nationalId or passportNumber as the document number)
    const rawDocumentNumber = customerDraft["nationalId"] ?? customerDraft["passportNumber"];
    const documentNumber = rawDocumentNumber ? crypto.encrypt(rawDocumentNumber) : null;
    const documentNumberIdx = rawDocumentNumber
      ? crypto.blindIndex(rawDocumentNumber, "text")
      : null;

    const identityDocument = await tx.identityDocument.create({
      data: {
        customerId: customer.id,
        documentNumber,
        documentNumberIdx,
        documentRef: encryptedDocumentRef,
      },
    });

    await recordAudit(tx, ctx, {
      action: "CREATE",
      subjectType: "IdentityDocument",
      subjectId: identityDocument.id,
    });

    // e. Encrypt vehicle identifiers and create Vehicle
    const chassisNumberRaw = vehicleDraft["chassisNumber"] as string | undefined;
    const engineNumberRaw = vehicleDraft["engineNumber"] as string | undefined;

    const chassisNumber = chassisNumberRaw ? crypto.encrypt(chassisNumberRaw) : null;
    const chassisNumberIdx = chassisNumberRaw
      ? crypto.blindIndex(chassisNumberRaw, "text")
      : null;
    const engineNumber = engineNumberRaw ? crypto.encrypt(engineNumberRaw) : null;

    const year = vehicleDraft["year"];
    const engineCC = vehicleDraft["engineCC"];
    const seatCount = vehicleDraft["seatCount"];
    const weight = vehicleDraft["weight"];

    const vehicle = await tx.vehicle.create({
      data: {
        customerId: customer.id,
        chassisNumber,
        chassisNumberIdx,
        engineNumber,
        platePrefix: (vehicleDraft["platePrefix"] as string | undefined) ?? null,
        plateNumber: (vehicleDraft["plateNumber"] as string | undefined) ?? null,
        plateProvince: (vehicleDraft["plateProvince"] as string | undefined) ?? null,
        year: typeof year === "number" ? year : null,
        engineCC: typeof engineCC === "number" ? engineCC : null,
        seatCount: typeof seatCount === "number" ? seatCount : null,
        weight: typeof weight === "number" ? weight : null,
        brandId: (vehicleDraft["brandId"] as string | undefined) ?? null,
        modelId: (vehicleDraft["modelId"] as string | undefined) ?? null,
        colorId: (vehicleDraft["colorId"] as string | undefined) ?? null,
        vehicleTypeId: (vehicleDraft["vehicleTypeId"] as string | undefined) ?? null,
        verifiedBy,
        verifiedAt,
      },
    });

    await recordAudit(tx, ctx, {
      action: "CREATE",
      subjectType: "Vehicle",
      subjectId: vehicle.id,
    });

    // f. Update the DraftIntake to reference the newly created entities
    await tx.draftIntake.update({
      where: { id: draftId },
      data: {
        customerId: customer.id,
        identityDocumentId: identityDocument.id,
        vehicleId: vehicle.id,
        step: "complete",
      },
    });

    return { customer, identityDocument, vehicle };
  });

  return result;
}
