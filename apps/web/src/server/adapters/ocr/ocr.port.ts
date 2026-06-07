/**
 * OcrModule port — the deep-module seam for vehicle registration book OCR.
 *
 * CUST-04 / CMI-03 contract:
 *   - extract() returns a raw, verbatim OcrResultRaw — no trimming, no uppercasing,
 *     no normalization of any kind. Values are byte-identical to whatever the
 *     underlying OCR engine returned.
 *   - The Zod schema validates SHAPE only (correct keys, each value string|null).
 *     No .trim() / .toUpperCase() / .transform() applied.
 *   - Real adapter (Google Document AI) drops in at Phase 10 with zero consumer changes.
 *
 * OCR fields per docs/CMI-SPEC.md "OCR fields from the vehicle registration book":
 *   Owner Name, Owner Address, ID Card Number, Passport Number,
 *   Vehicle Registration Number, Province, Vehicle Brand, Vehicle Model,
 *   Vehicle Year, Chassis Number, Engine Number, Engine Capacity,
 *   Vehicle Weight, Seat Count, Vehicle Color
 */

import { z } from "zod";

// ─── Raw OCR result shape ──────────────────────────────────────────────────────

/**
 * The 15 fields extracted from a Thai vehicle registration book.
 * Every value is string | null — never cleaned, never validated by this module.
 */
export interface OcrResultRaw {
  ownerName: string | null;
  ownerAddress: string | null;
  idCardNumber: string | null;
  passportNumber: string | null;
  vehicleRegistrationNumber: string | null;
  province: string | null;
  vehicleBrand: string | null;
  vehicleModel: string | null;
  vehicleYear: string | null;
  chassisNumber: string | null;
  engineNumber: string | null;
  engineCapacity: string | null;
  vehicleWeight: string | null;
  seatCount: string | null;
  vehicleColor: string | null;
}

/**
 * Zod schema that validates the SHAPE of an OcrResultRaw.
 * Validates that all required keys are present and each value is string | null.
 * NO normalization transforms are applied — this is a SHAPE-ONLY check (CMI-03/CUST-04).
 */
export const OcrResultRawSchema = z.object({
  ownerName: z.string().nullable(),
  ownerAddress: z.string().nullable(),
  idCardNumber: z.string().nullable(),
  passportNumber: z.string().nullable(),
  vehicleRegistrationNumber: z.string().nullable(),
  province: z.string().nullable(),
  vehicleBrand: z.string().nullable(),
  vehicleModel: z.string().nullable(),
  vehicleYear: z.string().nullable(),
  chassisNumber: z.string().nullable(),
  engineNumber: z.string().nullable(),
  engineCapacity: z.string().nullable(),
  vehicleWeight: z.string().nullable(),
  seatCount: z.string().nullable(),
  vehicleColor: z.string().nullable(),
});

// ─── Port interface ────────────────────────────────────────────────────────────

/**
 * The OCR module port — config-selected at runtime by the registry.
 * FakeOcrAdapter is the Phase-3 implementation; GoogleDocumentAiAdapter lands Phase 10.
 */
export interface OcrModule {
  /**
   * Extract raw fields from an uploaded vehicle registration book.
   *
   * @param documentType - e.g. "vehicle_registration_book"
   * @param file         - the uploaded file as bytes + mime type
   * @returns OcrResultRaw — verbatim extracted values, never cleaned or normalized
   */
  extract(
    documentType: string,
    file: { bytes: Buffer; mime: string },
  ): Promise<OcrResultRaw>;
}
