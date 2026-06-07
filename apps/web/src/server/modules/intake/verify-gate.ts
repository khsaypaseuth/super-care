/**
 * Verify-gate (CUST-07) — server-enforced human-verify gate for the intake flow.
 *
 * This module is a pure function — no I/O, no Prisma, no CryptoService.
 * It can be called from any server context (Server Actions, route handlers, services).
 *
 * CUST-07 lock (03-CONTEXT.md):
 *   Required fields this phase (no money fields until Phase 4):
 *   - Identity/legal: nationalId (or passportNumber for passport card type), firstName, lastName, dob
 *   - Vehicle legal identifiers: plate, chassisNumber, engineNumber
 *
 * Trust boundary (T-03-12, T-03-13):
 *   - The gate re-runs the Phase-1 pure validators server-side, regardless of client flags.
 *   - Client-sent `verified=true` is NEVER trusted for identifier validity.
 *   - Only when BOTH the field is verified AND the identifier value passes server-side validation
 *     does the gate allow persistence.
 *
 * Pattern 3 (03-RESEARCH.md): disabled UI is UX; this gate is the contract.
 */

import {
  isValidThaiNationalId,
  isValidPassport,
  isValidPlate,
  isValidChassis,
  isValidEngine,
} from "@super-care/shared/validators";

// ─── Required verify fields (CUST-07) ─────────────────────────────────────────

/**
 * The fields that MUST be marked verified before saveIntake can persist.
 *
 * Scope: identity/legal fields + vehicle legal identifiers.
 * Money fields are deferred to Phase 4 (no Premium columns yet).
 *
 * For national-ID card type ("1"), "nationalId" must be verified.
 * For passport card type ("2"), "passportNumber" is used instead of "nationalId".
 * The gate logic handles this substitution; the constant lists the base set.
 */
export const REQUIRED_VERIFY_FIELDS = [
  "nationalId",
  "firstName",
  "lastName",
  "dob",
  "plate",
  "chassisNumber",
  "engineNumber",
] as const;

export type RequiredVerifyField = (typeof REQUIRED_VERIFY_FIELDS)[number];

// ─── VerifyGateError ───────────────────────────────────────────────────────────

/**
 * Thrown by assertVerified when any required field is unverified, or when
 * a required identifier fails server-side re-validation (Pitfall 5).
 */
export class VerifyGateError extends Error {
  /** Fields from REQUIRED_VERIFY_FIELDS that are missing or false in the verified map. */
  readonly unverifiedFields: string[];
  /** Identifier fields that are "verified" but fail the server-side pure validator. */
  readonly invalidIdentifiers: string[];

  constructor(unverifiedFields: string[], invalidIdentifiers: string[] = []) {
    const parts: string[] = [];
    if (unverifiedFields.length > 0) {
      parts.push(`unverified fields: ${unverifiedFields.join(", ")}`);
    }
    if (invalidIdentifiers.length > 0) {
      parts.push(`invalid identifiers: ${invalidIdentifiers.join(", ")}`);
    }
    super(`VerifyGateError — ${parts.join("; ")}`);
    this.name = "VerifyGateError";
    this.unverifiedFields = unverifiedFields;
    this.invalidIdentifiers = invalidIdentifiers;
  }
}

// ─── AssertVerified input shape ────────────────────────────────────────────────

/**
 * The state passed to assertVerified. Pulled from the DraftIntake + draft step data.
 *
 * verified: per-field human-verified flags from the DraftIntake.verified Json column.
 * values:   the identifier values that will be persisted (cleartext from the draft).
 * cardTypeCode: "1" = Thai national ID card, "2" = passport (drives which identifier to re-validate).
 */
export interface VerifyGateState {
  verified: Record<string, boolean>;
  values: Record<string, string | undefined>;
  /** Card type code from the MasterCardType selection. "1" = national ID, "2" = passport. */
  cardTypeCode: string;
}

// ─── Gate function ─────────────────────────────────────────────────────────────

/**
 * Assert that all REQUIRED_VERIFY_FIELDS are marked verified AND that each identifier
 * field passes the corresponding Phase-1 pure validator server-side.
 *
 * This is the contract for saveIntake (T-03-12, T-03-13, Pattern 3).
 * Client `verified=true` is NEVER sufficient — the server re-checks every identifier.
 *
 * @throws {VerifyGateError} if any required field is unverified or any identifier is invalid.
 */
export function assertVerified(state: VerifyGateState): void {
  const { verified, values, cardTypeCode } = state;

  // Determine which identifier field is required for this card type:
  //   cardTypeCode "1" → Thai national ID  → check "nationalId" in required list
  //   cardTypeCode "2" → passport           → substitute "passportNumber" for "nationalId"
  //   anything else    → treat as national ID (safe default)
  const isPassportType = cardTypeCode === "2";

  // Build the effective required field list, substituting passportNumber for nationalId if needed
  const effectiveRequiredFields: string[] = REQUIRED_VERIFY_FIELDS.map((f) => {
    if (f === "nationalId" && isPassportType) return "passportNumber";
    return f;
  });

  // 1. Check all required fields are verified
  const unverifiedFields = effectiveRequiredFields.filter(
    (field) => !verified[field],
  );

  // 2. Server-side identifier re-validation (Pitfall 5 — client cannot be trusted)
  //    Re-run the pure validators regardless of verified flags.
  const invalidIdentifiers: string[] = [];

  // National ID or passport (mutually exclusive based on card type)
  if (!isPassportType) {
    const nationalId = values["nationalId"];
    if (nationalId !== undefined && nationalId !== "" && !isValidThaiNationalId(nationalId)) {
      invalidIdentifiers.push("nationalId");
    }
  } else {
    const passportNumber = values["passportNumber"];
    if (passportNumber !== undefined && passportNumber !== "" && !isValidPassport(passportNumber)) {
      invalidIdentifiers.push("passportNumber");
    }
  }

  // Plate — empty string is also invalid (isValidPlate rejects length < 2)
  const plate = values["plate"];
  if (plate !== undefined && !isValidPlate(plate)) {
    invalidIdentifiers.push("plate");
  }

  // Chassis number
  const chassisNumber = values["chassisNumber"];
  if (chassisNumber !== undefined && chassisNumber !== "" && !isValidChassis(chassisNumber)) {
    invalidIdentifiers.push("chassisNumber");
  }

  // Engine number
  const engineNumber = values["engineNumber"];
  if (engineNumber !== undefined && engineNumber !== "" && !isValidEngine(engineNumber)) {
    invalidIdentifiers.push("engineNumber");
  }

  // 3. Throw if any issue found
  if (unverifiedFields.length > 0 || invalidIdentifiers.length > 0) {
    throw new VerifyGateError(unverifiedFields, invalidIdentifiers);
  }
}
