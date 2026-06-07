/**
 * Customer repository — PII encryption + blind-index + audit-in-transaction.
 *
 * All PII operations run inside db.$transaction so the data op and the audit_logs
 * row are written atomically (SEC-03, T-02-06).
 *
 * Encryption contract:
 *   - nationalId / passportNumber are stored as CryptoService envelope strings.
 *   - decrypt() is called ONLY inside this module — cleartext never leaves.
 *   - Blind-index companions (nationalIdIdx / passportNumberIdx) allow equality
 *     lookup without decryption (Pattern 2, 02-RESEARCH.md).
 *
 * Decimal boundary:
 *   - No money columns on Customer; Decimal is handled in order/invoice/payment repos.
 *   - If a repo method ever reads Decimal, convert to big.js Money here (Pitfall 5).
 *
 * Actor context:
 *   - Phase 7 will populate actor from the session JWT.
 *   - Until then callers pass { actor: "system" } or { actor: "test" }.
 */

import type { PrismaClient, Customer } from "../../../generated/prisma/client";
import { CryptoService } from "../../crypto/crypto.service";
import { EnvKeyProvider } from "../../crypto/env-key-provider";
import type { ActorContext } from "../../audit/audit.service";
import { recordAudit } from "../../audit/audit.service";

// Default service instance backed by env keys.
// Repos under test can pass a custom CryptoService with injected stub keys.
function defaultCrypto(): CryptoService {
  return new CryptoService(new EnvKeyProvider());
}

// ─── Input / Output types ──────────────────────────────────────────────────────

export interface CreateCustomerInput {
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  /** Raw national ID (will be encrypted + blind-indexed). */
  nationalId?: string;
  /** Raw passport number (will be encrypted + blind-indexed). */
  passportNumber?: string;
  consentAt?: Date;
  consentVersion?: string;
}

/** Customer row with PII fields decrypted (returned ONLY from readCustomerPii). */
export interface CustomerWithPii {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  /** Decrypted plaintext national ID. */
  nationalId: string | null;
  /** Decrypted plaintext passport number. */
  passportNumber: string | null;
  consentAt: Date | null;
  consentVersion: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Repository ────────────────────────────────────────────────────────────────

/**
 * Create a new customer, encrypting nationalId/passportNumber and computing their
 * blind-index companions. Writes one audit_logs row (action=CREATE) in the same tx.
 */
export async function createCustomer(
  db: PrismaClient,
  ctx: ActorContext,
  input: CreateCustomerInput,
  crypto: CryptoService = defaultCrypto(),
): Promise<Customer> {
  return db.$transaction(async (tx) => {
    const nationalId = input.nationalId
      ? crypto.encrypt(input.nationalId)
      : null;
    const nationalIdIdx = input.nationalId
      ? crypto.blindIndex(input.nationalId, "id")
      : null;

    const passportNumber = input.passportNumber
      ? crypto.encrypt(input.passportNumber)
      : null;
    const passportNumberIdx = input.passportNumber
      ? crypto.blindIndex(input.passportNumber, "text")
      : null;

    const customer = await tx.customer.create({
      data: {
        firstName: input.firstName,
        lastName: input.lastName,
        email: input.email ?? null,
        phone: input.phone ?? null,
        nationalId,
        nationalIdIdx,
        passportNumber,
        passportNumberIdx,
        consentAt: input.consentAt ?? null,
        consentVersion: input.consentVersion ?? null,
      },
    });

    await recordAudit(tx, ctx, {
      action: "CREATE",
      subjectType: "Customer",
      subjectId: customer.id,
    });

    return customer;
  });
}

/**
 * Find a customer by raw national ID using the blind index (no decryption).
 * Writes one audit_logs row (action=READ) in the same tx.
 *
 * @returns The customer row (PII fields still encrypted), or null if not found.
 */
export async function findCustomerByNationalId(
  db: PrismaClient,
  ctx: ActorContext,
  rawNationalId: string,
  crypto: CryptoService = defaultCrypto(),
): Promise<Customer | null> {
  return db.$transaction(async (tx) => {
    const idx = crypto.blindIndex(rawNationalId, "id");

    const customer = await tx.customer.findUnique({
      where: { nationalIdIdx: idx },
    });

    if (customer) {
      await recordAudit(tx, ctx, {
        action: "READ",
        subjectType: "Customer",
        subjectId: customer.id,
      });
    }

    return customer;
  });
}

/**
 * Load a customer and decrypt PII fields. Decryption happens ONLY inside this module.
 * Writes one audit_logs row (action=READ) in the same tx.
 *
 * @returns CustomerWithPii with decrypted nationalId/passportNumber.
 * @throws Prisma.NotFoundError if the customer does not exist.
 */
export async function readCustomerPii(
  db: PrismaClient,
  ctx: ActorContext,
  customerId: string,
  crypto: CryptoService = defaultCrypto(),
): Promise<CustomerWithPii> {
  return db.$transaction(async (tx) => {
    const customer = await tx.customer.findUniqueOrThrow({
      where: { id: customerId },
    });

    await recordAudit(tx, ctx, {
      action: "READ",
      subjectType: "Customer",
      subjectId: customer.id,
    });

    return {
      id: customer.id,
      firstName: customer.firstName,
      lastName: customer.lastName,
      email: customer.email,
      phone: customer.phone,
      nationalId: customer.nationalId
        ? crypto.decrypt(customer.nationalId)
        : null,
      passportNumber: customer.passportNumber
        ? crypto.decrypt(customer.passportNumber)
        : null,
      consentAt: customer.consentAt,
      consentVersion: customer.consentVersion,
      createdAt: customer.createdAt,
      updatedAt: customer.updatedAt,
    };
  });
}
