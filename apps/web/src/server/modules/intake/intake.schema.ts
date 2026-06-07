/**
 * Intake Zod boundary schemas (PLAT-02).
 *
 * Each schema validates the SHAPE of a wizard step's input. Identifier fields
 * use .refine() with the Phase-1 pure validators so the same schema runs on
 * both the client (react-hook-form + zodResolver) and the server (Server Action input).
 *
 * Client validation is UX only — the server re-validates via the same schemas
 * AND the verify-gate runs assertVerified() before any persistence.
 *
 * No `any`. Strict TypeScript. No money columns (Phase 4).
 */

import { z } from "zod";
import {
  isValidThaiNationalId,
  isValidPassport,
  isValidPlate,
  isValidChassis,
  isValidEngine,
} from "@super-care/shared/validators";

// ─── Step 1: Start intake (CMI-02) ────────────────────────────────────────────

/**
 * Input for starting a new intake: select insurance company + policy mode.
 */
export const startIntakeInputSchema = z.object({
  /** Foreign key to InsuranceCompany. */
  insuranceCompanyId: z.string().min(1, "Insurance company is required"),
  /** "NEW" or "RENEWAL" — CMI-02 policy mode. */
  policyMode: z.enum(["NEW", "RENEWAL"]),
});

export type StartIntakeInput = z.infer<typeof startIntakeInputSchema>;

// ─── Step 2: Customer (CUST-01) ───────────────────────────────────────────────

/**
 * Input for capturing customer contact info (creates a Lead).
 */
export const customerContactInputSchema = z.object({
  email: z.string().email().optional(),
  phone: z.string().optional(),
  notes: z.string().optional(),
});

export type CustomerContactInput = z.infer<typeof customerContactInputSchema>;

/**
 * Input for the customer PII step (captured when converting Lead to Customer).
 * Identifier fields are refined with the Phase-1 pure validators.
 *
 * cardTypeCode drives which identifier is required:
 *   "1" = Thai national ID → nationalId is required and validated
 *   "2" = passport         → passportNumber is required and validated
 */
export const customerStepInputSchema = z
  .object({
    titleCode: z.string().optional(),
    firstName: z.string().min(1, "First name is required"),
    lastName: z.string().min(1, "Last name is required"),
    /** "1" = Thai ID card, "2" = passport, etc. Drives which identifier is validated. */
    cardTypeCode: z.string().min(1, "Card type is required"),
    /** Thai national ID — required when cardTypeCode = "1". */
    nationalId: z
      .string()
      .optional()
      .refine(
        (val) => !val || isValidThaiNationalId(val),
        { message: "Invalid Thai national ID checksum" },
      ),
    /** Passport number — required when cardTypeCode = "2". */
    passportNumber: z
      .string()
      .optional()
      .refine(
        (val) => !val || isValidPassport(val),
        { message: "Invalid passport format (6–9 uppercase alphanumeric)" },
      ),
    nationalityCode: z.string().optional(),
    /** Date of birth in ISO format (YYYY-MM-DD). */
    dob: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "DOB must be YYYY-MM-DD").optional(),
    phone: z.string().optional(),
    email: z.string().email().optional(),
    // Address fields
    addressLine1: z.string().optional(),
    addressLine2: z.string().optional(),
    subdistrict: z.string().optional(),
    district: z.string().optional(),
    province: z.string().optional(),
    postalCode: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    // Enforce that the correct identifier is provided for the given card type
    if (data.cardTypeCode === "1") {
      if (!data.nationalId || data.nationalId.trim() === "") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "National ID is required for Thai ID card",
          path: ["nationalId"],
        });
      }
    } else if (data.cardTypeCode === "2") {
      if (!data.passportNumber || data.passportNumber.trim() === "") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Passport number is required for passport card type",
          path: ["passportNumber"],
        });
      }
    }
  });

export type CustomerStepInput = z.infer<typeof customerStepInputSchema>;

// ─── Step 5: Vehicle ──────────────────────────────────────────────────────────

/**
 * Input for the vehicle step (VEH-01).
 * Identifier fields (plate, chassis, engine) refined with Phase-1 pure validators.
 */
export const vehicleStepInputSchema = z.object({
  platePrefix: z.string().optional(),
  plateNumber: z
    .string()
    .optional()
    .refine(
      (val) => !val || isValidPlate(val),
      { message: "Invalid plate format" },
    ),
  plateProvince: z.string().optional(),
  brandId: z.string().optional(),
  modelId: z.string().optional(),
  /** Vehicle manufacturing year. */
  year: z.number().int().min(1900).max(2100).optional(),
  colorId: z.string().optional(),
  vehicleTypeId: z.string().optional(),
  /** VIN/chassis number — required identifier. */
  chassisNumber: z
    .string()
    .optional()
    .refine(
      (val) => !val || isValidChassis(val),
      { message: "Invalid chassis/VIN format (6–17 uppercase alphanumeric, no I/O/Q)" },
    ),
  /** Engine number — required identifier. */
  engineNumber: z
    .string()
    .optional()
    .refine(
      (val) => !val || isValidEngine(val),
      { message: "Invalid engine number format (4–20 uppercase alphanumeric + hyphen)" },
    ),
  engineCC: z.number().int().positive().optional(),
  seatCount: z.number().int().positive().optional(),
  weight: z.number().positive().optional(),
});

export type VehicleStepInput = z.infer<typeof vehicleStepInputSchema>;

// ─── Verify map ───────────────────────────────────────────────────────────────

/**
 * Input for updating the per-field verified map on a DraftIntake.
 * The record value is the verified flag (true = staff confirmed this field).
 */
export const verifyMapInputSchema = z.record(z.string(), z.boolean());

export type VerifyMapInput = z.infer<typeof verifyMapInputSchema>;

// ─── Combined intake step union ────────────────────────────────────────────────

/**
 * Discriminated schema union for intake wizard steps.
 * Used by Server Actions to validate the step-specific payload.
 */
export const intakeStepInputSchema = z.discriminatedUnion("step", [
  z.object({ step: z.literal("insurer"), data: startIntakeInputSchema }),
  z.object({ step: z.literal("customer-contact"), data: customerContactInputSchema }),
  z.object({ step: z.literal("customer"), data: customerStepInputSchema }),
  z.object({ step: z.literal("vehicle"), data: vehicleStepInputSchema }),
  z.object({ step: z.literal("verify"), data: verifyMapInputSchema }),
]);

export type IntakeStepInput = z.infer<typeof intakeStepInputSchema>;
